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

## Commands

```console
npm run lint        # eslint + stylelint
npm run lint:fix
npm run debug       # run Electron in debug mode
npm run test:e2e
```
