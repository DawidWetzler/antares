import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { MySQLClient } from '@/../main/libs/clients/MySQLClient';
import { PostgreSQLClient } from '@/../main/libs/clients/PostgreSQLClient';
import { SQLiteClient } from '@/../main/libs/clients/SQLiteClient';

// The builder is pure string assembly, so the clients are never connected.
const noop = () => undefined;
const make = {
   mysql: () => new MySQLClient({ client: 'mysql', params: { schema: '', readonly: false }, logger: noop }),
   pg: () => new PostgreSQLClient({ client: 'pg', params: { schema: '', readonly: false }, logger: noop }),
   sqlite: () => new SQLiteClient({ client: 'sqlite', params: { databasePath: ':memory:', readonly: false }, logger: noop })
};
type Dialect = keyof typeof make;
const DIALECTS = Object.keys(make) as Dialect[];

/** Runs `build` on a fresh client per dialect and asserts the exact SQL. */
const each = (expected: Record<Dialect, string>, build: (c: ReturnType<typeof make[Dialect]>) => string) => {
   for (const d of DIALECTS)
      assert.equal(build(make[d]()), expected[d], `client ${d}`);
};

describe('query builder - SELECT', () => {
   test('the paginated table read the app actually issues', () => {
      // src/main/ipc-handlers/tables.ts get-table-data: page 3 of 50 rows.
      each({
         mysql: 'SELECT * FROM `sakila`.`actor` LIMIT 50 OFFSET 100 ',
         pg: 'SELECT * FROM "sakila"."actor" LIMIT 50 OFFSET 100 ',
         sqlite: 'SELECT * FROM "sakila"."actor" LIMIT 50 OFFSET 100 '
      }, c => c.select('*').schema('sakila').from('actor').limit(50).offset(100).getSQL());
   });

   test('the same read with a sort and a filter', () => {
      each({
         mysql: 'SELECT * FROM `sakila`.`actor` WHERE `first_name` LIKE \'%a%\' ORDER BY `actor_id` DESC LIMIT 50 OFFSET 50 ',
         pg: 'SELECT * FROM "sakila"."actor" WHERE "first_name" LIKE \'%a%\' ORDER BY "actor_id" DESC LIMIT 50 OFFSET 50 ',
         sqlite: 'SELECT * FROM "sakila"."actor" WHERE first_name LIKE \'%a%\' ORDER BY actor_id DESC LIMIT 50 OFFSET 50 '
      }, c => c.select('*').schema('sakila').from('actor').limit(50).offset(50)
         .orderBy({ actor_id: 'DESC' }).where({ first_name: 'LIKE \'%a%\'' }).getSQL());
   });

   test('no schema means an unqualified table name', () => {
      each({
         mysql: 'SELECT id, name FROM `users` ',
         pg: 'SELECT id, name FROM "users" ',
         sqlite: 'SELECT id, name FROM "users" '
      }, c => c.select('id', 'name').from('users').getSQL());
   });

   test('select() accumulates across calls and arrays are flattened', () => {
      each({
         mysql: 'SELECT a, b, c, d FROM `t` ',
         pg: 'SELECT a, b, c, d FROM "t" ',
         sqlite: 'SELECT a, b, c, d FROM "t" '
      }, c => c.select('a').select('b', 'c').select(['d'] as unknown as string).from('t').getSQL());
   });

   test('GROUP BY and ORDER BY', () => {
      each({
         mysql: 'SELECT country, COUNT(*) FROM `city` GROUP BY country ORDER BY `country` ASC ',
         pg: 'SELECT country, COUNT(*) FROM "city" GROUP BY country ORDER BY "country" ASC ',
         sqlite: 'SELECT country, COUNT(*) FROM "city" GROUP BY country ORDER BY country ASC '
      }, c => c.select('country', 'COUNT(*)').from('city').groupBy('country').orderBy({ country: 'ASC' }).getSQL());
   });

   test('a select without a from is emitted bare', () => {
      each({ mysql: 'SELECT 1 + 1 ', pg: 'SELECT 1 + 1 ', sqlite: 'SELECT 1 + 1 ' },
         c => c.select('1 + 1').getSQL());
   });

   test('an untouched builder produces an empty string', () => {
      each({ mysql: '', pg: '', sqlite: '' }, c => c.getSQL());
   });

   test('a from without a select produces no SELECT keyword', () => {
      each({ mysql: 'FROM `t` ', pg: 'FROM "t" ', sqlite: 'FROM "t" ' }, c => c.from('t').getSQL());
   });

   test('raw string and array WHERE clauses are ANDed', () => {
      each({
         mysql: 'SELECT * FROM `t` WHERE a > 1 AND b < 2 AND c = 3 ',
         pg: 'SELECT * FROM "t" WHERE a > 1 AND b < 2 AND c = 3 ',
         sqlite: 'SELECT * FROM "t" WHERE a > 1 AND b < 2 AND c = 3 '
      }, c => c.select('*').from('t').where('a > 1').where(['b < 2', 'c = 3']).getSQL());
   });

   test('multiple keys in one WHERE object are ANDed', () => {
      each({
         mysql: 'SELECT * FROM `t` WHERE `a` = 1 AND `b` = 2 ',
         pg: 'SELECT * FROM "t" WHERE "a" = 1 AND "b" = 2 ',
         sqlite: 'SELECT * FROM "t" WHERE a = 1 AND b = 2 '
      }, c => c.select('*').from('t').where({ a: '= 1', b: '= 2' }).getSQL());
   });
});

