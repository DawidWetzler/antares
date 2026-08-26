# Antares SQL

Coding conventions live in [docs/coding-guidelines.md](docs/coding-guidelines.md).

## coding-advisor agent

Consult the `coding-advisor` agent (`.claude/agents/coding-advisor.md`) whenever a
code style or code organization decision comes up:

- **During `write-spec`** — before finalizing a spec, ask `coding-advisor` where the new
  code belongs (files, layers, stores, IPC path) and fold its answer into the spec.
- **During implementation** — any time you are unsure about file placement, module/component
  structure, naming, or whether an approach matches project conventions.
- **Before adding** a new file, abstraction, store, or dependency.

It is advisory and read-only; you still write the code.

## Testing — TDD is the default

**Every change starts with a failing test.** Write the test, watch it fail, then write the
code that makes it pass. This applies to bug fixes too: reproduce the bug as a red test
first. Full rules, layer table and harness details live in [docs/testing.md](docs/testing.md).

Non-negotiables for any agent or contributor working here:

- **Pick the cheapest layer that can prove the behaviour**: `tests/unit/` (pure logic, no I/O)
  → `tests/integration/` (real SQLite/MySQL/PostgreSQL through the client classes) →
  `tests/e2e/` (Playwright + Electron, only what needs the running app). Never re-prove a
  lower layer through the UI.
- **Cover the negative paths**, not just the happy one: invalid input, constraint violations,
  syntax errors, missing files, wrong credentials.
- **Flip the switch.** A test you have never seen fail proves nothing. Break the production
  code on purpose, confirm the specific test goes red for the right reason, revert, confirm
  green. Record the mutation and the failure it produced **in the commit body** of the change
  that adds the test — pinned to its own diff, where it cannot go stale. `git diff src/` must
  be clean afterwards.
- **A known bug goes in as a `todo` test asserting the correct behaviour**, never as a test
  that pins the broken output — otherwise the suite certifies the bug and the eventual fix
  looks like a regression.
- **Tests must survive several processes at once** — the node runners fork per file, and the
  suites are verified under 4 concurrent integration runs and 2 concurrent e2e runs. Put the
  pid in every shared name (schema, temp file), never assert on a global schema/database list,
  and drive focus-dependent UI with `focus()` rather than `click()`.
- **Dialect coverage**: SQLite, MySQL and PostgreSQL each get a case wherever the SQL or
  behaviour differs; shared behaviour is tested once, table-driven.
- No new test framework or dependency — `node:test` + `node:assert/strict` and Playwright are
  what we have.

## Commands

```console
npm run lint        # eslint + stylelint
npm run lint:fix
npm run debug       # run Electron in debug mode
npm test            # unit + integration
npm run test:unit
npm run test:integration   # docker compose -f tests/docker-compose.yml up -d --wait
npm run test:e2e
```
