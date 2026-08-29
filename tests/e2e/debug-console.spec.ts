import { expect, test } from '@playwright/test';
import { Locator, Page } from 'playwright';

import { closeApp, connectSqliteWorkspace, launchApp, LaunchedApp, makeUserDataDir, typeInAceEditor } from './helpers';

// Carries every token class `sql-highlight` emits into this console, plus bare identifiers,
// which it leaves unwrapped.
const SAMPLE_SQL = 'SELECT COUNT(id) AS total FROM people WHERE city = \'city-3\' AND id < 42';

// Exact markup `highlight(sql, {html: true})` hands to `v-html` today (sql-highlight 4.4.0).
// The library emits `&#39;` for the quotes; the DOM serialises them back to `'` in innerHTML.
const SAMPLE_HTML = [
   '<span class="sql-hl-keyword">SELECT</span> ',
   '<span class="sql-hl-function">COUNT</span>',
   '<span class="sql-hl-bracket">(</span>id<span class="sql-hl-bracket">)</span> ',
   '<span class="sql-hl-keyword">AS</span> total ',
   '<span class="sql-hl-keyword">FROM</span> people ',
   '<span class="sql-hl-keyword">WHERE</span> city ',
   '<span class="sql-hl-special">=</span> ',
   '<span class="sql-hl-string">\'city-3\'</span> ',
   '<span class="sql-hl-keyword">AND</span> id ',
   '<span class="sql-hl-special">&lt;</span> ',
   '<span class="sql-hl-number">42</span>'
].join('');

const HL_CLASSES = ['keyword', 'function', 'number', 'string', 'special', 'bracket'];

const activeTab = (appWindow: Page) => appWindow.locator('.workspace-query-tab:visible');

const runQuery = async (appWindow: Page, sql: string) => {
   await typeInAceEditor(activeTab(appWindow), sql);
   // dismisses the autocompletion popup, which would otherwise sit over the Run button
   await activeTab(appWindow).locator('.ace_text-input').press('Escape');
   await activeTab(appWindow).locator('.workspace-query-buttons button.btn-primary').click();
};

// It opens on the "Executed queries" tab, the only surface that is highlighted.
const openConsole = async (appWindow: Page) => {
   await appWindow.locator('#footer .footer-link', { hasText: /^Console$/ }).click();
   await appWindow.locator('#console').waitFor();
};

// Connecting runs its own introspection queries, so the log is addressed by content.
const queryLog = (appWindow: Page, marker: string): Locator =>
   appWindow.locator('#console .console-log-sql').filter({ hasText: marker }).last();

test.describe('debug console SQL highlighting', () => {
   let app: LaunchedApp;
   let appWindow: Page;

   test.beforeEach(async () => {
      app = await launchApp(makeUserDataDir());
      appWindow = app.appWindow;
      await connectSqliteWorkspace(appWindow);
      await appWindow.locator('.workspace-tabs a.tab-add').click();
      await expect(appWindow.locator('.tab-item.active')).toContainText('Query #1');
   });

   test.afterEach(async () => {
      await closeApp(app);
   });

   test('wraps every SQL token in its sql-highlight class', async () => {
      await runQuery(appWindow, SAMPLE_SQL);
      await openConsole(appWindow);

      const log = queryLog(appWindow, 'city-3');
      await expect(log).toBeVisible();

      await expect(log.locator('.sql-hl-keyword')).toHaveText(['SELECT', 'AS', 'FROM', 'WHERE', 'AND']);
      await expect(log.locator('.sql-hl-function')).toHaveText(['COUNT']);
      await expect(log.locator('.sql-hl-bracket')).toHaveText(['(', ')']);
      await expect(log.locator('.sql-hl-string')).toHaveText(['\'city-3\'']);
      await expect(log.locator('.sql-hl-special')).toHaveText(['=', '<']);
      await expect(log.locator('.sql-hl-number')).toHaveText(['42']);

      // identifiers carry no class, so they must stay outside every span
      await expect(log.locator('span')).toHaveCount(12);

      expect(await log.innerHTML()).toBe(SAMPLE_HTML);
   });

   test('every emitted class paints a colour of its own', async () => {
      await runQuery(appWindow, SAMPLE_SQL);
      await openConsole(appWindow);

      const log = queryLog(appWindow, 'city-3');
      await expect(log).toBeVisible();

      // Losing the stylesheet is silent: the spans stay and the SQL just goes plain grey.
      const colours = await log.evaluate((el: HTMLElement, names: string[]) => {
         const out: Record<string, string> = { plain: getComputedStyle(el).color };
         for (const name of names) {
            const node = el.querySelector(`.sql-hl-${name}`) as HTMLElement;
            out[name] = node ? getComputedStyle(node).color : 'MISSING';
         }
         return out;
      }, HL_CLASSES);

      for (const name of HL_CLASSES) {
         expect(colours[name], `expect a .sql-hl-${name} node in the log`).not.toBe('MISSING');
         expect(colours[name], `.sql-hl-${name} colour vs plain text`).not.toBe(colours.plain);
      }
   });

   test('HTML inside a string literal reaches the console as text, not markup', async () => {
      const payload = '<img src=x onerror=1>';
      await runQuery(appWindow, `SELECT id FROM people WHERE name = '${payload}'`);
      await openConsole(appWindow);

      const log = queryLog(appWindow, 'onerror');
      await expect(log).toBeVisible();

      // `v-html` on DebugConsole.vue:54 is a real sink: whatever `highlight()` returns is
      // parsed as markup. sql-highlight escapes token content, so the payload stays inert.
      await expect(log.locator('img')).toHaveCount(0);
      await expect(log.locator('.sql-hl-string')).toHaveText([`'${payload}'`]);
      expect(await log.innerHTML()).toContain('&lt;img src=x onerror=1&gt;');
   });
});
