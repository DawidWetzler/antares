import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { matchesGrant } from '../../src/main/libs/misc/grantedPaths';

const posix = { isWindows: false };
const win = { isWindows: true };

const granted = ['/home/user/queries/report.sql', '/home/user/notes/scratch.sql'];
const winGranted = ['C:\\Users\\user\\queries\\report.sql'];

describe('matchesGrant', () => {
   test('a path the user picked in a dialog is granted', () => {
      assert.equal(matchesGrant('/home/user/queries/report.sql', granted, posix), true);
   });

   test('a path the user never picked is refused', () => {
      assert.equal(matchesGrant('/home/user/.ssh/id_rsa', granted, posix), false);
   });

   test('an empty grant list refuses everything', () => {
      assert.equal(matchesGrant('/home/user/queries/report.sql', [], posix), false);
   });

   test('traversal that lands back on a granted file is granted', () => {
      assert.equal(matchesGrant('/home/user/queries/../queries/report.sql', granted, posix), true);
   });

   test('traversal that escapes a granted directory is refused', () => {
      assert.equal(matchesGrant('/home/user/queries/../../../etc/passwd', granted, posix), false);
   });

   test('a granted file does not grant its directory', () => {
      assert.equal(matchesGrant('/home/user/queries', granted, posix), false);
   });

   test('a granted file does not grant its siblings', () => {
      assert.equal(matchesGrant('/home/user/queries/other.sql', granted, posix), false);
   });

   test('a relative path is refused', () => {
      assert.equal(matchesGrant('report.sql', granted, posix), false);
   });

   test('a win32 path differing only in case is granted, the filesystem is case-insensitive', () => {
      assert.equal(matchesGrant('c:\\users\\USER\\queries\\Report.sql', winGranted, win), true);
   });

   test('a case-folded path is refused off win32', () => {
      assert.equal(matchesGrant('/home/user/queries/REPORT.SQL', granted, posix), false);
   });

   test('a win32 path written with forward slashes is granted', () => {
      assert.equal(matchesGrant('C:/Users/user/queries/report.sql', winGranted, win), true);
   });

   test('a path that is not a string is refused, not thrown on', () => {
      assert.equal(matchesGrant(undefined as unknown as string, granted, posix), false);
   });
});
