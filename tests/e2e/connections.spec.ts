import { expect, test } from '@playwright/test';
import * as net from 'net';

import {
   fillConnectionName,
   launchApp,
   LaunchedApp,
   makeUserDataDir,
   pickFromBaseSelect,
   seedSqliteFixture
} from './helpers';

const isReachable = (host: string, port: number) => new Promise<boolean>(resolve => {
   const socket = net.connect({ host, port });
   const done = (ok: boolean) => {
      socket.destroy(); resolve(ok);
   };
   socket.setTimeout(2000);
   socket.once('connect', () => done(true));
   socket.once('timeout', () => done(false));
   socket.once('error', () => done(false));
});

test.describe('connections', () => {
   let app: LaunchedApp;

   test.beforeEach(async () => {
      app = await launchApp(makeUserDataDir());
   });

   test.afterEach(async () => {
      await app.electronApp.close();
   });

   test('creates, tests, saves and connects a SQLite connection', async () => {
      const { appWindow } = app;
      const dbFile = await seedSqliteFixture(appWindow);

      await fillConnectionName(appWindow, 'e2e sqlite');
      await pickFromBaseSelect(
         appWindow.locator('.connection-panel .form-group', { hasText: 'Client' }).locator('.select'),
         'SQLite'
      );
      // BaseUploadInput hides a real <input type=file>; Electron exposes File.path,
      // which is what the panel reads (WorkspaceAddConnectionPanel.vue pathSelection).
      await appWindow.locator('.connection-panel input.file-uploader-input').setInputFiles(dbFile);
      await expect(appWindow.locator('.connection-panel .file-uploader-value')).toContainText('.db');

      await appWindow.locator('#connection-test').click();
      await expect(
         appWindow.locator('#notifications-board .toast-success'),
         'test connection reports success'
      ).toContainText('Connection successfully made!');

      await appWindow.locator('#connection-save').click();
      await expect(
         appWindow.locator('.settingbar-top-elements .settingbar-element'),
         'saved connection lands in the settingbar'
      ).toHaveCount(1);

      await appWindow.locator('#connection-connect').click();
      await expect(appWindow.locator('.workspace-explorebar'), 'workspace opens on connect').toBeVisible();
      await expect(appWindow.locator('.workspace-explorebar-title')).toHaveText('e2e sqlite');
   });

   test('disconnects and reconnects from the UI', async () => {
      const { appWindow } = app;
      const dbFile = await seedSqliteFixture(appWindow);

      await fillConnectionName(appWindow, 'e2e reconnect');
      await pickFromBaseSelect(
         appWindow.locator('.connection-panel .form-group', { hasText: 'Client' }).locator('.select'),
         'SQLite'
      );
      await appWindow.locator('.connection-panel input.file-uploader-input').setInputFiles(dbFile);
      await appWindow.locator('#connection-save').click();
      await appWindow.locator('#connection-connect').click();
      await expect(appWindow.locator('.workspace-explorebar')).toBeVisible();

      await appWindow.locator('.workspace-explorebar-tools [title="Disconnect"]').click();
      await expect(appWindow.locator('.workspace-explorebar'), 'explore bar goes away on disconnect').toBeHidden();
      await expect(appWindow.locator('#connection-connect')).toBeVisible();

      await appWindow.locator('#connection-connect').click();
      await expect(appWindow.locator('.workspace-explorebar'), 'reconnect brings the workspace back').toBeVisible();
   });

   test('reports an error for invalid MySQL credentials', async () => {
      test.skip(!await isReachable('127.0.0.1', 53306),
         'MySQL is not reachable on 127.0.0.1:53306 — start tests/docker-compose.yml');

      const { appWindow } = app;
      await fillConnectionName(appWindow, 'e2e bad mysql');
      // client defaults to MySQL; host defaults to 127.0.0.1
      await appWindow.locator('.connection-panel .form-group', { hasText: 'Port' })
         .locator('input').fill('53306');
      await appWindow.locator('.connection-panel .form-group', { hasText: 'User' })
         .locator('input').fill('root');
      await appWindow.locator('.connection-panel .form-group', { hasText: 'Password' })
         .locator('input[type=password]').fill('definitely-not-antares');

      await appWindow.locator('#connection-test').click();
      const toast = appWindow.locator('#notifications-board .toast-error');
      await expect(toast, 'wrong password surfaces an error toast').toBeVisible();
      await expect(toast).toContainText(/access denied/i);
      await expect(appWindow.locator('#notifications-board .toast-success')).toHaveCount(0);
   });
});
