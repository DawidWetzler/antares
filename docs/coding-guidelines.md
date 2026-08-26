# Antares SQL — Coding Guidelines

Lean reference for writing code in this repo. Lint config is the source of truth for
formatting (`.eslintrc`, `.stylelintrc`); this doc covers what lint cannot check.

## Stack

Electron + Vue 3 (`<script setup>`, Composition API) + TypeScript + Pinia + Spectre.css/SCSS.
Bundled by webpack (main / renderer / workers configs), packaged by electron-builder.

## Project layout

| Path | Contains |
|---|---|
| `src/common/` | Code shared by main and renderer: `interfaces/`, `libs/` (pure helpers), `data-types/`, `customizations/` |
| `src/main/` | Electron main process: `ipc-handlers/`, `libs/clients/`, `libs/exporters/`, `libs/importers/`, `libs/parsers/`, `workers/` |
| `src/renderer/` | Vue app: `components/`, `stores/`, `composables/`, `ipc-api/`, `i18n/`, `scss/` |

Rules:
- A helper used by both processes lives in `src/common/libs/` — never duplicated.
- **Everything above the client class level must be client-agnostic.** DB-specific behaviour
  belongs in `src/main/libs/clients/<X>Client.ts` or in `src/common/customizations/<x>.ts`.
- Feature gating per client goes through `customizations` (merged over `defaults.ts`), not `if (client === 'mysql')`.

## Formatting (enforced)

- **3-space indent**, single quotes, semicolons, Stroustrup braces, LF endings.
- `curly: multi-or-nest` — no braces around a single statement:
  ```ts
  if (status === 'success')
     closeModal();
  else
     addNotification({ status: 'error', message: response });
  ```
- Imports sorted by `simple-import-sort` — run `npm run lint:fix`, don't hand-order.
- Path aliases: `@/*` → `src/renderer/*`, `common/*` → `src/common/*`. Use them instead of `../../..`.
- Template literals for string composition.
- Max 2 attributes per line on single-line tags, 1 per line when multiline; 3-space HTML indent.

## TypeScript

- `noImplicitAny` is on. Type public function params, returns and store state.
- Shared shapes go in `src/common/interfaces/`; component-local types stay in the component.
- Interface members end with `;` (multiline, required last).
- Use the union types (`ClientCode`, `Client`, `IpcResponse<T>`) rather than re-declaring strings.
- `any` needs an inline eslint-disable — treat it as a last resort.

## IPC

Every cross-process call goes through **three** layers, none skipped:

1. `src/renderer/ipc-api/<Domain>.ts` — a class of `static` methods, params wrapped in
   `unproxify()`, returns `Promise<IpcResponse<T>>`.
2. `src/main/ipc-handlers/<domain>.ts` — `ipcMain.handle('kebab-case-name', ...)`, registered
   from the default-exported factory taking `connections`.
3. The client class does the actual DB work.

Handler contract, no exceptions:

```ts
ipcMain.handle('update-schema', async (event, params) => {
   if (!validateSender(event.senderFrame)) return { status: 'error', response: 'Unauthorized process' };

   try {
      await connections[params.uid].alterSchema(params);
      return { status: 'success' };
   }
   catch (err) {
      return { status: 'error', response: err.toString() };
   }
});
```

- Event names are **kebab-case**, verb-first (`get-structure`, `delete-schema`).
- Never `throw` out of a handler — return `{ status: 'error', response }`.
- Long-running work (import/export) runs in `src/main/workers/` via `worker_threads`.

## Vue components

- File and usage: **PascalCase** (`<ModalEditSchema />`). Props/events in templates: **kebab-case**.
- Prefixes: `Base*` for generic reusable components, `The*` for single-instance ones.
  Tightly-coupled children keep the parent name as prefix (`WorkspaceTabQuery*`).
- Always `<script setup lang="ts">`. Order inside it:
  imports → `useI18n` → `defineProps`/`defineEmits` → stores → refs → computed →
  functions → init IIFE → lifecycle hooks.
- Emit instead of mutating props: `const closeModal = () => emit('close');`
- Every `addEventListener` gets its `removeEventListener` in `onBeforeUnmount`.
- Modals: `<Teleport to="#window-content">` + `useFocusTrap()`.
- `<style scoped lang="scss">` — scoped unless the styles are deliberately global.

## State (Pinia)

- One store per domain in `src/renderer/stores/`, options API style
  (`defineStore('name', { state, getters, actions })`).
- Persisted settings use `electron-store`: write to `this.x` **and** `persistentStore.set(...)`
  in the same action.
- Components read via `storeToRefs()` for reactive values, destructure actions directly.

## Errors and user feedback

Renderer pattern for any IPC call:

```ts
try {
   const { status, response } = await Schema.updateSchema(payload);
   if (status === 'success') /* ... */;
   else addNotification({ status: 'error', message: response });
}
catch (err) {
   addNotification({ status: 'error', message: err.stack });
}
```

Never surface a raw error by `console.log` alone — use `useNotificationsStore()`.

## i18n

- No hardcoded user-facing strings. Use `const { t } = useI18n()` and `t('database.editSchema')`.
- New keys go into `src/renderer/i18n/en-US.ts` in the right section (`general`, `database`,
  `application`, …). Other locales are updated by translators; check with
  `npm run translation:check <locale>`.

## Dependencies

Avoid new dependencies. Prefer stdlib, an existing dep, or a small helper in
`src/common/libs/`. A new runtime dep needs a reason that a few lines of code cannot cover.

Installs are constrained by `.npmrc`: exact versions, a 7-day minimum release age,
strict `engines`, and an `allowScripts` allowlist that blocks unreviewed install
scripts. If `npm i` fails with `ESTRICTALLOWSCRIPTS`, review the script before
approving it — see [Dependency policy](../CONTRIBUTING.md#dependency-policy).

## Commits

Conventional Commits, single-scoped — `feat(MySQL): ...`, `fix: ...`, `refactor: ...`.
Allowed types: feat, fix, docs, chore, style, refactor, build, ci, test, revert, perf.
Subject is lower/sentence case (never Upper-, Pascal- or Start-case). `standard-version`
generates the changelog from these.

## Before opening a PR

```console
npm run lint        # eslint + stylelint
npm run test:e2e    # playwright, when UI behaviour changed
```
