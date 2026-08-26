# Findings from building the test suite

Everything below was observed while writing `tests/`, against the code at `ed8d1136`. **Nothing
was fixed** — production code is untouched. Each row names the test that pins the behaviour;
`todo` tests assert the *correct* behaviour and flip to green when the bug is fixed.

## Data corruption / wrong rows touched

| # | Finding | Where | Pinned by |
|---|---|---|---|
| 1 | **`_reducer` discards every clause queued before an object clause** — the object branch returns `clausoles` instead of `[...acc, ...clausoles]`, so `.where('deleted = 0').where({ id: '= 5' })` emits only `WHERE \`id\` = 5`. On UPDATE/DELETE this widens the row set. Duplicated per client, so one fix does not reach them all. | `BaseClient.ts:64`, `PostgreSQLClient.ts:120`, `MySQLClient.ts:124`, `FirebirdSQLClient.ts:73` | unit `query builder - state handling` |
| 2 | **Builder state leaks between queries** — `_queryDefaults` is shallow-copied (`Object.assign({}, …)`) and only `run()` resets it, so an abandoned chain contaminates the next query on the same client. Observed: `SELECT * UPDATE "s"."books" SET "title" = 'x' WHERE "id" = 1 LIMIT 1`. | `BaseClient.ts:44`, `:132-138` | unit + integration `an abandoned builder chain must not leak` |
| 3 | **`sqlEscaper` escapes nothing but quotes and backslash** — the lookup array holds two-character sequences (`'\\n'`, `'\\0'`, `'\\x1a'`…) while the regex matches the real control characters, so `indexOf` never matches and `\n`, `\r`, `\t`, `\0`, `\x1a`, `%` pass through. Runs on every cell edit (`ipc-handlers/tables.ts:216`). | `sqlUtils.ts:164-170` | unit `sqlEscaper` |
| 4 | **pg/sqlite get backslash-escaped quotes** — `'O\'Brien'` is invalid under PostgreSQL's default `standard_conforming_strings=on` and in SQLite; the portable form is `''`. `formatJsonForSqlWhere` interpolates its payload with no escaping at all (`sqlUtils.ts:390`). | `sqlUtils.ts` `escapeAndQuote` | unit (todo) |
| 5 | **SQLite never quotes identifiers** in WHERE/SET/ORDER BY/GROUP BY or the INSERT column list — no `_reducer` override. A column named `order` yields invalid SQL on sqlite while mysql/pg wrap it. | `SQLiteClient.ts:592` | unit (todo) |
| 6 | **`= null` becomes `IS NULL` only on sqlite**, and only for the first occurrence per clause (`replace`, not `replaceAll`). mysql/pg emit `WHERE a = null`, which never matches. | `SQLiteClient.ts:581` | unit (todo) |
| 7 | **Identifiers are never escaped** — `jsonToSqlInsert` with a table named `` a`b `` emits `INSERT INTO \`a\`b\``; same in every client's `fromRaw`. | `sqlUtils.ts`, all clients | unit `FINDING` comment |

## Broken features

| # | Finding | Where | Pinned by |
|---|---|---|---|
| 8 | **No PostgreSQL function or procedure can be created from the Query tab** — `querySplitter` matches the dollar-tag regex against `line.slice(i)` (the whole remainder) instead of position `i`, then advances `i`, shredding the statement: `CREATE FUNCTION … AS $$ … $$` comes back as `C$$E$$T$$ $$U$$C$$…`. | `sqlUtils.ts:62-79` | unit + integration (todo) |
| 9 | **`querySplitter` is not comment-aware** — `SELECT /* a;b */ 1;` splits into two invalid statements; same for `;` inside `--`. | `sqlUtils.ts:36` | unit (todo) |
| 10 | **`removeComments` is string-unaware** — `SELECT '-- not a comment';` becomes `SELECT '`. | `sqlUtils.ts:112` | unit (todo) |
| 11 | **PG dumps containing a view or trigger cannot be re-imported** — bodies come back unqualified from `pg_get_viewdef`/`pg_get_functiondef` and neither the dump header nor the importer sets `search_path`; import dies with `relation "books" does not exist`. MySQL is unaffected. | `PostgreSQLExporter.ts:~208`, `:~239` | integration (todo) |
| 12 | **`getTableApproximateCount` ignores the schema** — `WHERE relname = '<table>'` with no schema and no `relkind`, so two schemas each holding `books` report each other's estimate. | `PostgreSQLClient.ts:559-563` | integration (todo) |
| 13 | **`getKeyUsage` fans out across schemas** — the `referential_constraints` join has no schema predicate while the others do, so a same-named constraint in N schemas reports one FK N times. The same query in `PostgreSQLExporter.getCreateTable` duplicates `ALTER TABLE … ADD CONSTRAINT` lines in dumps. | `PostgreSQLClient.ts:826-833` | integration (todo) |
| 14 | **A dead PostgreSQL connection reports as established** — in pooled mode `connect()` only builds a lazy `pg.Pool`, so it resolves in ~0 ms for a refused port, a wrong password, a missing database or a garbage DSN. The `connect` IPC handler never pings (`test-connection` does, so that path is safe). MySQL cannot do this: it issues a real query. | `PostgreSQLClient.ts:201-206`, `:224-247` | integration (todo) |
| 15 | **MySQL schema tree never shows row counts, and its size is `NaN`** — `SHOW FULL TABLES` returns no `TABLE_ROWS`/`DATA_LENGTH`, and the `show_table_size` query omits `TABLE_ROWS`; `Number(undefined)+Number(undefined)` reaches the UI. | `MySQLClient.ts:425`, `:400-414`, `:470-476` | integration (todo) |
| 16 | **`use()` does not stick in pooled mode** — `USE db` / `SET search_path` runs on one borrowed connection that is then released. Sequential queries usually survive; 8 concurrent ones fail with `No database selected` / `relation … does not exist`. Reached by `use-schema` and by internal `await this.use(schema)` calls before DDL (`PostgreSQLClient.ts:952, 1343, 1465, 1480`). | `MySQLClient.ts:322-325`, `PostgreSQLClient.ts:273-284` | integration (todo) |
| 17 | **CSV export is not RFC 4180** — the string delimiter is never doubled (`say "hi"` → `"say "hi""`), the header comes from row 0 only (ragged rows misalign), and with `stringDelimiter: 'none'` a value containing the field delimiter or a newline adds columns/rows. Round-tripping an export is lossy. | `exportRows.ts:39-50` | unit + integration (todo) |
| 18 | **CSV export loses JSON columns** — only string/Date/Buffer/Uint8Array are special-cased, and MySQL/PG return JSON already parsed, so `Array.join()` writes `[object Object]`. | `exportRows.ts:41-46` | integration (todo) |
| 19 | **BLOB SQL export emits the literal `undefined` on sqlite/firebird** — the branch only handles mysql/maria/pg, so `parsedValue` is never assigned. | `sqlUtils.ts:292-296` | unit (todo) |
| 20 | **SQLite connects with an empty database path** — Test connection succeeds and the workspace opens with no file chosen; there is no validation. | `WorkspaceAddConnectionPanel.vue:173-178` | e2e (observed under mutation) |
| 21 | **`limit(0)` is dropped as falsy** — `LIMIT 0` is a meaningful query. | `MySQLClient.ts:1739` and peers | unit (todo) |

