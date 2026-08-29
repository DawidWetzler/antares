import { Marked } from 'marked';

// marked has had no sanitizer since v5, so `html: () => ''` is the whole defence.
// Own `Marked` instance, because `marked.use()` mutates the shared singleton.
const marked = new Marked({
   renderer: {
      html: () => '',
      link ({ href, title, tokens }) {
         // Both arrive verbatim: `[x](<...>)` accepts quotes in the href, and marked 15 moved
         // title escaping out of the tokenizer into the renderer we are replacing here.
         const text = this.parser.parseInline(tokens);
         return `<a class="changelog-link" href="${href.replace(/"/g, '&quot;')}" title="${String(title || '').replace(/"/g, '&quot;')}" target="_blank">${text}</a>`;
      },
      listitem ({ tokens }) {
         return `<li>${this.parser.parse(tokens).replace(/ *\([^)]*\) */g, '')}</li>`;
      }
   }
});

export function parseMarkdown (markdown: string): string {
   return marked.parse(markdown) as string;
}
