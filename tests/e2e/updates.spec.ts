import { ElectronApplication, expect, Page, test } from '@playwright/test';

import { closeApp, launchApp, LaunchedApp, makeUserDataDir, openSettingsModal } from './helpers';

interface MainGlobals {
   __requireFromMain: (id: string) => { autoUpdater: NodeJS.EventEmitter & Record<string, unknown> };
   __quitAndInstallCalls?: number;
}

// tests/support/e2e-main.js loads before the app and leaves a require behind, so these reach the
// very `autoUpdater` singleton src/main/ipc-handlers/updates.ts attached its listeners to.
// Driving it directly keeps the whole check off the network.
const emitUpdaterEvent = (electronApp: ElectronApplication, event: string, payload?: unknown): Promise<boolean> =>
   electronApp.evaluate((electron, args) => {
      const { autoUpdater } = (globalThis as unknown as MainGlobals).__requireFromMain('electron-updater');
      return autoUpdater.emit(args.event, args.payload);
   }, { event, payload });

const openUpdateTab = async (appWindow: Page): Promise<void> => {
   await openSettingsModal(appWindow);
   await appWindow.locator('#settings .tab-item', { hasText: 'Update' }).click();
};

const updateMessage = (appWindow: Page) => appWindow.locator('#settings .empty-title');

test.describe('application updates', () => {
   let app: LaunchedApp;
   let appWindow: Page;

   test.beforeEach(async () => {
      app = await launchApp(makeUserDataDir(), { entry: 'tests/support/e2e-main.js' });
      appWindow = app.appWindow;
      await openUpdateTab(appWindow);
   });

   test.afterEach(async () => {
      await closeApp(app);
   });

   test('each updater event moves the update tab to its own message', async () => {
      await expect(updateMessage(appWindow), 'expect the idle message before any event')
         .toHaveText('No updates available');

      expect(await emitUpdaterEvent(app.electronApp, 'checking-for-update')).toBe(true);
      await expect(updateMessage(appWindow)).toHaveText('Checking for updates');

      expect(await emitUpdaterEvent(app.electronApp, 'update-not-available')).toBe(true);
      await expect(updateMessage(appWindow)).toHaveText('No updates available');

      expect(await emitUpdaterEvent(app.electronApp, 'update-available')).toBe(true);
      await expect(updateMessage(appWindow)).toHaveText('Update available');

      expect(await emitUpdaterEvent(app.electronApp, 'update-downloaded')).toBe(true);
      await expect(updateMessage(appWindow)).toHaveText('Update downloaded');
   });

   test('a download-progress event fills the progress bar from its percent field', async () => {
      expect(await emitUpdaterEvent(app.electronApp, 'download-progress', { percent: 42 })).toBe(true);

      await expect(updateMessage(appWindow)).toHaveText('Downloading update');
      await expect(appWindow.locator('#settings .empty-subtitle')).toHaveText('42%');
      await expect(appWindow.locator('#settings progress')).toHaveAttribute('value', '42');
   });

   test('the restart button asks the updater to install', async () => {
      // Swapped for the rest of this app's life: the real call would kill the process.
      await app.electronApp.evaluate(() => {
         const main = globalThis as unknown as MainGlobals;
         main.__quitAndInstallCalls = 0;
         main.__requireFromMain('electron-updater').autoUpdater.quitAndInstall = () => {
            main.__quitAndInstallCalls++;
         };
      });

      await emitUpdaterEvent(app.electronApp, 'update-downloaded');
      await appWindow.locator('#settings .empty-action button', { hasText: 'Restart Antares to install' }).click();

      await expect
         .poll(() => app.electronApp.evaluate(() => (globalThis as unknown as MainGlobals).__quitAndInstallCalls))
         .toBe(1);
   });

   test('the updater still exposes everything the main process drives it with', async () => {
      const surface = await app.electronApp.evaluate(() => {
         const { autoUpdater } = (globalThis as unknown as MainGlobals).__requireFromMain('electron-updater');
         return {
            checkForUpdatesAndNotify: typeof autoUpdater.checkForUpdatesAndNotify,
            quitAndInstall: typeof autoUpdater.quitAndInstall,
            allowPrerelease: typeof autoUpdater.allowPrerelease,
            autoDownload: typeof autoUpdater.autoDownload,
            logger: 'logger' in autoUpdater
         };
      });

      expect(surface).toEqual({
         checkForUpdatesAndNotify: 'function',
         quitAndInstall: 'function',
         allowPrerelease: 'boolean',
         autoDownload: 'boolean',
         logger: true
      });
   });

   // The macOS branch only sets `autoDownload` and never starts a check, so nothing replies and
   // the message sits on 'No updates available' for good. `link-to-download` exists for this
   // platform alone, so a check was meant to happen.
   test.fixme('checking for updates reports back on macOS', async () => {
      test.skip(process.platform !== 'darwin', 'covers the macOS-only branch of check-for-updates');

      await appWindow.locator('#settings .empty-action button', { hasText: 'Check for updates' }).click();

      await expect(updateMessage(appWindow)).not.toHaveText('No updates available');
   });
});
