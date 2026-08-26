/**
 * The database/schema tree and the per-table metadata behind it:
 * getStructure, getTableColumns, getTableIndexes, getKeyUsage, getTableDll.
 */
import * as assert from 'node:assert/strict';
import { after, before, describe, it, TestContext } from 'node:test';

import { Dialect, DIALECTS, Fixture, openFixture, pgClient, requireServer } from '../support/db';
import { settings } from '../support/electron-stubs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Schema = any;

const schemaOf = async (fx: Fixture): Promise<Schema> => {
   const all = await fx.client.getStructure(new Set([fx.schema])) as Schema[];
   const found = all.find(s => s.name === fx.schema);
   assert.ok(found, `getStructure did not return ${fx.schema}`);
   return found;
};

/** getStructure's `type` for the seeded view, per dialect trigger naming. */
const triggerName: Record<Dialect, string> = {
   sqlite: 'books_bi',
   mysql: 'books_bi',
   pg: 'books.books_bi'
};

for (const dialect of DIALECTS) {
   describe(`structure / ${dialect}`, () => {
      let fx: Fixture;

      before(async t => {
         if (!await requireServer(t as TestContext, dialect)) return;
         fx = await openFixture(dialect, `struct_${dialect}`);
      });

      after(async () => {
         if (fx) await fx.drop();
      });

      it('lists the seeded tables, the view and the trigger', async t => {
         if (!await requireServer(t, dialect)) return;
         const schema = await schemaOf(fx);

         assert.deepEqual(
            schema.tables.filter((tb: Schema) => tb.type === 'table').map((tb: Schema) => tb.name).sort(),
            ['authors', 'books']
         );
         const view = schema.tables.find((tb: Schema) => tb.name === 'books_view');
         assert.ok(view, 'books_view missing from the tree');
         assert.equal(view.type, 'view');
         assert.deepEqual(schema.triggers.map((tr: Schema) => tr.name), [triggerName[dialect]]);
         assert.equal(schema.triggers[0].table, 'books');
      });

      it('reports the right column types, nullability and defaults', async t => {
         if (!await requireServer(t, dialect)) return;
         const columns = await fx.client.getTableColumns({ schema: fx.schema, table: 'books' });
         const by = (name: string) => columns.find(c => c.name === name);

         assert.deepEqual(columns.map(c => c.name), [
            'id', 'author_id', 'title', 'price', 'published', 'created_at', 'cover', 'meta', 'active', 'tag'
         ]);
         assert.deepEqual(columns.map(c => c.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

         // NOT NULL vs NULL
         assert.equal(by('title').nullable, false);
         assert.equal(by('author_id').nullable, false);
         assert.equal(by('price').nullable, true);
         assert.equal(by('cover').nullable, true);

         // types, spelled the way each driver spells them
         const expected: Record<Dialect, Record<string, string>> = {
            sqlite: { title: 'VARCHAR', price: 'DECIMAL', published: 'DATE', created_at: 'DATETIME', cover: 'BLOB', active: 'BOOLEAN' },
            mysql: { title: 'VARCHAR', price: 'DECIMAL', published: 'DATE', created_at: 'DATETIME', cover: 'BLOB', active: 'TINYINT' },
            pg: { title: 'CHARACTER VARYING', price: 'NUMERIC', published: 'DATE', created_at: 'TIMESTAMP WITHOUT TIME ZONE', cover: 'BYTEA', active: 'BOOLEAN' }
         };
         for (const [column, type] of Object.entries(expected[dialect]))
            assert.equal(by(column).type, type, `type of ${column}`);

         // defaults survive the round trip (each dialect quotes them its own way)
         assert.match(String(by('tag').default), /none/);
         // MySQL hands numeric metadata back as strings (bigNumberStrings), the others as numbers
         assert.equal(Number(by('title').charLength), 120);
      });

      it('reports the primary key and the secondary index', async t => {
         if (!await requireServer(t, dialect)) return;
         const indexes = await fx.client.getTableIndexes({ schema: fx.schema, table: 'books' });
         const primary = indexes.find(i => i.type === 'PRIMARY');

         assert.ok(primary, 'no PRIMARY index reported');
         assert.equal(primary.column, 'id');
         const secondary = indexes.find(i => i.name === 'idx_books_title');
         assert.ok(secondary, 'idx_books_title missing');
         assert.equal(secondary.column, 'title');
         assert.equal(secondary.type, 'INDEX');
      });

      it('reports the foreign key from books.author_id to authors.id', async t => {
         if (!await requireServer(t, dialect)) return;
         const keys = await fx.client.getKeyUsage({ schema: fx.schema, table: 'books' });

         assert.ok(keys.length >= 1, 'no foreign key reported');
         const [key] = keys;
         assert.equal(key.table, 'books');
         assert.equal(key.field, 'author_id');
         assert.equal(key.refTable, 'authors');
         assert.equal(key.refField, 'id');
         assert.equal(key.refSchema, fx.schema);
         assert.ok(keys.every(k => k.refTable === 'authors'), 'a foreign key from another table leaked in');
      });

      it('returns an empty column list for an unknown table', async t => {
         if (!await requireServer(t, dialect)) return;
         // documented behaviour: the catalogue queries simply match nothing
         assert.deepEqual(await fx.client.getTableColumns({ schema: fx.schema, table: 'nope_missing' }), []);
         assert.deepEqual(await fx.client.getKeyUsage({ schema: fx.schema, table: 'nope_missing' }), []);
      });

      it('handles getTableIndexes on an unknown table the way the dialect does', async t => {
         if (!await requireServer(t, dialect)) return;
         const indexes = () => fx.client.getTableIndexes({ schema: fx.schema, table: 'nope_missing' });

         if (dialect === 'mysql') {
            // `SHOW INDEXES FROM` errors out, unlike the information_schema based dialects
            await assert.rejects(indexes, /doesn't exist/);
         }
         else
            assert.deepEqual(await indexes(), []);
      });

      it('returns no tables for an unknown schema', async t => {
         if (!await requireServer(t, dialect)) return;
         const all = await fx.client.getStructure(new Set(['antares_no_such_schema'])) as Schema[];
         for (const schema of all)
            assert.deepEqual(schema.tables, [], `${schema.name} should be empty`);
      });
   });
}

describe('structure / DDL', () => {
   for (const dialect of ['mysql', 'pg'] as Dialect[]) {
      it(`${dialect} getTableDll renders a CREATE TABLE for the seeded table`, async t => {
         if (!await requireServer(t, dialect)) return;
         const fx = await openFixture(dialect, `ddl_${dialect}`);
         try {
            const ddl = await fx.client.getTableDll({ schema: fx.schema, table: 'books' }) as string;
            assert.match(ddl, /CREATE TABLE/i);
            assert.match(ddl, /books/);
            assert.match(ddl, /title/);
            assert.match(ddl, /author_id/);
         }
         finally {
            await fx.drop();
         }
      });
   }

   /*
    * GAP: SQLiteClient never implements getTableDll, so the `get-table-ddl` IPC handler
    * answers `{ status: 'error', response: 'Error: Method "getTableDll" not implemented' }`
    * for every SQLite table. BaseClient.ts:169-171, SQLiteClient has no override.
    */
   it('sqlite getTableDll is not implemented', async () => {
      const fx = await openFixture('sqlite', 'ddl_sqlite');
      try {
         await assert.rejects(
            async () => fx.client.getTableDll({ schema: fx.schema, table: 'books' }),
            /Method "getTableDll" not implemented/
         );
      }
      finally {
         await fx.drop();
      }
   });
});

describe('structure / row counts', () => {
   it('pg reports a plausible row estimate in the tree and via getTableApproximateCount', async t => {
      if (!await requireServer(t, 'pg')) return;
      const fx = await openFixture('pg', 'rows_pg');
      try {
         const schema = await schemaOf(fx);
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         assert.equal(schema.tables.find((tb: any) => tb.name === 'books').rows, 7);
         assert.equal(Number(await fx.client.getTableApproximateCount({ schema: fx.schema, table: 'books' })), 7);
      }
      finally {
         await fx.drop();
      }
   });

   it('sqlite counts rows exactly (the tree itself carries no count)', async () => {
      const fx = await openFixture('sqlite', 'rows_sqlite');
      try {
         const schema = await schemaOf(fx);
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         assert.equal(schema.tables.find((tb: any) => tb.name === 'books').rows, false);
         assert.equal(await fx.client.getTableApproximateCount({ schema: fx.schema, table: 'books' }), 7);
      }
      finally {
         await fx.drop();
      }
   });

   it('mysql getTableApproximateCount returns the InnoDB estimate', async t => {
      if (!await requireServer(t, 'mysql')) return;
      const fx = await openFixture('mysql', 'rows_mysql');
      try {
         assert.equal(Number(await fx.client.getTableApproximateCount({ schema: fx.schema, table: 'books' })), 7);
      }
      finally {
         await fx.drop();
      }
   });

   /*
    * BUG (MySQLClient.ts:425 and 400-414 vs 470-476): neither getStructure branch ever selects
    * TABLE_ROWS — `SHOW FULL TABLES` does not return it and the show_table_size query omits it —
    * so `rows` is always undefined in the schema tree. With show_table_size off, `size` is also
    * NaN because DATA_LENGTH/INDEX_LENGTH are missing from SHOW FULL TABLES.
    */
   it('mysql getStructure should carry row counts and a numeric size', { todo: 'TABLE_ROWS is never selected' }, async t => {
      if (!await requireServer(t, 'mysql')) return;
      const fx = await openFixture('mysql', 'rows_mysql_tree');
      try {
         const plain = await schemaOf(fx);
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         const books = (s: any) => s.tables.find((tb: any) => tb.name === 'books');
         assert.equal(Number.isNaN(books(plain).size), false, 'size is NaN without show_table_size');

         settings.set('show_table_size', true);
         try {
            assert.equal(books(await schemaOf(fx)).rows, 7);
         }
         finally {
            settings.delete('show_table_size');
         }
      }
      finally {
         await fx.drop();
      }
   });

   it('mysql getStructure reports table sizes when show_table_size is on', async t => {
      if (!await requireServer(t, 'mysql')) return;
      const fx = await openFixture('mysql', 'rows_mysql_size');
      settings.set('show_table_size', true);
      try {
         const schema = await schemaOf(fx);
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         const books = schema.tables.find((tb: any) => tb.name === 'books');
         assert.ok(books.size > 0, `expected a positive size, got ${books.size}`);
         assert.equal(books.engine, 'InnoDB');
      }
      finally {
         settings.delete('show_table_size');
         await fx.drop();
      }
   });

   /*
    * BUG (PostgreSQLClient.ts:559-563): the query is
    * `SELECT reltuples FROM pg_class WHERE relname = '<table>'` — no schema filter and no
    * relkind filter. With the same table name in two schemas it returns whichever row
    * pg_class hands back first, so the grid can show another schema's row count.
    */
   it('pg getTableApproximateCount should be schema-scoped', { todo: 'query has no schema filter' }, async t => {
      if (!await requireServer(t, 'pg')) return;
      const big = await openFixture('pg', 'cnt_big');
      const small = await openFixture('pg', 'cnt_small');
      try {
         await small.exec(`DELETE FROM "${small.schema}"."books" WHERE id > 2`);
         await small.exec(`ANALYZE "${small.schema}"."books"`);
         const client = pgClient();
         await client.connect();
         try {
            assert.equal(Number(await client.getTableApproximateCount({ schema: big.schema, table: 'books' })), 7);
            assert.equal(Number(await client.getTableApproximateCount({ schema: small.schema, table: 'books' })), 2);
         }
         finally {
            client.destroy();
         }
      }
      finally {
         await big.drop();
         await small.drop();
      }
   });
});

describe('structure / foreign keys across schemas', () => {
   /*
    * BUG (PostgreSQLClient.ts:826-833, and the identical query in
    * PostgreSQLExporter.getCreateTable): the last join is
    * `JOIN information_schema.referential_constraints AS rc ON rc.constraint_name = kcu.constraint_name`
    * with no schema predicate. `tc.table_schema` is filtered but `rc` is matched by constraint
    * name alone, so with the same constraint name in N schemas the result fans out to N
    * identical rows — one foreign key is reported N times in the table's key list and N times
    * in a dump's ALTER TABLE ADD CONSTRAINT section.
    */
   it('pg getKeyUsage does not fan out over same-named constraints in other schemas', { todo: 'referential_constraints join is not schema-scoped' }, async t => {
      if (!await requireServer(t, 'pg')) return;
      const a = await openFixture('pg', 'fk_a');
      const b = await openFixture('pg', 'fk_b');
      try {
         // both fixtures live in the same process, so they share the run salt and therefore
         // the constraint name — which is exactly the collision this test is about
         const constraint = `fk_books_author_${a.schema.split('_').pop()}`;
         assert.deepEqual(
            (await a.client.getKeyUsage({ schema: a.schema, table: 'books' })).map(k => k.constraintName),
            [constraint]
         );
      }
      finally {
         await a.drop();
         await b.drop();
      }
   });
});
