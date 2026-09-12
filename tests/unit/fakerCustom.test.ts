import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import FakerMethods from 'common/FakerMethods';
import { fakerCustom } from 'common/libs/fakerCustom';

interface CatalogEntry { name: string; group: string; types: string[]; params?: string[] }

const methods = FakerMethods._methods as CatalogEntry[];
const fc = fakerCustom as unknown as Record<string, Record<string, (...args: unknown[]) => unknown>>;

/**
 * Deliberately loose: the two call sites care about the shape, never the value.
 * `tables.ts:406` branches on `typeof fakeValue === 'string'` and hands anything else to
 * `parseDate` for a date column, `WorkspaceTabQueryTable.vue:699` feeds the result to moment.
 * A generated value is random, so nothing here may assert on one.
 */
const ACCEPTS: Record<string, (value: unknown) => boolean> = {
   string: value => typeof value === 'string',
   uuid: value => typeof value === 'string',
   number: value => typeof value === 'number',
   float: value => typeof value === 'number',
   datetime: value => typeof value === 'string' || value instanceof Date,
   time: value => typeof value === 'string' || value instanceof Date
};

const shapeOf = (value: unknown): string => {
   if (value instanceof Date) return 'Date';
   if (Array.isArray(value)) return 'array';
   return typeof value;
};

// One pass over the live catalog -- the commented-out entries are not in the export, so
// parsing the export rather than the file skips them for free.
const sweep = () => {
   const notCallable: string[] = [];
   const threw: string[] = [];
   const wrongShape: string[] = [];

   for (const { group, name, types } of methods) {
      const method = fc[group]?.[name];

      if (typeof method !== 'function') {
         notCallable.push(`${group}.${name}`);
         continue;
      }

      let value: unknown;

      try {
         value = method();
      }
      catch (err) {
         threw.push(`${group}.${name}: ${(err as Error).message}`);
         continue;
      }

      if (value === undefined || value === null || value === '')
         wrongShape.push(`${group}.${name}: got ${value === '' ? 'an empty string' : String(value)}`);
      else if (!types.some(type => ACCEPTS[type]?.(value)))
         wrongShape.push(`${group}.${name}: got ${shapeOf(value)}, declared ${types.join('|')}`);
   }

   return { notCallable, threw, wrongShape };
};

const { notCallable, threw, wrongShape } = sweep();

describe('fakerCustom against the catalog', () => {
   test('every catalog entry resolves to a function on fakerCustom', {
      todo: 'the catalog offers time.recent, and fakerCustom.time only defines now and random'
   }, () => {
      assert.deepEqual(notCallable, []);
   });

   test('no catalog entry throws when called the way the handler calls it', () => {
      assert.deepEqual(threw, []);
   });

   test('every catalog entry returns a value of a shape it declares', {
      todo: 'three entries hand back an array or a boolean where the catalog promises a string'
   }, () => {
      assert.deepEqual(wrongShape, []);
   });
});

// The three methods fakerCustom adds on top of faker (fakerCustom.ts:9-16), the only part of
// the wrapper that is ours. Format, never value: these are clocks.
describe('the methods fakerCustom adds itself', () => {
   test('date.now is our moment-formatted timestamp, not faker\'s', () => {
      assert.match(fc.date.now() as string, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
   });

   test('time.now and time.random are moment-formatted times', () => {
      assert.match(fc.time.now() as string, /^\d{2}:\d{2}:\d{2}$/);
      assert.match(fc.time.random() as string, /^\d{2}:\d{2}:\d{2}$/);
   });

   test('adding them does not cost the faker methods spread in beside them', () => {
      // `...faker.date` sits after `now`, so a faker release that ships its own `date.now`
      // would silently take ours over. The other direction has to hold too.
      assert.equal(typeof fc.date.past, 'function');
      assert.equal(typeof fc.date.recent, 'function');
   });
});

describe('fakerCustom.seed', () => {
   test('is re-exported off the faker prototype, which the spread does not copy', () => {
      assert.equal(typeof fc.seed, 'function');
   });

   test('the same seed replays the same value, a different seed does not', () => {
      fc.seed(42);
      const first = fc.name.firstName();
      fc.seed(42);
      const replay = fc.name.firstName();
      fc.seed(1987);
      const other = fc.name.firstName();

      assert.equal(replay, first);
      assert.notEqual(other, first);
   });
});
