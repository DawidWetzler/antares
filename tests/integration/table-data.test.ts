/**
 * The table-data grid: reading a page through the query builder the way
 * `get-table-data` does, paginating it, and the insert / update / delete / truncate
 * round trips behind the cell editor — plus the writes that must be refused.
 */
import * as assert from 'node:assert/strict';
import { after, before, describe, it, TestContext } from 'node:test';

import { FLOAT, LONG_TEXT, NUMBER, TEXT } from 'common/fieldTypes';
import { sqlEscaper } from 'common/libs/sqlUtils';

import { Dialect, DIALECTS, Fixture, openFixture, requireServer } from '../support/db';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** `get-table-data`: select * with limit/offset and an optional sort. */
const page = async (fx: Fixture, limit: number, pageNo: number) => {
   const result = await fx.client
      .select('*')
      .schema(fx.schema)
      .from('books')
      .orderBy({ id: 'ASC' })
      .limit(limit)
      .offset((pageNo - 1) * limit)
      .run({ details: true, schema: fx.schema }) as { rows: Row[]; fields: Row[] };

   return result;
};

const exactCount = async (fx: Fixture, table = 'books') => {
   const { rows } = await fx.exec(`SELECT COUNT(*) AS c FROM ${fx.t(table)}`) as { rows: Row[] };
   return Number(rows[0].c);
};

const one = async (fx: Fixture, id: number) => {
   const { rows } = await fx.exec(`SELECT * FROM ${fx.t('books')} WHERE id = ${id}`) as { rows: Row[] };
   return rows[0];
};

/**
 * Mirrors the escaping `update-table-cell` (src/main/ipc-handlers/tables.ts:126-250) applies
 * before handing the value to the builder, for the column types this fixture uses.
 */
const escapeCell = (dialect: Dialect, type: string, content: string | null) => {
   if (content === null) return 'NULL';
   if ([...NUMBER, ...FLOAT].includes(type)) return content;
   if ([...TEXT, ...LONG_TEXT].includes(type))
      return dialect === 'mysql' ? `"${sqlEscaper(content)}"` : `'${content.replaceAll('\'', '\'\'')}'`;
   return `'${sqlEscaper(content)}'`;
};

/** The primary-key branch of `update-table-cell`. */
const updateCell = (fx: Fixture, args: { field: string; type: string; content: string | null; id: number }) => {
   const escaped = escapeCell(fx.dialect, args.type, args.content);
   return fx.client
      .update({ [args.field]: `= ${escaped}` })
      .schema(fx.schema)
      .from('books')
      .where({ id: `= ${args.id}` })
      .limit(1)
      .run();
};

/** Column type as the grid sees it, per dialect (matches getTableColumns). */
const textType: Record<Dialect, string> = { sqlite: 'VARCHAR', mysql: 'VARCHAR', pg: 'CHARACTER VARYING' };
const numType: Record<Dialect, string> = { sqlite: 'DECIMAL', mysql: 'DECIMAL', pg: 'NUMERIC' };

