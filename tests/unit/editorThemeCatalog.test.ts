import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';

const settingsFile = path.resolve(__dirname, '../../src/renderer/components/ModalSettings.vue');
const localThemeFile = path.resolve(__dirname, '../../src/renderer/libs/theme-catppuccin.js');
const referenceThemeFile = require.resolve('ace-builds/src-noconflict/theme-twilight.js');

// Only the `editorThemes` computed: the same file also lists copy-type codes, which are not
// ace themes and would otherwise be dragged in by the pattern below.
const editorThemesBlock = (): string => {
   const source = fs.readFileSync(settingsFile, 'utf-8');
   const start = source.indexOf('const editorThemes = computed(');

   return source.slice(start, source.indexOf('\n]);', start));
};

const codesIn = (block: string): string[] => [...block.matchAll(/code: '([a-z0-9_]+)'/g)]
   .map(([, code]) => code)
   // `auto` is the sentinel meaning "follow the application theme", resolved before it
   // ever reaches ace, so ace ships no file for it.
   .filter(code => code !== 'auto');

// The light/dark split is hand-maintained in the template, so the groups are read back the
// same way: whatever sits between one group label and the next belongs to that group.
const offeredThemesByGroup = (): { light: string[]; dark: string[] } => {
   const block = editorThemesBlock();
   const light = block.indexOf('group: t(\'application.light\')');
   const dark = block.indexOf('group: t(\'application.dark\')');

   assert.ok(light > -1 && dark > light, 'the light and dark groups are no longer where this scrape looks for them');

   return {
      light: codesIn(block.slice(light, dark)),
      dark: codesIn(block.slice(dark))
   };
};