describe('query builder - LIMIT / OFFSET', () => {
   test('offset(0) is a no-op, which is harmless', () => {
      each({ mysql: 'SELECT * FROM `t` ', pg: 'SELECT * FROM "t" ', sqlite: 'SELECT * FROM "t" ' },
         c => c.select('*').from('t').offset(0).getSQL());
   });

   test('limit(0) emits LIMIT 0', { todo: 'the guard is a truthiness check on _query.limit, so 0 is dropped and the query returns every row' }, () => {
      each({
         mysql: 'SELECT * FROM `t` LIMIT 0 ',
         pg: 'SELECT * FROM "t" LIMIT 0 ',
         sqlite: 'SELECT * FROM "t" LIMIT 0 '
      }, c => c.select('*').from('t').limit(0).getSQL());
   });

   test('offset without limit is still emitted', () => {
      each({
         mysql: 'SELECT * FROM `t` OFFSET 10 ',
         pg: 'SELECT * FROM "t" OFFSET 10 ',
         sqlite: 'SELECT * FROM "t" OFFSET 10 '
      }, c => c.select('*').from('t').offset(10).getSQL());
   });

   test('a later limit() overwrites the earlier one', () => {
      each({ mysql: 'SELECT * FROM `t` LIMIT 5 ', pg: 'SELECT * FROM "t" LIMIT 5 ', sqlite: 'SELECT * FROM "t" LIMIT 5 ' },
         c => c.select('*').from('t').limit(1).limit(5).getSQL());
   });

   test('pg suppresses LIMIT/OFFSET when there is no SELECT, mysql and sqlite do not', () => {
      each({
         mysql: 'UPDATE `t` SET `a` = 1 LIMIT 1 OFFSET 5 ',
         pg: 'UPDATE "t" SET "a" = 1 ',
         sqlite: 'UPDATE "t" SET a = 1 LIMIT 1 OFFSET 5 '
      }, c => c.update({ a: '= 1' }).from('t').limit(1).offset(5).getSQL());
   });
});

