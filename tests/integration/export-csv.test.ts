/**
 * CSV export of real rows: fetch through the client, hand the rows to the renderer's
 * exportRows() with a stubbed DOM, and read back the Blob it would have downloaded.
 * This is where per-dialect value mapping (dates, blobs, NULL, booleans) becomes visible.
 */
import * as assert from 'node:assert/strict';
import { after, before, describe, it, TestContext } from 'node:test';

import { Dialect, DIALECTS, Fixture, openFixture, requireServer } from '../support/db';

/* eslint-disable @typescript-eslint/no-explicit-any */
const captured: Blob[] = [];
const downloads: string[] = [];

// exportRows() builds an <a download> and clicks it; give it just enough DOM to do that.
const noop = () => { /* no browser here */ };

(globalThis as any).document = {
   createElement: () => ({
      style: {} as Record<string, string>,
      download: '',
      href: '',
      click: noop,
      remove: noop
   }),
   body: {
      appendChild: (el: any) => {
         downloads.push(el.download);
      }
   }
};
(globalThis as any).window = {
   URL: {
      createObjectURL: (blob: Blob) => {
         captured.push(blob);
         return 'blob:stub';
      }
   }
};

// Loaded after the stubs: the module itself is side-effect free, but keep the order honest.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { exportRows } = require('@/libs/exportRows') as typeof import('@/libs/exportRows');

const CSV_OPTIONS = { header: true, fieldDelimiter: ';', linesTerminator: '\\n', stringDelimiter: 'double' };

const toCsv = async (rows: any[], table: string) => {
   captured.length = 0;
   downloads.length = 0;
   exportRows({ type: 'csv', content: rows, table, csvOptions: { ...CSV_OPTIONS } as never });
   assert.equal(captured.length, 1, 'exportRows should have produced exactly one Blob');
   return { text: await captured[0].text(), fileName: downloads[0] };
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Blob content as the CSV writer renders the seeded row 1 per dialect. Note what falls out of
 * exportRows() unchanged: MySQL/PG JSON columns arrive already parsed and stringify to
 * `[object Object]`, and SQLite's JSON-in-TEXT keeps its inner double quotes unescaped.
 * Both are asserted as bugs at the bottom of this file.
 */
const firstRow: Record<Dialect, string> = {
   sqlite: '1;1;"Aardvark";10.5;"2020-01-10";"2020-01-10 10:20:30";AQL/;"{"n": 0}";1;"tag0"',
   mysql: '1;1;"Aardvark";"10.50";"2020-01-10";"2020-01-10 10:20:30";AQL/;[object Object];1;"tag0"',
   pg: '1;1;"Aardvark";"10.50";"2020-01-10";"2020-01-10 10:20:30";AQL/;[object Object];true;"tag0"'
};

const nullRow: Record<Dialect, string> = {
   sqlite: '7;1;"Gecko";;;;;;1;"tag6"',
   mysql: '7;1;"Gecko";;;;;;1;"tag6"',
   pg: '7;1;"Gecko";;;;;;true;"tag6"'
};

for (const dialect of DIALECTS) {
   describe(`csv export / ${dialect}`, () => {
      let fx: Fixture;

      before(async t => {
         if (!await requireServer(t as TestContext, dialect)) return;
         fx = await openFixture(dialect, `csv_${dialect}`);
      });

      after(async () => {
         if (fx) await fx.drop();
      });

      it('writes a header and one line per row', async t => {
         if (!await requireServer(t, dialect)) return;
         const { rows } = await fx.client.raw(`SELECT * FROM ${fx.t('books')} ORDER BY id`) as { rows: unknown[] };
         const { text, fileName } = await toCsv(rows, 'books');
         const lines = text.split('\n');

         assert.equal(fileName, 'books.csv');
         assert.equal(lines.length, 8, 'header plus 7 rows');
         assert.equal(lines[0], 'id;author_id;title;price;published;created_at;cover;meta;active;tag');
      });

      it('renders dates, decimals, blobs and booleans the way this dialect delivers them', async t => {
         if (!await requireServer(t, dialect)) return;
         const { rows } = await fx.client.raw(`SELECT * FROM ${fx.t('books')} ORDER BY id`) as { rows: unknown[] };
         const { text } = await toCsv(rows, 'books');

         assert.equal(text.split('\n')[1], firstRow[dialect]);
      });

      it('writes NULL as an empty field', async t => {
         if (!await requireServer(t, dialect)) return;
         const { rows } = await fx.client.raw(`SELECT * FROM ${fx.t('books')} WHERE id = 7`) as { rows: unknown[] };
         const { text } = await toCsv(rows, 'books');

         // id;author_id;title then five NULL columns then active;tag
         assert.equal(text.split('\n')[1], nullRow[dialect]);
      });

      it('quotes values that contain the delimiter and unicode', async t => {
         if (!await requireServer(t, dialect)) return;
         await fx.exec(`UPDATE ${fx.t('books')} SET title = 'semi;colon ✅' WHERE id = 1`);
         const { rows } = await fx.client.raw(`SELECT id, title FROM ${fx.t('books')} WHERE id = 1`) as { rows: unknown[] };
         const { text } = await toCsv(rows, 'books');

         assert.equal(text.split('\n')[1], '1;"semi;colon ✅"');
      });

      it('exports nothing but an empty document for an empty result set', async t => {
         if (!await requireServer(t, dialect)) return;
         const { rows } = await fx.client.raw(`SELECT * FROM ${fx.t('books')} WHERE 1 = 0`) as { rows: unknown[] };
         const { text } = await toCsv(rows, 'books');

         assert.equal(text, '', 'no rows means no header either');
      });
   });
}

describe('csv export / broken value handling', () => {
   /*
    * BUG (src/renderer/libs/exportRows.ts:39-47): a string value is wrapped in the string
    * delimiter but the delimiter is never doubled inside it, so a cell containing a `"`
    * produces a CSV file no parser can read back.
    */
   it('escapes the string delimiter inside a value', { todo: 'exportRows never escapes the string delimiter' }, async () => {
      const fx = await openFixture('sqlite', 'csv_quote');
      try {
         await fx.exec(`UPDATE ${fx.t('books')} SET title = 'say "hi"' WHERE id = 1`);
         const { rows } = await fx.client.raw(`SELECT title FROM ${fx.t('books')} WHERE id = 1`) as { rows: unknown[] };
         const { text } = await toCsv(rows, 'books');
         assert.equal(text.split('\n')[1], '"say ""hi"""');
      }
      finally {
         await fx.drop();
      }
   });

   /*
    * BUG (src/renderer/libs/exportRows.ts:41-46): the value mapper only special-cases string,
    * Date, Buffer and Uint8Array. MySQL and PostgreSQL hand JSON columns back as parsed
    * objects, which Array.join() renders as `[object Object]` — the data is simply lost.
    */
   for (const dialect of ['mysql', 'pg'] as Dialect[]) {
      it(`${dialect} exports a JSON column as JSON`, { todo: 'objects stringify to [object Object]' }, async t => {
         if (!await requireServer(t, dialect)) return;
         const fx = await openFixture(dialect, `csv_json_${dialect}`);
         try {
            const { rows } = await fx.client.raw(`SELECT meta FROM ${fx.t('books')} WHERE id = 1`) as { rows: unknown[] };
            const { text } = await toCsv(rows, 'books');
            assert.match(text.split('\n')[1], /"n"\s*:\s*0/);
         }
         finally {
            await fx.drop();
         }
      });
   }
});
