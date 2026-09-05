import { expect, test } from '@playwright/test';
import * as mysql from 'mysql2/promise';
import { Page } from 'playwright';

import { closeApp, closeModal, launchApp, LaunchedApp, makeUserDataDir, seedConnectionsStore } from './helpers';

// The map only renders for a spatial cell, and only MySQL and PostgreSQL map one. This drives the
// MySQL server from tests/docker-compose.yml — the same one the integration suite uses.
const MYSQL = { host: '127.0.0.1', port: 53306, user: 'root', password: 'antares' };
const SCHEMA = `antares_e2e_map_${process.pid.toString(36)}`;

// mysql2 is pure JS, so unlike better-sqlite3 it loads in the Playwright process directly.
const seedSpatialSchema = async () => {
   const conn = await mysql.createConnection({ ...MYSQL, multipleStatements: true });
   await conn.query(`DROP DATABASE IF EXISTS \`${SCHEMA}\``);
   await conn.query(`CREATE DATABASE \`${SCHEMA}\``);
   await conn.query(`CREATE TABLE \`${SCHEMA}\`.\`shapes\` (
      id INT PRIMARY KEY,
      pt POINT NOT NULL,
      mp MULTIPOLYGON NOT NULL
   ) ENGINE=InnoDB`);
   await conn.query(`INSERT INTO \`${SCHEMA}\`.\`shapes\` VALUES (
      1,
      ST_GeomFromText('POINT(9.19 45.46)'),
      ST_GeomFromText('MULTIPOLYGON(((9.1 45.4, 9.3 45.4, 9.3 45.6, 9.1 45.6, 9.1 45.4)),((9.4 45.4, 9.6 45.4, 9.6 45.6, 9.4 45.4)))')
   )`);
   await conn.end();
};

const dropSpatialSchema = async () => {
   const conn = await mysql.createConnection(MYSQL);
   await conn.query(`DROP DATABASE IF EXISTS \`${SCHEMA}\``);
   await conn.end();
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

// The connections store is encrypted with a renderer-held key, so it is seeded from a throwaway
// launch and read back by the launch under test.
const launchWithSpatialConnection = async (): Promise<LaunchedApp> => {
   const userDataDir = makeUserDataDir();
   const uid = `map${process.pid.toString(36)}`;

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

const openShapesTable = async (appWindow: Page) => {
   await appWindow.locator('.database-tables li', { hasText: 'shapes' }).dblclick();
   await appWindow.locator('.workspace-query-results').waitFor();
};

// column order is id, pt, mp, then the grid's trailing spacer cell
const cell = (appWindow: Page, col: number) =>
   appWindow.locator('.workspace-query-results .vscroll-holder .tr').first().locator('.td').nth(col);

const mapModal = (appWindow: Page) => appWindow.locator('.modal.active .map');

// Leaflet keeps the handlers it put on a DOM object in `_leaflet_events` on that object, and
// `Map.remove()` is what detaches them again — nulling the slot rather than dropping the key,
// hence the filter. `window` gets one for the map's resize handler.
const leafletWindowHandlers = (appWindow: Page) =>
   appWindow.evaluate(() => Object
      .values((window as unknown as { _leaflet_events?: Record<string, unknown> })._leaflet_events || {})
      .filter(Boolean).length);

test.describe('spatial map preview', () => {
   let app: LaunchedApp;

   test.beforeAll(async () => {
      test.skip(!await mysqlReachable(),
         `mysql is not reachable on ${MYSQL.host}:${MYSQL.port} — run: docker compose -f tests/docker-compose.yml up -d --wait`);
      await seedSpatialSchema();
   });

   test.afterAll(async () => {
      if (await mysqlReachable()) await dropSpatialSchema();
   });

   test.afterEach(async () => {
      await closeApp(app);
   });

   test('draws a single geometry', async () => {
      app = await launchWithSpatialConnection();
      await openShapesTable(app.appWindow);
      await cell(app.appWindow, 1).dblclick();

      await expect(mapModal(app.appWindow), 'leaflet takes over BaseMap root element')
         .toHaveClass(/leaflet-container/);
      await expect(mapModal(app.appWindow).locator('svg path'), 'the POINT is drawn as one marker')
         .toHaveCount(1);
   });

   test('draws every geometry of a multi geometry', async () => {
      app = await launchWithSpatialConnection();
      await openShapesTable(app.appWindow);
      await cell(app.appWindow, 2).dblclick();

      await expect(mapModal(app.appWindow), 'leaflet takes over BaseMap root element')
         .toHaveClass(/leaflet-container/);
      await expect(mapModal(app.appWindow).locator('svg path'), 'both polygons of the MULTIPOLYGON are drawn')
         .toHaveCount(2);
   });

   test('takes its leaflet handlers off window when the modal closes', async () => {
      app = await launchWithSpatialConnection();
      await openShapesTable(app.appWindow);
      await cell(app.appWindow, 1).dblclick();
      await expect(mapModal(app.appWindow)).toHaveClass(/leaflet-container/);

      expect(await leafletWindowHandlers(app.appWindow), 'the open map holds a window handler')
         .toBeGreaterThan(0);

      await closeModal(app.appWindow, '.modal.active');

      expect(await leafletWindowHandlers(app.appWindow), 'closing the modal must not leave the map behind')
         .toBe(0);
   });
});
