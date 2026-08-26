/**
 * The query tab: raw() results and field metadata, error reporting, the multi-statement
 * splitter, and the per-dialect value mapping the grid and the exporters depend on.
 */
import * as assert from 'node:assert/strict';
import { after, before, describe, it, TestContext } from 'node:test';

import { Dialect, DIALECTS, Fixture, openFixture, requireServer } from '../support/db';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = { rows: any[]; fields: any[]; report: any };

/** What each driver hands back for the seeded values; this is what the grid renders. */
const shape: Record<Dialect, {
   decimal: unknown;
   json: 'object' | 'string';
   boolTrue: unknown;
   boolFalse: unknown;
}> = {
   sqlite: { decimal: 10.5, json: 'string', boolTrue: 1, boolFalse: 0 },
   mysql: { decimal: '10.50', json: 'object', boolTrue: 1, boolFalse: 0 },
   pg: { decimal: '10.50', json: 'object', boolTrue: true, boolFalse: false }
};

const syntaxError: Record<Dialect, RegExp> = {
   sqlite: /near "SELCT": syntax error/,
   mysql: /You have an error in your SQL syntax.*SELCT/s,
   pg: /syntax error at or near "SELCT"/
};

for (const dialect of DIALECTS) {
   describe(`query / ${dialect}`, () => {
      let fx: Fixture;

      before(async t => {
         if (!await requireServer(t as TestContext, dialect)) return;
         fx = await openFixture(dialect, `query_${dialect}`);
      });

      after(async () => {
         if (fx) await fx.drop();
      });

      it('returns rows and field metadata for a SELECT', async t => {
         if (!await requireServer(t, dialect)) return;
         const result = await fx.client.raw(`SELECT id, title FROM ${fx.t('books')} ORDER BY id`) as Result;

         assert.equal(result.rows.length, 7);
         assert.equal(result.rows[0].title, 'Aardvark');
         assert.deepEqual(result.fields.map(f => f.alias), ['id', 'title']);
         assert.equal(result.fields[1].table, 'books');
         assert.ok(typeof result.duration === 'number' || result.duration === undefined);
      });

      it('returns an empty row set without erroring', async t => {
         if (!await requireServer(t, dialect)) return;
         const result = await fx.client.raw(`SELECT * FROM ${fx.t('books')} WHERE 1 = 0`) as Result;

         assert.deepEqual(result.rows, []);
         assert.equal(result.fields.length, 10, 'column metadata is still needed to draw the grid');
      });

      it('rejects a syntax error with a message naming the problem', async t => {
         if (!await requireServer(t, dialect)) return;
         await assert.rejects(() => fx.client.raw('SELCT * FROM books'), syntaxError[dialect]);
      });

      it('splits a multi-statement script into one result per statement', async t => {
         if (!await requireServer(t, dialect)) return;
         const results = await fx.client.raw('SELECT 1 AS a; SELECT 2 AS b;') as Result[];

         assert.ok(Array.isArray(results), 'expected one result object per statement');
         assert.equal(results.length, 2);
         assert.equal(Number(Object.values(results[0].rows[0])[0]), 1);
         assert.equal(Number(Object.values(results[1].rows[0])[0]), 2);
      });

      it('does not split on a semicolon inside a string literal', async t => {
         if (!await requireServer(t, dialect)) return;
         const result = await fx.client.raw('SELECT \'a;b\' AS s') as Result;

         assert.equal(Array.isArray(result), false, 'a single statement must stay single');
         assert.equal(Object.values(result.rows[0])[0], 'a;b');
      });

      it('round-trips the value types the grid and the exporters care about', async t => {
         if (!await requireServer(t, dialect)) return;
         const { rows } = await fx.client.raw(`SELECT * FROM ${fx.t('books')} ORDER BY id`) as Result;
         const first = rows[0];
         const last = rows[6];

         // NULL
         for (const column of ['price', 'published', 'created_at', 'cover', 'meta'])
            assert.equal(last[column], null, `${column} of the all-NULL row`);

         // dates / datetimes come back as strings so the grid can show them verbatim
         assert.equal(first.published, '2020-01-10');
         assert.match(String(first.created_at), /^2020-01-10[ T]10:20:30/);

         // decimals
         assert.equal(first.price, shape[dialect].decimal);

         // blob / bytea
         assert.ok(Buffer.isBuffer(first.cover), `cover should be a Buffer, got ${typeof first.cover}`);
         assert.equal(Buffer.from(first.cover).toString('hex'), '0102ff');

         // json
         assert.equal(typeof first.meta, shape[dialect].json);
         const meta = typeof first.meta === 'string' ? JSON.parse(first.meta) : first.meta;
         assert.deepEqual(meta, { n: 0 });

         // booleans
         assert.equal(first.active, shape[dialect].boolTrue);
         assert.equal(rows[1].active, shape[dialect].boolFalse);

         // unicode
         await fx.exec(`UPDATE ${fx.t('books')} SET title = 'Ünïcodé ✅ 日本' WHERE id = 1`);
         const after = await fx.client.raw(`SELECT title FROM ${fx.t('books')} WHERE id = 1`) as Result;
         assert.equal(after.rows[0].title, 'Ünïcodé ✅ 日本');
      });
   });
}

