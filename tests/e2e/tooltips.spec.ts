import { expect, Locator, Page, test } from '@playwright/test';

import {
   closeApp,
   launchApp,
   LaunchedApp,
   makeUserDataDir,
   seedConnectionsStore,
   seedSqliteFixture
} from './helpers';

// floating-vue teleports the bubble to <body> and, once dismissed, leaves it there for its
// dispose timeout with `visibility: hidden` — so visibility is the check, never presence.
const tooltip = (appWindow: Page): Locator => appWindow.locator('.v-popper--theme-tooltip');

const NEUTRAL_POINT = { x: 400, y: 400 };

// The bubble only opens on `mouseenter`, and on a cold start the sidebar list re-renders under
// a pointer that is already resting on the element — the replaced node never sees the event.
// Each attempt therefore leaves the element and arrives again.
const hoverForTooltip = async (appWindow: Page, anchor: Locator): Promise<void> => {
   await expect(async () => {
      await appWindow.mouse.move(NEUTRAL_POINT.x, NEUTRAL_POINT.y);
      await anchor.hover();
      await expect(tooltip(appWindow), 'expect the tooltip shown on hover').toBeVisible({ timeout: 2000 });
   }).toPass({ timeout: 20_000 });
};

const boxOf = async (locator: Locator, what: string) => {
   const box = await locator.boundingBox();
   if (!box) throw new Error(`expected ${what} to have a bounding box`);
   return box;
};

// A positioning regression leaves DOM and text intact and parks the bubble in the window
// corner. Measured per axis, so overlap counts as zero; today both gaps are 5px, and 60px
// absorbs the arrow, the offset and a placement flip.
const expectAnchoredNear = async (bubble: Locator, anchor: Locator): Promise<void> => {
   const b = await boxOf(bubble, 'the tooltip');
   const a = await boxOf(anchor, 'the hovered element');
   const gap = (bStart: number, bSize: number, aStart: number, aSize: number) =>
      Math.round(Math.max(aStart - (bStart + bSize), bStart - (aStart + aSize), 0));

   expect(b.x + b.y, 'expect the tooltip off the window origin').toBeGreaterThan(0);
   expect(
      gap(b.x, b.width, a.x, a.width),
      'expect the tooltip horizontally next to the element it describes'
   ).toBeLessThanOrEqual(60);
   expect(
      gap(b.y, b.height, a.y, a.height),
      'expect the tooltip vertically next to the element it describes'
   ).toBeLessThanOrEqual(60);
};

test.describe('setting bar tooltips', () => {
   let app: LaunchedApp;

   test.beforeEach(async () => {
      app = await launchApp(makeUserDataDir());
   });

   test.afterEach(async () => {
      await closeApp(app);
   });

   test('the settings button names itself on hover and drops the bubble on leave', async () => {
      const { appWindow } = app;
      const settings = appWindow.locator('.settingbar-bottom-elements .settingbar-element').last();

      await hoverForTooltip(appWindow, settings);
      await expect(tooltip(appWindow), 'expect the translated label in the bubble').toHaveText('Settings');
      await expectAnchoredNear(tooltip(appWindow), settings);

      await appWindow.locator('#footer').hover();
      await expect(tooltip(appWindow), 'expect the bubble gone once the pointer leaves').toBeHidden();
   });
});

test.describe('connection tooltips', () => {
   let app: LaunchedApp;

   test.afterEach(async () => {
      await closeApp(app);
   });

   // The sidebar label is a clipped `<small>`: the whole name shows up nowhere else.
   test('a sidebar connection spells its full name on hover', async () => {
      const uid = `C:E2ETIP${process.pid}`;
      const name = `a very long e2e connection name ${process.pid}`;

      const userDataDir = makeUserDataDir();

      app = await launchApp(userDataDir);
      const dbFile = await seedSqliteFixture(app.appWindow, 1);
      await seedConnectionsStore(app.appWindow, {
         connections: [{ uid, client: 'sqlite', name, databasePath: dbFile }],
         connectionsOrder: [{ isFolder: false, uid, client: 'sqlite', name, icon: null }]
      });
      await closeApp(app);

      app = await launchApp(userDataDir);
      const { appWindow } = app;
      const entry = appWindow.locator('#settingbar .settingbar-element', { hasText: name });

      await hoverForTooltip(appWindow, entry);
      await expect(tooltip(appWindow), 'expect the whole connection name in the bubble').toHaveText(name);
      await expectAnchoredNear(tooltip(appWindow), entry);

      await appWindow.locator('#footer').hover();
      await expect(tooltip(appWindow), 'expect the bubble gone once the pointer leaves').toBeHidden();
   });
});
