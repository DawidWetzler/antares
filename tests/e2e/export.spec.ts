import { expect, test } from '@playwright/test';
import * as path from 'path';
import { Page } from 'playwright';

import {
   captureDownload,
   closeApp,
   connectSqliteWorkspace,
   launchApp,
   LaunchedApp,
   makeUserDataDir,
   seedSettings
} from './helpers';

const PAGE_SIZE = 40;

test.describe('export', () => {
   let app: LaunchedApp;
   let appWindow: Page;
   let downloadDir: string;

   test.beforeEach(async () => {
      const userDataDir = makeUserDataDir();
      seedSettings(userDataDir, {
         cached_version: '0.7.35',
         data_tab_limit: PAGE_SIZE,
         notifications_timeout: 3600
      });
      app = await launchApp(userDataDir);
      appWindow = app.appWindow;
      downloadDir = makeUserDataDir();
      await connectSqliteWorkspace(appWindow);
      await appWindow.locator('.database-tables li', { hasText: 'people' }).dblclick();
      await appWindow.locator('.workspace-query-results').waitFor();
   });

   test.afterEach(async () => {
      await closeApp(app);
   });

   test('exports the grid to CSV and the file matches the grid', async () => {
      await appWindow.locator('.table-dropdown button.dropdown-toggle').click();
      await appWindow.locator('.table-dropdown .menu-item a', { hasText: 'CSV' }).click();

      const optionsModal = appWindow.locator('.modal.active', { hasText: 'CSV EXPORT OPTIONS' });
      await expect(optionsModal).toBeVisible();

      const savePath = path.join(downloadDir, 'people.csv');
      const csv = await captureDownload(app.electronApp, savePath, async () => {
         await optionsModal.locator('.modal-footer button.btn-primary').click();
      });

      const lines = csv.trim().split('\n');
      expect(lines[0], 'header row comes from the grid columns').toBe('id;name;city');
      expect(lines, 'one header + one line per row on the current page').toHaveLength(PAGE_SIZE + 1);
      expect(lines[1]).toBe('1;"person-1";"city-1"');
      expect(lines[PAGE_SIZE]).toBe(`${PAGE_SIZE};"person-${PAGE_SIZE}";"city-${PAGE_SIZE % 7}"`);

      // and the same rows really are on screen
      const firstRow = appWindow.locator('.workspace-query-results .vscroll-holder .tr').first();
      await expect(firstRow.locator('.cell-content')).toHaveText(['1', 'person-1', 'city-1']);
   });

   test('honours the CSV options chosen in the modal', async () => {
      await appWindow.locator('.table-dropdown button.dropdown-toggle').click();
      await appWindow.locator('.table-dropdown .menu-item a', { hasText: 'CSV' }).click();

      const optionsModal = appWindow.locator('.modal.active', { hasText: 'CSV EXPORT OPTIONS' });
      await optionsModal.locator('.form-group', { hasText: 'Field delimiter' })
         .locator('input.form-input').fill(',');
      await optionsModal.locator('.form-group', { hasText: 'Include header' })
         .locator('label.form-switch').click();

      const savePath = path.join(downloadDir, 'people-options.csv');
      const csv = await captureDownload(app.electronApp, savePath, async () => {
         await optionsModal.locator('.modal-footer button.btn-primary').click();
      });

      const lines = csv.trim().split('\n');
      expect(lines[0], 'header suppressed, comma delimited').toBe('1,"person-1","city-1"');
      expect(lines).toHaveLength(PAGE_SIZE);
   });

   test('exports a query tab result set to JSON', async () => {
      // JSON needs no options modal, so it also proves the download plumbing
      // is not specific to the CSV path.
      const savePath = path.join(downloadDir, 'people.json');
      const json = await captureDownload(app.electronApp, savePath, async () => {
         await appWindow.locator('.table-dropdown button.dropdown-toggle').click();
         await appWindow.locator('.table-dropdown .menu-item a', { hasText: 'JSON' }).click();
      });

      const parsed = JSON.parse(json) as { id: number; name: string }[];
      expect(parsed).toHaveLength(PAGE_SIZE);
      expect(parsed[0]).toMatchObject({ id: 1, name: 'person-1' });
   });
});
