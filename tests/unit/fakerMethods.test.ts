import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import FakerMethods from 'common/FakerMethods';

import { enUS } from '@/i18n/en-US';

interface CatalogEntry { name: string; group: string; types: string[]; params?: string[] }

const methods = FakerMethods._methods as CatalogEntry[];
const groups = FakerMethods.getGroups();
const labels = enUS.faker as Record<string, string>;

// The column-type buckets FakerSelect.vue sorts a column into before asking the catalog
// for the groups and methods that can fill it (FakerSelect.vue:117-133).
const COLUMN_TYPES = ['string', 'number', 'float', 'datetime', 'time', 'uuid'];

describe('FakerMethods catalog', () => {
   test('every entry names a method, a group and at least one column type it can fill', () => {
      const offenders: string[] = [];

      for (const entry of methods) {
         if (!entry.name || !entry.group)
            offenders.push(`${entry.group}.${entry.name}: missing name or group`);
         else if (!Array.isArray(entry.types) || !entry.types.length)
            offenders.push(`${entry.group}.${entry.name}: no types`);
         else {
            const unknown = entry.types.filter(type => !COLUMN_TYPES.includes(type));
            if (unknown.length)
               offenders.push(`${entry.group}.${entry.name}: unknown type ${unknown.join(', ')}`);
         }
      }

      assert.deepEqual(offenders, []);
   });

   test('no group lists the same method twice', () => {
      const seen = new Set<string>();
      const offenders: string[] = [];

      for (const { group, name } of methods) {
         if (seen.has(`${group}.${name}`)) offenders.push(`${group}.${name}`);
         seen.add(`${group}.${name}`);
      }

      assert.deepEqual(offenders, []);
   });
});

describe('FakerMethods.getGroups', () => {
   test('lists every group in the catalog, alphabetically', () => {
      const expected = [...new Set(methods.map(m => m.group))].sort();

      assert.deepEqual(groups.map(g => g.name), expected);
   });

   test('a group carries the union of the column types its methods can fill', () => {
      const offenders: string[] = [];

      for (const group of groups) {
         const union = [...new Set(methods.filter(m => m.group === group.name).flatMap(m => m.types))];
         const missing = union.filter(type => !group.types.includes(type));
         const extra = group.types.filter((type: string) => !union.includes(type));

         if (missing.length || extra.length)
            offenders.push(`${group.name}: missing ${missing.join(',') || '-'} extra ${extra.join(',') || '-'}`);
      }

      assert.deepEqual(offenders, []);
   });
});

describe('FakerMethods.getGroupsByType', () => {
   test('narrows to the groups that can fill that column type', () => {
      // `uuid` is the narrowest bucket: one method in one group.
      assert.deepEqual(FakerMethods.getGroupsByType('uuid').map(g => g.name), ['string']);
      assert.deepEqual(FakerMethods.getGroupsByType('time').map(g => g.name), ['time']);
      assert.deepEqual(FakerMethods.getGroupsByType('datetime').map(g => g.name), ['date']);
   });

   test('every returned group really holds a method of that type', () => {
      const offenders: string[] = [];

      for (const type of COLUMN_TYPES) {
         for (const group of FakerMethods.getGroupsByType(type)) {
            if (!methods.some(m => m.group === group.name && m.types.includes(type)))
               offenders.push(`${group.name}.${type}`);
         }
      }

      assert.deepEqual(offenders, []);
   });

   test('an unknown or empty type selects nothing, rather than everything', () => {
      // `none` is what FakerSelect.vue falls back to for a column it cannot bucket.
      assert.deepEqual(FakerMethods.getGroupsByType('none'), []);
      assert.deepEqual(FakerMethods.getGroupsByType(''), []);
      assert.deepEqual(FakerMethods.getGroupsByType(null), []);
   });
});

describe('FakerMethods.getMethods', () => {
   test('returns the methods of one group that fill that column type, alphabetically', () => {
      assert.deepEqual(FakerMethods.getMethods({ type: 'time', group: 'time' }).map(m => m.name), ['now', 'random', 'recent']);
      assert.deepEqual(FakerMethods.getMethods({ type: 'uuid', group: 'string' }).map(m => m.name), ['uuid']);
   });

   test('a group that cannot fill the type, or does not exist, returns nothing', () => {
      assert.deepEqual(FakerMethods.getMethods({ type: 'uuid', group: 'location' }), []);
      assert.deepEqual(FakerMethods.getMethods({ type: 'string', group: 'nosuchgroup' }), []);
   });

   test('the first method of every offered group is selectable, or the dropdown opens empty', () => {
      // FakerSelect.vue:230 auto-selects `fakerMethods[0]` whenever the group changes.
      const offenders: string[] = [];

      for (const type of COLUMN_TYPES) {
         for (const group of FakerMethods.getGroupsByType(type)) {
            if (!FakerMethods.getMethods({ type, group: group.name }).length)
               offenders.push(`${group.name}.${type}`);
         }
      }

      assert.deepEqual(offenders, []);
   });
});

// FakerSelect.vue:7,18 labels both dropdowns through `t(`faker.${opt.name}`)`. A key missing
// from en-US is not translated away by the fallback -- it renders the raw `faker.userName`.
// Only en-US on purpose: i18n/index.ts falls back to it with `silentFallbackWarn`, so the
// other 18 locales degrade to an English label. `npm run translation:check` reports those.
describe('en-US faker labels', () => {
   test('every catalog method and every group has a label', () => {
      const offenders = [...new Set([...methods.map(m => m.name), ...groups.map(g => g.name)])]
         .filter(name => !labels[name])
         .sort();

      assert.deepEqual(offenders, []);
   });

   test('no label outlives the catalog entry it was written for', () => {
      const named = new Set([...methods.map(m => m.name), ...groups.map(g => g.name)]);
      const offenders = Object.keys(labels).filter(key => !named.has(key)).sort();

      assert.deepEqual(offenders, []);
   });
});
