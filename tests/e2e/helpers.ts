import { expect } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { _electron as electron, ConsoleMessage, ElectronApplication, Locator, Page } from 'playwright';

import { encrypt } from '../../src/common/libs/encrypter';

export interface LaunchedApp {
   electronApp: ElectronApplication;
   appWindow: Page;
   userDataDir: string;
   rendererErrors: string[];
}

// Opening Preferences mounts the changelog tab even when another tab is selected (v-show), and
// it fetches release notes from GitHub, which 403s once the anonymous 60/hour cap is spent.
// Only this host is dropped: a failed local resource still fails the test.
const isReleaseNotesFetch = (msg: ConsoleMessage): boolean =>
   msg.location().url.startsWith('https://api.github.com/');

export const makeUserDataDir = (): string =>
   fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'antares-e2e-')));

export const appVersion = (): string =>

   require(path.resolve(__dirname, '../../package.json')).version as string;

// On a virgin userData dir the changelog modal's overlay eats every click
// (`cachedVersion` mismatch, stores/application.ts:30), so `cached_version` is pre-stamped.
export const launchApp = async (userDataDir: string, opts: { firstRun?: boolean; entry?: string } = {}): Promise<LaunchedApp> => {
   const settingsFile = path.join(userDataDir, 'settings.json');
   if (!opts.firstRun && !fs.existsSync(settingsFile))
      seedSettings(userDataDir, { cached_version: appVersion(), notifications_timeout: 3600 });

   const rendererErrors: string[] = [];
   const electronApp = await electron.launch({
      args: [opts.entry ?? 'dist/main.js', `--user-data-dir=${userDataDir}`],
      // Electron has no headless mode; main.ts reads this and never shows the window, so a
      // run does not take over the screen. The window still composites, so screenshots work.
      env: { ...process.env, ANTARES_E2E_HEADLESS: '1' }
   });
   const appWindow = await electronApp.firstWindow();
   // Guards the env var above: without it every spec silently takes over the screen again.
   expect(await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
      'expect the e2e window to stay off screen').toBe(false);

   appWindow.on('console', msg => {
      if (msg.type() === 'error' && !isReleaseNotesFetch(msg)) rendererErrors.push(msg.text());
   });
   appWindow.on('pageerror', err => rendererErrors.push(err.message));

   await appWindow.waitForEvent('load');
   await appWindow.locator('#footer').waitFor();

   return { electronApp, appWindow, userDataDir, rendererErrors };
};

// Closes before asserting: throwing first would leak the Electron process for the rest of the run.
export const closeApp = async (app: LaunchedApp): Promise<void> => {
   const errors = [...app.rendererErrors];
   await app.electronApp.close();
   expect(errors, `expect no renderer errors, got:\n${errors.join('\n')}`).toEqual([]);
};

export const seedSettings = (userDataDir: string, settings: Record<string, unknown>): void =>
   fs.writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify(settings));

export const readSettings = (userDataDir: string): Record<string, unknown> =>
   JSON.parse(fs.readFileSync(path.join(userDataDir, 'settings.json'), 'utf-8'));

export const readWindowState = (userDataDir: string): Record<string, number> =>
   JSON.parse(fs.readFileSync(path.join(userDataDir, 'window-state.json'), 'utf-8'));

export const closeModal = async (appWindow: Page, selector: string): Promise<void> => {
   await appWindow.locator(`${selector} .modal-header .btn-clear`).click();
   await appWindow.locator(selector).waitFor({ state: 'detached' });
};

export const openSettingsModal = async (appWindow: Page): Promise<void> => {
   await appWindow.locator('.settingbar-bottom-elements .settingbar-element').last().click();
   await appWindow.locator('#settings').waitFor();
};

