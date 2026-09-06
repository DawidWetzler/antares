import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { updateStrategy } from '../../src/main/libs/misc/updateStrategy';

const appImage = { isWindowsStore: false, isAppImage: true };
const noAppImage = { isWindowsStore: false, isAppImage: false };
const windowsStore = { isWindowsStore: true, isAppImage: false };

describe('updateStrategy', () => {
   test('the Windows Store build never updates itself', () => {
      assert.equal(updateStrategy('win32', windowsStore), 'none');
   });

   test('a Linux build outside an AppImage is updated by its package manager', () => {
      assert.equal(updateStrategy('linux', noAppImage), 'none');
   });

   test('an AppImage updates itself, no signature required', () => {
      assert.equal(updateStrategy('linux', appImage), 'auto');
   });

   // Neither platform's binaries are code signed here, so an installed update would be
   // refused by Gatekeeper and flagged by SmartScreen. Point at the download page instead.
   test('macOS is told about an update rather than given one', () => {
      assert.equal(updateStrategy('darwin', noAppImage), 'notify');
   });

   test('Windows outside the Store is told about an update rather than given one', () => {
      assert.equal(updateStrategy('win32', noAppImage), 'notify');
   });
});
