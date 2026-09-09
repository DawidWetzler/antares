import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { escapeAndQuote, formatJsonForSqlWhere, jsonToSqlInsert, likeContains, objectToGeoJSON, quoteLiteral, valueToGeoJSON, valueToSqlString } from 'common/libs/sqlUtils';
import { Feature, FeatureCollection } from 'geojson';

const DIALECTS = ['mysql', 'pg', 'sqlite'] as const;
// mysql wraps strings in `"`, pg/sqlite in `'` (see src/common/customizations/*).
const SW = { mysql: '"', pg: '\'', sqlite: '\'' } as const;
const num = { type: 'INT', datePrecision: 0 };
const str = { type: 'VARCHAR', datePrecision: 0 };

describe('escapeAndQuote', () => {
   test('wraps plain strings in the dialect string wrapper', () => {
      assert.equal(escapeAndQuote('plain', 'mysql'), '"plain"');
      assert.equal(escapeAndQuote('plain', 'pg'), '\'plain\'');
      assert.equal(escapeAndQuote('plain', 'sqlite'), '\'plain\'');
      assert.equal(escapeAndQuote('plain', 'firebird'), '\'plain\'');
   });

   test('empty string becomes an empty quoted literal', () => {
      for (const c of DIALECTS)
         assert.equal(escapeAndQuote('', c), `${SW[c]}${SW[c]}`, `client ${c}`);
   });

   test('mysql escapes single quotes with a backslash', () => {
      assert.equal(escapeAndQuote('O\'Brien', 'mysql'), '"O\\\'Brien"');
   });

   test('pg and sqlite double the single quote instead of backslash-escaping it', { todo: 'escapeAndQuote emits a backslash escape, invalid under PostgreSQL default standard_conforming_strings=on and in sqlite' }, () => {
      assert.equal(escapeAndQuote('O\'Brien', 'pg'), '\'O\'\'Brien\'');
      assert.equal(escapeAndQuote('O\'Brien', 'sqlite'), '\'O\'\'Brien\'');
   });

   test('double quotes are escaped only when they are the wrapper', () => {
      assert.equal(escapeAndQuote('say "hi"', 'mysql'), '"say \\"hi\\""');
      assert.equal(escapeAndQuote('say "hi"', 'pg'), '\'say "hi"\'');
      assert.equal(escapeAndQuote('say "hi"', 'sqlite'), '\'say "hi"\'');
   });

   test('escapes backslash and the control characters', () => {
      assert.equal(escapeAndQuote('a\\b', 'mysql'), '"a\\\\b"');
      assert.equal(escapeAndQuote('a\nb', 'mysql'), '"a\\nb"');
      assert.equal(escapeAndQuote('a\rb', 'mysql'), '"a\\rb"');
      assert.equal(escapeAndQuote('a\tb', 'mysql'), '"a\\tb"');
      assert.equal(escapeAndQuote('a\bb', 'mysql'), '"a\\bb"');
      assert.equal(escapeAndQuote('a\0b', 'mysql'), '"a\\0b"');
      assert.equal(escapeAndQuote('a\x1ab', 'mysql'), '"a\\Zb"');
   });

   test('keeps the tail after the last escape', () => {
      assert.equal(escapeAndQuote('a\'b tail', 'mysql'), '"a\\\'b tail"');
      assert.equal(escapeAndQuote('lead a\'b', 'mysql'), '"lead a\\\'b"');
      assert.equal(escapeAndQuote('a\'', 'mysql'), '"a\\\'"');
   });

   test('multiple escapes in one value are all applied', () => {
      assert.equal(escapeAndQuote('a\nb\\c\'d', 'mysql'), '"a\\nb\\\\c\\\'d"');
   });

   test('percent signs and unicode are left alone', () => {
      assert.equal(escapeAndQuote('100% héllo→☃', 'pg'), '\'100% héllo→☃\'');
   });
});

