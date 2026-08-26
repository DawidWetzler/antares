/**
 * Integration test plumbing: real clients against the servers in tests/docker-compose.yml.
 *
 *   docker compose -f tests/docker-compose.yml up -d --wait
 *
 * MySQL  127.0.0.1:53306 root/antares
 * PG     127.0.0.1:55432 postgres/antares db antares_test
 * SQLite one throwaway file per test file
 */
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';

import { MySQLClient } from '../../src/main/libs/clients/MySQLClient';
import { PostgreSQLClient } from '../../src/main/libs/clients/PostgreSQLClient';
import { SQLiteClient } from '../../src/main/libs/clients/SQLiteClient';

export type Dialect = 'sqlite' | 'mysql' | 'pg';
export const DIALECTS: Dialect[] = ['sqlite', 'mysql', 'pg'];
export const SERVER_DIALECTS: Dialect[] = ['mysql', 'pg'];

export const MYSQL_HOST = '127.0.0.1';
export const MYSQL_PORT = 53306;
export const PG_HOST = '127.0.0.1';
export const PG_PORT = 55432;
/** Nothing listens here, so connections are refused immediately instead of timing out. */
export const DEAD_PORT = 1;
/** What ipc-handlers/connection.ts uses for a normal (non single-connection) workspace. */
export const APP_POOL_SIZE = 5;

export type AnyClient = MySQLClient | PostgreSQLClient | SQLiteClient;

/* eslint-disable @typescript-eslint/no-explicit-any */
const noLogger = () => { /* the real one talks to Electron webContents */ };

export const mysqlClient = (extra: Record<string, any> = {}, poolSize = APP_POOL_SIZE) => new MySQLClient({
   client: 'mysql',
   uid: `it-mysql-${Math.random().toString(36).slice(2)}`,
   params: { host: MYSQL_HOST, port: MYSQL_PORT, user: 'root', password: 'antares', schema: '', readonly: false, ...extra },
   poolSize,
   logger: noLogger
} as never);

export const pgClient = (extra: Record<string, any> = {}, poolSize = APP_POOL_SIZE) => new PostgreSQLClient({
   client: 'pg',
   uid: `it-pg-${Math.random().toString(36).slice(2)}`,
   params: { host: PG_HOST, port: PG_PORT, user: 'postgres', password: 'antares', database: 'antares_test', schema: '', readonly: false, ...extra },
   poolSize,
   logger: noLogger
} as never);

export const sqliteClient = (databasePath: string, readonly = false) => new SQLiteClient({
   client: 'sqlite',
   uid: `it-sqlite-${Math.random().toString(36).slice(2)}`,
   params: { databasePath, readonly },
   poolSize: 1,
   logger: noLogger
} as never);
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Creates an empty file: SQLiteClient opens with `fileMustExist: true`. */
export const tempDbFile = (tag: string) => {
   const file = path.join(os.tmpdir(), `antares-it-${tag}-${process.pid}-${Date.now()}.db`);
   fs.writeFileSync(file, '');
   return file;
};

export const rmFile = (file: string) => {
   try {
      fs.unlinkSync(file);
   }
   catch { /* already gone */ }
};

export const portOpen = (host: string, port: number, timeout = 1500) => new Promise<boolean>(resolve => {
   const socket = net.connect({ host, port });
   const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
   };
   socket.setTimeout(timeout);
   socket.once('connect', () => done(true));
   socket.once('error', () => done(false));
   socket.once('timeout', () => done(false));
});

const reachCache = new Map<Dialect, string>();

export const unreachable = async (dialect: Dialect) => {
   if (dialect === 'sqlite') return null;
   if (!reachCache.has(dialect)) {
      const [host, port] = dialect === 'mysql' ? [MYSQL_HOST, MYSQL_PORT] : [PG_HOST, PG_PORT];
      reachCache.set(dialect, await portOpen(host, port)
         ? null
         : `${dialect} is not reachable on ${host}:${port} — run: docker compose -f tests/docker-compose.yml up -d --wait`);
   }
   return reachCache.get(dialect);
};

/** `if (!await requireServer(t, dialect)) return;` — skips loudly instead of failing obscurely. */
export const requireServer = async (t: { skip: (msg?: string) => void }, dialect: Dialect) => {
   const why = await unreachable(dialect);
   if (why) t.skip(why);
   return !why;
};

/* ------------------------------------------------------------------ fixture */

/**
 * `authors` (1:N) `books`, plus a view, an index and a trigger, per dialect.
 *
 * The PostgreSQL foreign key carries the run salt in its name instead of letting
 * PostgreSQL derive `books_author_id_fkey`: the exporter's key-usage query is not
 * schema-scoped (finding 13), so a same-named constraint in a schema belonging to a
 * concurrent suite run makes the dump emit the constraint twice and the re-import fail.
 */
