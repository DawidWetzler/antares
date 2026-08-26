/**
 * SQL dump export and re-import, driven exactly as src/main/workers/{exporter,importer}.ts
 * drive them but without worker_threads: dump a seeded schema, wipe it, import the file
 * back and compare the data.
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import MysqlExporter from '../../src/main/libs/exporters/sql/MysqlExporter';
import PostgreSQLExporter from '../../src/main/libs/exporters/sql/PostgreSQLExporter';
import MySQLImporter from '../../src/main/libs/importers/sql/MySQLlImporter';
import PostgreSQLImporter from '../../src/main/libs/importers/sql/PostgreSQLImporter';
import { AnyClient, Dialect, mysqlClient, openFixture, pgClient, requireServer, rmFile } from '../support/db';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const TABLES = ['authors', 'books'].map(table => ({
   table,
   includeStructure: true,
   includeContent: true,
   includeDropStatement: true
}));

const exportOptions = (schema: string, outputFile: string, extras = true) => ({
   schema,
   tables: TABLES,
   includes: { functions: false, views: extras, triggers: extras, routines: false, schedulers: false },
   outputFormat: 'sql' as const,
   outputFile,
   sqlInsertAfter: 250,
   sqlInsertDivider: 'bytes' as const
});

/** BaseExporter.run() ends the stream in a `finally`; wait for the file to actually close. */
const dump = async (exporter: Any) => {
   const closed = new Promise<void>(resolve => exporter._outputFileStream.once('close', () => resolve()));
   const failed = new Promise<never>((resolve, reject) => exporter.once('error', reject));
   await Promise.race([exporter.run(), failed]);
   await closed;
};

/**
 * The import worker feeds the importer a bare connection pool (workers/importer.ts:39-48).
 * getConnectionPool() also arms the client's keepalive interval and only destroy() clears it,
 * so the client has to be kept and torn down or the process never exits.
 */
const importerPool = async (dialect: Dialect, schema: string) => {
   const client = (dialect === 'mysql' ? mysqlClient({ schema }, 1) : pgClient({}, 1)) as Any;
   client._connection = await client.getConnectionPool();
   return { pool: client._connection, close: () => (client as AnyClient).destroy() };
};

const runImport = async (importer: Any) => {
   const queryErrors: Any[] = [];
   importer.on('query-error', (e: Any) => queryErrors.push(e));
   await importer.run();
   return queryErrors.map(e => e.message as string);
};

const snapshot = async (client: AnyClient, schema: string, dialect: Dialect) => {
   const q = (id: string) => dialect === 'mysql' ? `\`${id}\`` : `"${id}"`;
   const table = (name: string) => `${q(schema)}.${q(name)}`;
   const authors = await client.raw(`SELECT id, name, note FROM ${table('authors')} ORDER BY id`, { split: false }) as Any;
   const books = await client.raw(`SELECT id, author_id, title, price, published, active, tag FROM ${table('books')} ORDER BY id`, { split: false }) as Any;
   return { authors: authors.rows, books: books.rows };
};

const tempSql = (tag: string) => path.join(os.tmpdir(), `antares-it-dump-${tag}-${process.pid}-${Date.now()}.sql`);

describe('sql dump / mysql', () => {
   it('dumps a schema with its view and trigger, wipes it and imports the dump back', async t => {
      if (!await requireServer(t, 'mysql')) return;
      const fx = await openFixture('mysql', 'dump_mysql');
      const file = tempSql('mysql');
      let importer: { pool: Any; close: () => void };

      try {
         const before = await snapshot(fx.client, fx.schema, 'mysql');
         assert.equal(before.books.length, 7);

         await dump(new MysqlExporter(fx.client as Any, TABLES, exportOptions(fx.schema, file)));
         const sql = fs.readFileSync(file, 'utf8');
         assert.match(sql, /CREATE TABLE `books`/);
         assert.match(sql, /INSERT INTO `books`/);
         assert.match(sql, /Aardvark/);
         assert.match(sql, /VIEW `books_view`/, 'the view should be in the dump');
         assert.match(sql, /books_bi/, 'the trigger should be in the dump');

         // wipe
         await fx.exec(`DROP DATABASE \`${fx.schema}\``);
         await fx.exec(`CREATE DATABASE \`${fx.schema}\``);

         importer = await importerPool('mysql', fx.schema);
         const errors = await runImport(new MySQLImporter(importer.pool, {
            uid: 'it', schema: fx.schema, type: 'mysql', file
         }));
         assert.deepEqual(errors, [], 'the import reported query errors');

         assert.deepEqual(await snapshot(fx.client, fx.schema, 'mysql'), before, 'data differs after the round trip');
      }
      finally {
         if (importer) importer.close();
         rmFile(file);
         await fx.drop();
      }
   });
});