describe('query builder - UPDATE', () => {
   test('the single-cell edit the app issues for a table with a primary key', () => {
      // src/main/ipc-handlers/tables.ts update-table-cell.
      each({
         mysql: 'UPDATE `sakila`.`actor` SET `first_name` = \'PENELOPE\' WHERE `actor_id` = 1 LIMIT 1 ',
         pg: 'UPDATE "sakila"."actor" SET "first_name" = \'PENELOPE\' WHERE "actor_id" = 1 ',
         sqlite: 'UPDATE "sakila"."actor" SET first_name = \'PENELOPE\' WHERE actor_id = 1 LIMIT 1 '
      }, c => c.update({ first_name: '= \'PENELOPE\'' }).schema('sakila').from('actor')
         .where({ actor_id: '= 1' }).limit(1).getSQL());
   });

   test('the cell edit for a table without a primary key matches the whole original row', () => {
      each({
         mysql: 'UPDATE `db`.`t` SET `a` = 2 WHERE `a` = 1 AND `b` = \'x\' ',
         pg: 'UPDATE "db"."t" SET "a" = 2 WHERE "a" = 1 AND "b" = \'x\' ',
         sqlite: 'UPDATE "db"."t" SET a = 2 WHERE a = 1 AND b = \'x\' '
      }, c => c.schema('db').update({ a: '= 2' }).from('t').where({ a: '= 1', b: '= \'x\'' }).getSQL());
   });

   test('multiple SET columns', () => {
      each({
         mysql: 'UPDATE `t` SET `a` = 1, `b` = 2 ',
         pg: 'UPDATE "t" SET "a" = 1, "b" = 2 ',
         sqlite: 'UPDATE "t" SET a = 1, b = 2 '
      }, c => c.update({ a: '= 1', b: '= 2' }).from('t').getSQL());
   });
});

describe('query builder - INSERT', () => {
   test('a multi-row insert', () => {
      each({
         mysql: 'INSERT INTO `db`.`users` (`id`, `name`) VALUES (1, \'a\'), (2, \'b\') ',
         pg: 'INSERT INTO "db"."users" ("id", "name") VALUES (1, \'a\'), (2, \'b\') ',
         sqlite: 'INSERT INTO "db"."users" (id, name) VALUES (1, \'a\'), (2, \'b\') '
      }, c => c.insert([{ id: 1, name: '\'a\'' }, { id: 2, name: '\'b\'' }]).schema('db').into('users').getSQL());
   });

   test('insert() accumulates across calls', () => {
      each({
         mysql: 'INSERT INTO `t` (`id`) VALUES (1), (2) ',
         pg: 'INSERT INTO "t" ("id") VALUES (1), (2) ',
         sqlite: 'INSERT INTO "t" (id) VALUES (1), (2) '
      }, c => c.insert([{ id: 1 }]).insert([{ id: 2 }]).into('t').getSQL());
   });

   test('an empty insert array emits no INSERT at all', () => {
      each({ mysql: 'FROM `t` ', pg: 'FROM "t" ', sqlite: 'FROM "t" ' },
         c => c.insert([]).into('t').getSQL());
   });

   test('mysql and pg quote the inserted column names', () => {
      assert.equal(make.mysql().insert([{ order: 1 }]).into('t').getSQL(), 'INSERT INTO `t` (`order`) VALUES (1) ');
      assert.equal(make.pg().insert([{ order: 1 }]).into('t').getSQL(), 'INSERT INTO "t" ("order") VALUES (1) ');
   });

   test('sqlite quotes the inserted column names too', { todo: 'SQLiteClient.getSQL:592 uses Object.keys() raw, so a column named after a keyword produces invalid SQL' }, () => {
      assert.equal(make.sqlite().insert([{ order: 1 }]).into('t').getSQL(), 'INSERT INTO "t" ("order") VALUES (1) ');
   });
});

describe('query builder - DELETE', () => {
   test('the bulk row delete the app issues', () => {
      each({
         mysql: 'DELETE FROM `sakila`.`actor` WHERE `actor_id` IN (1,2,3) LIMIT 3 ',
         pg: 'DELETE FROM "sakila"."actor" WHERE "actor_id" IN (1,2,3) ',
         sqlite: 'DELETE FROM "sakila"."actor" WHERE actor_id IN (1,2,3) LIMIT 3 '
      }, c => c.schema('sakila').delete('actor').where({ actor_id: 'IN (1,2,3)' }).limit(3).getSQL());
   });

   test('delete() also sets the FROM table', () => {
      each({ mysql: 'DELETE FROM `t` ', pg: 'DELETE FROM "t" ', sqlite: 'DELETE FROM "t" ' },
         c => c.delete('t').getSQL());
   });
});

