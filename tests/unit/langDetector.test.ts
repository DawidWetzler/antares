import * as assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { langDetector } from 'common/libs/langDetector';

// The unit runner is `electron --test` with ELECTRON_RUN_AS_NODE, which has no DOM, so the
// isHTML/isSVG/isXML predicates have nothing to call. This stand-in implements only what
// they touch — the element children of `body`, and a `parsererror` node — which is enough
// to exercise the order the detector tries them in, and nothing more. It is not a parser:
// these tests pin the dispatch, not the real HTML/XML/SVG recognition.
const wellFormed = (str: string) => {
   const markup = str.trim().replace(/^<\?[\s\S]*?\?>/, '').trim();
   if (!markup.startsWith('<')) return false;

   const tag = /<\/?([a-z][\w:.-]*)[^>]*?(\/?)>/gi;
   const open: string[] = [];
   let match = tag.exec(markup);
   while (match) {
      if (match[0].startsWith('</')) {
         if (open.pop() !== match[1]) return false;
      }
      else if (!match[2]) open.push(match[1]);
      match = tag.exec(markup);
   }
   return !open.length;
};

class FakeDOMParser {
   parseFromString (str: string, type: string) {
      if (type === 'text/html') {
         return {
            body: { childNodes: [{ nodeType: /<[a-z][^>]*>/i.test(str) ? 1 : 3 }] },
            querySelector: () => null as unknown
         };
      }

      const error = wellFormed(str) ? null : { nodeName: 'parsererror' };
      return {
         body: { childNodes: [] as { nodeType: number }[] },
         querySelector: (selector: string) => selector === 'parsererror' ? error : null
      };
   }
}

const global = globalThis as unknown as Record<string, unknown>;
const original = global.DOMParser;

before(() => {
   global.DOMParser = FakeDOMParser;
});

after(() => {
   global.DOMParser = original;
});

describe('langDetector - no content', () => {
   test('an empty string is text', () => {
      assert.equal(langDetector(''), 'text');
   });

   test('whitespace only is text', () => {
      assert.equal(langDetector('  \n\t '), 'text');
   });
});

describe('langDetector - dispatch order', () => {
   test('an object is json', () => {
      assert.equal(langDetector('{"a": 1}'), 'json');
   });

   test('an array is json', () => {
      assert.equal(langDetector('[1, 2, 3]'), 'json');
   });

   test('json wins over the markdown characters it contains', () => {
      assert.equal(langDetector('{"note": "# heading with **bold**"}'), 'json');
   });

   test('a bare tag is html', () => {
      assert.equal(langDetector('<div>hello</div>'), 'html');
   });

   test('svg wins over xml', () => {
      assert.equal(langDetector('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="1"/></svg>'), 'svg');
   });

   test('well formed markup that is neither html nor svg is xml', () => {
      assert.equal(langDetector('<?xml version="1.0"?><note><to>Tove</to></note>'), 'xml');
   });

   test('markdown is only reached once the markup predicates decline', () => {
      assert.equal(langDetector('# heading\n\n- item'), 'markdown');
   });
});

describe('langDetector - fallback', () => {
   test('prose that matches nothing is text', () => {
      assert.equal(langDetector('just a plain sentence'), 'text');
   });
});