const DDL: Record<Dialect, (schema: string) => string[]> = {
   mysql: schema => [
      `CREATE TABLE \`${schema}\`.\`authors\` (
         id INT AUTO_INCREMENT PRIMARY KEY,
         name VARCHAR(80) NOT NULL UNIQUE,
         note VARCHAR(120) NULL
      ) ENGINE=InnoDB`,
      `CREATE TABLE \`${schema}\`.\`books\` (
         id INT AUTO_INCREMENT PRIMARY KEY,
         author_id INT NOT NULL,
         title VARCHAR(120) NOT NULL,
         price DECIMAL(8,2) NULL,
         published DATE NULL,
         created_at DATETIME NULL,
         cover BLOB NULL,
         meta JSON NULL,
         active TINYINT(1) NOT NULL DEFAULT 1,
         tag VARCHAR(20) NOT NULL DEFAULT 'none',
         KEY idx_books_title (title),
         CONSTRAINT fk_books_author FOREIGN KEY (author_id) REFERENCES \`${schema}\`.\`authors\` (id)
      ) ENGINE=InnoDB`,
      `CREATE VIEW \`${schema}\`.\`books_view\` AS SELECT id, title FROM \`${schema}\`.\`books\``,
      `CREATE TRIGGER \`${schema}\`.\`books_bi\` BEFORE INSERT ON \`${schema}\`.\`books\` FOR EACH ROW SET NEW.title = NEW.title`
   ],
   pg: schema => [
      `CREATE SCHEMA "${schema}"`,
      `CREATE TABLE "${schema}"."authors" (
         id serial PRIMARY KEY,
         name varchar(80) NOT NULL UNIQUE,
         note varchar(120) NULL
      )`,
      `CREATE TABLE "${schema}"."books" (
         id serial PRIMARY KEY,
         author_id integer NOT NULL,
         title varchar(120) NOT NULL,
         price numeric(8,2) NULL,
         published date NULL,
         created_at timestamp NULL,
         cover bytea NULL,
         meta json NULL,
         active boolean NOT NULL DEFAULT true,
         tag varchar(20) NOT NULL DEFAULT 'none',
         CONSTRAINT "fk_books_author_${schema.split('_').pop()}" FOREIGN KEY (author_id) REFERENCES "${schema}"."authors" (id)
      )`,
      `CREATE INDEX idx_books_title ON "${schema}"."books" (title)`,
      `CREATE VIEW "${schema}"."books_view" AS SELECT id, title FROM "${schema}"."books"`,
      `CREATE FUNCTION "${schema}".books_touch() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql`,
      `CREATE TRIGGER books_bi BEFORE INSERT ON "${schema}"."books" FOR EACH ROW EXECUTE PROCEDURE "${schema}".books_touch()`
   ],
   sqlite: () => [
      `CREATE TABLE "authors" (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name VARCHAR(80) NOT NULL UNIQUE,
         note VARCHAR(120) NULL
      )`,
      `CREATE TABLE "books" (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         author_id INTEGER NOT NULL REFERENCES "authors" (id),
         title VARCHAR(120) NOT NULL,
         price DECIMAL(8,2) NULL,
         published DATE NULL,
         created_at DATETIME NULL,
         cover BLOB NULL,
         meta TEXT NULL,
         active BOOLEAN NOT NULL DEFAULT 1,
         tag VARCHAR(20) NOT NULL DEFAULT 'none'
      )`,
      'CREATE INDEX idx_books_title ON "books" (title)',
      'CREATE VIEW "books_view" AS SELECT id, title FROM "books"',
      'CREATE TRIGGER books_bi AFTER INSERT ON "books" BEGIN UPDATE "books" SET tag = tag WHERE id = NEW.id; END'
   ]
};

export const AUTHORS = ['Ada', 'Grace', 'Linus'];
/** 7 rows: enough for limit=3 pages 1..3 with a partial last page. */
export const BOOK_TITLES = [
   'Aardvark', 'Basilisk', 'Cormorant', 'Dormouse', 'Echidna', 'Fennec', 'Gecko'
];

const blobLiteral = (dialect: Dialect, hex: string) => dialect === 'mysql'
   ? `0x${hex}`
   : dialect === 'pg'
      ? `decode('${hex}', 'hex')`
      : `X'${hex}'`;

