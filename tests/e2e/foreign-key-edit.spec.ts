import { expect, test } from '@playwright/test';
import * as mysql from 'mysql2/promise';
import { Page } from 'playwright';

import { closeApp, launchApp, LaunchedApp, makeUserDataDir, seedConnectionsStore } from './helpers';

// The foreign key dropdown is only fed by clients that report key usage, and SQLite's `raw`
// never fills it — so this drives the MySQL server from tests/docker-compose.yml.
const MYSQL = { host: '127.0.0.1', port: 53306, user: 'root', password: 'antares' };
const SCHEMA = `antares_e2e_fk_${process.pid.toString(36)}`;

// `model_has_roles` mirrors a pivot table: its primary key spans two columns, so the grid has
// no single primary field to address the edited row with.
const seedSchema = async () => {
   const conn = await mysql.createConnection({ ...MYSQL, multipleStatements: true });
   await conn.query(`DROP DATABASE IF EXISTS \`${SCHEMA}\``);
   await conn.query(`CREATE DATABASE \`${SCHEMA}\``);
   await conn.query(`CREATE TABLE \`${SCHEMA}\`.\`users\` (
      id BIGINT UNSIGNED PRIMARY KEY,
      name VARCHAR(50) NOT NULL
   ) ENGINE=InnoDB`);
   await conn.query(`INSERT INTO \`${SCHEMA}\`.\`users\` VALUES (1, 'user-1'), (2, 'user-2')`);
   // 250 more users: more than the 100 options the dropdown draws, so the page has to end
   // before the referenced table does and a value past it can only be reached by searching.
   await conn.query(`INSERT INTO \`${SCHEMA}\`.\`users\` (id, name)
      WITH RECURSIVE seq(n) AS (SELECT 3 UNION ALL SELECT n + 1 FROM seq WHERE n < 252)
      SELECT n, CONCAT('user-', n) FROM seq`);
   // One name carrying the characters a naive LIKE pattern would read as syntax.
   await conn.query(`INSERT INTO \`${SCHEMA}\`.\`users\` VALUES (900, 'odd%_name')`);
   await conn.query(`CREATE TABLE \`${SCHEMA}\`.\`model_has_roles\` (
      role_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (role_id, user_id),
      CONSTRAINT model_has_roles_user_id_foreign FOREIGN KEY (user_id) REFERENCES \`${SCHEMA}\`.\`users\` (id)
   ) ENGINE=InnoDB`);
   await conn.query(`INSERT INTO \`${SCHEMA}\`.\`model_has_roles\` VALUES (7, 1)`);
   await conn.end();
};

const dropSchema = async () => {
   const conn = await mysql.createConnection(MYSQL);
   await conn.query(`DROP DATABASE IF EXISTS \`${SCHEMA}\``);
   await conn.end();
};

const readPivot = async () => {
   const conn = await mysql.createConnection(MYSQL);
   const [rows] = await conn.query(`SELECT user_id FROM \`${SCHEMA}\`.\`model_has_roles\` WHERE role_id = 7`);
   await conn.end();
   return rows as { user_id: number }[];
};

const mysqlReachable = async () => {
   try {
      const conn = await mysql.createConnection({ ...MYSQL, connectTimeout: 2000 });
      await conn.end();
      return true;
   }
   catch {
      return false;
   }
};

const UID = `fk${process.pid.toString(36)}`;

const launchWithConnection = async (): Promise<LaunchedApp> => {
   const userDataDir = makeUserDataDir();
   const uid = UID;

   const seeding = await launchApp(userDataDir);
   await seedConnectionsStore(seeding.appWindow, {
      connections: [{
         uid,
         client: 'mysql',
         name: uid,
         ...MYSQL,
         database: SCHEMA,
         schema: SCHEMA,
         ask: false,
         readonly: false,
         singleConnectionMode: false,
         ssl: false,
         ssh: false,
         untrustedConnection: false
      }],
      connectionsOrder: [{ isFolder: false, uid, client: 'mysql', name: uid, icon: null }]
   });
   await closeApp(seeding);

   const app = await launchApp(userDataDir);
   await app.appWindow.locator('#settingbar .settingbar-top-elements .settingbar-element').first().click();
   await app.appWindow.locator('#connection-connect').click();
   await app.appWindow.locator('.workspace-explorebar').waitFor();
   return app;
};

