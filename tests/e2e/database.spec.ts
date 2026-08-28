import { expect, test } from '@playwright/test';
import { Page } from 'playwright';

import {
   closeApp,
   connectSqliteWorkspace,
   launchApp,
   LaunchedApp,
   makeUserDataDir,
   seedSettings,
   sqliteExec
} from './helpers';

const PAGE_SIZE = 40;// smallest-but-one option in the settings modal; fixture has 60 rows

const gridRows = (appWindow: Page) => appWindow.locator('.workspace-query-results .vscroll-holder .tr');
const cell = (appWindow: Page, row: number, col: number) =>
   gridRows(appWindow).nth(row).locator('.td').nth(col);

const openPeopleTable = async (appWindow: Page) => {
   await appWindow.locator('.database-tables li', { hasText: 'people' }).dblclick();
   await appWindow.locator('.workspace-query-results').waitFor();
   await expect(gridRows(appWindow)).toHaveCount(PAGE_SIZE);
};

test.describe('database', () => {
   let app: LaunchedApp;
   let appWindow: Page;
   let dbFile: string;

   test.beforeEach(async () => {
      const userDataDir = makeUserDataDir();
      // A small page size keeps the fixture (60 rows) spread over two pages.
      seedSettings(userDataDir, { cached_version: '0', data_tab_limit: PAGE_SIZE, notifications_timeout: 3600 });
      app = await launchApp(userDataDir);
      appWindow = app.appWindow;
      // seedSettings above stamps cached_version '0', so dismiss the changelog
      await appWindow.locator('#settings .modal-header .btn-clear').click();
      dbFile = await connectSqliteWorkspace(appWindow);
   });

   test.afterEach(async () => {
      await closeApp(app);
   });

   test('the schema tree lists the seeded tables and collapses', async () => {
      const schema = appWindow.locator('.workspace-explorebar-database');
      await expect(schema.locator('summary .database-name span, summary span').first()).toHaveText('main');
      await expect(schema.locator('.database-tables a.table-name span')).toHaveText(['blobs', 'empty_table', 'people']);

      await expect(schema).toHaveAttribute('open', '');
      await schema.locator('summary').click();
      await expect(schema.locator('.database-tables')).toBeHidden();
      await schema.locator('summary').click();
      await expect(schema.locator('.database-tables')).toBeVisible();
   });

   test('opens a table and shows its rows in the grid', async () => {
      await openPeopleTable(appWindow);

      await expect(appWindow.locator('.workspace-query-results .thead .th .table-column-title span'))
         .toHaveText(['id', 'name', 'city']);
      await expect(appWindow.locator('.workspace-query-info')).toContainText(/Total:\s*60/);
      await expect(cell(appWindow, 0, 0)).toHaveText('1');
      await expect(cell(appWindow, 0, 1)).toHaveText('person-1');
   });

   test('paginates to the second page', async () => {
      await openPeopleTable(appWindow);
      const pageIndicator = appWindow.locator('.workspace-query-buttons .dropdown-toggle.text-bold');
      const next = appWindow.locator('button[title="Next results page"]');
      const prev = appWindow.locator('button[title="Previous results page"]');

      await expect(pageIndicator).toHaveText('1');
      await expect(prev).toBeDisabled();
      await expect(cell(appWindow, 0, 1)).toHaveText('person-1');

      await next.click();
      await expect(pageIndicator).toHaveText('2');
      await expect(gridRows(appWindow), 'page 2 holds the 20 remaining rows').toHaveCount(60 - PAGE_SIZE);
      await expect(cell(appWindow, 0, 0)).toHaveText('41');
      await expect(cell(appWindow, 0, 1), 'page 2 shows different rows').toHaveText('person-41');
      await expect(next).toBeDisabled();

      await prev.click();
      await expect(pageIndicator).toHaveText('1');
      await expect(cell(appWindow, 0, 1)).toHaveText('person-1');
   });

   test('edits a cell and writes it to the database file', async () => {
      await openPeopleTable(appWindow);

      // `city` is VARCHAR, which Antares edits inline; a SQLite `TEXT` column
      // would open the Ace modal editor instead (fieldTypes.ts LONG_TEXT).
      const target = cell(appWindow, 0, 2);
      await target.locator('.cell-content').dblclick();
      const editor = target.locator('input.editable-field');
      await editor.fill('edited-by-e2e');
      await editor.blur();

      await expect(target).toHaveText('edited-by-e2e');
      await expect
         .poll(() => sqliteExec<{ city: string }[]>(appWindow, dbFile, ['SELECT city FROM people WHERE id = 1']),
            { message: 'cell edit reaches the sqlite file' })
         .toEqual([{ city: 'edited-by-e2e' }]);
   });

   test('inserts a row through the UI', async () => {
      await openPeopleTable(appWindow);

      await appWindow.locator('.workspace-query-buttons button', { hasText: 'Insert rows' }).click();
      const modal = appWindow.locator('.modal.active', { hasText: 'Insert rows' });
      await modal.locator('.form-group', { has: appWindow.locator('label[title="name"]') })
         .locator('input.form-input').fill('inserted-by-e2e');
      await modal.locator('.modal-footer button.btn-primary').click();
      await expect(modal).toHaveCount(0);

      await expect
         .poll(() => sqliteExec<{ c: number }[]>(appWindow, dbFile, ['SELECT COUNT(*) AS c FROM people']),
            { message: 'insert reaches the sqlite file' })
         .toEqual([{ c: 61 }]);
      await expect(appWindow.locator('.workspace-query-info')).toContainText(/Total:\s*61/);
   });

   test('deletes a row through the UI', async () => {
      await openPeopleTable(appWindow);

      await cell(appWindow, 0, 0).click();
      await cell(appWindow, 0, 0).click({ button: 'right' });
      await appWindow.locator('.context-element', { hasText: 'Delete row' }).click();
      await appWindow.locator('.modal.active .modal-footer button.btn-primary').click();

      await expect
         .poll(() => sqliteExec<{ c: number }[]>(appWindow, dbFile, ['SELECT COUNT(*) AS c FROM people WHERE id = 1']),
            { message: 'delete reaches the sqlite file' })
         .toEqual([{ c: 0 }]);
      await expect(appWindow.locator('.workspace-query-info')).toContainText(/Total:\s*59/);
   });
});
