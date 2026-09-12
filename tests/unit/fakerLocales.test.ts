import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { allLocales } from '@faker-js/faker';
import FakerMethods from 'common/FakerMethods';
import { fakerLocales, generateFakeValue } from 'common/libs/fakerCustom';

const CYRILLIC = /\p{Script=Cyrillic}/u;
const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

describe('the locale dropdown', () => {
   test('offers every locale this faker build carries, each one once', () => {
      const values = fakerLocales.map(locale => locale.value);

      // `base` holds only the locale-independent data; a faker built on it alone throws for
      // almost everything, so it is the one key in `allLocales` the dropdown must not show.
      assert.deepEqual([...values].sort(), Object.keys(allLocales).filter(code => code !== 'base').sort());
      assert.deepEqual(values.filter((value, i) => values.indexOf(value) !== i), []);
      assert.deepEqual(fakerLocales.filter(locale => !locale.label.trim()), []);
   });

   // A code faker does not know is not an error anywhere: generation quietly falls back to
   // English, so a dead entry can only be caught here, by name.
   test('every offered code is a locale this faker build carries', () => {
      const offenders = fakerLocales
         .filter(locale => !(locale.value in allLocales))
         .map(locale => `${locale.value}: ${locale.label}`);

      assert.deepEqual(offenders, []);
   });

   test('the four codes that were dead on 6.1.2 are offered under the names faker knows', () => {
      const values = fakerLocales.map(locale => locale.value);

      for (const dead of ['cz', 'en_IND', 'ge', 'nep'])
         assert.ok(!values.includes(dead), `${dead} is not a faker locale`);

      for (const live of ['cs_CZ', 'en_IN', 'ka_GE', 'ne'])
         assert.ok(values.includes(live), `${live} is missing`);
   });
});

// The assertion is on the alphabet, never on the value: two random strings differ anyway,
// so `notEqual` would pass while the generator was answering in English all along.
describe('picking a locale', () => {
   test('changes the alphabet the generated value is written in', () => {
      // `ru` keeps Latin first names on this build; the city list is the Cyrillic one.
      assert.match(generateFakeValue({ group: 'location', method: 'city', locale: 'ru' }) as string, CYRILLIC);
      assert.doesNotMatch(generateFakeValue({ group: 'location', method: 'city', locale: 'en' }) as string, CYRILLIC);
      assert.match(generateFakeValue({ group: 'person', method: 'lastName', locale: 'ja' }) as string, JAPANESE);
   });

   test('no locale is passed means English, the way the single-cell fill calls it', () => {
      assert.doesNotMatch(generateFakeValue({ group: 'location', method: 'city' }) as string, CYRILLIC);
   });

   test('an unknown locale code falls back to English rather than throwing', () => {
      assert.equal(typeof generateFakeValue({ group: 'location', method: 'city', locale: 'nosuchlocale' }), 'string');
   });

   // Not every locale carries the data behind every method, and the insert handler generates
   // one value per column per row -- a single gap would fail the whole insert.
   test('every catalog entry produces a value in every offered locale', () => {
      const methods = FakerMethods._methods as { name: string; group: string }[];
      const offenders: string[] = [];

      for (const { value: locale } of fakerLocales) {
         for (const { group, name } of methods) {
            try {
               const generated = generateFakeValue({ group, method: name, locale });
               if (generated === undefined || generated === null || generated === '')
                  offenders.push(`${locale} ${group}.${name}: got ${String(generated)}`);
            }
            catch (err) {
               offenders.push(`${locale} ${group}.${name}: ${(err as Error).message}`);
            }
         }
      }

      assert.deepEqual(offenders, []);
   });
});
