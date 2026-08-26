import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import customizations from 'common/customizations';
import { defaults } from 'common/customizations/defaults';
import { bufferToBase64 } from 'common/libs/bufferToBase64';
import { getArrayDepth } from 'common/libs/getArrayDepth';
import hexToBinary, { HexChar } from 'common/libs/hexToBinary';

describe('customizations', () => {
   test('every client is registered and merged over defaults', () => {
      assert.deepEqual(Object.keys(customizations).sort(), ['firebird', 'maria', 'mysql', 'pg', 'sqlite']);
      for (const [name, c] of Object.entries(customizations)) {
         // Keys never overridden still come from defaults.
         assert.deepEqual(Object.keys(defaults).filter(k => !(k in c)), [], `client ${name} lost default keys`);
      }
      // maria and mysql share the same object.
      assert.equal(customizations.maria, customizations.mysql);
   });

   test('the defaults are all-off so an unset flag never enables a feature', () => {
      assert.equal(defaults.schemas, false);
      assert.equal(defaults.routines, false);
      assert.equal(defaults.processesList, false);
      assert.equal(defaults.elementsWrapper, '');
   });

   test('identifier and string wrappers differ per client', () => {
      assert.equal(customizations.mysql.elementsWrapper, '`');
      assert.equal(customizations.mysql.stringsWrapper, '"');
      assert.equal(customizations.pg.elementsWrapper, '"');
      assert.equal(customizations.pg.stringsWrapper, '\'');
      assert.equal(customizations.sqlite.elementsWrapper, '"');
      assert.equal(customizations.sqlite.stringsWrapper, '\'');
   });

   test('sqlite gates off the features it has no concept of', () => {
      assert.equal(customizations.sqlite.schemas, false);
      assert.equal(customizations.sqlite.routines, false);
      assert.equal(customizations.sqlite.functions, false);
      assert.equal(customizations.sqlite.processesList, false);
      assert.equal(customizations.sqlite.collations, false);
      // ... but keeps the ones it does support, and is the only file-based client.
      assert.equal(customizations.sqlite.tables, true);
      assert.equal(customizations.sqlite.views, true);
      assert.equal(customizations.sqlite.triggers, true);
      assert.equal(customizations.sqlite.fileConnection, true);
      assert.equal(customizations.pg.fileConnection, false);
      assert.equal(customizations.mysql.fileConnection, false);
   });

   test('mysql and pg enable structure features sqlite does not', () => {
      for (const flag of ['schemas', 'routines', 'functions'] as const) {
         assert.equal(customizations.mysql[flag], true, `mysql.${flag}`);
         assert.equal(customizations.pg[flag], true, `pg.${flag}`);
         assert.equal(customizations.sqlite[flag], false, `sqlite.${flag}`);
      }
   });

   test('pg-only and mysql-only features stay apart', () => {
      assert.equal(customizations.pg.triggerFunctions, true);
      assert.equal(customizations.mysql.triggerFunctions, false);
      assert.equal(customizations.mysql.schedulers, true);
      assert.equal(customizations.pg.schedulers, false);
   });

   test('mysql extends the shared operator list, the others inherit it', () => {
      for (const client of ['pg', 'sqlite', 'firebird'] as const)
         assert.deepEqual(customizations[client].operators, defaults.operators, `client ${client}`);

      assert.ok(customizations.mysql.operators.includes('RLIKE'));
      assert.ok(!defaults.operators.includes('RLIKE'));
      assert.ok(!customizations.pg.operators.includes('RLIKE'));
   });

   test('usersManagement is off everywhere - the flag exists but no client enables it', () => {
      for (const [name, c] of Object.entries(customizations))
         assert.equal(c.usersManagement, false, `client ${name}`);
   });
});

describe('getArrayDepth', () => {
   test('depth of flat, nested and non-array input', () => {
      assert.equal(getArrayDepth([]), 1);
      assert.equal(getArrayDepth([1, 2]), 1);
      assert.equal(getArrayDepth([[1], [2]]), 2);
      assert.equal(getArrayDepth([[[1]]]), 3);
      assert.equal(getArrayDepth('nope' as unknown as unknown[]), 0);
      assert.equal(getArrayDepth(null as unknown as unknown[]), 0);
   });

   test('ragged nesting reports the deepest branch', () => {
      assert.equal(getArrayDepth([1, [2, [3]]]), 3);
   });
});

describe('hexToBinary', () => {
   test('maps hex nibbles to 4-bit groups, either case', () => {
      assert.equal(hexToBinary('0f' as unknown as HexChar[]), '00001111');
      assert.equal(hexToBinary('0F' as unknown as HexChar[]), '00001111');
      assert.equal(hexToBinary('dead' as unknown as HexChar[]), '1101111010101101');
      assert.equal(hexToBinary('' as unknown as HexChar[]), '');
   });

   test('a non-hex character does not leak the string "undefined" into the literal', { todo: 'the lookup miss is concatenated straight into the result, so hexToBinary(\'g\') returns "undefined"' }, () => {
      assert.notEqual(hexToBinary('g' as unknown as HexChar[]), 'undefined');
   });
});

describe('bufferToBase64', () => {
   test('matches Buffer.toString for ascii and binary payloads', () => {
      assert.equal(bufferToBase64(Buffer.from('hello')), 'aGVsbG8=');
      assert.equal(bufferToBase64(Buffer.from([0x00, 0xff, 0x7f])), 'AP9/');
      assert.equal(bufferToBase64(Buffer.alloc(0)), '');
   });
});
