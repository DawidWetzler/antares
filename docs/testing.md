# Antares SQL — Testing

Test-driven development is the default here: **write the failing test first, then the code
that makes it pass.** A test you have never seen fail proves nothing, so every test lands
together with evidence that it goes red when the behaviour it guards breaks.

## Layers

Pick the cheapest layer that can prove the behaviour. Do not re-prove a lower layer higher up.

| Layer | Runner | Covers | Lives in |
|---|---|---|---|
| **unit** | `node:test` (ts-node, no I/O) | Pure logic: SQL generation per dialect, `sqlUtils`, serializers (CSV/JSON/SQL/PHP), customizations, helpers | `tests/unit/*.test.ts` |
| **integration** | `node:test` against real databases | Client classes (`src/main/libs/clients/*`) talking to real SQLite / MySQL / PostgreSQL: connect, structure, table CRUD, pagination, queries, dump export/import | `tests/integration/*.test.ts` |
| **e2e** | Playwright driving Electron | Only what needs the running app: window lifecycle, settings/window persistence, Vue UI interactions, IPC wiring | `tests/e2e/*.spec.ts` |

Both `node:test` layers run **inside Electron's node** (`ELECTRON_RUN_AS_NODE=1 electron …`)
because `better-sqlite3` is compiled for Electron's ABI and will not load in the system node.

## Commands

```console
npm test                 # unit + integration
npm run test:unit
npm run test:integration # needs the test databases, see below
npm run test:node -- tests/unit/sqlUtils.test.ts   # single file
npm run test:e2e         # compile, then playwright
npm run test:e2e-dry     # playwright against the existing dist/
```

Test files must sit **flat** in their layer directory and match `*.test.ts` (`*.spec.ts` for
e2e) — the runner glob is single-level, subdirectories are not discovered.

## Test databases

```console
docker compose -f tests/docker-compose.yml up -d --wait
```

Non-default ports on purpose, so a local MySQL/Postgres is never touched:

| Client | Host | User / password | Database |
|---|---|---|---|
| MySQL (percona 8.0) | `127.0.0.1:53306` | `root` / `antares` | `antares_test` |
| PostgreSQL 16 | `127.0.0.1:55432` | `postgres` / `antares` | `antares_test` |
| SQLite | temp file per test | — | — |

Integration tests create and drop their own schema, and skip loudly (never silently) when a
server is unreachable.

## Harness

- `tests/support/paths.js` — resolves the `common/*` and `@/*` path aliases for the node runners.
- `tests/support/electron-stubs.js` — in-memory `electron-store`; `MySQLClient.getStructure`
  calls `Store.initRenderer()`, which throws outside a real main process.
- `tests/support/db.ts` — connect / seed / teardown helpers for the integration layer.
- Client classes need `logger: () => {}` in their params outside Electron, otherwise they
  reach for `webContents`.

## Parallelism

Everything is expected to survive several processes running at once, and that is checked, not
assumed: 4 simultaneous `npm run test:integration` runs plus a `npm run test:unit`, and 2
simultaneous e2e invocations.

- The node runners already fork **a process per test file** — that is why the integration suite
  finishes in ~2 s.
- Every shared name carries the pid: the integration schema/database is
  `antares_it_<tag>_<pid>` and SQLite fixtures are `antares-it-<tag>-<pid>-<ts>.db`. Never
  hardcode a schema name, and never assert on a *global* list (all schemas, all databases) —
  a concurrent run's fixtures are legitimately there too.
- The PostgreSQL fixture names its foreign key after the run salt on purpose. PostgreSQL's
  default `books_author_id_fkey` collides across schemas, and the exporter's key-usage query
  is not schema-scoped (finding 13), so a concurrent run would break the dump round-trip.
- E2E runs `fullyParallel` on 3 workers (`PW_WORKERS` to change). Each spec launches its own
  Electron instance against its own `--user-data-dir` and its own SQLite fixture.
- Playwright wipes its output directory at startup, so concurrent e2e invocations need
  `PW_OUTPUT_DIR=<dir>` each, or they delete each other's traces.
- **Only one window holds OS focus.** Anything that depends on focus (`@focus`-driven
  dropdowns, keyboard input) must be driven with `focus()`/explicit events rather than a bare
  `click()`, or it will pass serially and fail in parallel.

## Known bugs go in as `todo`, never as pinned behaviour

When a test uncovers a real production bug, assert the behaviour that **should** hold and mark
the test `{ todo: '<why it fails today>' }`:

```ts
test('a value containing the string delimiter is doubled', { todo: 'exportRows applies no CSV escaping' }, () => {
   assert.equal(text, 'a\n"say ""hi"""');
});
```

`node:test` reports todos separately and they do not fail the run. The bug stays visible in
every run and the test flips to green the day someone fixes it. Never assert the broken output
as if it were correct — that makes the suite certify the bug, and the next real fix arrives
looking like a regression.

## Flip the switch

Every behaviour under test gets a mutation check:

1. Apply **one** deliberate change to the production code under test.
2. Re-run — the *specific* test must fail, with a message that names the real problem.
3. Restore that exact file (`git show HEAD:<file> > <file>`, never a directory-wide
   `git checkout` — a sibling process may have its own mutation in flight) and confirm green.

A mutation that leaves the suite green is a coverage hole, not a pass. `git diff src/` must be
empty when you are done.

**Record it in the commit body**, not in a tracked ledger: what you broke, where, which test
caught it, and the failure message. One line per mutation is enough.

```
fix(MySQL): quote identifiers in the WHERE reducer

Verified by mutation: dropping the backtick wrapper in _reducer turns
`query builder - SELECT > the same read with a sort and a filter` red with
`WHERE first_nameLIKE '%a%'`; reverted, green again.
```

A standalone `MUTATION-LOG.md` was tried and dropped on purpose: it is append-only, full of
`file:line` references that drift on the next refactor, and nobody updates it — it rots into
exactly the misleading green it exists to prevent. The commit body travels with the diff.
