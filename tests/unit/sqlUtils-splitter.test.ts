import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { querySplitter, removeComments, sqlEscaper } from 'common/libs/sqlUtils';

describe('querySplitter', () => {
   test('splits multiple statements and keeps the semicolons', () => {
      assert.deepEqual(querySplitter('SELECT 1; SELECT 2;', 'mysql'), ['SELECT 1;', 'SELECT 2;']);
   });

   test('keeps a trailing statement without a semicolon', () => {
      assert.deepEqual(querySplitter('SELECT 1; SELECT 2', 'mysql'), ['SELECT 1;', 'SELECT 2']);
   });

   test('a single statement stays a single statement', () => {
      assert.deepEqual(querySplitter('SELECT * FROM users', 'mysql'), ['SELECT * FROM users']);
   });

   test('empty and whitespace-only input yield no queries', () => {
      assert.deepEqual(querySplitter('', 'mysql'), []);
      assert.deepEqual(querySplitter('   \n\t  ', 'mysql'), []);
   });

   test('bare semicolons survive as empty statements', () => {
      // Documented behaviour: the splitter does not filter out blank statements,
      // callers (raw()) skip them later with `if (!query) continue`.
      assert.deepEqual(querySplitter(';;;', 'mysql'), [';', ';', ';']);
   });

   test('semicolons inside single-quoted literals do not split', () => {
      assert.deepEqual(querySplitter('SELECT \'a;b\'; SELECT 2;', 'mysql'), ['SELECT \'a;b\';', 'SELECT 2;']);
   });

   test('semicolons inside double-quoted literals do not split', () => {
      assert.deepEqual(querySplitter('SELECT "a;b";', 'mysql'), ['SELECT "a;b";']);
   });

   test('an unclosed quote swallows the following statements', () => {
      assert.deepEqual(
         querySplitter('SELECT 1; SELECT \'unclosed; SELECT 3;', 'mysql'),
         ['SELECT 1;', 'SELECT \'unclosed;SELECT 3;']
      );
   });

   test('a balanced apostrophe pair still splits normally', () => {
      assert.deepEqual(querySplitter('SELECT \'O\'; SELECT 2;', 'mysql'), ['SELECT \'O\';', 'SELECT 2;']);
   });

   test('newlines between statements are normalised away', () => {
      assert.deepEqual(querySplitter('SELECT 1;\nSELECT 2;\n', 'mysql'), ['SELECT 1;', 'SELECT 2;']);
   });

   test('BEGIN..END blocks are kept in one statement', () => {
      assert.deepEqual(
         querySplitter('BEGIN; SELECT 1; END; SELECT 2;', 'mysql'),
         ['BEGIN;SELECT 1;END;', 'SELECT 2;']
      );
   });

   test('mysql, pg and sqlite agree on plain statements', () => {
      const sql = 'SELECT 1; INSERT INTO t VALUES (\'a;b\'); DELETE FROM t;';
      const expected = ['SELECT 1;', 'INSERT INTO t VALUES (\'a;b\');', 'DELETE FROM t;'];
      for (const client of ['mysql', 'maria', 'pg', 'sqlite', 'firebird'] as const)
         assert.deepEqual(querySplitter(sql, client), expected, `client ${client}`);
   });

   test('a semicolon inside a -- comment does not split the statement', { todo: 'the splitter is not comment-aware: today it returns ["SELECT 1;", "-- c;", "omment\\nSELECT 2;"]' }, () => {
      const out = querySplitter('SELECT 1; -- c;omment\nSELECT 2;', 'mysql');
      assert.equal(out.length, 2);
      assert.equal(out[0], 'SELECT 1;');
      assert.ok(out[1].endsWith('SELECT 2;'), `second statement was cut: ${out[1]}`);
   });

   test('a semicolon inside a /* */ comment does not split the statement', { todo: 'the splitter is not comment-aware: today it returns ["SELECT /* a;", "b */ 1;", "SELECT 2;"]' }, () => {
      assert.deepEqual(
         querySplitter('SELECT /* a;b */ 1; SELECT 2;', 'mysql'),
         ['SELECT /* a;b */ 1;', 'SELECT 2;']
      );
   });

   test('a pg dollar-quoted function body is kept intact', { todo: 'dollarTagRegex is matched against line.slice(i) instead of position i, so $$ is injected after nearly every character' }, () => {
      const sql = 'CREATE FUNCTION f() RETURNS void AS $$ SELECT 1; $$ LANGUAGE plpgsql;';
      assert.deepEqual(querySplitter(sql, 'pg'), [sql]);
   });

   test('a dollar-quoted body gets no special treatment on mysql', () => {
      // Correct for mysql, which has no dollar quoting - a real mysql body would
      // use DELIMITER, which this splitter also does not implement.
      const sql = 'CREATE FUNCTION f() RETURNS void AS $$ SELECT 1; $$ LANGUAGE plpgsql;';
      assert.deepEqual(querySplitter(sql, 'mysql'), [
         'CREATE FUNCTION f() RETURNS void AS $$ SELECT 1;',
         '$$ LANGUAGE plpgsql;'
      ]);
   });
});

