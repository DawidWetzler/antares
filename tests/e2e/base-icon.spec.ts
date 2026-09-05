import { mdiHistory, mdiTimerSand } from '@mdi/js';
import { expect, Locator, test } from '@playwright/test';
import { Page } from 'playwright';

import {
   closeApp,
   connectSqliteWorkspace,
   launchApp,
   LaunchedApp,
   makeUserDataDir,
   typeInAceEditor
} from './helpers';

const activeTab = (appWindow: Page) => appWindow.locator('.workspace-query-tab:visible');

// Chromium reports every SVG transform as a matrix, whatever the authored notation.
const ROTATE_180 = 'matrix(-1, 0, 0, -1, 0, 0)';
const FLIP_HORIZONTAL = 'matrix(-1, 0, 0, 1, 0, 0)';

const expectPaintedInTextColor = async (icon: Locator): Promise<void> => {
   const [fill, color] = await icon.locator('path').evaluate(el => {
      const style = getComputedStyle(el);
      return [style.fill, style.color];
   });

   expect(fill, 'expect the glyph painted in the colour of the text around it').toBe(color);
};

test.describe('mdi icons', () => {
   let app: LaunchedApp;
   let appWindow: Page;

   test.beforeEach(async () => {
      app = await launchApp(makeUserDataDir());
      appWindow = app.appWindow;
      await connectSqliteWorkspace(appWindow);
   });

   test.afterEach(async () => {
      await closeApp(app);
   });

   test('an icon is a sized 24x24 viewport around its path, rotated where asked', async () => {
      await appWindow.locator('.workspace-tabs a.tab-add').click();
      await typeInAceEditor(activeTab(appWindow), 'SELECT 1');
      await activeTab(appWindow).locator('.workspace-query-buttons button.btn-primary').click();

      // The query duration is prefixed by an hourglass turned upside down.
      const icon = activeTab(appWindow).locator('.workspace-query-info svg').first();

      await expect(icon, 'expect the icon drawn at the size the call site asked for').toHaveAttribute('width', '16');
      await expect(icon, 'expect the mdi 24-unit viewport whatever the drawn size').toHaveAttribute('viewBox', '0 0 24 24');
      await expect(icon.locator('path'), 'expect the requested glyph').toHaveAttribute('d', mdiTimerSand);
      await expect(icon, 'expect the rotation the call site asked for').toHaveCSS('transform', ROTATE_180);
      await expectPaintedInTextColor(icon);
   });

   test('a flipped icon is mirrored', async () => {
      await appWindow.locator('.database-tables li', { hasText: 'people' }).dblclick();
      await appWindow.locator('.workspace-query-results').waitFor();

      const refresh = activeTab(appWindow).locator('.workspace-query-buttons .dropdown').first();

      // The slider lives in a closed Spectre dropdown; `change` is what commits the interval.
      await refresh.locator('input.slider').evaluate((el: HTMLInputElement) => {
         el.value = '5';
         el.dispatchEvent(new Event('input', { bubbles: true }));
         el.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const icon = refresh.locator('button svg');

      await expect(icon.locator('path'), 'expect the auto-refresh glyph').toHaveAttribute('d', mdiHistory);
      await expect(icon, 'expect the glyph mirrored horizontally').toHaveCSS('transform', FLIP_HORIZONTAL);
   });
});
