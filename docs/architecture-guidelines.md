# Antares SQL — Architecture Guidelines

Reference for feature development. Read before touching structure; follow the conventions in `CONTRIBUTING.md` for style details.

## Stack

Electron 30 + Vue 3 + TypeScript, Pinia state, Spectre.css + SCSS, webpack (3 separate configs: main / renderer / workers), electron-builder for packaging, `standard-version` + Conventional Commits for releases.

## Process model

Three build targets, three roles:

| Target | Entry | Role |
|---|---|---|
| main | `src/main/main.ts` | Window lifecycle, IPC handlers, DB connections, settings |
| renderer | `src/renderer/index.ts` | Vue app, UI, Pinia stores |
| workers | `src/main/workers/*.ts` | Long-running export/import as `worker_threads` |

`nodeIntegration: true` / `contextIsolation: false` — the renderer has Node access by design and talks to main via `ipcRenderer.invoke` directly (no preload bridge). Because of this, **every `ipcMain.handle` must start with `validateSender(event.senderFrame)`**.

Never open a database connection from the renderer. All DB work goes through IPC to main.

## Source layout

```
src/common/     shared by main + renderer: interfaces, customizations, data-types, pure libs
src/main/       ipc-handlers/, libs/clients/, libs/exporters|importers|parsers, workers/
src/renderer/   components/, stores/, ipc-api/, composables/, i18n/, libs/, scss/
```

Path aliases: `common/*` → `src/common/*` (all three targets) and `@/*` → `src/renderer/*` (renderer only). They are declared twice — in `tsconfig.json` and in each webpack config — so a new alias must be added in both.

`common/` is for code with **no Electron/Node/Vue dependency** shared by both sides. Anything touching `ipcMain`/`ipcRenderer` belongs to main or renderer, not common.

## Adding a feature — the standard path

A feature that reaches the database crosses five layers. Add all five, in this order:

1. **Client method** — `src/main/libs/clients/<Client>.ts`, one method per capability, returns neutral (client-agnostic) shapes.
2. **IPC handler** — `src/main/ipc-handlers/<domain>.ts`, event name in **kebab-case**, wrapped in try/catch.
3. **Renderer API** — `src/renderer/ipc-api/<Domain>.ts`, a static method calling `ipcRenderer.invoke(...)`.
4. **Store / component** — Pinia store for shared state, component for local state.
5. **Customization flag** — `src/common/customizations/*` if the capability is not universal.

Register new handler modules in `src/main/ipc-handlers/index.ts`; new i18n keys go in `en-US.ts` first (`npm run translation:check` verifies the rest).

## Key design decisions

### Client abstraction
`BaseClient` is an abstract, chainable query builder (`.schema().select().from().where().run()`) plus a neutral API surface. Concrete clients: `MySQLClient`, `PostgreSQLClient`, `SQLiteClient`, `FirebirdSQLClient`. Instantiate only via `ClientsFactory.getClient()` — never `new XClient()` outside it (workers included).

**Everything above the client class level must be client-agnostic.** If a caller branches on `client === 'mysql'`, the branch belongs inside the client or in customizations instead.

Live connections live in a single `Record<uid, Client>` map created in `ipc-handlers/index.ts` and passed to each handler module. Handlers look up `connections[params.uid]`; they never hold their own.

### Customizations over feature flags
Per-client capability is data, not code. `common/customizations/defaults.ts` lists **every** option, all off; each client spreads defaults and turns on what it supports. New capability → add the key to `defaults.ts` (off) and enable per client. UI and handlers gate on `workspace.customizations.<flag>`; this is also how a feature ships for one client before the others.

### IPC contract
Every handler resolves `IpcResponse<T> = { status: 'success' | 'error' | 'abort'; response?: T }`. **Errors are returned, never thrown across IPC** — catch and return `{ status: 'error', response: err.toString() }`. Callers check `status` and push to the notifications store on error.

Renderer args must pass through `unproxify()` before `invoke` — Vue reactive proxies are not structured-cloneable.

### Workers
Export/import run in `worker_threads` (`webpack.workers.config.js` bundles them separately) so heavy streaming never blocks main. They communicate by `parentPort.postMessage({ type, payload })` and use their own `ClientsFactory` connection. Extend `BaseExporter` / `BaseImporter` (EventEmitters: `error`, `end`, progress) for a new format. Anything that can take more than a moment on a large dataset goes here, not in a handler.

### Persistence
`electron-store` only, one store per concern (`settings`, `shortcuts`, `connections`, …). Stores are read in both processes; the settings store is read in `main.ts` before window creation for theme. The `connections` store is created with an `encryptionKey` — a per-install key kept in `localStorage` and mirrored to disk through `get-key`/`set-key`, which the main process wraps with Electron `safeStorage`. Never persist plaintext credentials, and never widen that store's contents without checking it stays encrypted.

### State
Pinia option-store per domain (`workspaces`, `connections`, `settings`, `notifications`, `history`, `console`, `scratchpad`, `schemaExport`). `workspaces` is the hub: one workspace per connection, holding tabs, structure, breadcrumbs and the resolved `customizations`. Cross-store access is by calling `useXStore()` inside actions. Component-local state stays in the component; only what more than one component needs becomes a store.

### Renderer conventions
Vue 3 SFC with `<script setup lang="ts">` (89 of 90 components — do not add Options API). Naming: `Base*` for generic building blocks, `The*` for single-instance, `Workspace*`/`Modal*` prefixes for tightly-coupled groups; PascalCase files and tags, kebab-case props/events in templates. Shared logic goes in `composables/`, pure helpers in `renderer/libs/`. All user-facing strings via `vue-i18n` (`t('...')`), never hard-coded.

## Constraints

- **Avoid new dependencies.** Native DB drivers must be rebuilt (`electron-builder install-app-deps`) and grow every platform artifact. A few lines beat a package.
- Formatting is enforced: 3-space indent, single quotes, semicolons, Stroustrup braces, sorted imports (`simple-import-sort`). Run `npm run lint:fix`.
- Conventional Commits, single-scoped — the CHANGELOG and releases are generated from them.
- E2E only (`tests/`, Playwright, `npm run test:e2e`). There is no unit test layer; keep logic in testable pure functions in `common/libs/` where practical.
