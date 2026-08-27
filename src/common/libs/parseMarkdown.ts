import { Marked } from 'marked';

// marked has had no sanitizer since v5, so `html: () => ''` is the whole defence.
// Own `Marked` instance, because `marked.use()` mutates the shared singleton.
const marked = new Marked({
   renderer: {
      html: () => '',
      link (href: string, title: string, text: string) {
         // `href` arrives verbatim and `[x](<...>)` accepts quotes, which would close the attribute.
         return `<a class="changelog-link" href="${href.replace(/"/g, '&quot;')}" title="${title || ''}" target="_blank">${text}</a>`;
      },
      listitem (text: string) {
         return `<li>${text.replace(/ *\([^)]*\) */g, '')}</li>`;
      }
   }
});

export function parseMarkdown (markdown: string): string {
   return marked.parse(markdown) as string;
}
