/**
 * Connection lifecycle against real servers: connect / ping / destroy / reconnect /
 * schema switching, plus the failure modes that must reject fast instead of hanging.
 */
import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, describe, it, TestContext } from 'node:test';

import {
   AnyClient,
   DEAD_PORT,
   Dialect,
   DIALECTS,
   Fixture,
   mysqlClient,
   openFixture,
   pgClient,
   requireServer,
   rmFile,
   sqliteClient,
   tempDbFile
} from '../support/db';

/** Every negative case has to settle well inside this; a hang is the bug we are hunting. */
const FAST = 4000;

/**
 * Runs a doomed connection attempt and always tears the client down afterwards.
 * MySQLClient.connect() installs its keepalive interval *before* the query that fails, so a
 * client that is not destroyed keeps the process alive.
 */
const failedConnect = async (label: string, make: () => AnyClient, alsoPing = false) => {
   const client = make();
   const start = Date.now();
   const err = await (async () => {
      await client.connect();
      if (alsoPing) await client.ping();
   })().then(() => null, (e: Error) => e);
   const elapsed = Date.now() - start;

   try {
      client.destroy();
   }
   catch { /* never got far enough to hold a handle */ }

   assert.ok(err, `${label}: expected a rejection, got success`);
   assert.ok(elapsed < FAST, `${label}: took ${elapsed}ms, expected < ${FAST}ms (hang)`);
   return err;
};

/** ping() is `SELECT 1+1`; MySQL hands back strings, the others numbers. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pingValue = (result: any) => Number(Object.values(result.rows[0])[0]);

for (const dialect of DIALECTS) {
   describe(`connections / ${dialect}`, () => {
      let fx: Fixture;

      before(async t => {
         if (!await requireServer(t as TestContext, dialect)) return;
         fx = await openFixture(dialect, `conn_${dialect}`);
      });

      after(async () => {
         if (fx) await fx.drop();
      });

      it('connects and answers ping', async t => {
         if (!await requireServer(t, dialect)) return;
         assert.equal(pingValue(await fx.client.ping()), 2);
      });

      it('reconnects after destroy', async t => {
         if (!await requireServer(t, dialect)) return;
         fx.client.destroy();
         await fx.client.connect();
         assert.equal(pingValue(await fx.client.ping()), 2);
         // and the data is still there afterwards
         const { rows } = await fx.exec(`SELECT COUNT(*) AS c FROM ${fx.t('books')}`) as { rows: {c: number}[] };
         assert.equal(Number(rows[0].c), 7);
      });
   });
}

describe('connections / negatives', () => {
   it('mysql rejects a wrong password', async t => {
      if (!await requireServer(t, 'mysql')) return;
      const err = await failedConnect('wrong password', () => mysqlClient({ password: 'definitely-not-it' }));
      assert.match(err.message, /Access denied/i);
   });

   it('mysql rejects a port with nothing listening', async () => {
      const err = await failedConnect('dead port', () => mysqlClient({ port: DEAD_PORT }));
      assert.match(err.message, /ECONNREFUSED/);
   });

   it('mysql rejects a non-existent database', async t => {
      if (!await requireServer(t, 'mysql')) return;
      const err = await failedConnect('unknown schema', () => mysqlClient({ schema: 'antares_no_such_db' }));
      assert.match(err.message, /Unknown database 'antares_no_such_db'/);
   });

   it('pg rejects a wrong password', async t => {
      if (!await requireServer(t, 'pg')) return;
      const err = await failedConnect('wrong password', () => pgClient({ password: 'definitely-not-it' }), true);
      assert.match(err.message, /password authentication failed/i);
   });

   it('pg rejects a port with nothing listening', async () => {
      const err = await failedConnect('dead port', () => pgClient({ port: DEAD_PORT }), true);
      assert.match(err.message, /ECONNREFUSED/);
   });

   it('pg rejects a non-existent database', async t => {
      if (!await requireServer(t, 'pg')) return;
      const err = await failedConnect('unknown database', () => pgClient({ database: 'antares_no_such_db' }), true);
      assert.match(err.message, /database "antares_no_such_db" does not exist/);
   });

   it('pg rejects a malformed connection string', async () => {
      const err = await failedConnect('malformed connString', () => pgClient({ connectionString: 'this-is-not://a valid/dsn' }), true);
      assert.match(err.message, /ENOTFOUND|ECONNREFUSED|invalid|EAI_AGAIN/i);
   });

   it('sqlite rejects a missing database file', async () => {
      // unique name: a previous run must never be able to leave this file behind
      const missing = path.join(os.tmpdir(), `antares-does-not-exist-${process.pid}-${Date.now()}.db`);
      const err = await failedConnect('missing file', () => sqliteClient(missing));
      assert.match(err.message, /unable to open database file/);
   });

   it('sqlite rejects a path that is not a database', async () => {
      const err = await failedConnect('directory as db', () => sqliteClient(os.tmpdir()));
      assert.match(err.message, /unable to open database file/);
   });

   /*
    * BUG (PostgreSQLClient.ts:201-206 + 224-247): in pooled mode `connect()` only builds a
    * `pg.Pool`, which connects lazily, so it resolves even for a refused port or bad
    * credentials. The renderer's `connect` IPC handler does not ping, so a broken connection
    * is reported as established. MySQLClient.connect() cannot: it issues a real query.
    */
   it('pg connect() alone should already fail on a dead port', { todo: 'pooled pg connect() never validates' }, async () => {
      const c = pgClient({ port: DEAD_PORT });
      try {
         await assert.rejects(() => c.connect(), /ECONNREFUSED/);
      }
      finally {
         c.destroy();
      }
   });
});

