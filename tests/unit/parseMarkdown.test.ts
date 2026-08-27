import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseMarkdown } from 'common/libs/parseMarkdown';

describe('parseMarkdown - rendering', () => {
   test('headings, emphasis and lists', () => {
      const html = parseMarkdown('## Fixes\n\n- **bold** item\n- second\n');
      assert.match(html, /<h2>Fixes<\/h2>/);
      assert.match(html, /<strong>bold<\/strong>/);
      assert.match(html, /<ul>[\s\S]*<li>.*second<\/li>[\s\S]*<\/ul>/);
   });

   test('links keep the class the changelog binds its click handler to', () => {
      const html = parseMarkdown('[antares](https://example.com)');
      assert.match(html, /<a class="changelog-link" href="https:\/\/example\.com" title="" target="_blank">antares<\/a>/);
   });

   test('a list item drops its parenthesised trailer', () => {
      assert.match(parseMarkdown('- fixed a thing (#1234)\n'), /<li>fixed a thing<\/li>/);
   });

   test('empty input renders nothing', () => {
      assert.equal(parseMarkdown(''), '');
   });
});

describe('parseMarkdown - raw markup is not passed through', () => {
   test('a raw HTML block is dropped', () => {
      const html = parseMarkdown('# Title\n\n<div onclick="window.pwned = 1">click me</div>\n');
      assert.match(html, /<h1>Title<\/h1>/);
      assert.doesNotMatch(html, /<div|onclick/);
   });

   test('raw inline HTML is dropped, the surrounding text is kept', () => {
      const html = parseMarkdown('before <img src=x onerror=alert(1)> after');
      assert.doesNotMatch(html, /<img|onerror/);
      assert.match(html, /before\s+after/);
   });

   test('a standalone script vector renders as nothing at all', () => {
      assert.equal(parseMarkdown('<img src=x onerror=alert(1)>'), '');
   });

   test('an svg payload is dropped', () => {
      assert.doesNotMatch(parseMarkdown('<svg onload=alert(1)></svg>'), /<svg|onload/);
   });

   test('a link href cannot break out of its attribute', () => {
      // `<...>` is the pointy-bracket href form, which marked hands over verbatim —
      // quotes and all. Unescaped, this closes href="" and opens an event handler.
      const html = parseMarkdown('[x](<" onmouseover=alert(1) x=">)');
      // a bare `"` in front of the handler name is what a successful breakout looks like
      assert.doesNotMatch(html, /"\s*onmouseover/);
      assert.match(html, /href="&quot; onmouseover=alert\(1\) x=&quot;"/);
   });

   test('a quoted href cannot break out of its attribute', () => {
      assert.doesNotMatch(parseMarkdown('[x]("onmouseover=alert(1)")'), /"\s*onmouseover/);
   });

   test('a link title stays single-escaped', () => {
      // marked escapes the title itself; escaping it again would show `&amp;quot;` to the user.
      assert.match(
         parseMarkdown('[x](https://a.com "say \\"hi\\"")'),
         /title="say &quot;hi&quot;"/
      );
   });

   test('a javascript: link is not rendered as a link',
      { todo: 'the link renderer does not filter schemes; open-external validation is phase 1.3' },
      () => {
         assert.doesNotMatch(parseMarkdown('[x](javascript:alert(1))'), /javascript:/);
      });
});