describe('sql dump / pg', () => {
   it('dumps tables and data, wipes the schema and imports the dump back', async t => {
      if (!await requireServer(t, 'pg')) return;
      const fx = await openFixture('pg', 'dump_pg');
      const file = tempSql('pg');
      let importer: { pool: Any; close: () => void };

      try {
         const before = await snapshot(fx.client, fx.schema, 'pg');
         assert.equal(before.books.length, 7);

         await dump(new PostgreSQLExporter(fx.client as Any, TABLES, exportOptions(fx.schema, file, false)));
         const sql = fs.readFileSync(file, 'utf8');
         assert.match(sql, new RegExp(`CREATE SCHEMA "${fx.schema}"`));
         assert.match(sql, new RegExp(`CREATE TABLE "${fx.schema}"."books"`));
         assert.match(sql, new RegExp(`INSERT INTO "${fx.schema}"."books"`));
         assert.match(sql, /decode\('0102FF', 'hex'\)/, 'bytea should round trip as a hex literal');
         // the fixture names the FK after the run salt, see tests/support/db.ts
         assert.match(sql, new RegExp(`ADD CONSTRAINT "fk_books_author_${fx.schema.split('_').pop()}"`));

         await fx.exec(`DROP SCHEMA "${fx.schema}" CASCADE`);

         importer = await importerPool('pg', fx.schema);
         const errors = await runImport(new PostgreSQLImporter(importer.pool, {
            uid: 'it', schema: fx.schema, type: 'pg', file
         }));
         assert.deepEqual(errors, [], 'the import reported query errors');

         assert.deepEqual(await snapshot(fx.client, fx.schema, 'pg'), before, 'data differs after the round trip');
      }
      finally {
         if (importer) importer.close();
         rmFile(file);
         await fx.drop();
      }
   });

   /*
    * BUG (PostgreSQLExporter.ts:208-238 and 239-284): views and triggers are dumped with the
    * definition pg_get_viewdef / pg_get_functiondef return, which is unqualified —
    * `CREATE OR REPLACE VIEW "x"."books_view" AS SELECT ... FROM books`,
    * `CREATE TRIGGER ... EXECUTE FUNCTION books_touch()`, `DROP VIEW IF EXISTS "books_view"`.
    * Neither the dump header nor PostgreSQLImporter sets search_path to the target schema, so
    * re-importing any PostgreSQL dump containing a view or a trigger fails with
    * `relation "books" does not exist`. MySQL dumps do not have this problem because
    * SHOW CREATE VIEW is replayed against the connection's default database.
    */
   it('re-imports a dump that contains a view and a trigger', { todo: 'pg dump emits unqualified view/trigger bodies' }, async t => {
      if (!await requireServer(t, 'pg')) return;
      const fx = await openFixture('pg', 'dump_pg_view');
      const file = tempSql('pgview');
      let importer: { pool: Any; close: () => void };

      try {
         await dump(new PostgreSQLExporter(fx.client as Any, TABLES, exportOptions(fx.schema, file)));
         await fx.exec(`DROP SCHEMA "${fx.schema}" CASCADE`);

         importer = await importerPool('pg', fx.schema);
         const errors = await runImport(new PostgreSQLImporter(importer.pool, {
            uid: 'it', schema: fx.schema, type: 'pg', file
         }));
         assert.deepEqual(errors, [], 'the import reported query errors');
      }
      finally {
         if (importer) importer.close();
         rmFile(file);
         await fx.drop();
      }
   });
});

describe('sql dump / coverage gaps', () => {
   /*
    * Confirmed from the source tree: `src/main/libs/exporters/sql` and
    * `src/main/libs/importers/sql` only ship MySQL and PostgreSQL implementations, and both
    * workers answer `"<client>" exporter/importer not aviable` for anything else
    * (workers/exporter.ts:37-42, workers/importer.ts:48-53). There is no SQLite dump/restore
    * and no CSV importer anywhere in the app — import is SQL dump only.
    */
   it('ships no sqlite exporter/importer and no csv importer', () => {
      const root = path.join(__dirname, '..', '..', 'src', 'main', 'libs');

      assert.deepEqual(fs.readdirSync(path.join(root, 'exporters', 'sql')).sort(), ['MysqlExporter.ts', 'PostgreSQLExporter.ts', 'SqlExporter.ts']);
      assert.deepEqual(fs.readdirSync(path.join(root, 'importers', 'sql')).sort(), ['MySQLlImporter.ts', 'PostgreSQLImporter.ts']);
      assert.deepEqual(fs.readdirSync(path.join(root, 'exporters')).sort(), ['BaseExporter.ts', 'sql']);
      assert.deepEqual(fs.readdirSync(path.join(root, 'importers')).sort(), ['BaseImporter.ts', 'sql']);
   });
});
