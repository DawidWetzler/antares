import { expect, test } from '@playwright/test';
import { Locator, Page } from 'playwright';

import {
   closeApp,
   connectSqliteWorkspace,
   launchApp,
   LaunchedApp,
   makeUserDataDir,
   readConnectionsStore,
   seedConnectionsStore,
   seedSqliteFixture
} from './helpers';

// SortableJS swaps one neighbour per `dragover`, so the pointer has to be walked to the
// target: dragTo() moves the sidebar list not at all, and back-to-back mouse.move() calls
// with no pause between them get it one position short of a two-place move.
const dragOnto = async (
   page: Page,
   source: Locator,
   target: Locator,
   at: (box: { x: number; y: number; width: number; height: number }) => { x: number; y: number }
): Promise<void> => {
   const from = await source.boundingBox();
   const to = at(await target.boundingBox());

   const startX = from.x + from.width / 2;
   const startY = from.y + from.height / 2;
   await page.mouse.move(startX, startY);
   await page.mouse.down();

   const steps = 20;
   for (let i = 1; i <= steps; i++) {
      await page.mouse.move(startX + (to.x - startX) * i / steps, startY + (to.y - startY) * i / steps);
      await page.waitForTimeout(30);
   }
   await page.mouse.up();
};

const sidebarNames = (appWindow: Page) =>
   appWindow.locator('#settingbar .settingbar-top-elements .settingbar-element-name');

test.describe('drag reorder', () => {
   let app: LaunchedApp;
   let appWindow: Page;

   test.afterEach(async () => {
      await closeApp(app);
   });

   test('reorders the sidebar connections and persists the new order', async () => {
      const userDataDir = makeUserDataDir();
      const names = ['alpha', 'bravo', 'charlie'].map(n => `${n}${process.pid}`);

      app = await launchApp(userDataDir);
      appWindow = app.appWindow;
      const dbFile = await seedSqliteFixture(appWindow, 1);
      await seedConnectionsStore(appWindow, {
         connections: names.map(uid => ({ uid, client: 'sqlite', name: uid, databasePath: dbFile })),
         connectionsOrder: names.map(uid => ({ isFolder: false, uid, client: 'sqlite', name: uid, icon: null }))
      });
      await closeApp(app);

      app = await launchApp(userDataDir);
      appWindow = app.appWindow;
      await expect(sidebarNames(appWindow)).toHaveText(names);

      const items = appWindow.locator('#settingbar .settingbar-top-elements li');
      // Only the outer 20px of an element reorders: the inset `.drag-area` in the middle is
      // the make-a-folder drop zone (SettingBarConnections.vue:37).
      await dragOnto(appWindow, items.nth(2), items.nth(0), box => ({ x: box.x + box.width / 2, y: box.y + 4 }));

      const reordered = [names[2], names[0], names[1]];
      await expect(sidebarNames(appWindow), 'expect the dragged connection first in the sidebar')
         .toHaveText(reordered);

      expect(
         (await readConnectionsStore<{ name: string }[]>(appWindow, 'connectionsOrder')).map(el => el.name),
         'expect the new order written to the connections store'
      ).toEqual(reordered);
   });

   test('reorders the workspace query tabs', async () => {
      app = await launchApp(makeUserDataDir());
      appWindow = app.appWindow;
      await connectSqliteWorkspace(appWindow);

      for (let i = 0; i < 3; i++)
         await appWindow.locator('.workspace-tabs a.tab-add').click();

      const tabs = appWindow.locator('.workspace-tabs .tab-item.tab-draggable');
      await expect(tabs).toHaveText([/Query #1/, /Query #2/, /Query #3/]);

      await dragOnto(appWindow, tabs.nth(0), tabs.nth(2), box => ({ x: box.x + box.width - 4, y: box.y + box.height / 2 }));

      await expect(tabs, 'expect the dragged tab last').toHaveText([/Query #2/, /Query #3/, /Query #1/]);
   });
});
