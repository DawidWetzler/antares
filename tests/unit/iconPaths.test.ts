import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';

import { camelize } from '@/libs/camelize';
import { iconPaths } from '@/libs/iconPaths';

const srcDir = path.resolve(__dirname, '../../src');
// The map cannot vouch for itself: its own identifiers are the thing under test.
const mapFile = path.join(srcDir, 'renderer/libs/iconPaths.ts');
const connectionIconsFile = path.join(srcDir, 'renderer/components/ModalConnectionAppearance.vue');

const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
   .flatMap(entry => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
   });

// Every name BaseIcon can be asked for: the identifiers written across the sources, plus
// the connection icon codes the four `camelize` call sites turn into identifiers at runtime.
const requestedIcons = (): string[] => {
   const names = new Set<string>();

   for (const file of walk(srcDir)) {
      if (file === mapFile) continue;

      for (const [name] of fs.readFileSync(file, 'utf-8').matchAll(/\bmdi[A-Z][A-Za-z0-9]*/g))
         names.add(name);
   }

   for (const [, code] of fs.readFileSync(connectionIconsFile, 'utf-8').matchAll(/code: '(mdi-[a-z0-9-]+)'/g))
      names.add(camelize(code));

   return [...names].sort();
};

describe('icon paths', () => {
   test('every icon name the app can request resolves to a path', () => {
      const unresolved = requestedIcons().filter(name => !iconPaths[name]);

      assert.deepEqual(unresolved, []);
   });

   test('an unknown icon name resolves to undefined', () => {
      assert.equal(iconPaths.mdiNotAnIcon, undefined);
   });
});
