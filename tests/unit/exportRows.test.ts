/* eslint-disable @typescript-eslint/no-explicit-any */
import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

// exportRows ends in a DOM download, so stub the few globals it touches and keep
// the Blob it hands to createObjectURL.
const blobs: Blob[] = [];
const anchors: Record<string, any>[] = [];
const g = globalThis as Record<string, any>;
g.document = {
   createElement: () => {
      const a: Record<string, any> = { style: {}, click: () => undefined, remove: () => undefined };
      anchors.push(a);
      return a;
   },
   body: { appendChild: () => undefined }
};
g.window = { URL: { createObjectURL: (b: Blob) => {
   blobs.push(b); return 'blob:stub';
} } };

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { exportRows } = require('@/libs/exportRows');

const exported = async (args: Record<string, any>) => {
   blobs.length = 0;
   anchors.length = 0;
   exportRows(args);
   assert.equal(blobs.length, 1, 'expected exactly one Blob');
   return { text: await blobs[0].text(), type: blobs[0].type, anchor: anchors[0] };
};

const CSV = { header: true, fieldDelimiter: ',', linesTerminator: '\\n', stringDelimiter: 'double' };
const csv = (content: any[], csvOptions: Record<string, any> = {}) =>
   exported({ type: 'csv', content, table: 't', csvOptions: { ...CSV, ...csvOptions } });

describe('exportRows - csv', () => {
   test('header row plus one data row', async () => {
      const { text, type } = await csv([{ id: 1, name: 'Bob' }]);
      assert.equal(text, 'id,name\n1,"Bob"');
      assert.equal(type, 'text/csv');
   });

   test('header can be turned off', async () => {
      const { text } = await csv([{ id: 1, name: 'Bob' }], { header: false });
      assert.equal(text, '1,"Bob"');
   });

   test('field delimiter variants', async () => {
      assert.equal((await csv([{ a: 1, b: 2 }], { fieldDelimiter: ';' })).text, 'a;b\n1;2');
      assert.equal((await csv([{ a: 1, b: 2 }], { fieldDelimiter: '\t' })).text, 'a\tb\n1\t2');
      assert.equal((await csv([{ a: 1, b: 2 }], { fieldDelimiter: '|' })).text, 'a|b\n1|2');
   });

   test('string delimiter single, double and none', async () => {
      const row = [{ a: 'x' }];
      assert.equal((await csv(row, { stringDelimiter: 'double' })).text, 'a\n"x"');
      assert.equal((await csv(row, { stringDelimiter: 'single' })).text, 'a\n\'x\'');
      assert.equal((await csv(row, { stringDelimiter: 'none' })).text, 'a\nx');
      // Anything other than single/double falls through to no delimiter.
      assert.equal((await csv(row, { stringDelimiter: '' })).text, 'a\nx');
   });

   test('line terminators \\n and \\r\\n', async () => {
      const rows = [{ a: 1 }, { a: 2 }];
      assert.equal((await csv(rows, { linesTerminator: '\\n' })).text, 'a\n1\n2');
      assert.equal((await csv(rows, { linesTerminator: '\\r\\n' })).text, 'a\r\n1\r\n2');
   });

   test('numbers, null and undefined', async () => {
      // Array.join turns null/undefined into an empty field.
      const { text } = await csv([{ n: 0, f: 1.5, neg: -2, nil: null, und: undefined }]);
      assert.equal(text, 'n,f,neg,nil,und\n0,1.5,-2,,');
   });

   test('Date values are formatted and quoted', async () => {
      const { text } = await csv([{ d: new Date(2024, 0, 2, 3, 4, 5) }]);
      assert.equal(text, 'd\n"2024-01-02 03:04:05"');
      assert.equal((await csv([{ d: new Date(2024, 0, 2, 3, 4, 5) }], { stringDelimiter: 'none' })).text, 'd\n2024-01-02 03:04:05');
   });

   test('Buffer and Uint8Array are base64 encoded and never quoted', async () => {
      const { text } = await csv([{ b: Buffer.from([1, 2]), u: new Uint8Array([3, 4]) }]);
      assert.equal(text, 'b,u\nAQI=,AwQ=');
   });

   test('booleans are stringified by join', async () => {
      assert.equal((await csv([{ a: true, b: false }])).text, 'a,b\ntrue,false');
   });

   test('an empty result set exports an empty file, header included', async () => {
      const { text } = await csv([]);
      assert.equal(text, '');
   });

   test('the download file name carries the table and page', async () => {
      assert.equal((await csv([{ a: 1 }])).anchor.download, 't.csv');
      assert.equal((await exported({ type: 'csv', content: [{ a: 1 }], table: 't', page: 3, csvOptions: CSV })).anchor.download, 't-3.csv');
   });

   // exportRows.ts:44-50 applies no CSV escaping at all - the tests below describe
   // what a conforming writer must do.
   test('a value containing the string delimiter has it doubled', { todo: 'no escaping is applied, so `he said "hi"` is emitted with bare inner quotes' }, async () => {
      const { text } = await csv([{ a: 'he said "hi"' }]);
      assert.equal(text, 'a\n"he said ""hi"""');
   });

   test('a single-quoted value containing an apostrophe has it doubled', { todo: 'same missing escaping on the single-delimiter path' }, async () => {
      assert.equal((await csv([{ a: 'it\'s' }], { stringDelimiter: 'single' })).text, 'a\n\'it\'\'s\'');
   });

   test('a value containing the field delimiter does not add a column', { todo: 'with stringDelimiter none the value is written bare, so "x,y" becomes two fields' }, async () => {
      const { text } = await csv([{ a: 'x,y', b: 'z' }], { stringDelimiter: 'none' });
      const [header, row] = text.split('\n');
      assert.equal(row.split(',').length, header.split(',').length);
   });

   test('a value containing the line terminator stays on one line', { todo: 'the newline inside the value is written raw, so one data row becomes two lines' }, async () => {
      const { text } = await csv([{ a: 'line1\nline2' }], { stringDelimiter: 'none' });
      assert.equal(text.split('\n').length, 2);
   });

   test('every data row has as many fields as the header', { todo: 'the header is Object.keys(content[0]) while each row is serialised from its own keys, so ragged rows misalign - today this yields "a,b\\n1,2\\n3\\n4,5,6"' }, async () => {
      const { text } = await csv([{ a: 1, b: 2 }, { a: 3 }, { a: 4, b: 5, c: 6 }]);
      const [header, ...rows] = text.split('\n');
      for (const row of rows)
         assert.equal(row.split(',').length, header.split(',').length, `row "${row}" does not match header "${header}"`);
   });
});

