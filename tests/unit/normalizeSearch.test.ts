import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { localesNames } from '@/i18n/supported-locales';
import { normalizeSearch } from '@/libs/normalizeSearch';

// What BaseSelect does with the two normalized strings, so the cases below read as the
// question a user asks: does typing this find that option?
const matches = (label: string, typed: string): boolean => normalizeSearch(label).includes(normalizeSearch(typed));

describe('normalizeSearch', () => {
   test('a term typed without accents finds a label that carries them', () => {
      assert.ok(matches('Catppuccin Frappé', 'frappe'));
      assert.ok(matches('Français', 'francais'));
      assert.ok(matches('Čeština', 'cestina'));
      assert.ok(matches('Tiếng Việt', 'tieng viet'));
   });

   test('typing the accent, the exact label or a different case still finds it', () => {
      assert.ok(matches('Catppuccin Frappé', 'Frappé'));
      assert.ok(matches('Catppuccin Frappé', 'CATPPUCCIN FRAPPÉ'));
      assert.ok(matches('Catppuccin Frappé', '  frappé  '));
   });

   test('a term the label does not contain still finds nothing', () => {
      assert.equal(matches('Catppuccin Frappé', 'mocha'), false);
      assert.equal(matches('Catppuccin Frappé', 'frappex'), false);
   });

   test('every locale name stays findable by typing itself', () => {
      for (const name of Object.values(localesNames))
         assert.ok(matches(name, name), `${name} no longer matches itself`);
   });
});