describe('connections / schema switching', () => {
   it('sqlite use() is a no-op and tables stay reachable through the schema()', async () => {
      const fx = await openFixture('sqlite', 'conn_use_sqlite');
      try {
         assert.equal(fx.client.use(), null);
         const { rows } = await fx.client.select('*').schema('main').from('books').limit(1).run() as { rows: unknown[] };
         assert.equal(rows.length, 1);
      }
      finally {
         await fx.drop();
      }
   });

   it('mysql use() selects the schema for later unqualified queries', async t => {
      if (!await requireServer(t, 'mysql')) return;
      const fx = await openFixture('mysql', 'conn_use_mysql');
      const c = mysqlClient();
      await c.connect();
      try {
         await assert.rejects(() => c.raw('SELECT COUNT(*) AS c FROM books'), /No database selected/);
         await c.use(fx.schema);
         const { rows } = await c.raw('SELECT COUNT(*) AS c FROM books') as { rows: {c: string}[] };
         assert.equal(Number(rows[0].c), 7);
      }
      finally {
         c.destroy();
         await fx.drop();
      }
   });

   it('pg per-query schema (the path get-table-data uses) resolves unqualified names', async t => {
      if (!await requireServer(t, 'pg')) return;
      const fx = await openFixture('pg', 'conn_use_pg');
      try {
         const { rows } = await fx.client.raw('SELECT COUNT(*) AS c FROM books', { schema: fx.schema }) as { rows: {c: string}[] };
         assert.equal(Number(rows[0].c), 7);
      }
      finally {
         await fx.drop();
      }
   });

   /*
    * BUG: `use()` runs `USE db` / `SET search_path` on one connection borrowed from the pool
    * and then releases it, so the selection does not stick for queries that land on a
    * different pooled connection. MySQLClient.ts:322-325, PostgreSQLClient.ts:273-284.
    * Sequential queries usually survive (the pool hands back the same connection); concurrent
    * ones do not.
    */
   for (const dialect of ['mysql', 'pg'] as Dialect[]) {
      it(`${dialect} use() should stick for concurrent queries`, { todo: 'use() is applied to a single pooled connection' }, async t => {
         if (!await requireServer(t, dialect)) return;
         const fx = await openFixture(dialect, `conn_sticky_${dialect}`);
         const c = dialect === 'mysql' ? mysqlClient() : pgClient();
         await c.connect();
         try {
            await c.use(fx.schema);
            const out = await Promise.all(Array.from({ length: 8 }, () => c.raw('SELECT COUNT(*) AS c FROM books') as Promise<{rows: {c: string}[]}>));
            assert.deepEqual(out.map(o => Number(o.rows[0].c)), Array(8).fill(7));
         }
         finally {
            c.destroy();
            await fx.drop();
         }
      });
   }
});

describe('connections / readonly', () => {
   it('sqlite readonly connection reads but refuses to write', async () => {
      const file = tempDbFile('conn_ro');
      const seeder = sqliteClient(file);
      await seeder.connect();
      await seeder.raw('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)', { split: false });
      await seeder.raw('INSERT INTO t (v) VALUES (\'a\')', { split: false });
      seeder.destroy();

      const ro = sqliteClient(file, true);
      await ro.connect();
      try {
         const { rows } = await ro.raw('SELECT v FROM t') as { rows: {v: string}[] };
         assert.equal(rows[0].v, 'a');
         await assert.rejects(
            () => ro.schema('main').update({ v: '= \'b\'' }).from('t').where({ id: '= 1' }).limit(1).run(),
            /attempt to write a readonly database/
         );
         const after = await ro.raw('SELECT v FROM t') as { rows: {v: string}[] };
         assert.equal(after.rows[0].v, 'a', 'the rejected write must not have changed anything');
      }
      finally {
         ro.destroy();
         rmFile(file);
      }
   });
});