describe('valueToSqlString', () => {
   test('null becomes the NULL keyword, not a quoted string', () => {
      for (const c of DIALECTS)
         assert.equal(valueToSqlString({ val: null, client: c, field: str }), 'NULL', `client ${c}`);
   });

   test('empty string becomes an empty literal, distinct from NULL', () => {
      assert.equal(valueToSqlString({ val: '', client: 'mysql', field: str }), '""');
      assert.equal(valueToSqlString({ val: '', client: 'pg', field: str }), '\'\'');
   });

   test('numbers pass through unquoted', () => {
      assert.equal(valueToSqlString({ val: 42, client: 'mysql', field: num }), 42);
      assert.equal(valueToSqlString({ val: 0, client: 'mysql', field: num }), 0);
      assert.equal(valueToSqlString({ val: -7, client: 'pg', field: { type: 'BIGINT', datePrecision: 0 } }), -7);
   });

   test('floats are coerced with parseFloat', () => {
      assert.equal(valueToSqlString({ val: '1.50', client: 'mysql', field: { type: 'FLOAT', datePrecision: 0 } }), 1.5);
      assert.ok(Number.isNaN(valueToSqlString({ val: 'nope', client: 'mysql', field: { type: 'DECIMAL', datePrecision: 0 } }) as unknown as number));
   });

   test('booleans pass through unquoted', () => {
      assert.equal(valueToSqlString({ val: true, client: 'mysql', field: { type: 'BOOLEAN', datePrecision: 0 } }), true);
      assert.equal(valueToSqlString({ val: false, client: 'sqlite', field: { type: 'BOOL', datePrecision: 0 } }), false);
   });

   test('DATE is formatted and quoted', () => {
      assert.equal(valueToSqlString({ val: '2024-03-05', client: 'pg', field: { type: 'DATE', datePrecision: 0 } }), '\'2024-03-05\'');
      assert.equal(valueToSqlString({ val: new Date(2024, 2, 5, 23, 30), client: 'pg', field: { type: 'DATE', datePrecision: 0 } }), '\'2024-03-05\'');
   });

   test('an invalid DATE is returned raw and unquoted', () => {
      assert.equal(valueToSqlString({ val: 'not-a-date', client: 'pg', field: { type: 'DATE', datePrecision: 0 } }), 'not-a-date');
   });

   test('DATETIME honours datePrecision', () => {
      const d = new Date(2024, 2, 5, 10, 11, 12, 456);
      assert.equal(valueToSqlString({ val: d, client: 'pg', field: { type: 'DATETIME', datePrecision: 0 } }), '\'2024-03-05 10:11:12\'');
      assert.equal(valueToSqlString({ val: d, client: 'pg', field: { type: 'DATETIME', datePrecision: 1 } }), '\'2024-03-05 10:11:12.4\'');
      assert.equal(valueToSqlString({ val: d, client: 'pg', field: { type: 'DATETIME', datePrecision: 3 } }), '\'2024-03-05 10:11:12.456\'');
      assert.equal(valueToSqlString({ val: d, client: 'mysql', field: { type: 'TIMESTAMP', datePrecision: 3 } }), '"2024-03-05 10:11:12.456"');
   });

   test('an invalid DATETIME is quoted and escaped', () => {
      assert.equal(valueToSqlString({ val: 'O\'clock', client: 'mysql', field: { type: 'DATETIME', datePrecision: 0 } }), '"O\\\'clock"');
   });

   test('strings are escaped and quoted per dialect', () => {
      assert.equal(valueToSqlString({ val: 'a;b', client: 'mysql', field: str }), '"a;b"');
      assert.equal(valueToSqlString({ val: '--', client: 'pg', field: str }), '\'--\'');
      assert.equal(valueToSqlString({ val: 'a\nb', client: 'mysql', field: str }), '"a\\nb"');
      assert.equal(valueToSqlString({ val: 'a\\b', client: 'mysql', field: str }), '"a\\\\b"');
      assert.equal(valueToSqlString({ val: 'O\'Brien', client: 'mysql', field: str }), '"O\\\'Brien"');
      assert.equal(valueToSqlString({ val: '☃', client: 'pg', field: str }), '\'☃\'');
   });

   test('plain objects are JSON-stringified then escaped', () => {
      assert.equal(valueToSqlString({ val: { a: 1 }, client: 'mysql', field: { type: 'JSON', datePrecision: 0 } }), '"{\\"a\\":1}"');
      assert.equal(valueToSqlString({ val: { a: 1 }, client: 'pg', field: { type: 'JSON', datePrecision: 0 } }), '\'{"a":1}\'');
   });

   test('BLOB uses the dialect binary literal syntax', () => {
      const buf = Buffer.from([0xde, 0xad, 0x00]);
      assert.equal(valueToSqlString({ val: buf, client: 'mysql', field: { type: 'BLOB', datePrecision: 0 } }), 'X\'DEAD00\'');
      assert.equal(valueToSqlString({ val: buf, client: 'maria', field: { type: 'BLOB', datePrecision: 0 } }), 'X\'DEAD00\'');
      assert.equal(valueToSqlString({ val: buf, client: 'pg', field: { type: 'BLOB', datePrecision: 0 } }), 'decode(\'DEAD00\', \'hex\')');
   });

   test('BLOB accepts a Uint8Array as well as a Buffer', () => {
      assert.equal(
         valueToSqlString({ val: new Uint8Array([0x01, 0xff]), client: 'mysql', field: { type: 'BLOB', datePrecision: 0 } }),
         'X\'01FF\''
      );
   });

   test('BLOB on sqlite uses the X\'..\' literal sqlite understands', { todo: 'sqlUtils.ts:292-296 only branches on mysql/maria/pg, so parsedValue stays undefined and the export writes the literal text "undefined"' }, () => {
      assert.equal(valueToSqlString({ val: Buffer.from([0xde]), client: 'sqlite', field: { type: 'BLOB', datePrecision: 0 } }), 'X\'DE\'');
   });

   test('BLOB on firebird produces something other than undefined', { todo: 'same missing branch in sqlUtils.ts:292-296' }, () => {
      assert.notEqual(valueToSqlString({ val: Buffer.from([0xde]), client: 'firebird', field: { type: 'BLOB', datePrecision: 0 } }), undefined);
   });

   test('BIT is rendered as a binary literal', () => {
      assert.equal(valueToSqlString({ val: [0x0f], client: 'mysql', field: { type: 'BIT', datePrecision: 0 } }), 'b\'00001111\'');
   });

   test('TSVECTOR doubles single quotes instead of backslash-escaping', () => {
      assert.equal(valueToSqlString({ val: 'it\'s', client: 'pg', field: { type: 'TSVECTOR', datePrecision: 0 } }), '\'it\'\'s\'');
   });

   test('array fields become pg brace literals', () => {
      assert.equal(valueToSqlString({ val: [1, 2], client: 'pg', field: { type: 'INTEGER', datePrecision: 0, isArray: true } }), '\'{1,2}\'');
      assert.equal(valueToSqlString({ val: '[1,2]', client: 'pg', field: { type: 'INTEGER', datePrecision: 0, isArray: true } }), '\'{1,2}\'');
      assert.equal(valueToSqlString({ val: [], client: 'pg', field: { type: 'INTEGER', datePrecision: 0, isArray: true } }), '\'{}\'');
   });

   test('an array field fed a scalar does not silently drop the value', { todo: 'the non-string branch of the isArray path falls back to an empty string, so a scalar becomes an empty array literal' }, () => {
      assert.notEqual(valueToSqlString({ val: 5, client: 'pg', field: { type: 'INTEGER', datePrecision: 0, isArray: true } }), '\'\'');
   });

   test('SPATIAL values are wrapped in ST_GeomFromGeoJSON', () => {
      assert.equal(
         valueToSqlString({ val: { x: 1, y: 2 }, client: 'mysql', field: { type: 'POINT', datePrecision: 0 } }),
         'ST_GeomFromGeoJSON(\'{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[1,2]}}\')'
      );
   });

   test('missing field descriptor throws rather than emitting junk', () => {
      assert.throws(() => valueToSqlString({ val: 'x', client: 'mysql', field: undefined }), TypeError);
   });
});