const cell = (appWindow: Page, col: number) =>
   appWindow.locator('.workspace-query-results .vscroll-holder .tr').first().locator('.td').nth(col);

interface ForeignRow { foreign_column: string | number; foreign_description?: string }

/**
 * Calls `get-foreign-list` the way ForeignKeySelect does. The rendered dropdown cannot see
 * how much came over the wire -- BaseSelect draws only `maxVisibleOptions` either way -- so
 * the limit has to be asserted on the handler's own answer.
 */
const getForeignList = (appWindow: Page, params: Record<string, unknown>): Promise<{ status: string; response: { rows: ForeignRow[] } }> =>
   appWindow.evaluate(async (params) => {
      const { ipcRenderer } = require('electron');
      return ipcRenderer.invoke('get-foreign-list', params);
   }, params) as Promise<{ status: string; response: { rows: ForeignRow[] } }>;

const resetPivot = async () => {
   const conn = await mysql.createConnection(MYSQL);
   await conn.query(`UPDATE \`${SCHEMA}\`.\`model_has_roles\` SET user_id = 1 WHERE role_id = 7`);
   await conn.end();
};

test.describe('foreign key editing', () => {
   // One schema, one `app` handle and one pivot row are shared, and every test writes to it.
   test.describe.configure({ mode: 'serial' });

   let app: LaunchedApp;

   test.beforeAll(async () => {
      test.skip(!await mysqlReachable(),
         `mysql is not reachable on ${MYSQL.host}:${MYSQL.port} — run: docker compose -f tests/docker-compose.yml up -d --wait`);
      await seedSchema();
   });

   test.afterAll(async () => {
      if (await mysqlReachable()) await dropSchema();
   });

   test.beforeEach(async () => {
      if (await mysqlReachable()) await resetPivot();
   });

   test.afterEach(async () => {
      await closeApp(app);
   });

   test('picks a referenced row on a table without a single primary key', async () => {
      app = await launchWithConnection();
      const appWindow = app.appWindow;

      await appWindow.locator('.database-tables li', { hasText: 'model_has_roles' }).dblclick();
      await appWindow.locator('.workspace-query-results').waitFor();
      await expect(cell(appWindow, 1)).toHaveText('1');

      await cell(appWindow, 1).locator('.cell-content').dblclick();
      const options = cell(appWindow, 1).locator('.select__item');
      await expect(options.nth(0)).toHaveText(/^1\s+- user-1$/);
      await expect(options.nth(1)).toHaveText(/^2\s+- user-2$/);
      await options.nth(1).click();

      await expect(appWindow.locator('#notifications-board .toast-error')).toHaveCount(0);
      await expect(cell(appWindow, 1)).toHaveText('2');
      await expect.poll(readPivot, { message: 'the foreign key edit reaches the database' })
         .toEqual([{ user_id: 2 }]);
   });

   /**
    * `get-foreign-list` fetches one page instead of the whole referenced table, so the
    * search box has to reach the server: a value past the page is otherwise unreachable.
    * The referenced table holds 253 rows and the dropdown draws 100.
    */
   test('reaches a referenced row past the first page by searching for it', async () => {
      app = await launchWithConnection();
      const appWindow = app.appWindow;

      await appWindow.locator('.database-tables li', { hasText: 'model_has_roles' }).dblclick();
      await appWindow.locator('.workspace-query-results').waitFor();

      await cell(appWindow, 1).locator('.cell-content').dblclick();
      const options = cell(appWindow, 1).locator('.select__item');
      await expect(options).toHaveCount(100);

      // The value the cell holds stays readable while the dropdown is open and while typing:
      // the search box is empty, so it shows the current label as its placeholder.
      const search = cell(appWindow, 1).locator('.select__search-input');
      await expect(search).toHaveAttribute('placeholder', /^1\s+- user-1$/);

      // user-240 is outside the page, so only a server-side search can offer it.
      await search.focus();
      await search.fill('user-240');
      await expect(options).toHaveCount(2);
      await expect(search).toHaveAttribute('placeholder', /^1\s+- user-1$/);
      await expect(options.filter({ hasText: 'user-240' })).toHaveText([/^240\s+- user-240$/]);

      await options.filter({ hasText: 'user-240' }).click();

      await expect(appWindow.locator('#notifications-board .toast-error')).toHaveCount(0);
      await expect(cell(appWindow, 1)).toHaveText('240');
      await expect.poll(readPivot, { message: 'a row past the first page reaches the database' })
         .toEqual([{ user_id: 240 }]);
   });

   test('get-foreign-list answers with one page, never the whole referenced table', async () => {
      app = await launchWithConnection();
      const appWindow = app.appWindow;
      const base = { uid: UID, schema: SCHEMA, table: 'users', column: 'id', description: 'name' };

      // 253 rows in `users`; the dropdown draws 100.
      const capped = await getForeignList(appWindow, base);
      expect(capped.status).toBe('success');
      expect(capped.response.rows.length).toBe(100);

      const explicit = await getForeignList(appWindow, { ...base, limit: 7 });
      expect(explicit.response.rows.length).toBe(7);

      // The row the cell holds comes back with its description even though the page it
      // would sit in is not the page asked for, and it is not duplicated when it is.
      const past = await getForeignList(appWindow, { ...base, limit: 3, value: 240 });
      expect(past.response.rows.length).toBe(4);
      // BIGINT arrives as a string from this driver, hence the Number().
      expect(Number(past.response.rows[0].foreign_column)).toBe(240);
      expect(past.response.rows[0].foreign_description).toBe('user-240');

      const inside = await getForeignList(appWindow, { ...base, limit: 3, value: 2 });
      expect(inside.response.rows.length).toBe(3);
      expect(inside.response.rows.filter(r => Number(r.foreign_column) === 2).length).toBe(1);

      // A search narrows the page server side, and still carries the current value.
      const searched = await getForeignList(appWindow, { ...base, search: 'user-240', value: 1 });
      expect(searched.response.rows.map(r => Number(r.foreign_column))).toEqual([1, 240]);

      // A NULL current value asks for no extra row.
      const nulled = await getForeignList(appWindow, { ...base, limit: 2, value: null });
      expect(nulled.response.rows.length).toBe(2);
   });

   test('a search term matches anywhere in the value, and its wildcards stay literal', async () => {
      app = await launchWithConnection();
      const appWindow = app.appWindow;

      await appWindow.locator('.database-tables li', { hasText: 'model_has_roles' }).dblclick();
      await appWindow.locator('.workspace-query-results').waitFor();

      await cell(appWindow, 1).locator('.cell-content').dblclick();
      const options = cell(appWindow, 1).locator('.select__item');
      const search = cell(appWindow, 1).locator('.select__search-input');
      await search.focus();

      // "dd%_na" appears in the middle of `odd%_name`, never at its start, and carries the
      // two LIKE wildcards. A prefix match or a leaked wildcard both break this.
      await search.fill('dd%_na');
      await expect(options.filter({ hasText: 'odd%_name' })).toHaveCount(1);

      // A term matching nothing empties the list instead of erroring or offering everything.
      await search.fill('nobodyhasthisname');
      await expect(options).toHaveCount(1); // only the value the cell holds
      await expect(options).toHaveText([/^1\s+- user-1$/]);
      await expect(appWindow.locator('#notifications-board .toast-error')).toHaveCount(0);

      // A quote cannot break the query.
      await search.fill('\' OR 1=1 --');
      await expect(options).toHaveCount(1);
      await expect(appWindow.locator('#notifications-board .toast-error')).toHaveCount(0);
   });
});