const offeredThemes = (): string[] => {
   const { light, dark } = offeredThemesByGroup();

   return [...light, ...dark];
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

interface AceTheme {
   isDark: boolean;
   cssClass: string;
   cssText: string;
}

// The local file is a plain ace module: it registers itself on the `ace` global that
// ace-builds installs in the renderer. Handing it a stub `define` and loading it once yields
// the real `cssText` and `isDark` of every flavour, instead of a regex guess at them.
let registered: Record<string, AceTheme> = null;

const localThemes = (): Record<string, AceTheme> => {
   if (registered) return registered;

   registered = {};
   (globalThis as unknown as { ace: unknown }).ace = {
      define: (name: string, deps: string[], factory: (require: (id: string) => unknown, exports: AceTheme) => void) => {
         const theme = {} as AceTheme;

         factory(() => ({ importCssString: () => undefined }), theme);
         registered[name] = theme;
      }
   };
   require(localThemeFile);

   return registered;
};

const isDefinedLocally = (code: string): boolean => `ace/theme/${code}` in localThemes();

// `cssText` of a shipped ace theme, without loading the module: requiring it calls
// `dom.importCssString`, which needs a document this layer does not have.
const shippedCssText = (file: string): string => JSON.parse(`"${/module\.exports = "([\s\S]*?)";\n/.exec(fs.readFileSync(file, 'utf-8'))[1]}"`);

const selectorsIn = (cssText: string, cssClass: string): Set<string> => {
   const parts = [...cssText.matchAll(/([^{}]+)\{[^{}]*\}/g)]
      .flatMap(([, selector]) => selector.split(','))
      .map(selector => selector.trim())
      .filter(Boolean);

   // Drop the theme's own class so two themes can be compared: what is left is the role the
   // rule styles. The whole-editor rule normalises to the empty string, kept as a marker.
   return new Set(parts.map(selector => selector.split(new RegExp(`\\.${cssClass}\\b`)).join('').trim() || ':editor'));
};

// catppuccin/palette v1.8.0. Repeated here on purpose: a guard that imports the values it
// guards cannot catch an off-palette colour.
const palettes: Record<string, string[]> = {
   'ace/theme/catppuccin_latte': ['#dc8a78', '#dd7878', '#ea76cb', '#8839ef', '#d20f39', '#e64553', '#fe640b', '#df8e1d', '#40a02b', '#179299', '#04a5e5', '#209fb5', '#1e66f5', '#7287fd', '#4c4f69', '#5c5f77', '#6c6f85', '#7c7f93', '#8c8fa1', '#9ca0b0', '#acb0be', '#bcc0cc', '#ccd0da', '#eff1f5', '#e6e9ef', '#dce0e8'],
   'ace/theme/catppuccin_mocha': ['#f5e0dc', '#f2cdcd', '#f5c2e7', '#cba6f7', '#f38ba8', '#eba0ac', '#fab387', '#f9e2af', '#a6e3a1', '#94e2d5', '#89dceb', '#74c7ec', '#89b4fa', '#b4befe', '#cdd6f4', '#bac2de', '#a6adc8', '#9399b2', '#7f849c', '#6c7086', '#585b70', '#45475a', '#313244', '#1e1e2e', '#181825', '#11111b']
};

const catppuccinFlavours: Record<string, 'light' | 'dark'> = {
   catppuccin_latte: 'light',
   catppuccin_mocha: 'dark'
};

describe('editor theme catalog', () => {
   test('every theme the settings modal offers is one ace ships or one this repo defines', () => {
      const missing = offeredThemes().filter(code => !isShippedByAce(code) && !isDefinedLocally(code));

      assert.deepEqual(missing, []);
   });

   test('the settings modal offers themes at all', () => {
      assert.ok(offeredThemes().length > 30, 'the block scrape found nothing, so the check above is vacuous');
   });

   test('a theme name neither ace nor this repo defines is not silently accepted', () => {
      assert.equal(isShippedByAce('not_a_real_theme'), false);
      assert.equal(isDefinedLocally('not_a_real_theme'), false);
   });
});

describe('catppuccin editor themes', () => {
   test('both flavours are offered in the picker, in the group that matches their brightness', () => {
      const { light, dark } = offeredThemesByGroup();

      for (const [code, group] of Object.entries(catppuccinFlavours)) {
         assert.ok(light.includes(code) || dark.includes(code), `${code} is not offered in the settings modal`);
         assert.equal(light.includes(code) ? 'light' : 'dark', group, `${code} sits in the wrong brightness group`);
      }
   });

   test('every offered flavour is defined by the local theme file', () => {
      for (const code of Object.keys(catppuccinFlavours))
         assert.ok(isDefinedLocally(code), `the local theme file defines no ace/theme/${code}`);
   });

   test('isDark agrees with the group the flavour is offered in', () => {
      const themes = localThemes();

      for (const [code, group] of Object.entries(catppuccinFlavours))
         assert.equal(themes[`ace/theme/${code}`].isDark, group === 'dark', `ace/theme/${code} reports the wrong isDark`);
   });

   test('each flavour styles every role a shipped ace theme styles', () => {
      const reference = selectorsIn(shippedCssText(referenceThemeFile), 'ace-twilight');
      const themes = localThemes();

      assert.ok(reference.size > 30, `only ${reference.size} reference selectors were scraped, so the check below is vacuous`);

      for (const code of Object.keys(catppuccinFlavours)) {
         const theme = themes[`ace/theme/${code}`];
         const covered = selectorsIn(theme.cssText, theme.cssClass);
         const holes = [...reference].filter(selector => !covered.has(selector)).sort();

         assert.deepEqual(holes, [], `ace/theme/${code} leaves these roles unstyled`);
      }
   });

   test('no colour outside the flavour palette leaks into the css', () => {
      const themes = localThemes();

      for (const [name, palette] of Object.entries(palettes)) {
         const { cssText } = themes[name];
         const strays = [...cssText.matchAll(/#[0-9a-f]{3,8}\b/gi)]
            .map(([hex]) => hex.toLowerCase())
            .filter(hex => !palette.includes(hex));

         assert.deepEqual([...new Set(strays)], [], `${name} uses colours that are not in its palette`);
         // Only then is the hex scan above a complete account of the colours used.
         assert.equal(/\b(rgb|rgba|hsl|hsla)\(/.test(cssText), false, `${name} states a colour outside the palette notation`);
      }
   });
});
