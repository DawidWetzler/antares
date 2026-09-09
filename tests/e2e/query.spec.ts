import { expect, test } from '@playwright/test';
import { Page } from 'playwright';

import { closeApp, connectSqliteWorkspace, launchApp, LaunchedApp, makeUserDataDir, typeInAceEditor } from './helpers';

const activeTab = (appWindow: Page) => appWindow.locator('.workspace-query-tab:visible');

// `ace.edit()` parks the editor on its own container element, so the live completer array of
// every mounted editor is readable from the page without a hook in production code.
type AceContainer = Element & { env?: { editor?: { completers?: unknown[] } } };
const completerState = (appWindow: Page) => appWindow.evaluate(() => {
   const arrays = Array.from(document.querySelectorAll('.editor-query'))
      .map(el => (el as AceContainer).env?.editor?.completers ?? []);

   return {
      editors: arrays.length,
      lengths: arrays.map(a => a.length),
      // one array object per editor: a shared one is how a tab inherits every other tab's
      // completers, and how one connection's tables end up in another connection's popup
      ownArrays: new Set(arrays).size
   };
});
// The popup is `position: fixed`, so the off-screen e2e window reports it as not visible; and
// a closed popup keeps the last rows it drew. `display` is what separates open from closed.
const popupText = (appWindow: Page) => appWindow.evaluate(() => {
   const popup = document.querySelector('.ace_autocomplete') as HTMLElement | null;
   return popup && getComputedStyle(popup).display !== 'none' ? popup.innerText : '';
});
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
      await appWindow.locator('.modal.active button', { hasText: 'Confirm' }).click();
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

   // The completer array ace hands out is module-level and shared by every editor in the
   // window, so pushing into it (the old `setCustomCompleter`) grew every editor's list by one
   // per query tab opened and per table name typed, and closing the tab left the entry behind.
   test('each editor owns its completer list, whatever the session does', async () => {
      const fresh = await completerState(appWindow);
      expect(fresh.editors).toBe(1);
      // a freshly mounted editor is the budget: ace's built-ins plus this editor's own completer
      const budget = fresh.lengths[0];

      await typeInAceEditor(activeTab(appWindow), 'SELECT id FROM people WHERE id = 1');
      // the old code re-registered a completer 100 ms after the recognised table count changed
      await appWindow.waitForTimeout(500);

      for (let i = 2; i <= 5; i++) {
         await appWindow.locator('.workspace-tabs a.tab-add').click();
         await expect(appWindow.locator('.tab-item.active')).toContainText(`Query #${i}`);
      }

      const used = await completerState(appWindow);
      expect(used.editors).toBe(5);
      expect(Math.max(...used.lengths), `completers per editor: ${used.lengths}`).toBeLessThanOrEqual(budget);
      expect(used.ownArrays, 'every editor has its own completer array').toBe(used.editors);

      for (let i = 5; i > 1; i--) {
         await appWindow.locator('.tab-item.tab-draggable').last().locator('.btn-clear').click();
         await expect(appWindow.locator('.tab-item.tab-draggable')).toHaveCount(i - 1);
      }

      const afterClose = await completerState(appWindow);
      expect(afterClose.lengths, 'a closed tab leaves no completer behind').toEqual([budget]);
   });

   test('suggestions still cover tables, columns and SQL keywords', async () => {
      // A caption is asserted together with its meta ('peopletable' is `people` + `table`), so
      // the assertion also names which completer served the row.
      const cases: [string, string, string][] = [
         ['SELECT * FROM ', 'peo', 'peopletable'],
         ['SELECT * FROM people WHERE ', 'cit', 'citycolumn'],
         ['', 'sele', 'selectkeyword'],
         ['SELECT * FROM people WHERE ', 'people.', 'namecolumn']
      ];

      for (const [stem, prefix, expected] of cases) {
         const input = activeTab(appWindow).locator('.editor-query .ace_text-input');
         await input.press('ControlOrMeta+a');
         await input.pressSequentially(stem);
         // Typed at full speed the popup lags a prefix behind and ends up closed, so the
         // prefix that has to produce suggestions is typed a keystroke at a time.
         await input.pressSequentially(prefix, { delay: 200 });

         await expect.poll(() => popupText(appWindow), { message: `suggestions for "${stem}${prefix}"` })
            .toContain(expected);
      }
   });

   test('clearing asks for confirmation and only wipes the tab once confirmed', async () => {
      await runQuery(appWindow, 'SELECT 42 AS answer');
      await expect(activeTab(appWindow).locator('.workspace-query-results .vscroll-holder .tr .cell-content'))
         .toHaveText(['42']);

      const clearButton = activeTab(appWindow).locator('.workspace-query-buttons button', { hasText: 'Clear' });
      const modal = appWindow.locator('.modal.active');

      await clearButton.click();
      await expect(modal, 'clear is confirmed, never immediate').toBeVisible();
      await expect(activeTab(appWindow).locator('.ace_content')).toContainText('SELECT 42');

      await modal.locator('button', { hasText: 'Cancel' }).click();
      await expect(modal).toBeHidden();
      await expect(activeTab(appWindow).locator('.ace_content')).toContainText('SELECT 42');
      await expect(activeTab(appWindow).locator('.workspace-query-results .vscroll-holder .tr .cell-content'))
         .toHaveText(['42']);

      await clearButton.click();
      await modal.locator('button', { hasText: 'Confirm' }).click();
      await expect(modal).toBeHidden();
      await expect(activeTab(appWindow).locator('.ace_content')).not.toContainText('SELECT 42');
      await expect(activeTab(appWindow).locator('.workspace-query-results .vscroll-holder .tr')).toHaveCount(0);
   });
});
