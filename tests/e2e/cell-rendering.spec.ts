import { expect, test } from '@playwright/test';
import { Page } from 'playwright';

import { closeApp, connectSqliteWorkspace, launchApp, LaunchedApp, makeUserDataDir } from './helpers';

// The grid appends an empty spacer `.td` after the last column, so the row is 4 cells wide.
const blobRow = (appWindow: Page) =>
   appWindow.locator('.workspace-query-results .vscroll-holder .tr').first().locator('.td');

test.describe('cell rendering', () => {
   let app: LaunchedApp;
   let appWindow: Page;

   test.beforeEach(async () => {
      app = await launchApp(makeUserDataDir());
      appWindow = app.appWindow;
      await connectSqliteWorkspace(appWindow);
      await appWindow.locator('.database-tables li', { hasText: 'blobs' }).dblclick();
      await appWindow.locator('.workspace-query-results').waitFor();
   });

   test.afterEach(async () => {
      await closeApp(app);
   });

   // SQLite hands DATETIME over as a string and typeFormat returns strings verbatim, so the
   // date assertion pins delivery of the stored value, not typeFormat's date formatting.
   test('renders a BLOB as its mime type and a DATETIME as its stored value', async () => {
      await expect(blobRow(appWindow).nth(1), 'the PNG magic bytes reach mimeFromHex intact')
         .toHaveText('image/png (8 Bytes)');
      await expect(blobRow(appWindow).nth(2), 'the seeded datetime reaches the cell unchanged')
         .toHaveText('2021-02-03 04:05:06');
      await expect(blobRow(appWindow), 'every cell of the seeded row renders its own value')
         .toHaveText(['1', 'image/png (8 Bytes)', '2021-02-03 04:05:06', '']);
   });
});