// Enter commits `filteredOptions[hightlightedIndex]`, an index only recomputed in a watcher
// (:31 vs :241) — stale, or `undefined` once filtering shortened the list, which silently
// leaves the old value. So the pick is verified and retried; finding 27 in tests/FINDINGS.md.
export const pickFromBaseSelect = async (root: Locator, optionLabel: string): Promise<void> => {
   const committed = root.locator('.select__item-text span');

   for (let attempt = 1; attempt <= 3; attempt++) {
      // focus(), not click(): the dropdown opens from `@focus="activate()"`, and a click on a
      // window without OS focus never delivers it — hence the breakage only in parallel runs.
      await root.focus();
      if (!await root.locator('.select__list-wrapper').count())
         await root.click();

      const search = root.locator('.select__search-input');
      await search.fill(optionLabel);
      // exact text: the page-size options include both '100' and '1000'
      await expect(root.locator('.select__item').filter({ hasText: new RegExp(`^${optionLabel}$`) })).toHaveCount(1);
      await expect(root.locator('.select__item.select__option--highlight')).toHaveText(optionLabel);
      await search.press('Enter');
      await expect(root.locator('.select__list-wrapper')).toHaveCount(0);

      if ((await committed.textContent())?.trim() === optionLabel) return;
   }

   throw new Error(`BaseSelect never committed "${optionLabel}" in 3 attempts (see finding 27)`);
};

export const fillConnectionName = async (appWindow: Page, name: string): Promise<void> =>
   appWindow.locator('.connection-panel .form-group', { hasText: 'Connection name' })
      .locator('input')
      .fill(name);

// 60 rows forces a second page at the smallest page size the settings modal offers (40).
export const seedSqliteFixture = async (appWindow: Page, rows = 60): Promise<string> => {
   const file = path.join(makeUserDataDir(), 'fixture.db');
   await sqliteExec(appWindow, file, [
      // `city` is VARCHAR on purpose: Antares inline-edits TEXT-family columns
      // but routes LONG_TEXT (SQLite's `TEXT`) through an Ace modal instead.
      'CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city VARCHAR(50))',
      'CREATE TABLE empty_table (id INTEGER PRIMARY KEY)',
      // X'89504E47...' is the PNG magic number, so the grid has a mime to label the cell with.
      'CREATE TABLE blobs (id INTEGER PRIMARY KEY, payload BLOB, seen_at DATETIME)',
      'INSERT INTO blobs (id, payload, seen_at) VALUES (1, X\'89504E470D0A1A0A\', \'2021-02-03 04:05:06\')',
      `WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < ${rows})
       INSERT INTO people (id, name, city) SELECT n, 'person-' || n, 'city-' || (n % 7) FROM seq`
   ]);
   return file;
};

// The native module is built for Electron's ABI, so the renderer (nodeIntegration: true)
// is the only place it loads — never the Playwright node process.
export const sqliteExec = async <T>(appWindow: Page, file: string, statements: string[]): Promise<T> =>
   appWindow.evaluate(({ file, statements }) => {
      const Database = require('better-sqlite3');
      const db = new Database(file);
      let last: unknown = null;
      for (const sql of statements) {
         const stmt = db.prepare(sql);
         last = stmt.reader ? stmt.all() : stmt.run();
      }
      db.close();
      return last as T;
   }, { file, statements });

// Returns the fixture path, so specs can verify writes straight against the database.
export const connectSqliteWorkspace = async (appWindow: Page, name = 'e2e sqlite'): Promise<string> => {
   const dbFile = await seedSqliteFixture(appWindow);

   await fillConnectionName(appWindow, name);
   await pickFromBaseSelect(
      appWindow.locator('.connection-panel .form-group', { hasText: 'Client' }).locator('.select'),
      'SQLite'
   );
   await appWindow.locator('.connection-panel input.file-uploader-input').setInputFiles(dbFile);
   await appWindow.locator('#connection-save').click();
   await appWindow.locator('#connection-connect').click();
   await appWindow.locator('.workspace-explorebar').waitFor();

   return dbFile;
};

// Ace keeps its text in a hidden textarea and repaints `.ace_content` itself, so
// `fill()` on `.ace_text-input` is swallowed — the input has to be typed.
export const typeInAceEditor = async (tab: Locator, sql: string): Promise<void> => {
   const editor = tab.locator('.editor-query');
   await editor.locator('.ace_content').click();
   await editor.locator('.ace_text-input').press('ControlOrMeta+a');
   await editor.locator('.ace_text-input').pressSequentially(sql);
   await expect(editor.locator('.ace_content')).toContainText(sql.slice(0, 20));
};