describe('objectToGeoJSON', () => {
   test('point, lineString and polygon by array depth', () => {
      assert.equal(objectToGeoJSON({ x: 1, y: 2 }).geometry.type, 'Point');
      assert.equal(objectToGeoJSON([{ x: 1, y: 2 }, { x: 3, y: 4 }]).geometry.type, 'LineString');
      assert.equal(objectToGeoJSON([[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 0 }]]).geometry.type, 'Polygon');
   });

   test('a ring of fewer than four positions is rejected before it reaches the SQL', () => {
      assert.throws(
         () => objectToGeoJSON([[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }]]),
         /Each LinearRing of a Polygon must have 4 or more Positions\./
      );
   });

   test('an unclosed ring is rejected before it reaches the SQL', () => {
      assert.throws(
         () => objectToGeoJSON([[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]]),
         /First and last Position are not equivalent\./
      );
   });

   test('a single position is not a LineString', () => {
      assert.throws(
         () => objectToGeoJSON([{ x: 1, y: 2 }]),
         /coordinates must be an array of two or more positions/
      );
   });

   test('a point without numeric coordinates is rejected', () => {
      assert.throws(() => objectToGeoJSON({}), /coordinates must contain numbers/);
   });
});

// The shapes below are what mysql2 actually hands back, observed against percona 8.0 through
// MySQLClient: every position is a `{ x, y }` object and the nesting depth carries the type.
describe('valueToGeoJSON', () => {
   const P = (x: number, y: number) => ({ x, y });
   const RING = [P(0, 0), P(4, 0), P(4, 4), P(0, 4), P(0, 0)];

   test('a single geometry becomes one Feature', () => {
      assert.deepEqual(valueToGeoJSON(P(1, 2), false), {
         type: 'Feature',
         properties: {},
         geometry: { type: 'Point', coordinates: [1, 2] }
      });
      assert.equal((valueToGeoJSON([P(0, 0), P(1, 1), P(2, 2)], false) as Feature).geometry.type, 'LineString');
      assert.equal((valueToGeoJSON([RING], false) as Feature).geometry.type, 'Polygon');
      assert.equal((valueToGeoJSON(P(5, 6), false) as Feature).geometry.type, 'Point');
   });

   test('a multi geometry becomes a FeatureCollection, one Feature per element', () => {
      const collection = valueToGeoJSON([P(0, 0), P(1, 1)], true) as FeatureCollection;
      assert.equal(collection.type, 'FeatureCollection');
      assert.deepEqual(collection.features.map(f => f.geometry.type), ['Point', 'Point']);
   });

   test('each multi type keeps the geometry mysql2 nested it as', () => {
      const cases: [string, unknown, string[]][] = [
         ['MULTIPOINT', [P(0, 0), P(1, 1)], ['Point', 'Point']],
         ['MULTILINESTRING', [[P(0, 0), P(1, 1)], [P(2, 2), P(3, 3)]], ['LineString', 'LineString']],
         ['MULTIPOLYGON', [[RING], [[P(5, 5), P(6, 5), P(6, 6), P(5, 5)]]], ['Polygon', 'Polygon']],
         ['GEOMCOLLECTION', [P(1, 1), [P(0, 0), P(2, 2)]], ['Point', 'LineString']],
         ['GEOMETRYCOLLECTION', [P(1, 1), [RING]], ['Point', 'Polygon']]
      ];

      for (const [type, val, expected] of cases) {
         const collection = valueToGeoJSON(val, true) as FeatureCollection;
         assert.deepEqual(collection.features.map(f => f.geometry.type), expected, type);
      }
   });

   test('a malformed ring inside a multi geometry throws instead of reaching the SQL', () => {
      assert.throws(
         () => valueToGeoJSON([[[P(0, 0), P(1, 0), P(1, 1), P(0, 1)]]], true),
         /First and last Position are not equivalent\./
      );
   });
});

