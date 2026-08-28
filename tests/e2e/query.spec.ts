import { expect, test } from '@playwright/test';
import { Page } from 'playwright';

import { closeApp, connectSqliteWorkspace, launchApp, LaunchedApp, makeUserDataDir, typeInAceEditor } from './helpers';

const activeTab = (appWindow: Page) => appWindow.locator('.workspace-query-tab:visible');
const runQuery = async (appWindow: Page, sql: string) => {
   await typeInAceEditor(activeTab(appWindow), sql);
   await activeTab(appWindow).locator('.workspace-query-buttons button.btn-primary').click();
};

test.describe('query tab', () => {
   let app: LaunchedApp;
   let appWindow: Page;

   test.beforeEach(async () => {
      app = await launchApp(makeUserDataDir());
      appWindow = app.appWindow;
      await connectSqliteWorkspace(appWindow);
      await appWindow.locator('.workspace-tabs a.tab-add').click();
      await expect(appWindow.locator('.tab-item.active')).toContainText('Query #1');
   });

   // A tab's label turns into its query text once it has run, so address tabs by
   // position (`.tab-item.tab-draggable`) rather than by name.

   test.afterEach(async () => {
      await closeApp(app);
   });

   test('runs a SELECT and shows the expected rows', async () => {
      await runQuery(appWindow, 'SELECT id, name FROM people WHERE id < 4 ORDER BY id');

      const rows = activeTab(appWindow).locator('.workspace-query-results .vscroll-holder .tr');
      await expect(rows).toHaveCount(3);
      await expect(activeTab(appWindow).locator('.workspace-query-results .thead .table-column-title span'))
         .toHaveText(['id', 'name']);
      await expect(rows.nth(0).locator('.cell-content')).toHaveText(['1', 'person-1']);
      await expect(rows.nth(2).locator('.cell-content')).toHaveText(['3', 'person-3']);
   });

   test('a syntax error is reported and the tab survives', async () => {
      await runQuery(appWindow, 'SELEKT * FROM people');

      const toast = appWindow.locator('#notifications-board .toast-error');
      await expect(toast, 'syntax error surfaces in the UI').toBeVisible();
      await expect(toast).toContainText(/syntax error/i);

      // the tab is still alive and can run a good query straight after
      await activeTab(appWindow).locator('.workspace-query-buttons button', { hasText: 'Clear' }).click();
      await runQuery(appWindow, 'SELECT 42 AS answer');
      await expect(activeTab(appWindow).locator('.workspace-query-results .vscroll-holder .tr .cell-content'))
         .toHaveText(['42']);
   });

   test('multiple query tabs stay independent', async () => {
      await runQuery(appWindow, 'SELECT name FROM people WHERE id = 1');
      await expect(activeTab(appWindow).locator('.vscroll-holder .tr .cell-content')).toHaveText(['person-1']);

      await appWindow.locator('.workspace-tabs a.tab-add').click();
      await expect(appWindow.locator('.tab-item.active')).toContainText('Query #2');
      await expect(appWindow.locator('.tab-item.tab-draggable')).toHaveCount(2);
      await runQuery(appWindow, 'SELECT name FROM people WHERE id = 2');
      await expect(activeTab(appWindow).locator('.vscroll-holder .tr .cell-content')).toHaveText(['person-2']);

      // switching back must restore tab 1's own query text and its own results
      const tabs = appWindow.locator('.tab-item.tab-draggable');
      await tabs.nth(0).locator('.tab-link').click();
      await expect(tabs.nth(0)).toHaveClass(/active/);
      await expect(activeTab(appWindow).locator('.ace_content')).toContainText('WHERE id = 1');
      await expect(activeTab(appWindow).locator('.vscroll-holder .tr .cell-content')).toHaveText(['person-1']);

      await tabs.nth(1).locator('.tab-link').click();
      await expect(tabs.nth(1)).toHaveClass(/active/);
      await expect(activeTab(appWindow).locator('.ace_content')).toContainText('WHERE id = 2');
      await expect(activeTab(appWindow).locator('.vscroll-holder .tr .cell-content')).toHaveText(['person-2']);
   });
});
