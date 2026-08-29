import { expect, test } from '@playwright/test';
import { Page } from 'playwright';

import { closeApp, connectSqliteWorkspace, launchApp, LaunchedApp, makeUserDataDir, typeInAceEditor } from './helpers';

const activeTab = (appWindow: Page) => appWindow.locator('.workspace-query-tab:visible');

// Ace virtualises `.ace_line`, so the rendered DOM is not the document. `ace.edit()` hangs the
// live editor off its own container, which is the only place the whole text can be read from.
const editorValue = (appWindow: Page): Promise<string> =>
   activeTab(appWindow).locator('.editor-query').evaluate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      el => (el as any).env.editor.getValue() as string
   );

const formatButton = (appWindow: Page) =>
   activeTab(appWindow).locator('.workspace-query-buttons button[title="Format"]');

const formatQuery = async (appWindow: Page, sql: string): Promise<string> => {
   await typeInAceEditor(activeTab(appWindow), sql);
   await formatButton(appWindow).click();
   return editorValue(appWindow);
};

test.describe('query editor formatting', () => {
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

   test('breaks a SELECT with a JOIN onto indented clause lines', async () => {
      const formatted = await formatQuery(
         appWindow,
         'SELECT p.id,p.name,p.city FROM people p JOIN people q ON q.id=p.id WHERE p.id<4 ORDER BY p.name'
      );

      expect(formatted).toBe([
         'SELECT',
         '  p.id,',
         '  p.name,',
         '  p.city',
         'FROM',
         '  people p',
         '  JOIN people q ON q.id = p.id',
         'WHERE',
         '  p.id < 4',
         'ORDER BY',
         '  p.name'
      ].join('\n'));
   });

   test('keeps two statements apart and nests a subquery', async () => {
      const formatted = await formatQuery(
         appWindow,
         'INSERT INTO people (id,name,city) VALUES (61,\'a\',\'b\'),(62,\'c\',\'d\'); SELECT count(*) FROM people WHERE id IN (SELECT id FROM people WHERE name LIKE \'p%\') AND city IS NOT NULL'
      );

      expect(formatted).toBe([
         'INSERT INTO',
         '  people (id, name, city)',
         'VALUES',
         '  (61, \'a\', \'b\'),',
         '  (62, \'c\', \'d\');',
         '',
         'SELECT',
         '  count(*)',
         'FROM',
         '  people',
         'WHERE',
         '  id IN (',
         '    SELECT',
         '      id',
         '    FROM',
         '      people',
         '    WHERE',
         '      name LIKE \'p%\'',
         '  )',
         '  AND city IS NOT NULL'
      ].join('\n'));
   });

   test('leaves the query untouched when it cannot be parsed', async () => {
      const sql = 'SELECT id FROM people !';
      await typeInAceEditor(activeTab(appWindow), sql);
      await formatButton(appWindow).click();

      await expect.poll(() => editorValue(appWindow)).toBe(sql);

      // The parse error escapes the click handler and Vue logs it, which `closeApp` would fail
      // on. Spliced rather than reassigned: launchApp's console listener holds this array.
      const kept = app.rendererErrors.filter(e => !e.includes('Parse error'));
      app.rendererErrors.splice(0, app.rendererErrors.length, ...kept);
   });

   // `uppercase: true` was renamed to `keywordCase` in sql-formatter v10 and is now ignored.
   // The layout tests above feed upper case in, so fixing that does not turn them red.
   test.fixme('raises keywords to upper case', async () => {
      const formatted = await formatQuery(appWindow, 'select id from people where id < 4');

      expect(formatted).toBe(['SELECT', '  id', 'FROM', '  people', 'WHERE', '  id < 4'].join('\n'));
   });

   test.fixme('reports a parse error to the user', async () => {
      await typeInAceEditor(activeTab(appWindow), 'SELECT id FROM people !');
      await formatButton(appWindow).click();

      await expect(appWindow.locator('#notifications-board .toast-error')).toBeVisible();
   });

   test('the Format button is disabled while the editor is empty', async () => {
      await expect(formatButton(appWindow)).toBeDisabled();

      await typeInAceEditor(activeTab(appWindow), 'SELECT 1');
      await expect(formatButton(appWindow)).toBeEnabled();
   });
});