for (const dialect of DIALECTS) {
   describe(`table data / ${dialect}`, () => {
      let fx: Fixture;

      before(async t => {
         if (!await requireServer(t as TestContext, dialect)) return;
         fx = await openFixture(dialect, `data_${dialect}`);
      });

      after(async () => {
         if (fx) await fx.drop();
      });

      it('reads a page with field metadata, like the grid does', async t => {
         if (!await requireServer(t, dialect)) return;
         const { rows, fields } = await page(fx, 3, 1);

         assert.equal(rows.length, 3);
         assert.deepEqual(rows.map(r => r.title), ['Aardvark', 'Basilisk', 'Cormorant']);
         assert.deepEqual(fields.map(f => f.name), [
            'id', 'author_id', 'title', 'price', 'published', 'created_at', 'cover', 'meta', 'active', 'tag'
         ]);
         // details:true resolves the primary key so the grid knows the row is editable
         assert.equal(fields.find(f => f.name === 'id').key, 'pri');
      });

      it('paginates: page 2 is disjoint from page 1 under a stable sort', async t => {
         if (!await requireServer(t, dialect)) return;
         const first = await page(fx, 3, 1);
         const second = await page(fx, 3, 2);

         assert.deepEqual(first.rows.map(r => r.id), [1, 2, 3]);
         assert.deepEqual(second.rows.map(r => r.id), [4, 5, 6]);
         assert.equal(first.rows.filter(r => second.rows.some(s => s.id === r.id)).length, 0);
      });

      it('paginates: the last page is partial and an offset past the end is empty', async t => {
         if (!await requireServer(t, dialect)) return;
         assert.deepEqual((await page(fx, 3, 3)).rows.map(r => r.id), [7]);
         assert.deepEqual((await page(fx, 3, 4)).rows, []);
         assert.deepEqual((await page(fx, 3, 40)).rows, []);
      });

      it('counts the rows', async t => {
         if (!await requireServer(t, dialect)) return;
         assert.equal(await exactCount(fx), 7);
         assert.equal(Number(await fx.client.getTableApproximateCount({ schema: fx.schema, table: 'books' })), 7);
      });

      it('edits a cell and the new value persists', async t => {
         if (!await requireServer(t, dialect)) return;
         await updateCell(fx, { field: 'title', type: textType[dialect], content: 'Edited title', id: 2 });
         assert.equal((await one(fx, 2)).title, 'Edited title');
         assert.equal((await one(fx, 1)).title, 'Aardvark', 'the edit must not touch other rows');
      });

      it('edits a cell to a value that needs escaping', async t => {
         if (!await requireServer(t, dialect)) return;
         const nasty = 'O\'Brien "the \\ quote" — ✅ 日本';
         await updateCell(fx, { field: 'title', type: textType[dialect], content: nasty, id: 3 });
         assert.equal((await one(fx, 3)).title, nasty);
      });

      it('edits a cell to NULL', async t => {
         if (!await requireServer(t, dialect)) return;
         await updateCell(fx, { field: 'price', type: numType[dialect], content: null, id: 4 });
         assert.equal((await one(fx, 4)).price, null);
      });

      it('inserts a row and lets the defaults and auto-increment fill in', async t => {
         if (!await requireServer(t, dialect)) return;
         const before = await exactCount(fx);

         await fx.client
            .schema(fx.schema)
            .into('books')
            .insert([{ author_id: 1, title: '\'Inserted\'' }])
            .run();

         assert.equal(await exactCount(fx), before + 1);
         const { rows } = await fx.exec(`SELECT * FROM ${fx.t('books')} WHERE title = 'Inserted'`) as { rows: Row[] };
         assert.equal(rows.length, 1);
         assert.ok(rows[0].id > 7, `auto-increment should hand out a fresh id, got ${rows[0].id}`);
         assert.equal(rows[0].tag, 'none', 'the column default should apply');
         assert.equal(rows[0].price, null);
      });

      it('deletes a row and it is gone', async t => {
         if (!await requireServer(t, dialect)) return;
         const before = await exactCount(fx);

         await fx.client
            .schema(fx.schema)
            .delete('books')
            .where({ id: 'IN (5)' })
            .limit(1)
            .run();

         assert.equal(await exactCount(fx), before - 1);
         assert.equal(await one(fx, 5), undefined);
      });

      it('truncates the table', async t => {
         if (!await requireServer(t, dialect)) return;
         await fx.client.truncateTable({ schema: fx.schema, table: 'books', force: true });
         assert.equal(await exactCount(fx), 0);
      });
   });
}

