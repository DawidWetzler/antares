import { expect, test } from '@playwright/test';
import { ElectronApplication, Page } from 'playwright';

import {
   closeApp,
   connectSqliteWorkspace,
   launchApp,
   LaunchedApp,
   makeUserDataDir,
   typeInAceEditor
} from './helpers';

// Playwright cannot click a native menu, but the main process can be asked what it was told to
// pop up, and a recorded MenuItem can be fired by hand — which covers both halves of the
// behaviour: the menu that appears, and what choosing an entry does.
const spyOnMenus = (electronApp: ElectronApplication): Promise<void> =>
   electronApp.evaluate(({ Menu }) => {
      const g = globalThis as unknown as { __menus?: unknown[] };
      g.__menus = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proto = (Menu as any).prototype;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((proto as any).__spied) return;
      const popup = proto.popup;
      proto.popup = function (...args: unknown[]) {
         g.__menus.push(this);
         return popup.apply(this, args);
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (proto as any).__spied = true;
   });

const poppedMenuLabels = (electronApp: ElectronApplication): Promise<string[][]> =>
   electronApp.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const menus = (globalThis as any).__menus as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return menus.map(menu => menu.items.map((item: any) => item.type === 'separator' ? '-' : item.label));
   });

const forgetPoppedMenus = (electronApp: ElectronApplication): Promise<void> =>
   electronApp.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = globalThis as any;
      g.__menus.forEach((menu: { closePopup?: () => void }) => menu.closePopup?.());
      g.__menus = [];
   });

const chooseMenuEntry = (electronApp: ElectronApplication, label: string): Promise<string> =>
   electronApp.evaluate(({ BrowserWindow }, wanted) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const menus = (globalThis as any).__menus as any[];
      const menu = menus[menus.length - 1];
      if (!menu) return 'no menu was popped';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entry = menu.items.find((item: any) => item.label === wanted);
      if (!entry) return `no "${wanted}" entry`;
      menu.closePopup?.();
      entry.click(entry, BrowserWindow.getAllWindows()[0], {});
      return 'chosen';
   }, label);

test.describe('window controls', () => {
   let app: LaunchedApp;
   let appWindow: Page;
   let electronApp: ElectronApplication;

   test.beforeAll(async () => {
      app = await launchApp(makeUserDataDir());
      ({ appWindow, electronApp } = app);
      await spyOnMenus(electronApp);
   });

   test.afterAll(async () => {
      await closeApp(app);
   });

   test.beforeEach(async () => {
      await forgetPoppedMenus(electronApp);
   });

   // An open native popup keeps the window alive, and `electronApp.close()` waits it out.
   test.afterEach(async () => {
      await forgetPoppedMenus(electronApp);
   });

   const isMaximized = (): Promise<boolean> =>
      electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized());

   // The minimise/maximise/close buttons render only on Linux, and the devtools and reload
   // buttons never render in a webpack build at all, so this is the one window control a user
   // on any platform can actually reach.
   test('double-clicking the title bar maximizes the window, and again restores it', async () => {
      expect(await isMaximized()).toBe(false);

      await appWindow.locator('#titlebar').dblclick();
      await expect.poll(isMaximized, { message: 'expect the window maximized' }).toBe(true);

      await appWindow.locator('#titlebar').dblclick();
      await expect.poll(isMaximized, { message: 'expect the window restored' }).toBe(false);
   });

   test('right-clicking a text field offers the edit entries', async () => {
      await appWindow.locator('.connection-panel input[type="text"]').first().click({ button: 'right' });

      await expect.poll(() => poppedMenuLabels(electronApp), { message: 'expect one edit menu' })
         .toEqual([['Cut', 'Copy', 'Paste', '-', 'Select all']]);
   });

   test('right-clicking outside a text field offers nothing', async () => {
      await appWindow.locator('#footer').click({ button: 'right' });
      await appWindow.waitForTimeout(500);

      expect(await poppedMenuLabels(electronApp)).toEqual([]);
   });
});

