import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';

const settingsFile = path.resolve(__dirname, '../../src/renderer/components/ModalSettings.vue');

// Only the `editorThemes` computed: the same file also lists copy-type codes, which are not
// ace themes and would otherwise be dragged in by the pattern below.
const offeredThemes = (): string[] => {
   const source = fs.readFileSync(settingsFile, 'utf-8');
   const start = source.indexOf('const editorThemes = computed(');
   const block = source.slice(start, source.indexOf('\n]);', start));

   return [...block.matchAll(/code: '([a-z0-9_]+)'/g)]
      .map(([, code]) => code)
      // `auto` is the sentinel meaning "follow the application theme", resolved before it
      // ever reaches ace, so ace ships no file for it.
      .filter(code => code !== 'auto');
};

const isShippedByAce = (code: string): boolean => {
   try {
      require.resolve(`ace-builds/src-noconflict/theme-${code}.js`);
      return true;
   }
   catch {
      return false;
   }
};

describe('editor theme catalog', () => {
   test('every theme the settings modal offers is one ace ships', () => {
      const missing = offeredThemes().filter(code => !isShippedByAce(code));

      assert.deepEqual(missing, []);
   });

   test('the settings modal offers themes at all', () => {
      assert.ok(offeredThemes().length > 30, 'the block scrape found nothing, so the check above is vacuous');
   });

   test('a theme name ace does not ship is not silently accepted', () => {
      assert.equal(isShippedByAce('not_a_real_theme'), false);
   });
});