describe('exportRows - other formats share the entry point', () => {
   test('json is pretty printed with 3 spaces', async () => {
      const { text, type } = await exported({ type: 'json', content: [{ a: 1, b: null }], table: 't' });
      assert.equal(text, '[\n   {\n      "a": 1,\n      "b": null\n   }\n]');
      assert.equal(type, 'application/json');
   });

   test('json of an empty set is an empty array', async () => {
      assert.equal((await exported({ type: 'json', content: [], table: 't' })).text, '[]');
   });

   test('sql delegates to jsonToSqlInsert with the dialect wrappers', async () => {
      const fields = { id: { type: 'INT', datePrecision: 0 }, name: { type: 'VARCHAR', datePrecision: 0 } };
      assert.equal(
         (await exported({ type: 'sql', content: [{ id: 1, name: 'O\'Brien' }], table: 't', client: 'mysql', fields })).text,
         'INSERT INTO `t` (`id`, `name`) VALUES (1,"O\\\'Brien");'
      );
      assert.equal(
         (await exported({ type: 'sql', content: [{ id: 1, name: 'plain' }], table: 't', client: 'pg', fields })).text,
         'INSERT INTO "t" ("id", "name") VALUES (1,\'plain\');'
      );
   });

   test('sqlOptions.targetTable overrides the table in the SQL and the file name', async () => {
      const res = await exported({
         type: 'sql',
         content: [{ id: 1 }],
         table: 'source',
         client: 'pg',
         fields: { id: { type: 'INT', datePrecision: 0 } },
         sqlOptions: { sqlInsertAfter: 1, sqlInsertDivider: 'rows', targetTable: 'dest' }
      });
      assert.equal(res.text, 'INSERT INTO "dest" ("id") VALUES (1);');
      assert.equal(res.anchor.download, 'dest.sql');
      assert.equal(res.type, 'text/sql');
   });

   test('php emits a variable named after the table with dashes replaced', async () => {
      const { text, type } = await exported({ type: 'php', content: [{ a: 1 }], table: 'my-table' });
      assert.equal(text, '<?php\n$my_table = [\n\t[\n\t\t\'a\' => 1\n\t]\n];');
      assert.equal(type, 'application/x-httpd-php');
   });

   test('an unknown type does not write the string "undefined" into the file', { todo: 'the switch has an empty default, so `content` stays undefined and Blob stringifies it' }, async () => {
      const { text } = await exported({ type: 'xml' as any, content: [{ a: 1 }], table: 't' });
      assert.notEqual(text, 'undefined');
   });
});
