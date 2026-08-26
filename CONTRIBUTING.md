# Contributors Guide

Antares SQL is an application based on [Electron.js](https://www.electronjs.org/) that uses [Vue.js](https://vuejs.org/) and [Spectre.css](https://picturepan2.github.io/spectre/) as frontend frameworks.  
For the build process it takes advantage of [electron-builder](https://www.electron.build/).  
This application uses [Pinia🍍](https://pinia.vuejs.org/) as application state manager and [electron-store](https://github.com/sindresorhus/electron-store) to save the various settings on disc.  
This guide aims to provide useful information and guidelines to everyone wants to contribute with this open-source project.
For every other question related to this project please [contact me](https://github.com/Fabio286).

## Project Structure

The main files of the application are located inside `src` folder and are groupped in three subfolders.

### `common`

This folder contains small libraries, classes and objects. The purpose of `common` folder is to group together utilities used by **renderer** and **main** processes.  
Noteworthy is the `customizations` folder that contains clients related customizations. Those settings are merged with `default.js` that lists every option.  
Client related customizations are stored on Pinia and can be accessed by `customizations` property of current workspace object, or importing `common/customizations`.  

An use case of customizations object can be the following:

```js
computed: {
      defaultEngine () {
         if (this.workspace.customizations.engines)
            return this.workspace.engines.find(engine => engine.isDefault).name;
         return '';
      }
}
```

In this case the computed property `defaultEngine` returns the default engine for MySQL client, or an empty string with PostgreSQL that doesn't have engines.  
Customization properties are also useful **if some features are ready for one client but not others**.

### `main`

Inside this folder are located all files required by main process.  
`ipc-handlers` subfolder includes all IPC handlers for events sent from renderer process.  
`libs` subfolder includes classes related to clients and **query and connection logics**.  
**Everything above client's class level should be "client agnostic"** with a neutral and uniformed api interface

### `renderer`

In this folder is located the structure of Vue frontend application.

## Build

The command to build Antares SQL locally is `npm run build`. 

## Dependency policy

`.npmrc` enforces four rules on every install. They are deliberate, so please do not
work around them with flags:

| Setting | Effect |
| --- | --- |
| `min-release-age=7` | A package version must be at least 7 days old to be installed. Blunts compromised-release attacks, which are usually yanked within hours. |
| `save-exact=true` | `npm i <pkg>` writes an exact version, never a `^`/`~` range. |
| `engine-strict=true` | The `engines` field in `package.json` is a hard error, not a warning. Node 24 and npm >= 11.17.0 are required. |
| `strict-allow-scripts=true` | A dependency whose install scripts are not covered by `allowScripts` fails the install instead of silently executing. |

### Install scripts

`preinstall`, `install` and `postinstall` scripts run arbitrary code on your machine
during `npm i`, which is the usual delivery route for a compromised package. The
`allowScripts` field in `package.json` is the reviewed allowlist:

- **listed with `true`** — reviewed and permitted.
- **absent** — not reviewed. The install fails until someone reviews it.
- **listed with `false`** — explicitly denied. The script is skipped and stays skipped.

Entries are either version-pinned (`electron@30.0.8`, so a version bump needs a fresh
review) or name-only (`ssh2`, allowing any version). Prefer pinned. Four packages
currently have to be name-only because npm rejects a pinned entry for them even when
the pin matches the only installed version — reproducible on npm 11.16.0, 11.17.0 and 11.19.0.

Why each currently-approved package is trusted:

| Package | Script | Why it is allowed |
| --- | --- | --- |
| `better-sqlite3` | `prebuild-install \|\| node-gyp rebuild` | Native SQLite driver. Must compile to work at all. |
| `cpu-features` | `node-gyp rebuild` | Optional crypto accelerator for `ssh2`. Perf only. |
| `electron` | `node install.js` | Downloads the Electron binary. Without it there is no app. |
| `fsevents` | `node-gyp rebuild` | macOS file-watching for webpack. Optional, degrades to polling. |
| `playwright` | `node install.js` | Downloads browsers for the e2e suite. |
| `ssh2` | `node install.js` | Builds the optional `cpu-features` binding. Falls back to pure JS. |
| `vue-demi` | `node scripts/postinstall.js` | Selects the Vue 2 or Vue 3 shim. |

### Reviewing a new one

When an install fails with `ESTRICTALLOWSCRIPTS`, read the script before approving it:

```console
npm approve-scripts --allow-scripts-pending   # list what is unreviewed, changes nothing
cat node_modules/<pkg>/package.json           # read the actual script
npm approve-scripts <pkg>                     # allow it, pinned to the installed version
npm deny-scripts <pkg>                        # or refuse it outright
```

Both commands edit `package.json`, so the decision lands in the diff and gets reviewed
like any other change. Never reach for `--dangerously-allow-all-scripts`.

## Conventions

### Electron

- **kebab-case** for IPC event names.

### Vue

- **PascalCase** for file names (with .vue extension) and including components inside others (`<MyComponent/>`).  
- "**Base**" prefix for [base component names](https://vuejs.org/v2/style-guide/#Base-component-names-strongly-recommended).
- "**The**" prefix for [single-instance component names](https://vuejs.org/v2/style-guide/#Single-instance-component-names-strongly-recommended).  
- [Tightly coupled component names](https://vuejs.org/v2/style-guide/#Tightly-coupled-component-names-strongly-recommended).
- [Order of words in component names](https://vuejs.org/v2/style-guide/#Order-of-words-in-component-names-strongly-recommended).
- **kebab-case** in templates for property and event names.

### Code Style

The project includes [ESlint](https://eslint.org/) and [StyleLint](https://stylelint.io/) config files with style rules. I recommend to set the lint on-save option in your code editor.  
Alternatively you can launch following commands to lint the project.  

Check if all the style rules have been followed:

```console
npm run lint
```

Apply style rules globally if possible:  

```console
npm run lint:fix
```

### Other recommendations

Please, use if possible **template literals** to compose strings and **avoid unnecessary dependencies**.

### Commits

The commit style adopted for this project is [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).  
Basicly it's important to have **single scoped commits with a prefix** that follows this style because Antares SQL uses [standard-version](https://github.com/conventional-changelog/standard-version) to generate new releases and [CHANGELOG.md](https://github.com/Fabio286/antares/blob/master/CHANGELOG.md) file to track all notable changes.  
For Visual Studio Code users may be useful [Conventional Commits](https://marketplace.visualstudio.com/items?itemName=vivaxy.vscode-conventional-commits) extension.

## Debug

**Debug mode**:

```console
npm run debug
```

After running the debug mode Antares will listen on port 9222 (main process) for a debugger.  
On **Visual Studio Code** just launch "*Electron: Main*" configurations after running Antares in debug mode.