describe('query builder - identifier quoting and escaping', () => {
   test('the wrapper is doubled when it appears inside an identifier', { todo: 'no client escapes the wrapper: today mysql emits `SELECT * FROM `a`b` ` and pg/sqlite `SELECT * FROM "a"b" `, both invalid' }, () => {
      assert.equal(make.mysql().select('*').from('a`b').getSQL(), 'SELECT * FROM `a``b` ');
      assert.equal(make.pg().select('*').from('a"b').getSQL(), 'SELECT * FROM "a""b" ');
      assert.equal(make.sqlite().select('*').from('a"b').getSQL(), 'SELECT * FROM "a""b" ');
   });

   test('sqlite rewrites "= null" to IS NULL', () => {
      assert.equal(make.sqlite().select('*').from('t').where({ a: '= null' }).getSQL(), 'SELECT * FROM "t" WHERE a IS NULL ');
   });

   test('mysql and pg rewrite "= null" to IS NULL as well', { todo: 'only SQLiteClient.getSQL:581 does the rewrite, so mysql/pg emit `= null`, which never matches a row' }, () => {
      assert.equal(make.mysql().select('*').from('t').where({ a: '= null' }).getSQL(), 'SELECT * FROM `t` WHERE `a` IS NULL ');
      assert.equal(make.pg().select('*').from('t').where({ a: '= null' }).getSQL(), 'SELECT * FROM "t" WHERE "a" IS NULL ');
   });

   test('every "= null" in a clause is rewritten, not just the first', { todo: 'SQLiteClient.getSQL:581 uses String.replace instead of replaceAll' }, () => {
      assert.equal(
         make.sqlite().select('*').from('t').where('a = null OR b = null').getSQL(),
         'SELECT * FROM "t" WHERE a IS NULL OR b IS NULL '
      );
   });
});

describe('query builder - state handling', () => {
   test('a reused client does not accumulate clauses between builds', { todo: 'only run() calls the private _resetQuery(), so a second getSQL() on the same client emits `SELECT *, id FROM `b` `' }, () => {
      const c = make.mysql();
      assert.equal(c.select('*').from('a').getSQL(), 'SELECT * FROM `a` ');
      assert.equal(c.select('id').from('b').getSQL(), 'SELECT id FROM `b` ');
   });

   test('a fresh client per query is clean', () => {
      assert.equal(make.mysql().select('*').from('a').getSQL(), 'SELECT * FROM `a` ');
      assert.equal(make.mysql().select('id').from('b').getSQL(), 'SELECT id FROM `b` ');
   });

   test('an object clause keeps the clauses queued before it', { todo: '_reducer\'s object branch returns `clausoles` instead of [...acc, ...clausoles], so earlier WHERE fragments are silently dropped - a filter can vanish from an UPDATE or DELETE' }, () => {
      for (const d of DIALECTS) {
         assert.ok(
            make[d]().select('*').from('t').where('deleted = 0').where({ id: '= 5' }).getSQL().includes('deleted = 0'),
            `client ${d} dropped the first clause`
         );
      }
      assert.equal(
         make.mysql().select('*').from('t').where({ a: '= 1' }).where({ b: '= 2' }).getSQL(),
         'SELECT * FROM `t` WHERE `a` = 1 AND `b` = 2 '
      );
   });

   test('a string clause after an object clause is kept', () => {
      // The string branch does spread the accumulator, so this direction works today.
      assert.equal(
         make.mysql().select('*').from('t').where({ b: '= 2' }).where('deleted = 0').getSQL(),
         'SELECT * FROM `t` WHERE `b` = 2 AND deleted = 0 '
      );
   });

   test('a wrong-typed clause does not crash the builder on undefined', { todo: '_reducer has no default branch, so it returns undefined and getSQL throws "Cannot read properties of undefined (reading \'length\')" - a validation error would be fine, this TypeError is not' }, () => {
      for (const d of DIALECTS) {
         assert.doesNotThrow(
            () => make[d]().select('*').from('t').where(true).getSQL(),
            TypeError,
            `client ${d}`
         );
      }
   });

   test('getSQL is unimplemented on the abstract base', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { BaseClient } = require('@/../main/libs/clients/BaseClient');
      class Bare extends BaseClient {}
      const bare = new Bare({ client: 'mysql', params: {}, logger: noop });
      assert.throws(() => bare.getSQL(), /must implement the "getSQL" method/);
      assert.throws(() => bare.raw('SELECT 1'), /must implement the "raw" method/);
      assert.throws(() => bare.getDatabases(), /not implemented/);
   });
});