describe('jsonToSqlInsert', () => {
   const fields = { id: num, name: str };
   const json = [{ id: 1, name: 'O\'Brien' }, { id: 2, name: 'a;b' }, { id: 3, name: null }];

   test('quotes identifiers per dialect', () => {
      assert.equal(
         jsonToSqlInsert({ json: [{ id: 1, name: 'x' }], client: 'mysql', fields, table: 'users' }),
         'INSERT INTO `users` (`id`, `name`) VALUES (1,"x");'
      );
      assert.equal(
         jsonToSqlInsert({ json: [{ id: 1, name: 'x' }], client: 'pg', fields, table: 'users' }),
         'INSERT INTO "users" ("id", "name") VALUES (1,\'x\');'
      );
      assert.equal(
         jsonToSqlInsert({ json: [{ id: 1, name: 'x' }], client: 'sqlite', fields, table: 'users' }),
         'INSERT INTO "users" ("id", "name") VALUES (1,\'x\');'
      );
   });

   test('one statement per row by default, escaping and NULL included', () => {
      assert.equal(
         jsonToSqlInsert({ json, client: 'mysql', fields, table: 'users' }),
         'INSERT INTO `users` (`id`, `name`) VALUES (1,"O\\\'Brien");\n' +
         'INSERT INTO `users` (`id`, `name`) VALUES (2,"a;b");\n' +
         'INSERT INTO `users` (`id`, `name`) VALUES (3,NULL);'
      );
   });

   test('sqlInsertAfter groups rows into multi-row statements', () => {
      assert.equal(
         jsonToSqlInsert({ json, client: 'mysql', fields, table: 't', options: { sqlInsertAfter: 2, sqlInsertDivider: 'rows' } }),
         'INSERT INTO `t` (`id`, `name`) VALUES (1,"O\\\'Brien"),\n(2,"a;b");\n' +
         'INSERT INTO `t` (`id`, `name`) VALUES (3,NULL);'
      );
   });

   test('a batch size larger than the row count yields a single statement', () => {
      const out = jsonToSqlInsert({ json, client: 'pg', fields, table: 't', options: { sqlInsertAfter: 100, sqlInsertDivider: 'rows' } });
      assert.equal(out.match(/INSERT INTO/g).length, 1);
      assert.ok(out.endsWith('(3,NULL);'));
   });

   test('the bytes divider splits once the statement exceeds N KiB', () => {
      const wide = Array.from({ length: 40 }, (_, i) => ({ id: i, name: 'x'.repeat(100) }));
      const oneKb = jsonToSqlInsert({ json: wide, client: 'pg', fields, table: 't', options: { sqlInsertAfter: 1, sqlInsertDivider: 'bytes' } });
      const fourKb = jsonToSqlInsert({ json: wide, client: 'pg', fields, table: 't', options: { sqlInsertAfter: 4, sqlInsertDivider: 'bytes' } });
      const count = (s: string) => s.match(/INSERT INTO/g).length;
      assert.ok(count(oneKb) > count(fourKb), `1KiB=${count(oneKb)} should beat 4KiB=${count(fourKb)}`);
      assert.ok(count(oneKb) > 1 && count(oneKb) < wide.length);
      // Every emitted statement is terminated.
      assert.equal(oneKb.match(/;/g).length, count(oneKb));
   });

   test('a small bytes budget still keeps every row', () => {
      const out = jsonToSqlInsert({ json, client: 'mysql', fields, table: 't', options: { sqlInsertAfter: 1, sqlInsertDivider: 'bytes' } });
      assert.equal(out, 'INSERT INTO `t` (`id`, `name`) VALUES (1,"O\\\'Brien"),\n(2,"a;b"),\n(3,NULL);');
   });

   test('dotted column names are reduced to the last segment', () => {
      assert.equal(
         jsonToSqlInsert({ json: [{ 'users.id': 1 }], client: 'mysql', fields: { 'users.id': num }, table: 't' }),
         'INSERT INTO `t` (`id`) VALUES (1);'
      );
   });

   test('the table name is not escaped - a backtick breaks out of the identifier', () => {
      assert.equal(
         jsonToSqlInsert({ json: [{ id: 1 }], client: 'mysql', fields, table: 'a`b' }),
         'INSERT INTO `a`b` (`id`) VALUES (1);'
      );
   });

   test('an empty row set throws instead of returning empty SQL', () => {
      assert.throws(() => jsonToSqlInsert({ json: [], client: 'mysql', fields, table: 't' }), TypeError);
   });

   test('the first row alone decides the column list', () => {
      // A ragged second row is emitted with its own values but the header of row 1.
      const out = jsonToSqlInsert({ json: [{ id: 1, name: 'a' }, { id: 2 }], client: 'pg', fields, table: 't' });
      assert.equal(out, 'INSERT INTO "t" ("id", "name") VALUES (1,\'a\');\nINSERT INTO "t" ("id", "name") VALUES (2);');
   });
});