const seedRows = (dialect: Dialect, schema: string) => {
   const t = (name: string) => dialect === 'mysql' ? `\`${schema}\`.\`${name}\`` : dialect === 'pg' ? `"${schema}"."${name}"` : `"${name}"`;
   const bool = (v: boolean) => dialect === 'sqlite' ? (v ? '1' : '0') : (v ? 'true' : 'false');
   const stmts = [
      `INSERT INTO ${t('authors')} (name, note) VALUES ${AUTHORS.map((a, i) => `('${a}', ${i === 1 ? 'NULL' : `'note ${a}'`})`).join(', ')}`
   ];

   stmts.push(...BOOK_TITLES.map((title, i) => `INSERT INTO ${t('books')} (author_id, title, price, published, created_at, cover, meta, active, tag) VALUES (
      ${(i % AUTHORS.length) + 1},
      '${title}',
      ${i === 6 ? 'NULL' : `${(i + 1) * 10}.50`},
      ${i === 6 ? 'NULL' : `'2020-0${(i % 9) + 1}-1${i % 9}'`},
      ${i === 6 ? 'NULL' : `'2020-0${(i % 9) + 1}-1${i % 9} 1${i % 9}:20:30'`},
      ${i === 6 ? 'NULL' : blobLiteral(dialect, '0102ff')},
      ${i === 6 ? 'NULL' : `'{"n": ${i}}'`},
      ${bool(i % 2 === 0)},
      'tag${i}'
   )`));

   return stmts;
};

export interface Fixture {
   dialect: Dialect;
   /** What the app calls "schema": a MySQL database, a PG schema, `main` for SQLite. */
   schema: string;
   client: AnyClient;
   /** Wraps an identifier the way the dialect does. */
   q: (id: string) => string;
   /** Fully qualified table name. */
   t: (table: string) => string;
   /** Runs one statement, no splitting (seed DDL contains `;` inside bodies). */
   exec: (sql: string) => Promise<unknown>;
   drop: () => Promise<void>;
}

/**
 * A connected client on a schema of its own, seeded with the fixture above.
 * `tag` must be unique per test file so parallel-ish runs cannot collide.
 */
export const openFixture = async (dialect: Dialect, tag: string, opts: { seed?: boolean } = {}): Promise<Fixture> => {
   const seed = opts.seed !== false;
   // The pid keeps concurrent suite runs apart: node:test forks a process per file, so
   // this is unique both across files and across simultaneous `npm run test:integration`
   // invocations. Without it, one run drops the schema another run is querying — which
   // shows up as unrelated failures and, on MySQL, a metadata-lock hang.
   const name = `antares_it_${tag}_${process.pid.toString(36)}`.slice(0, 60).toLowerCase();
   let client: AnyClient;
   let schema: string;
   let file: string;

   if (dialect === 'sqlite') {
      file = tempDbFile(tag);
      client = sqliteClient(file);
      schema = 'main';
      await client.connect();
   }
   else if (dialect === 'mysql') {
      const bootstrap = mysqlClient();
      await bootstrap.connect();
      await bootstrap.raw(`DROP DATABASE IF EXISTS \`${name}\``);
      await bootstrap.raw(`CREATE DATABASE \`${name}\``);
      bootstrap.destroy();
      client = mysqlClient({ schema: name });
      schema = name;
      await client.connect();
   }
   else {
      client = pgClient();
      schema = name;
      await client.connect();
      await client.raw(`DROP SCHEMA IF EXISTS "${name}" CASCADE`, { split: false });
   }

   const q = (id: string) => dialect === 'mysql' ? `\`${id}\`` : `"${id}"`;
   const t = (table: string) => dialect === 'sqlite' ? `"${table}"` : `${q(schema)}.${q(table)}`;
   const exec = (sql: string) => client.raw(sql, { split: false });

   if (seed) {
      for (const sql of DDL[dialect](schema)) await exec(sql);
      for (const sql of seedRows(dialect, schema)) await exec(sql);
      // reltuples / TABLE_ROWS are estimates from the planner statistics
      if (dialect === 'pg') await exec(`ANALYZE "${schema}"."books"`);
      if (dialect === 'mysql') await exec(`ANALYZE TABLE \`${schema}\`.\`books\``);
   }
   else if (dialect === 'pg')
      await exec(`CREATE SCHEMA "${name}"`);

   const drop = async () => {
      try {
         if (dialect === 'pg') await exec(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
         client.destroy();
         if (dialect === 'mysql') {
            const bootstrap = mysqlClient();
            await bootstrap.connect();
            await bootstrap.raw(`DROP DATABASE IF EXISTS \`${schema}\``);
            bootstrap.destroy();
         }
      }
      finally {
         if (file) rmFile(file);
      }
   };

   return { dialect, schema, client, q, t, exec, drop };
};
