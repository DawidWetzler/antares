import { expect, test } from '@playwright/test';
import { Page } from 'playwright';

import { appVersion, closeApp, launchApp, makeUserDataDir, openSettingsModal, pickFromBaseSelect, readSettings, seedSettings } from './helpers';

const openThemesTab = async (appWindow: Page): Promise<void> => {
   await openSettingsModal(appWindow);
   await appWindow.locator('#settings .tab-item', { hasText: 'Themes' }).click();
   await appWindow.locator('#settings .theme-block').first().waitFor();
};

const seedTheme = (userDataDir: string, theme: string, editorThemes: Record<string, string> = {}): void =>
   seedSettings(userDataDir, {
      cached_version: appVersion(),
      notifications_timeout: 3600,
      application_theme: theme,
      ...editorThemes
   });

test.describe('system theme', () => {
   test('picking System persists the choice and survives a restart', async () => {
      const userDataDir = makeUserDataDir();
      let app = await launchApp(userDataDir);

      await openThemesTab(app.appWindow);
      await app.appWindow.locator('#settings .theme-block.theme-system').click();
      await expect(app.appWindow.locator('#settings .theme-block.selected .h6')).toHaveText('System');

      expect(
         await app.electronApp.evaluate(({ nativeTheme }) => nativeTheme.themeSource),
         'expect the main process to follow the stored choice'
      ).toBe('system');

      await closeApp(app);
      expect(readSettings(userDataDir).application_theme, 'theme written to settings.json').toBe('system');

      app = await launchApp(userDataDir);
      expect(
         await app.electronApp.evaluate(({ nativeTheme }) => nativeTheme.themeSource),
         'expect themeSource restored from the store at startup'
      ).toBe('system');

      await openThemesTab(app.appWindow);
      await expect(app.appWindow.locator('#settings .theme-block.selected .h6')).toHaveText('System');
      await closeApp(app);
   });

   test('the window follows the OS colour scheme and flips live', async () => {
      const userDataDir = makeUserDataDir();
      seedTheme(userDataDir, 'system');
      const app = await launchApp(userDataDir);

      await app.appWindow.emulateMedia({ colorScheme: 'dark' });
      await expect(app.appWindow.locator('#wrapper')).toHaveClass(/theme-dark/);

      await app.appWindow.emulateMedia({ colorScheme: 'light' });
      await expect(app.appWindow.locator('#wrapper')).toHaveClass(/theme-light/);

      await app.appWindow.emulateMedia({ colorScheme: 'dark' });
      await expect(app.appWindow.locator('#wrapper')).toHaveClass(/theme-dark/);

      await closeApp(app);
   });

   test('an explicit choice ignores the OS colour scheme', async () => {
      const userDataDir = makeUserDataDir();
      seedTheme(userDataDir, 'light');
      const app = await launchApp(userDataDir);

      await app.appWindow.emulateMedia({ colorScheme: 'dark' });
      await expect(app.appWindow.locator('#wrapper')).toHaveClass(/theme-light/);

      expect(
         await app.electronApp.evaluate(({ nativeTheme }) => nativeTheme.themeSource),
         'expect the main process to follow the stored choice'
      ).toBe('light');

      await closeApp(app);
   });

   test('the editor theme belongs to the application theme it was picked on', async () => {
      const userDataDir = makeUserDataDir();
      seedTheme(userDataDir, 'light', { editor_theme_light: 'dracula', editor_theme_dark: 'catppuccin_mocha' });
      const app = await launchApp(userDataDir);

      // Only the themes tab is on screen, but every other tab stays in the DOM under v-show.
      const themesTab = app.appWindow.locator('#settings .panel-body:visible');
      const editorTheme = themesTab.locator('.select');
      const preview = themesTab.locator('.ace_editor');

      await openThemesTab(app.appWindow);
      await expect(editorTheme.locator('.select__item-text span')).toHaveText('Dracula');
      await expect(preview).toHaveClass(/ace-dracula/);

      await app.appWindow.locator('#settings .theme-block', { hasText: 'Dark' }).click();
      await expect(editorTheme.locator('.select__item-text span'), 'expect the dark theme to bring its own editor theme').toHaveText('Catppuccin Mocha');
      await expect(preview).toHaveClass(/ace-catppuccin-mocha/);

      await pickFromBaseSelect(editorTheme, 'Monokai');
      await expect(preview).toHaveClass(/ace-monokai/);

      await closeApp(app);
      const settings = readSettings(userDataDir);
      expect(settings.editor_theme_dark, 'a pick made on the dark theme belongs to it').toBe('monokai');
      expect(settings.editor_theme_light, 'the light theme keeps the theme picked for it').toBe('dracula');
   });
});
