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

   test('a fresh install follows the application theme', async () => {
      const store = await loadStore();
      assert.equal(store.editorTheme, 'auto');
   });

   test('auto maps the resolved dark theme to twilight and light to sqlserver', async () => {
      setSystemPrefersDark(true);
      const store = await loadStore({ editor_theme: 'auto', application_theme: 'system' });
      assert.equal(store.resolvedEditorTheme, 'twilight');

      setSystemPrefersDark(false);
      assert.equal(store.resolvedEditorTheme, 'sqlserver');
   });

   test('auto follows a system theme flipping mid-session, in both directions', async () => {
      const store = await loadStore({ editor_theme: 'auto', application_theme: 'system' });
      assert.equal(store.resolvedEditorTheme, 'sqlserver');

      setSystemPrefersDark(true);
      assert.equal(store.resolvedEditorTheme, 'twilight');

      setSystemPrefersDark(false);
      assert.equal(store.resolvedEditorTheme, 'sqlserver');
   });

   test('auto follows an explicit application theme, not the system one', async () => {
      const store = await loadStore({ editor_theme: 'auto', application_theme: 'dark' });
      assert.equal(store.resolvedEditorTheme, 'twilight', 'a light system must not lighten a dark app');

      setSystemPrefersDark(true);
      assert.equal(store.resolvedEditorTheme, 'twilight');
   });

   test('an explicitly chosen theme ignores the application theme and the system', async () => {
      const store = await loadStore({ editor_theme: 'monokai', application_theme: 'system' });
      assert.equal(store.resolvedEditorTheme, 'monokai');

      setSystemPrefersDark(true);
      assert.equal(store.resolvedEditorTheme, 'monokai');
   });

   test('an existing light choice survives a dark application theme', async () => {
      const store = await loadStore({ editor_theme: 'sqlserver', application_theme: 'dark' });
      assert.equal(store.resolvedEditorTheme, 'sqlserver');
   });

   test('an unknown stored theme name is passed through untouched', async () => {
      const store = await loadStore({ editor_theme: 'not-a-real-theme', application_theme: 'system' });
      assert.equal(store.resolvedEditorTheme, 'not-a-real-theme');
   });

   test('choosing auto is persisted like any other theme', async () => {
      const store = await loadStore({ editor_theme: 'monokai' });
      store.changeEditorTheme('auto');

      assert.equal(store.editorTheme, 'auto');
      assert.equal(settings.get('editor_theme'), 'auto');
   });
});
