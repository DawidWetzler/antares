import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ElectronApplication, Page } from 'playwright';

import { closeApp, launchApp, LaunchedApp, makeUserDataDir } from './helpers';

const fixture = (name: string, content = 'SELECT 1;'): string => {
   const file = path.join(os.tmpdir(), `antares-e2e-${process.pid}-${name}`);
   fs.writeFileSync(file, content, 'utf-8');
   return file;
};

const readFile = (appWindow: Page, filePath: string): Promise<unknown> =>
   appWindow.evaluate(target => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ipcRenderer } = require('electron');
      return ipcRenderer.invoke('read-file', { filePath: target, encoding: 'utf-8' });
   }, filePath);

const writeFile = (appWindow: Page, filePath: string, content: string): Promise<unknown> =>
   appWindow.evaluate(({ target, content }) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ipcRenderer } = require('electron');
      return ipcRenderer.invoke('write-file', target, content);
   }, { target: filePath, content });

const stubOpenDialog = (electronApp: ElectronApplication, filePath: string): Promise<void> =>
   electronApp.evaluate(({ dialog }, target) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
   }, filePath);

const stubSaveDialog = (electronApp: ElectronApplication, filePath: string): Promise<void> =>
   electronApp.evaluate(({ dialog }, target) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (dialog as any).showSaveDialog = async () => ({ canceled: false, filePath: target });
   }, filePath);

const pickInOpenDialog = (appWindow: Page): Promise<unknown> =>
   appWindow.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ipcRenderer } = require('electron');
      return ipcRenderer.invoke('show-open-dialog', { properties: ['openFile'] });
   });

const nameInSaveDialog = (appWindow: Page): Promise<unknown> =>
   appWindow.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ipcRenderer } = require('electron');
      return ipcRenderer.invoke('show-save-dialog', {});
   });

test.describe('file access', () => {
   let app: LaunchedApp;
   let appWindow: Page;
   let electronApp: ElectronApplication;

   test.beforeAll(async () => {
      app = await launchApp(makeUserDataDir());
      ({ appWindow, electronApp } = app);
   });

   test.afterAll(async () => {
      await closeApp(app);
   });

   test('a file the user never picked cannot be read', async () => {
      const secret = fixture('unpicked.txt', 'id_rsa stand-in');

      expect(await readFile(appWindow, secret)).toMatchObject({ status: 'error' });
      expect(await readFile(appWindow, secret)).not.toBe('id_rsa stand-in');
   });

   test('a file the user never picked cannot be written', async () => {
      const target = path.join(os.tmpdir(), `antares-e2e-${process.pid}-unpicked-write.txt`);
      fs.rmSync(target, { force: true });

      expect(await writeFile(appWindow, target, 'payload')).toMatchObject({ status: 'error' });
      expect(fs.existsSync(target), `expect ${target} not to be created`).toBe(false);
   });

   test('a file the user picked in the open dialog can be read', async () => {
      const file = fixture('picked.sql', 'SELECT picked;');
      await stubOpenDialog(electronApp, file);

      await pickInOpenDialog(appWindow);

      expect(await readFile(appWindow, file)).toBe('SELECT picked;');
   });

   test('a file the user named in the save dialog can be written', async () => {
      const file = path.join(os.tmpdir(), `antares-e2e-${process.pid}-named.sql`);
      fs.rmSync(file, { force: true });
      await stubSaveDialog(electronApp, file);

      await nameInSaveDialog(appWindow);

      expect(await writeFile(appWindow, file, 'SELECT saved;')).toMatchObject({ status: 'success' });
      expect(fs.readFileSync(file, 'utf-8')).toBe('SELECT saved;');
   });

   test('picking one file does not open its neighbours', async () => {
      const picked = fixture('neighbour-picked.sql', 'SELECT picked;');
      const sibling = fixture('neighbour-sibling.sql', 'SELECT sibling;');
      await stubOpenDialog(electronApp, picked);

      await pickInOpenDialog(appWindow);

      expect(await readFile(appWindow, sibling)).toMatchObject({ status: 'error' });
   });
});

test.describe('file access after an update', () => {
   let app: LaunchedApp;
   let appWindow: Page;
   const restored = fixture('restored-tab.sql', 'SELECT restored;');
   const stranger = fixture('stranger.sql', 'SELECT stranger;');

   test.beforeAll(async () => {
      const userDataDir = makeUserDataDir();
      fs.writeFileSync(
         path.join(userDataDir, 'tabs.json'),
         JSON.stringify({ 'connection-uid': [{ uid: 'tab-1', type: 'query', filePath: restored }] })
      );

      app = await launchApp(userDataDir);
      ({ appWindow } = app);
   });

   test.afterAll(async () => {
      await closeApp(app);
   });

   test('a file path already in the saved tabs stays readable', async () => {
      expect(await readFile(appWindow, restored)).toBe('SELECT restored;');
   });

   test('a file path absent from the saved tabs is still refused', async () => {
      expect(await readFile(appWindow, stranger)).toMatchObject({ status: 'error' });
   });
});
