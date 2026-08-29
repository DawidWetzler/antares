import { expect, test } from '@playwright/test';
import { Locator, Page } from 'playwright';

import {
   closeApp,
   launchApp,
   LaunchedApp,
   makeUserDataDir,
   seedConnectionsStore,
   seedSqliteFixture
} from './helpers';

// A note counts as big above 75px of paragraph height. Measured here: 24px and 192px, so
// neither fixture sits near the boundary.
const LONG_NOTE = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod '.repeat(8);
const SHORT_NOTE = 'short note';

const openScratchpad = async (appWindow: Page): Promise<void> => {
   await appWindow.locator('#settingbar .settingbar-bottom-elements .settingbar-element').first().click();
   await appWindow.locator('.modal.active').filter({ has: appWindow.locator('.add-button') }).waitFor();
};

// The editor is Ace, so the text has to be typed — see `typeInAceEditor` in helpers.
const addNote = async (appWindow: Page, text: string): Promise<void> => {
   await appWindow.locator('.add-button').click();
   const modal = appWindow.locator('.modal.active').filter({ has: appWindow.locator('.editor-wrapper') });
   await modal.waitFor();
   await modal.locator('.editor').click();
   await modal.locator('.ace_text-input').pressSequentially(text);
   await modal.locator('.modal-footer .btn-primary').click();
   await modal.waitFor({ state: 'detached' });
};

const noteTile = (appWindow: Page, text: string): Locator =>
   appWindow.locator('.tile').filter({ hasText: text.slice(0, 30) });

test.describe('scratchpad note height', () => {
   let app: LaunchedApp;

   test.beforeEach(async () => {
      app = await launchApp(makeUserDataDir());
      await openScratchpad(app.appWindow);
   });

   test.afterEach(async () => {
      await closeApp(app);
   });

   test('leaves a short note without an expander or a clipping gradient', async () => {
      const { appWindow } = app;
      await addNote(appWindow, SHORT_NOTE);

      const tile = noteTile(appWindow, SHORT_NOTE);
      await expect(tile).toHaveCount(1);
      await expect(tile.locator('.tile-compress'), 'expect no expander on a note that fits')
         .toHaveCount(0);
      await expect(tile.locator('.tile-paragraph-overlay'), 'expect no gradient on a note that fits')
         .toHaveCount(0);
   });

   test('gives a long note an expander and a gradient, and drops the gradient once expanded', async () => {
      const { appWindow } = app;
      await addNote(appWindow, LONG_NOTE);

      const tile = noteTile(appWindow, LONG_NOTE);
      await expect(tile).toHaveCount(1);
      await expect(tile.locator('.tile-compress'), 'expect an expander on a clipped note')
         .toHaveCount(1);
      await expect(tile.locator('.tile-paragraph-overlay'), 'expect the clipping gradient on a clipped note')
         .toHaveCount(1);

      await tile.locator('.tile-compress').click();

      await expect(tile.locator('.tile-content-message'), 'expect the note opened by the expander')
         .toHaveClass(/opened/);
      await expect(tile.locator('.tile-paragraph-overlay'), 'expect the gradient gone once the note is open')
         .toHaveCount(0);
      await expect(tile.locator('.tile-compress'), 'expect the expander kept, to collapse the note again')
         .toHaveCount(1);
   });
});

// Measured: one entry is 70px against 530px of bar, so it turns over at eight.
const FITTING_CONNECTIONS = 3;
const OVERFLOWING_CONNECTIONS = 20;

const middleElements = (appWindow: Page): Locator =>
   appWindow.locator('#settingbar .settingbar-middle-elements .settingbar-element');

// The height is measured on mount, so the connections have to be on disk before the window
// opens — hence the seed-then-restart round trip.
const launchWithConnections = async (count: number): Promise<LaunchedApp> => {
   const userDataDir = makeUserDataDir();
   const names = Array.from({ length: count }, (_, i) => `c${process.pid}n${i}`);

   const seeding = await launchApp(userDataDir);
   const dbFile = await seedSqliteFixture(seeding.appWindow, 1);
   await seedConnectionsStore(seeding.appWindow, {
      connections: names.map(uid => ({ uid, client: 'sqlite', name: uid, databasePath: dbFile })),
      connectionsOrder: names.map(uid => ({ isFolder: false, uid, client: 'sqlite', name: uid, icon: null }))
   });
   await closeApp(seeding);

   const app = await launchApp(userDataDir);
   await expect(app.appWindow.locator('#settingbar .settingbar-top-elements .settingbar-element'))
      .toHaveCount(count);
   return app;
};

test.describe('settingbar connections overflow', () => {
   let app: LaunchedApp;

   test.afterEach(async () => {
      await closeApp(app);
   });

   test('hides the all connections button while every connection fits the bar', async () => {
      app = await launchWithConnections(FITTING_CONNECTIONS);

      await expect(
         middleElements(app.appWindow),
         'expect only the add connection button while the list fits'
      ).toHaveCount(1);
   });

   test('adds the all connections button once the list overflows the bar', async () => {
      app = await launchWithConnections(OVERFLOWING_CONNECTIONS);
      const { appWindow } = app;

      await expect(
         middleElements(appWindow),
         'expect the all connections button next to the add connection button'
      ).toHaveCount(2);

      await middleElements(appWindow).first().click();
      await expect(
         appWindow.locator('.modal.active .modal-title', { hasText: 'All connections' }),
         'expect the button to be the only route to the connections that do not fit'
      ).toBeVisible();
   });
});
