import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { isTrustedFrameUrl } from '../../src/main/libs/misc/validateSender';

const indexPath = '/opt/antares/resources/app.asar/dist/index.html';
const packaged = { isWindows: false, isDev: false };
const dev = { isWindows: false, isDev: true };
const win = { isWindows: true, isDev: false };

const winIndexPath = 'C:\\Program Files\\Antares\\dist\\index.html';
const storeIndexPath = 'C:\\Program Files\\WindowsApps\\AntaresSQL_0.7.35.0_x64__8wekyb3d8bbwe\\dist\\index.html';

describe('isTrustedFrameUrl', () => {
   test('the packaged index.html is trusted', () => {
      assert.equal(isTrustedFrameUrl(`file://${indexPath}`, indexPath, packaged), true);
   });

   test('another file:// document is not trusted', () => {
      assert.equal(isTrustedFrameUrl('file:///tmp/evil.html', indexPath, packaged), false);
   });

   test('the dev server is trusted in development', () => {
      assert.equal(isTrustedFrameUrl('http://localhost:9080/index.html', indexPath, dev), true);
   });

   test('the dev server is not trusted outside development', () => {
      assert.equal(isTrustedFrameUrl('http://localhost:9080/index.html', indexPath, packaged), false);
   });

   test('a foreign origin is not trusted', () => {
      assert.equal(isTrustedFrameUrl('https://evil.example/', indexPath, packaged), false);
   });

   test('a foreign origin is not trusted on win32 either', () => {
      assert.equal(isTrustedFrameUrl('https://evil.example/', indexPath, win), false);
   });

   test('an install path containing a space is trusted', () => {
      const spaced = '/Applications/Antares SQL.app/Contents/Resources/app.asar/dist/index.html';

      assert.equal(isTrustedFrameUrl(
         'file:///Applications/Antares%20SQL.app/Contents/Resources/app.asar/dist/index.html', spaced, packaged
      ), true);
   });

   test('a non-ASCII install path is trusted', () => {
      const accented = '/home/jürgen/日本/antares/dist/index.html';

      assert.equal(isTrustedFrameUrl(
         'file:///home/j%C3%BCrgen/%E6%97%A5%E6%9C%AC/antares/dist/index.html', accented, packaged
      ), true);
   });

   test('a win32 install path with a drive letter is trusted', () => {
      assert.equal(isTrustedFrameUrl(
         'file:///C:/Antares/dist/index.html', 'C:\\Antares\\dist\\index.html', win
      ), true);
   });

   test('a win32 install path with a space is trusted', () => {
      assert.equal(isTrustedFrameUrl(
         'file:///C:/Program%20Files/Antares/dist/index.html', winIndexPath, win
      ), true);
   });

   test('a Microsoft Store install path is trusted', () => {
      assert.equal(isTrustedFrameUrl(
         'file:///C:/Program%20Files/WindowsApps/AntaresSQL_0.7.35.0_x64__8wekyb3d8bbwe/dist/index.html',
         storeIndexPath, win
      ), true);
   });

   test('a sibling document in the install folder is not trusted on win32', () => {
      assert.equal(isTrustedFrameUrl(
         'file:///C:/Program%20Files/Antares/dist/evil.html', winIndexPath, win
      ), false);
   });

   test('a win32 path differing only in case is trusted, the filesystem is case-insensitive', () => {
      assert.equal(isTrustedFrameUrl(
         'file:///c:/program%20files/antares/dist/index.html', winIndexPath, win
      ), true);
   });

   test('a case-folded path is not trusted off win32', () => {
      assert.equal(isTrustedFrameUrl(
         'file:///OPT/antares/resources/app.asar/dist/index.html', indexPath, packaged
      ), false);
   });

   // A frame that never navigated reports an empty url. Denying has to stay a return value:
   // throwing out of an ipcMain handler surfaces to the user as a failed action instead.
   test('an unparseable frame url is refused, not thrown on', () => {
      assert.equal(isTrustedFrameUrl('', indexPath, packaged), false);
      assert.equal(isTrustedFrameUrl('not a url', winIndexPath, win), false);
   });
});