describe('removeComments', () => {
   test('strips -- comments up to the newline', () => {
      assert.equal(removeComments('SELECT 1; -- hi\nSELECT 2;'), 'SELECT 1; SELECT 2;');
   });

   test('strips a -- comment that runs to end of input', () => {
      assert.equal(removeComments('SELECT 1; -- trailing'), 'SELECT 1; ');
   });

   test('strips /* */ comments', () => {
      assert.equal(removeComments('SELECT /* hi */ 1;'), 'SELECT  1;');
   });

   test('an unterminated /* eats the rest of the input', () => {
      assert.equal(removeComments('SELECT /* oops'), 'SELECT ');
   });

   test('nested /* */ openers do not nest', () => {
      assert.equal(removeComments('SELECT /* a /* b */ 1;'), 'SELECT  1;');
   });

   test('empty input returns empty', () => {
      assert.equal(removeComments(''), '');
   });

   test('subtraction and division are not mistaken for comments', () => {
      assert.equal(removeComments('SELECT 1 - -2, 4 / 2;'), 'SELECT 1 - -2, 4 / 2;');
   });

   test('comment markers inside string literals are left alone', { todo: 'removeComments is not string-aware: today "SELECT \'-- not a comment\';" becomes "SELECT \'"' }, () => {
      assert.equal(removeComments('SELECT \'-- not a comment\';'), 'SELECT \'-- not a comment\';');
      assert.equal(removeComments('SELECT \'a /* b */ c\';'), 'SELECT \'a /* b */ c\';');
   });
});

describe('sqlEscaper', () => {
   test('escapes single quotes', () => {
      assert.equal(sqlEscaper('O\'Brien'), 'O\\\'Brien');
   });

   test('escapes double quotes', () => {
      assert.equal(sqlEscaper('say "hi"'), 'say \\"hi\\"');
   });

   test('escapes backslashes', () => {
      assert.equal(sqlEscaper('a\\b'), 'a\\\\b');
      assert.equal(sqlEscaper('C:\\tmp\\x'), 'C:\\\\tmp\\\\x');
   });

   test('empty string and plain text pass through', () => {
      assert.equal(sqlEscaper(''), '');
      assert.equal(sqlEscaper('plain héllo ☃'), 'plain héllo ☃');
   });

   test('no raw control character survives escaping', { todo: 'the lookup array holds the two-char sequences "\\\\n", "\\\\0" ... instead of the real control characters, so indexOf() never matches and every control char falls through unchanged' }, () => {
      // `%` is intentionally a no-op (r[10] is '\%', which is just '%'), so it is
      // not asserted here even though it is in the match pattern.
      for (const raw of ['a\nb', 'a\rb', 'a\tb', 'a\0b', 'a\x1ab']) {
         // eslint-disable-next-line no-control-regex
         assert.ok(!/[\0\x08\x09\x1a\n\r]/.test(sqlEscaper(raw)), `${JSON.stringify(raw)} still contains a raw control character`);
      }
   });
});
