import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';

const handlersDir = path.resolve(__dirname, '../../src/main/ipc-handlers');
const registration = /ipcMain\.(handle|on)\(\s*'([^']+)'/g;

// The guard has to be the first statement, before the handler acts on anything the caller sent.
const GUARD_WINDOW = 3;

const unguardedChannels = (): string[] => {
   const found: string[] = [];

   for (const file of fs.readdirSync(handlersDir).filter(f => f.endsWith('.ts'))) {
      const lines = fs.readFileSync(path.join(handlersDir, file), 'utf-8').split('\n');

      lines.forEach((line, i) => {
         for (const [, , channel] of line.matchAll(registration)) {
            const window = lines.slice(i, i + GUARD_WINDOW + 1).join('\n');
            if (!window.includes('validateSender(event.senderFrame)'))
               found.push(`${file}:${i + 1} ${channel}`);
         }
      });
   }

   return found;
};

describe('IPC handler guards', () => {
   test('every ipcMain channel rejects an untrusted sender', () => {
      assert.deepEqual(unguardedChannels(), []);
   });
});