describe('formatJsonForSqlWhere', () => {
   test('per-dialect comparison syntax', () => {
      assert.equal(formatJsonForSqlWhere({ a: 1 }, 'mysql'), ' = CAST(\'{"a":1}\' AS JSON)');
      assert.equal(formatJsonForSqlWhere({ a: 1 }, 'maria'), ' = \'{"a":1}\'');
      assert.equal(formatJsonForSqlWhere({ a: 1 }, 'pg'), '::text = \'{"a":1}\'');
      assert.equal(formatJsonForSqlWhere({ a: 1 }, 'sqlite'), ' = \'{"a":1}\'');
      assert.equal(formatJsonForSqlWhere({ a: 1 }, 'firebird'), ' = \'{"a":1}\'');
   });

   test('the JSON payload is escaped before interpolation', { todo: 'formatJsonForSqlWhere interpolates JSON.stringify output raw, so a quote in the data terminates the literal early' }, () => {
      assert.equal(formatJsonForSqlWhere({ a: 'O\'Brien' }, 'sqlite'), ' = \'{"a":"O\'\'Brien"}\'');
   });
});

describe('quoteLiteral', () => {
   test('wraps every dialect in the standard single quote', () => {
      for (const c of [...DIALECTS, 'firebird', 'maria'] as const)
         assert.equal(quoteLiteral('plain', c), '\'plain\'', `client ${c}`);
   });

   test('the single quote is doubled, never backslash-escaped', () => {
      // Unlike escapeAndQuote above, this holds under PostgreSQL's default
      // standard_conforming_strings=on, and MySQL accepts '' inside a '…' literal too.
      for (const c of [...DIALECTS, 'firebird', 'maria'] as const)
         assert.equal(quoteLiteral('O\'Brien', c), '\'O\'\'Brien\'', `client ${c}`);
   });

   test('the backslash is doubled only where the literal treats it as an escape', () => {
      assert.equal(quoteLiteral('a\\b', 'mysql'), '\'a\\\\b\'');
      assert.equal(quoteLiteral('a\\b', 'maria'), '\'a\\\\b\'');
      assert.equal(quoteLiteral('a\\b', 'pg'), '\'a\\b\'');
      assert.equal(quoteLiteral('a\\b', 'sqlite'), '\'a\\b\'');
      assert.equal(quoteLiteral('a\\b', 'firebird'), '\'a\\b\'');
   });

   test('a backslash before a quote cannot escape its way out of the literal', () => {
      // `\'` would leave the literal open on MySQL if the backslash were passed through.
      assert.equal(quoteLiteral('a\\\'; DROP TABLE users --', 'mysql'), '\'a\\\\\'\'; DROP TABLE users --\'');
      assert.equal(quoteLiteral('a\\\'; DROP TABLE users --', 'pg'), '\'a\\\'\'; DROP TABLE users --\'');
   });

   test('an empty string is still a literal', () => {
      assert.equal(quoteLiteral('', 'pg'), '\'\'');
   });
});