// `page.waitForEvent('download')` never fires for Electron, so the main process's
// `will-download` is hooked instead.
export const captureDownload = async (
   electronApp: ElectronApplication,
   savePath: string,
   trigger: () => Promise<void>
): Promise<string> => {
   await electronApp.evaluate(({ session }, target) => {
      const g = globalThis as unknown as { __e2eDownload?: unknown };
      g.__e2eDownload = null;
      session.defaultSession.once('will-download', (_event, item) => {
         item.setSavePath(target);
         item.once('done', (_e, state) => {
            g.__e2eDownload = { state, filename: item.getFilename(), savePath: item.getSavePath() };
         });
      });
   }, savePath);

   await trigger();

   await expect
      .poll(() => electronApp.evaluate(() =>
         (globalThis as unknown as { __e2eDownload?: { state: string } }).__e2eDownload), {
         message: `expected a completed download at ${savePath}`,
         timeout: 20_000
      })
      .toMatchObject({ state: 'completed' });

   return fs.readFileSync(savePath, 'utf-8');
};

export interface IconFixture { uid: string; name: string; svg: string }
export interface CustomIconRecord { uid: string; base64: string }

// The `connections` store is encrypted with a key the renderer keeps in localStorage, so it
// can only be seeded from inside a running renderer, not from disk like settings.json.
export const seedConnectionsStore = async (
   appWindow: Page,
   entries: Record<string, unknown>
): Promise<void> =>
   appWindow.evaluate(entries => {
      const Store = require('electron-store').default;
      const store = new Store({ name: 'connections', encryptionKey: localStorage.getItem('key') });
      for (const [key, value] of Object.entries(entries))
         store.set(key, value);
   }, entries);

export const readConnectionsStore = async <T>(appWindow: Page, key: string): Promise<T> =>
   appWindow.evaluate(key => {
      const Store = require('electron-store').default;
      const store = new Store({ name: 'connections', encryptionKey: localStorage.getItem('key') });
      return store.get(key) as unknown;
   }, key) as Promise<T>;

export const iconConnectionFixture = (iconUid: string, name: string): Record<string, unknown> => {
   const connection = {
      uid: `${iconUid}:conn`,
      client: 'sqlite',
      name,
      databasePath: path.join(makeUserDataDir(), 'never-opened.db')
   };

   return {
      connections: [connection],
      connectionsOrder: [{
         isFolder: false,
         uid: connection.uid,
         client: 'sqlite',
         name,
         icon: iconUid,
         hasCustomIcon: true
      }]
   };
};

// The file format mirrors `ModalSettingsDataExport.vue:247-256`. Icon uids must not contain
// `-`: `SettingBarConnections.vue:57` camelize()s the uid, which breaks the icon lookup.
export const writeIconSettingsExport = (icons: IconFixture[], passkey: string): string => {
   const connections = icons.map(icon => ({
      uid: `${icon.uid}:conn`,
      client: 'sqlite',
      name: icon.name,
      databasePath: path.join(makeUserDataDir(), 'never-opened.db')
   }));

   const payload = JSON.stringify({
      connections,
      connectionsOrder: connections.map((connection, i) => ({
         isFolder: false,
         uid: connection.uid,
         client: 'sqlite',
         name: connection.name,
         icon: icons[i].uid,
         hasCustomIcon: true
      })),
      customIcons: icons.map(icon => ({
         uid: icon.uid,
         base64: Buffer.from(icon.svg, 'utf-8').toString('base64')
      }))
   });

   const file = path.join(makeUserDataDir(), `icons-${process.pid}.antares`);
   fs.writeFileSync(file, Buffer.from(JSON.stringify(encrypt(payload, passkey)), 'utf-8').toString('hex'));
   return file;
};

export const importSettingsFile = async (appWindow: Page, file: string, passkey: string): Promise<void> => {
   await openSettingsModal(appWindow);
   await appWindow.locator('#settings .tab-item', { hasText: 'Data' }).click();
   await appWindow.locator('#settings button', { hasText: 'Import data' }).click();

   // The import modal carries no id; the file input is what makes it unambiguous.
   const importModal = appWindow
      .locator('.modal.active .modal-container')
      .filter({ has: appWindow.locator('input.file-uploader-input') });
   await importModal.waitFor();
   await importModal.locator('input.file-uploader-input').setInputFiles(file);
   await importModal.locator('input[type="password"]').fill(passkey);
   await importModal.locator('button', { hasText: /^Import$/ }).click();
   await importModal.waitFor({ state: 'detached' });
   await closeModal(appWindow, '#settings');
};

export const customIconInSidebar = (appWindow: Page, connectionName: string): Locator =>
   appWindow
      .locator('#settingbar .settingbar-element', { hasText: connectionName })
      .locator('.settingbar-element-icon');