## Resource leaks and latent hangs

| # | Finding | Where |
|---|---|---|
| 22 | **A failed `MySQLClient.connect()` leaks the pool and a keepalive `setInterval`** — the interval is armed before the `SHOW GLOBAL VARIABLES` probe that throws, and only `destroy()` clears it. Kept the test process alive until the suite started destroying clients after failed connects. `workers/importer.ts:39` calls `getConnectionPool()` directly, where `destroy()` would throw because `_connection` is never assigned. |
| 23 | **`raw(sql, { details: true })` deadlocks at `poolSize: 1`** — `raw` holds a pooled connection while `getTableColumns`/`getTableIndexes`/`getKeyUsage` ask the same pool for another. Verified on MySQL and PG; fine at 2 and 5. The app uses 5 or 0, so it is latent — but `poolSize: 1` is a legal `ClientParams` value. Reported, not tested: a hanging test is worse than a note. |

## Time bombs and dead code

| # | Finding | Where |
|---|---|---|
| 24 | **`File.path` is removed in Electron 32+** (deprecated in 30; `webUtils.getPathForFile` replaces it). Any bump past 31 silently breaks every file-based connection (SQLite, Firebird) and the SSL/SSH key pickers. | `WorkspaceAddConnectionPanel.vue:174-177` |
| 25 | **`e.path[0].tagName` is dead code** — `Event.path` is a removed Chrome alias for `composedPath()`, so the guard meant to stop the Delete key while a cell editor is focused never runs. | `WorkspaceTabQueryTable.vue:541` |
| 26 | **Duplicate DOM `id="query-editor"`** — one per query tab, inactive ones only `display:none`. Invalid HTML; `getElementById` and any `#query-editor` selector hit the wrong tab. | `WorkspaceTabQuery.vue` |
| 27 | **`BaseSelect` commits the wrong option, or none at all** — Enter picks `filteredOptions[hightlightedIndex]` while that index is only recomputed in a watcher (`:31` vs `:241`). Typing a filter and pressing Enter in the same frame selects the previously highlighted option; once filtering has shortened the list, a stale index resolves to `undefined` and `select(undefined)` closes the dropdown leaving the old value in place — silently, no error. Separately, **hovering an option starts a feedback loop**: `@mousemove.self` assigns `hightlightedIndex` (`:57`) and the watcher on it scrolls the list (`:288`), which moves the item out from under the cursor, which fires another mousemove. A pointer user sees the list twitch; automation cannot click an option at all. | `BaseSelect.vue:31`, `:57`, `:241`, `:288` |
| 28 | **`_queryDefaults.join` is dead weight** — no client reads `_query.join` and no `join()` builder method exists. | `BaseClient.ts:39` |
| 29 | **First run starts with the whole UI click-blocked** — the changelog modal auto-opens and its full-screen overlay swallows clicks on `#settingbar` until dismissed. | `stores/application.ts:30` |

## Absent features (not bugs — nothing to test)

- **No CSV import anywhere.** The only import channel is `import-sql` (`ipc-handlers/schema.ts:302`); `src/main/libs/importers/` holds only `sql/{MySQLlImporter,PostgreSQLImporter}`; the file dialog filters `.sql`; grepping for `papaparse|csv-parse|csvtojson|parseCsv|readCsv|importCsv` returns nothing. Asserted by `sql dump / coverage gaps`.
- **No SQLite (or Firebird) exporter/importer.** Both workers answer `"<client>" exporter/importer not aviable` (`workers/exporter.ts:37-42`, `workers/importer.ts:48-53`).
- **`SQLiteClient.getTableDll` is not implemented.** Asserted by `structure / DDL`.

## Minor, documented rather than filed

`getTableIndexes` on an unknown table rejects on MySQL but returns `[]` on SQLite/PG; MySQL returns numeric column metadata (`charLength`) as strings while the others return numbers; after `truncateTable`, MySQL's approximate count keeps the stale estimate and PG's returns `-1`; an array field fed a number silently becomes an empty literal; `hexToBinary('g')` and an unknown export type both produce the string `undefined`.
