import { expect, test } from '@playwright/test';
import { ElectronApplication, Page } from 'playwright';

import {
   closeModal,
   launchApp,
   LaunchedApp,
   makeUserDataDir,
   openSettingsModal,
   pickFromBaseSelect,
   readSettings,
   readWindowState
} from './helpers';

test.describe('app lifecycle', () => {
   let app: LaunchedApp;
   let appWindow: Page;
   let electronApp: ElectronApplication;

   test.beforeAll(async () => {
      app = await launchApp(makeUserDataDir());
      ({ appWindow, electronApp } = app);
   });

   test.afterAll(async () => {
      await electronApp.close();
   });

   test('launches unpackaged', async () => {
      const isPackaged = await electronApp.evaluate(async ({ app }) => app.isPackaged);
      expect(isPackaged, 'expect is unpacked').toBe(false);
   });

   test('main window elements visibility', async () => {
      const visibleSelectors = [
         '#window-content',
         '#settingbar',
         '#footer'
      ];
      for (const selector of visibleSelectors)
         await expect(appWindow.locator(selector), `expect ${selector} visible`).toBeVisible();
   });

   test('clean start raises no renderer errors and no error toast', async () => {
      await expect(appWindow.locator('#notifications-board .toast-error')).toHaveCount(0);
      expect(app.rendererErrors, 'expect no renderer errors on a clean start').toEqual([]);
   });

   test('opens the preferences modal from the UI', async () => {
      await openSettingsModal(appWindow);
      await expect(appWindow.locator('#settings .modal-title')).toContainText('Settings');
      await closeModal(appWindow, '#settings');
   });
});

test.describe('first run', () => {
   test('a virgin profile opens the changelog automatically', async () => {
      const app = await launchApp(makeUserDataDir(), { firstRun: true });
      await expect(app.appWindow.locator('#settings')).toBeVisible();
      await expect(app.appWindow.locator('#settings .tab-item.active .tab-link')).toHaveText('Changelog');
      await app.electronApp.close();
   });
});

test.describe('preferences persistence', () => {
   const userDataDir = makeUserDataDir();

   test('theme and page size survive a restart', async () => {
      // --- first run: change two settings through the UI ---
      let app = await launchApp(userDataDir);
      await expect(app.appWindow.locator('#wrapper')).toHaveClass(/theme-light/);

      await openSettingsModal(app.appWindow);
      await app.appWindow.locator('#settings .tab-item', { hasText: 'Themes' }).click();
      await app.appWindow.locator('#settings .theme-block').first().click();// dark is the first block
      await expect(app.appWindow.locator('#wrapper')).toHaveClass(/theme-dark/);

      await app.appWindow.locator('#settings .tab-item', { hasText: 'General' }).click();
      const pageSizeSelect = app.appWindow
         .locator('#settings .form-group', { has: app.appWindow.locator('label', { hasText: 'Results per page' }) })
         .locator('.select');
      await pickFromBaseSelect(pageSizeSelect, '250');
      await expect(pageSizeSelect).toContainText('250');

      await app.electronApp.close();

      // --- on disk ---
      const persisted = readSettings(userDataDir);
      expect(persisted.application_theme, 'theme written to settings.json').toBe('dark');
      expect(persisted.data_tab_limit, 'page size written to settings.json').toBe(250);

      // --- second run: same userData dir, settings still applied in the UI ---
      app = await launchApp(userDataDir);
      await expect(app.appWindow.locator('#wrapper')).toHaveClass(/theme-dark/);

      await openSettingsModal(app.appWindow);
      await expect(
         app.appWindow
            .locator('#settings .form-group', { has: app.appWindow.locator('label', { hasText: 'Results per page' }) })
            .locator('.select')
      ).toContainText('250');
      await app.appWindow.locator('#settings .tab-item', { hasText: 'Themes' }).click();
      await expect(app.appWindow.locator('#settings .theme-block.selected .h6')).toHaveText('Dark');

      await app.electronApp.close();
   });
});

test.describe('window state restore', () => {
   const userDataDir = makeUserDataDir();

   test('geometry is restored after a restart', async () => {
      const target = { x: 120, y: 90, width: 1180, height: 690 };

      let app = await launchApp(userDataDir);
      await app.electronApp.evaluate(({ BrowserWindow }, bounds) => {
         BrowserWindow.getAllWindows()[0].setBounds(bounds);
      }, target);
      // electron-window-state debounces resize/move but also flushes on close
      await expect
         .poll(() => app.electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds()))
         .toEqual(target);
      await app.electronApp.close();

      expect(readWindowState(userDataDir)).toMatchObject(target);

      app = await launchApp(userDataDir);
      const restored = await app.electronApp.evaluate(({ BrowserWindow }) =>
         BrowserWindow.getAllWindows()[0].getBounds());
      expect(restored, 'window geometry restored by electron-window-state').toEqual(target);
      await app.electronApp.close();
   });
});