for (const dialect of DIALECTS) {
   describe(`table data / ${dialect} / refused writes`, () => {
      let fx: Fixture;

      before(async t => {
         if (!await requireServer(t as TestContext, dialect)) return;
         fx = await openFixture(dialect, `bad_${dialect}`);
      });

      after(async () => {
         if (fx) await fx.drop();
      });

      const intact = async () => assert.equal(await exactCount(fx), 7, 'the refused write must not have changed the table');

      it('refuses a NOT NULL violation', async t => {
         if (!await requireServer(t, dialect)) return;
         await assert.rejects(
            () => fx.client.schema(fx.schema).into('books').insert([{ author_id: 1, title: 'NULL' }]).run(),
            /(cannot be null|NOT NULL constraint failed|violates not-null constraint)/i
         );
         await intact();
      });

      it('refuses a UNIQUE violation', async t => {
         if (!await requireServer(t, dialect)) return;
         await assert.rejects(
            () => fx.client.schema(fx.schema).into('authors').insert([{ name: '\'Ada\'' }]).run(),
            /(Duplicate entry|UNIQUE constraint failed|duplicate key value)/i
         );
         const { rows } = await fx.exec(`SELECT COUNT(*) AS c FROM ${fx.t('authors')}`) as { rows: Row[] };
         assert.equal(Number(rows[0].c), 3);
      });

      it('refuses a FOREIGN KEY violation', async t => {
         if (!await requireServer(t, dialect)) return;
         await assert.rejects(
            () => fx.client.schema(fx.schema).into('books').insert([{ author_id: 9999, title: '\'orphan\'' }]).run(),
            /(foreign key constraint|FOREIGN KEY constraint failed)/i
         );
         await intact();
      });

      it('refuses an update against a non-existent column', async t => {
         if (!await requireServer(t, dialect)) return;
         await assert.rejects(
            () => fx.client.schema(fx.schema).update({ nope: '= 1' }).from('books').where({ id: '= 1' }).limit(1).run(),
            /(Unknown column 'nope'|no such column: nope|column "nope" .* does not exist)/i
         );
         await intact();
      });

      it('handles a type mismatch the way the dialect does', async t => {
         if (!await requireServer(t, dialect)) return;
         const write = () => fx.client.schema(fx.schema).update({ price: '= \'not-a-number\'' }).from('books').where({ id: '= 1' }).limit(1).run();

         if (dialect === 'sqlite') {
            // SQLite has no static column types: the string is simply stored
            await write();
            assert.equal((await one(fx, 1)).price, 'not-a-number');
         }
         else {
            await assert.rejects(write, /(Incorrect decimal value|invalid input syntax for type numeric)/i);
            assert.notEqual((await one(fx, 1)).price, 'not-a-number');
         }
         await intact();
      });
   });
}

describe('table data / builder state', () => {
   /*
    * BUG (BaseClient.ts:44 + 132-138): `_query` is per-client mutable state and `getSQL()`
    * does not reset it — only `run()` does. A chain that is built but never run (an early
    * return, a throw between builder calls, or two chains interleaved across an await on the
    * same connection) leaks its clauses into the next query on that client. Here an abandoned
    * SELECT turns the following UPDATE into `SELECT * UPDATE ... LIMIT 1`, which PostgreSQL
    * rejects outright and MySQL/SQLite mangle.
    */
   it('an abandoned builder chain must not leak into the next query', { todo: '_query is shared and only run() resets it' }, async t => {
      if (!await requireServer(t, 'pg')) return;
      const fx = await openFixture('pg', 'leak_pg');
      try {
         fx.client.select('*').schema(fx.schema).from('books').limit(5); // built, never run
         const sql = fx.client
            .update({ title: '= \'x\'' })
            .schema(fx.schema)
            .from('books')
            .where({ id: '= 1' })
            .limit(1)
            .getSQL();
         assert.equal(sql.includes('SELECT'), false, `leaked SELECT clause: ${sql}`);
         assert.equal(sql.includes('LIMIT'), false, `leaked LIMIT clause: ${sql}`);
      }
      finally {
         await fx.drop();
      }
   });
});
