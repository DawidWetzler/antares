# Antares UX Guidelines

SQL client for power users. Dense, keyboard-driven, dual-theme desktop app.
Stack: Vue 3 (`<script setup>`, Composition API) + Spectre.css + SCSS + MDI icons.

## Principles

1. **Density over whitespace.** Data grids and trees are the product. Use `0.7rem` for table/menu text, `0.2–0.4rem` padding.
2. **Reuse Spectre.** Everything is a Spectre class or an existing `Base*` component. Custom CSS is an override in `main.scss`, not a new system.
3. **Both themes or neither.** Every color goes through `var(--primary-color)`/`$vars`; theme-specific rules live in `scss/themes/{dark,light}-theme.scss`.
4. **Keyboard first.** Register shortcuts in `src/common/shortcuts.ts`, trap focus in modals (`useFocusTrap`).
5. **No hardcoded strings.** All user-facing text via `t('namespace.key')` (`vue-i18n`, `src/renderer/i18n`).
6. **Destructive = confirm.** Drops/deletes/discards go through `BaseConfirmModal`.

## Colors — `src/renderer/scss/_variables.scss`

| Token | Value | Use |
|---|---|---|
| `--primary-color` | `#e36929` | Brand orange: accents, active tab underline, focus rings, links, SQL keywords |
| `--primary-color-dark` | primary +30% black | Hover state |
| `--primary-color-shadow` | `rgba(227,105,41,.2)` | Focus glow |
| `$success-color` | `#32b643` | Connected, success toast |
| `$warning-color` | `#e0a40c` | Connecting (pulsing), warnings |
| `$error-color` | `#de3b28` | Failed, errors |

Surfaces: dark `$body-bg-dark #1d1d1d` / `$bg-color-gray #272727` / `$bg-color-light-dark #3f3f3f` · light `$body-bg #f3f3f3` / `$bg-color-light-gray #f1f1f1` / `$light-color #fdfdfd`.

Primary color is **user-configurable per connection** — never hardcode `#e36929` in a component.

### Data-type colors (`_data-types.scss`, class `.type-<sqltype>`)

string `seagreen` · number `cornflowerblue` · date `coral` · bit `lightskyblue` · blob `darkorchid` · array/geometry `yellowgreen` · enum/bool `goldenrod` · unknown & `.is-null` `gray`.

## Sizing

`$border-radius: 0.3rem` · `$titlebar-height: 1.5rem` · `$footer-height: 1.5rem` · `$settingbar-width: 3.5rem` · `$explorebar-width: 14rem` (resizable).
Editor font sizes: `xsmall 10px → xxlarge 20px` (user setting), monospace.

## Component palette

**Own components** (`src/renderer/components/`) — prefer these before writing markup:

| Component | Use |
|---|---|
| `BaseIcon` | All icons. `icon-name="mdiXxx"` from `@mdi/js`, `:size` in px (16 inline, 24 buttons, 48 empty states) |
| `BaseConfirmModal` | Any modal. Slots: `header`/`body`/`footer`; sizes `small\|medium\|400\|large\|resize`; teleports to `#window-content`, focus-trapped, ESC/overlay closes |
| `BaseSelect` | Searchable select (over raw `.form-select`) |
| `BaseNotification` / `TheNotificationsBoard` | Toasts: `success\|error\|warning\|info`, icon + message, expandable |
| `BaseContextMenu` | Right-click menus, auto-flips at viewport edges |
| `BaseLoader`, `.loading` class | Async feedback; `.loading` on a `.btn` hides its label |
| `BaseVirtualScroll` | Any list that can exceed ~hundreds of rows |
| `BaseTextEditor` / `QueryEditor` | Ace editor wrappers (SQL + themes) |
| `WorkspaceEmptyState` | Empty-state pattern: logo + `h6` subtitle + primary action |

**Spectre classes in use** (ranked by frequency): `columns`/`column`/`col-*`/`col-gapless` (layout), `btn` + `btn-primary`/`btn-dark`/`btn-link`/`btn-clear`/`btn-gray`, `form-group`/`form-label`/`form-input`/`form-select`/`form-checkbox`/`form-switch`/`input-group`, `modal`, `tab`/`tab-item`, `table`, `tile`, `panel`, `menu`/`menu-item`, `empty`, `accordion`, `tooltip` (`data-tooltip`), `badge` (`badge-connected`/`-connecting`/`-failed`), `divider`, `dropdown`, `c-hand`, `text-light`/`text-bold`/`text-uppercase`/`text-center`, `h5`/`h6`.

Button hierarchy: `btn-primary` (one per view, the confirm action) → `btn-dark`/`btn-gray` (neutral) → `btn-link` (cancel/tertiary). Icon-only buttons need a `data-tooltip`.

## Motion — `_transitions.scss`

`fade` 0.5s · `fade-slide-down` 0.15s (dropdowns) · `slide-fade` 0.3s (panels) · `jump-down` 0.2s (appearing items) · `flip-list-move` 0.5s (drag reorder) · `pulse` 2s (pending state) · `.rotate` 0.8s linear (spinners). Reuse a name; don't add a transition class.

## Conventions

- 3-space indent (ESLint), SCSS via stylelint-standard. Run `npm run lint`.
- Component naming: `Base*` = generic, `The*` = single instance, `Modal*`, `Workspace*`, `SettingBar*`.
- Scoped styles in `.vue` files; only cross-cutting overrides go in `main.scss`.
- Accessibility floor: focus trap in modals, visible focus ring (primary glow), keyboard-reachable actions, tooltips on icon-only controls.
