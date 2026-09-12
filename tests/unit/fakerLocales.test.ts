import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { fakerCustom, fakerLocales } from 'common/libs/fakerCustom';

const fc = fakerCustom as unknown as Record<string, unknown> & {
   locales: Record<string, unknown>;
   seed: (value: number) => void;
};

const CYRILLIC = /\p{Script=Cyrillic}/u;
const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** Exactly what `insert-table-fake-rows` does before generating (tables.ts:392). */
const generateWith = (locale: string, group: string, method: string): string => {
   (fc as Record<string, unknown>).locale = locale;
   fc.seed(2026);
   return (fc[group] as Record<string, () => string>)[method]();
};

describe('the locale dropdown', () => {
   test('offers the 45 languages it has always offered, each one once', () => {
      const values = fakerLocales.map(locale => locale.value);

      assert.equal(values.length, 45);
      assert.deepEqual(values.filter((value, i) => values.indexOf(value) !== i), []);
      assert.deepEqual(fakerLocales.filter(locale => !locale.label.trim()), []);
   });

   // A code faker does not know is not an error anywhere: generation quietly falls back to
   // English, so a dead entry can only be caught here, by name.
   test('every offered code is a locale this faker build carries', {
      todo: 'Nepalese is offered as `nep`, and this faker build calls it `ne`'
   }, () => {
      const offenders = fakerLocales
         .filter(locale => !(locale.value in fc.locales))
         .map(locale => `${locale.value}: ${locale.label}`);

      assert.deepEqual(offenders, []);
   });
});

// The assertion is on the alphabet, never on the value: two random strings differ anyway,
// so `notEqual` would pass while the generator was answering in English all along.
describe('picking a locale', () => {
   test('changes the alphabet the generated value is written in', {
      todo: 'fakerCustom spreads faker, so assigning .locale writes a property nothing reads'
   }, () => {
      // `ru` keeps Latin first names on this build; the city list is the Cyrillic one.
      assert.match(generateWith('ru', 'address', 'city'), CYRILLIC);
      assert.doesNotMatch(generateWith('en', 'address', 'city'), CYRILLIC);
      assert.match(generateWith('ja', 'name', 'lastName'), JAPANESE);
   });
});
