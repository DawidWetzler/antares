import * as assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';

import { createPinia, setActivePinia } from 'pinia';

import { settings } from '../support/electron-stubs';

// The store reads `prefers-color-scheme` at module load and subscribes to it, so the stub has
// to exist before the first import of it — hence the dynamic import in `loadStore` below.
const schemeListeners: ((e: { matches: boolean }) => void)[] = [];
let systemPrefersDark = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window = {
   matchMedia: () => ({
      get matches () {
         return systemPrefersDark;
      },
      addEventListener: (_: string, listener: (e: { matches: boolean }) => void) => schemeListeners.push(listener)
   })
};

const setSystemPrefersDark = (value: boolean): void => {
   systemPrefersDark = value;
   schemeListeners.forEach(listener => listener({ matches: value }));
};

type SettingsStore = ReturnType<typeof import('@/stores/settings')['useSettingsStore']>;

const loadStore = async (stored: Record<string, unknown> = {}): Promise<SettingsStore> => {
   settings.clear();
   for (const [key, value] of Object.entries(stored))
      settings.set(key, value);

   setActivePinia(createPinia());
   const { useSettingsStore } = await import('@/stores/settings');
   return useSettingsStore();
};

describe('editor theme resolution', () => {
   // Registers the store's `prefers-color-scheme` listener, so a test can flip the scheme
   // before it builds its own store instance.
   before(async () => {
      await import('@/stores/settings');
   });

   beforeEach(() => {
      setSystemPrefersDark(false);
   });

   test('a fresh install reads sqlserver on a light application theme and twilight on a dark one', async () => {
      const light = await loadStore({ application_theme: 'light' });
      assert.equal(light.resolvedEditorTheme, 'sqlserver');

      const dark = await loadStore({ application_theme: 'dark' });
      assert.equal(dark.resolvedEditorTheme, 'twilight');
   });

   test('a choice made on a dark application theme leaves the light one alone', async () => {
      const store = await loadStore({ application_theme: 'dark' });
      store.changeEditorTheme('catppuccin_mocha');

      assert.equal(store.resolvedEditorTheme, 'catppuccin_mocha');
      assert.equal(settings.get('editor_theme_dark'), 'catppuccin_mocha');

      store.applicationTheme = 'light';
      assert.equal(store.resolvedEditorTheme, 'sqlserver', 'the dark choice must not follow into the light theme');
   });

   test('a choice made on a light application theme leaves the dark one alone', async () => {
      const store = await loadStore({ application_theme: 'light' });
      store.changeEditorTheme('dracula');

      assert.equal(store.resolvedEditorTheme, 'dracula');
      assert.equal(settings.get('editor_theme_light'), 'dracula');

      store.applicationTheme = 'dark';
      assert.equal(store.resolvedEditorTheme, 'twilight', 'the light choice must not follow into the dark theme');
   });

   test('going back to system picks the choice that belongs to the current colour scheme', async () => {
      const store = await loadStore({ editor_theme_light: 'dracula', editor_theme_dark: 'catppuccin_mocha' });

      store.applicationTheme = 'system';
      assert.equal(store.resolvedEditorTheme, 'dracula');

      setSystemPrefersDark(true);
      assert.equal(store.resolvedEditorTheme, 'catppuccin_mocha');

      setSystemPrefersDark(false);
      assert.equal(store.resolvedEditorTheme, 'dracula');
   });

   test('an explicit application theme ignores the system colour scheme', async () => {
      const store = await loadStore({ application_theme: 'dark', editor_theme_light: 'dracula', editor_theme_dark: 'catppuccin_mocha' });
      assert.equal(store.resolvedEditorTheme, 'catppuccin_mocha', 'a light system must not lighten a dark app');

      setSystemPrefersDark(true);
      assert.equal(store.resolvedEditorTheme, 'catppuccin_mocha');
   });

   test('a theme stored by an older version is kept on both colour schemes', async () => {
      const store = await loadStore({ editor_theme: 'monokai', application_theme: 'system' });
      assert.equal(store.resolvedEditorTheme, 'monokai');

      setSystemPrefersDark(true);
      assert.equal(store.resolvedEditorTheme, 'monokai');
   });

   test('the retired auto sentinel falls back to the per-scheme defaults', async () => {
      const store = await loadStore({ editor_theme: 'auto', application_theme: 'system' });
      assert.equal(store.resolvedEditorTheme, 'sqlserver');

      setSystemPrefersDark(true);
      assert.equal(store.resolvedEditorTheme, 'twilight');
   });

   test('a per-scheme choice wins over the theme stored by an older version', async () => {
      const store = await loadStore({ editor_theme: 'monokai', editor_theme_dark: 'catppuccin_mocha', application_theme: 'dark' });
      assert.equal(store.resolvedEditorTheme, 'catppuccin_mocha');

      store.applicationTheme = 'light';
      assert.equal(store.resolvedEditorTheme, 'monokai');
   });

   test('an unknown stored theme name is passed through untouched', async () => {
      const store = await loadStore({ editor_theme_light: 'not-a-real-theme' });
      assert.equal(store.resolvedEditorTheme, 'not-a-real-theme');
   });
});