test.describe('query editor context menu', () => {
   let app: LaunchedApp;
   let appWindow: Page;
   let electronApp: ElectronApplication;
   let tab: ReturnType<Page['locator']>;

   test.beforeAll(async () => {
      app = await launchApp(makeUserDataDir());
      ({ appWindow, electronApp } = app);
      await connectSqliteWorkspace(appWindow);
      await appWindow.locator('.workspace-tabs a.tab-add').click();
      tab = appWindow.locator('.workspace-query-tab:visible');
      await spyOnMenus(electronApp);
   });

   test.afterAll(async () => {
      await closeApp(app);
   });

   test.beforeEach(async () => {
      await forgetPoppedMenus(electronApp);
   });

   // An open native popup keeps the window alive, and `electronApp.close()` waits it out.
   test.afterEach(async () => {
      await forgetPoppedMenus(electronApp);
   });

   const rightClickEditor = () => tab.locator('.editor-query .ace_content').click({ button: 'right' });

   test('right-clicking the editor offers the query entries', async () => {
      await rightClickEditor();

      await expect.poll(() => poppedMenuLabels(electronApp), { message: 'expect one query menu' })
         .toEqual([[
            'Run', 'Clear', '-',
            'Save file', 'Save file as', 'Open file', '-',
            'Cut', 'Copy', 'Paste', '-',
            'Select all'
         ]]);
   });

   test('choosing Clear empties the editor', async () => {
      await typeInAceEditor(tab, 'SELECT 42');
      await rightClickEditor();
      await expect.poll(() => poppedMenuLabels(electronApp)).toHaveLength(1);

      expect(await chooseMenuEntry(electronApp, 'Clear')).toBe('chosen');

      await expect(tab.locator('.editor-query .ace_content')).toHaveText('');
   });

   test('choosing Run executes the query', async () => {
      await typeInAceEditor(tab, 'SELECT 7 AS answer');
      await rightClickEditor();
      await expect.poll(() => poppedMenuLabels(electronApp)).toHaveLength(1);

      expect(await chooseMenuEntry(electronApp, 'Run')).toBe('chosen');

      await expect(tab.locator('.workspace-query-results .thead .table-column-title span'))
         .toHaveText(['answer']);
   });
});

// The window buttons that would drive these are Linux-only, so the channels themselves are the
// only place this behaviour can be pinned.
test.describe('window IPC channels', () => {
   let app: LaunchedApp;
   let appWindow: Page;
   let electronApp: ElectronApplication;

   test.beforeAll(async () => {
      app = await launchApp(makeUserDataDir());
      ({ appWindow, electronApp } = app);
      await spyOnMenus(electronApp);
   });

   test.afterAll(async () => {
      await closeApp(app);
   });

   test.afterEach(async () => {
      await forgetPoppedMenus(electronApp);
   });

   const invoke = (channel: string, ...args: unknown[]): Promise<unknown> =>
      appWindow.evaluate(({ channel, args }) => {
         // eslint-disable-next-line @typescript-eslint/no-var-requires
         const { ipcRenderer } = require('electron');
         return ipcRenderer.invoke(channel, ...args);
      }, { channel, args });

   test('minimize-window minimizes the window', async () => {
      await invoke('minimize-window');

      await expect
         .poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()),
            { message: 'expect the window minimized' })
         .toBe(true);

      await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore());
   });

   test('is-window-maximized answers for the window that asked', async () => {
      expect(await invoke('is-window-maximized')).toBe(false);

      await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
      expect(await invoke('is-window-maximized')).toBe(true);

      await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].unmaximize());
   });

   // The renderer fills in `role`, and a role is a command to Electron. Only the four editing
   // roles may cross; `quit` would end the app straight from a crafted menu.
   test('a context menu role outside the allowlist never reaches the menu', async () => {
      // `show-context-menu` only settles once the menu is dismissed, so awaiting it here would
      // wait for the popup this test is about to inspect.
      await appWindow.evaluate(() => {
         // eslint-disable-next-line @typescript-eslint/no-var-requires
         const { ipcRenderer } = require('electron');
         ipcRenderer.invoke('show-context-menu', [
            { label: 'Copy', role: 'copy' },
            { label: 'Quit', role: 'quit' },
            { label: 'Devtools', role: 'toggleDevTools' }
         ]);
      });

      await expect.poll(() => poppedMenuLabels(electronApp), { message: 'expect only the allowed entry' })
         .toEqual([['Copy']]);
   });
});
