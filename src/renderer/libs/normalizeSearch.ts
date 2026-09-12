// Option labels are compared through this on both sides, so `frappe` finds `Frappé` and
// `francais` finds `Français`. Stripping combining marks only ever adds matches, and leaves
// scripts that carry no diacritics (CJK, Cyrillic, Hebrew) untouched.
export const normalizeSearch = (text: string) => text
   .normalize('NFD')
   .replace(/\p{Diacritic}/gu, '')
   .toLowerCase()
   .trim();
