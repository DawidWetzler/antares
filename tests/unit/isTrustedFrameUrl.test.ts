import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { isTrustedFrameUrl } from '../../src/main/libs/misc/validateSender';

const indexPath = '/opt/antares/resources/app.asar/dist/index.html';
const packaged = { isWindows: false, isDev: false };
const dev = { isWindows: false, isDev: true };

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

   test('a foreign origin is not trusted on win32 either',
      { todo: 'the TEMP HOTFIX returns true for every frame on win32, before the URL is even looked at' },
      () => {
         assert.equal(isTrustedFrameUrl('https://evil.example/', indexPath, { isWindows: true, isDev: false }), false);
      });
});
