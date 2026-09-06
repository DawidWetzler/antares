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

const launchWithConnection = async (): Promise<LaunchedApp> => {
   const userDataDir = makeUserDataDir();
   const uid = `fk${process.pid.toString(36)}`;

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

test.describe('foreign key editing', () => {
   let app: LaunchedApp;

   test.beforeAll(async () => {
      test.skip(!await mysqlReachable(),
         `mysql is not reachable on ${MYSQL.host}:${MYSQL.port} — run: docker compose -f tests/docker-compose.yml up -d --wait`);
      await seedSchema();
   });

   test.afterAll(async () => {
      if (await mysqlReachable()) await dropSchema();
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
      await expect(options).toHaveText([/^1\s+- user-1$/, /^2\s+- user-2$/]);
      await options.nth(1).click();

      await expect(appWindow.locator('#notifications-board .toast-error')).toHaveCount(0);
      await expect(cell(appWindow, 1)).toHaveText('2');
      await expect.poll(readPivot, { message: 'the foreign key edit reaches the database' })
         .toEqual([{ user_id: 2 }]);
   });
});
