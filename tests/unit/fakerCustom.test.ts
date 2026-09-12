import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { faker } from '@faker-js/faker';
import FakerMethods from 'common/FakerMethods';
import { generateFakeValue } from 'common/libs/fakerCustom';

interface CatalogEntry { name: string; group: string; types: string[]; params?: string[] }

const methods = FakerMethods._methods as CatalogEntry[];

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
      let value: unknown;

      try {
         value = generateFakeValue({ group, method: name });
      }
      catch (err) {
         const message = (err as Error).message;
         (message.startsWith('faker has no method') ? notCallable : threw).push(`${group}.${name}: ${message}`);
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

describe('generateFakeValue against the catalog', () => {
   test('every catalog entry resolves to something faker can produce', () => {
      assert.deepEqual(notCallable, []);
   });

   test('no catalog entry throws when called the way the handler calls it', () => {
      assert.deepEqual(threw, []);
   });

   test('every catalog entry returns a value of a shape it declares', () => {
      assert.deepEqual(wrongShape, []);
   });

   test('a group or method the catalog does not carry is refused, not silently empty', () => {
      assert.throws(() => generateFakeValue({ group: 'nosuchgroup', method: 'city' }), /faker has no method/);
      assert.throws(() => generateFakeValue({ group: 'location', method: 'nosuchmethod' }), /faker has no method/);
   });
});

// The entries the wrapper produces itself rather than handing to faker, the only part of it
// that is ours. Format, never value: these are clocks.
describe('the entries the wrapper produces itself', () => {
   test('date.now is our moment-formatted timestamp, not faker\'s', () => {
      assert.match(generateFakeValue({ group: 'date', method: 'now' }) as string, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
   });

   test('time.now, time.recent and time.random are moment-formatted times', () => {
      for (const method of ['now', 'recent', 'random'])
         assert.match(generateFakeValue({ group: 'time', method }) as string, /^\d{2}:\d{2}:\d{2}$/);
   });

   test('overriding an entry does not cost the faker methods beside it', () => {
      // `date.now` is ours and `date.recent` is faker's; both live in the same catalog group.
      assert.ok(generateFakeValue({ group: 'date', method: 'past' }) instanceof Date);
      assert.ok(generateFakeValue({ group: 'date', method: 'recent' }) instanceof Date);
   });

   test('a user-supplied min and max reach the generator', () => {
      for (let i = 0; i < 50; i++) {
         const value = generateFakeValue({ group: 'number', method: 'int', params: { min: 10, max: 12 } }) as number;
         assert.ok(value >= 10 && value <= 12, `got ${value}`);
      }
   });

   test('without params a number stays in the range faker 6 used, not faker 10\'s full range', () => {
      // `random.number()` capped at 99999 on 6.1.2, and an INT column still has to take it.
      for (let i = 0; i < 50; i++)
         assert.ok((generateFakeValue({ group: 'number', method: 'int' }) as number) <= 99999);
   });
});

describe('the no-locale path', () => {
   test('runs on the root faker instance, so seeding it replays the same value', () => {
      faker.seed(42);
      const first = generateFakeValue({ group: 'person', method: 'firstName' });
      faker.seed(42);
      const replay = generateFakeValue({ group: 'person', method: 'firstName' });
      faker.seed(1987);
      const other = generateFakeValue({ group: 'person', method: 'firstName' });

      assert.equal(replay, first);
      assert.notEqual(other, first);
   });
});