describe('query / dialect specific splitting', () => {
   /*
    * BUG (src/common/libs/sqlUtils.ts:61-79): the dollar-tag branch matches
    * `line.slice(i).match(/\$(\w+)?\$/)` — anywhere in the rest of the line rather than at
    * position `i` — so for every character before a `$$` it believes it just opened a tag,
    * appends `$$` to the output and skips a character. `CREATE FUNCTION ... AS $$ ... $$`
    * comes out of the splitter as `C$$E$$T$$ $$U$$C$$I$$N$$...`, which no server can parse.
    * Effect: PostgreSQL statements containing a dollar-quoted body cannot be run from the
    * query tab at all (the seed DDL in tests/support/db.ts has to pass `split: false`).
    */
   it('pg keeps a dollar-quoted body in one statement', { todo: 'querySplitter corrupts $$ bodies' }, async t => {
      if (!await requireServer(t, 'pg')) return;
      const fx = await openFixture('pg', 'split_pg');
      try {
         // the semicolons live inside $$ ... $$ and must not become separate statements
         await fx.client.raw(`
            CREATE FUNCTION "${fx.schema}".two() RETURNS integer AS $$
            BEGIN
               PERFORM 1;
               RETURN 2;
            END;
            $$ LANGUAGE plpgsql
         `);
         const { rows } = await fx.client.raw(`SELECT "${fx.schema}".two() AS n`) as Result;
         assert.equal(Number(rows[0].n), 2);
      }
      finally {
         await fx.drop();
      }
   });

   it('pg keeps a dollar-quoted literal intact', { todo: 'querySplitter corrupts $$ bodies' }, async t => {
      if (!await requireServer(t, 'pg')) return;
      const fx = await openFixture('pg', 'split_pg_lit', { seed: false });
      try {
         const result = await fx.client.raw('SELECT $$a;b$$ AS s') as Result;
         assert.equal(Array.isArray(result), false, 'a dollar-quoted literal is one statement');
         assert.equal(result.rows[0].s, 'a;b');
      }
      finally {
         await fx.drop();
      }
   });

   it('mysql keeps a BEGIN ... END trigger body in one statement', async t => {
      if (!await requireServer(t, 'mysql')) return;
      const fx = await openFixture('mysql', 'split_mysql');
      try {
         await fx.client.raw(`
            CREATE TRIGGER \`${fx.schema}\`.\`books_bu\` BEFORE UPDATE ON \`${fx.schema}\`.\`books\`
            FOR EACH ROW
            BEGIN
               SET NEW.tag = 'touched';
            END;
         `);
         await fx.exec(`UPDATE \`${fx.schema}\`.\`books\` SET title = 'x' WHERE id = 1`);
         const { rows } = await fx.client.raw(`SELECT tag FROM \`${fx.schema}\`.\`books\` WHERE id = 1`) as Result;
         assert.equal(rows[0].tag, 'touched');
      }
      finally {
         await fx.drop();
      }
   });
});