describe('likeContains', () => {
   // src/main/ipc-handlers/tables.ts get-foreign-list: the server-side half of the
   // case-insensitive `indexOf` filter BaseSelect applies to option labels.
   test('one spelling that every dialect understands, only the identifier wrapper differs', () => {
      assert.equal(likeContains('id', 'ada', 'mysql'), 'LOWER(CAST(`id` AS CHAR(255))) LIKE \'%ada%\' ESCAPE \'#\'');
      assert.equal(likeContains('id', 'ada', 'pg'), 'LOWER(CAST("id" AS CHAR(255))) LIKE \'%ada%\' ESCAPE \'#\'');
      assert.equal(likeContains('id', 'ada', 'sqlite'), 'LOWER(CAST("id" AS CHAR(255))) LIKE \'%ada%\' ESCAPE \'#\'');
      assert.equal(likeContains('id', 'ada', 'firebird'), 'LOWER(CAST("id" AS CHAR(255))) LIKE \'%ada%\' ESCAPE \'#\'');
   });

   test('the term is wrapped in % on both sides, so it matches anywhere in the value', () => {
      // NOT `LIKE 'term%'`: a prefix match would stop finding what the client-side
      // filter finds today, which is a user-visible regression.
      assert.match(likeContains('name', 'ada', 'pg'), /LIKE '%ada%'/);
   });

   test('the term is lowercased to meet the LOWER() on the column', () => {
      assert.equal(likeContains('name', 'AdA', 'pg'), 'LOWER(CAST("name" AS CHAR(255))) LIKE \'%ada%\' ESCAPE \'#\'');
   });

   test('a wildcard the user typed stays a literal character', () => {
      assert.equal(likeContains('name', '50%', 'pg'), 'LOWER(CAST("name" AS CHAR(255))) LIKE \'%50#%%\' ESCAPE \'#\'');
      assert.equal(likeContains('name', 'a_b', 'pg'), 'LOWER(CAST("name" AS CHAR(255))) LIKE \'%a#_b%\' ESCAPE \'#\'');
   });

   test('the escape character itself is escaped', () => {
      assert.equal(likeContains('name', '#', 'pg'), 'LOWER(CAST("name" AS CHAR(255))) LIKE \'%##%\' ESCAPE \'#\'');
      assert.equal(likeContains('name', '#_', 'pg'), 'LOWER(CAST("name" AS CHAR(255))) LIKE \'%###_%\' ESCAPE \'#\'');
   });

   test('a quote in the term cannot terminate the literal', () => {
      assert.equal(likeContains('name', 'o\'brien', 'pg'), 'LOWER(CAST("name" AS CHAR(255))) LIKE \'%o\'\'brien%\' ESCAPE \'#\'');
   });

   test('an injection attempt stays one string literal', () => {
      const term = '\' OR 1=1 --';
      for (const c of [...DIALECTS, 'firebird'] as const) {
         const clause = likeContains('name', term, c);
         // Exactly one literal: the opening quote, the doubled quote from the term,
         // the closing quote, and the two around the escape character.
         assert.equal((clause.match(/'/g) || []).length, 6, `client ${c}`);
         assert.match(clause, /LIKE '%'' or 1=1 --%' ESCAPE '#'$/, `client ${c}`);
      }
   });

   test('a backslash-quote injection attempt is neutralised on MySQL too', () => {
      assert.equal(likeContains('name', '\\\' OR 1=1 --', 'mysql'),
         'LOWER(CAST(`name` AS CHAR(255))) LIKE \'%\\\\\'\' or 1=1 --%\' ESCAPE \'#\'');
   });

   test('an empty term still produces a valid match-everything clause', () => {
      assert.equal(likeContains('name', '', 'pg'), 'LOWER(CAST("name" AS CHAR(255))) LIKE \'%%\' ESCAPE \'#\'');
   });
});
