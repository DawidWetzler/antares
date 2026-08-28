import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { MenuItemSpec } from 'common/interfaces/menu';

import { contextMenuTemplate } from '../../src/main/libs/misc/contextMenuTemplate';

const noop = () => undefined;

describe('contextMenuTemplate', () => {
   test('every allowed role passes through', () => {
      const items: MenuItemSpec[] = [
         { role: 'cut' },
         { role: 'copy' },
         { role: 'paste' },
         { role: 'selectAll' }
      ];

      assert.deepEqual(
         contextMenuTemplate(items, noop).map(i => i.role),
         ['cut', 'copy', 'paste', 'selectAll']
      );
   });

   test('an item with a role outside the allowlist is dropped', () => {
      const items = [
         { role: 'quit' },
         { role: 'toggleDevTools' },
         { role: 'copy' }
      ] as MenuItemSpec[];

      assert.deepEqual(contextMenuTemplate(items, noop).map(i => i.role), ['copy']);
   });

   test('a separator passes through', () => {
      assert.deepEqual(
         contextMenuTemplate([{ type: 'separator' }], noop),
         [{ type: 'separator' }]
      );
   });

   test('labels survive', () => {
      assert.equal(contextMenuTemplate([{ id: 'run', label: 'Run query' }], noop)[0].label, 'Run query');
      assert.equal(contextMenuTemplate([{ role: 'copy', label: 'Copy cell' }], noop)[0].label, 'Copy cell');
   });

   test('clicking an item calls back with its id', () => {
      const clicked: string[] = [];
      const template = contextMenuTemplate([{ id: 'run', label: 'Run query' }], id => clicked.push(id));

      template[0].click(null, null, null);

      assert.deepEqual(clicked, ['run']);
   });

   test('an item without an id has no click handler', () => {
      const template = contextMenuTemplate([{ role: 'copy' }, { type: 'separator' }], noop);

      assert.equal(template[0].click, undefined);
      assert.equal(template[1].click, undefined);
   });

   test('an empty list yields an empty template', () => {
      assert.deepEqual(contextMenuTemplate([], noop), []);
   });
});
