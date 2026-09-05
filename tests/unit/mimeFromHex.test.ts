import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { mimeFromHex } from 'common/libs/mimeFromHex';

// Both call sites hand over the first 4 bytes of the blob, hex encoded and uppercased.
describe('mimeFromHex - 2 byte signatures', () => {
   test('every 2 byte signature resolves from a full 4 byte sample', () => {
      assert.deepEqual(mimeFromHex('424D3600'), { ext: 'bmp', mime: 'image/bmp' });
      assert.deepEqual(mimeFromHex('1F8B0800'), { ext: 'tar.gz', mime: 'application/gzip' });
      assert.deepEqual(mimeFromHex('0B770000'), { ext: 'ac3', mime: 'audio/vnd.dolby.dd-raw' });
      assert.deepEqual(mimeFromHex('78010203'), { ext: 'dmg', mime: 'application/x-apple-diskimage' });
      assert.deepEqual(mimeFromHex('4D5A9000'), { ext: 'exe', mime: 'application/x-msdownload' });
   });

   test('both compress signatures resolve to the same type', () => {
      assert.deepEqual(mimeFromHex('1FA00000'), { ext: 'Z', mime: 'application/x-compress' });
      assert.deepEqual(mimeFromHex('1F9D0000'), { ext: 'Z', mime: 'application/x-compress' });
   });

   test('a blob shorter than the signature window still matches', () => {
      assert.deepEqual(mimeFromHex('424D'), { ext: 'bmp', mime: 'image/bmp' });
   });
});

describe('mimeFromHex - 3 byte signatures', () => {
   test('every 3 byte signature resolves from a full 4 byte sample', () => {
      assert.deepEqual(mimeFromHex('FFD8FFE0'), { ext: 'jpg', mime: 'image/jpeg' });
      assert.deepEqual(mimeFromHex('4949BC01'), { ext: 'jxr', mime: 'image/vnd.ms-photo' });
      assert.deepEqual(mimeFromHex('425A6839'), { ext: 'bz2', mime: 'application/x-bzip2' });
   });

   test('a 3 byte blob matches without a fourth byte', () => {
      assert.deepEqual(mimeFromHex('FFD8FF'), { ext: 'jpg', mime: 'image/jpeg' });
   });
});

describe('mimeFromHex - 4 byte signatures', () => {
   test('every 4 byte signature resolves', () => {
      assert.deepEqual(mimeFromHex('89504E47'), { ext: 'png', mime: 'image/png' });
      assert.deepEqual(mimeFromHex('47494638'), { ext: 'gif', mime: 'image/gif' });
      assert.deepEqual(mimeFromHex('25504446'), { ext: 'pdf', mime: 'application/pdf' });
      assert.deepEqual(mimeFromHex('504B0304'), { ext: 'zip', mime: 'application/zip' });
      assert.deepEqual(mimeFromHex('425047FB'), { ext: 'bpg', mime: 'image/bpg' });
      assert.deepEqual(mimeFromHex('4D4D002A'), { ext: 'tif', mime: 'image/tiff' });
      assert.deepEqual(mimeFromHex('00000100'), { ext: 'ico', mime: 'image/x-icon' });
   });
});

describe('mimeFromHex - unrecognised input', () => {
   test('an unknown signature reports itself in the mime type', () => {
      assert.deepEqual(mimeFromHex('DEADBEEF'), { ext: '', mime: 'unknown DEADBEEF' });
   });

   test('a prefix of a 4 byte signature is not a match', () => {
      assert.deepEqual(mimeFromHex('89504E'), { ext: '', mime: 'unknown 89504E' });
      assert.deepEqual(mimeFromHex('8950'), { ext: '', mime: 'unknown 8950' });
   });

   test('a lowercase signature is not a match, the callers uppercase', () => {
      assert.deepEqual(mimeFromHex('89504e47'), { ext: '', mime: 'unknown 89504e47' });
   });

   test('more than 4 bytes never matches, the callers truncate', () => {
      assert.deepEqual(mimeFromHex('89504E470D0A'), { ext: '', mime: 'unknown 89504E470D0A' });
   });
});
