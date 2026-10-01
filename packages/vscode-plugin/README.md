# TSRX Syntax for VS Code

Provides syntax highlighting, rich intellisense and [formatting](#formatting) for
`.tsrx` files in VS Code, using the TSRX language server.

## TypeScript backends

VS Code's own TypeScript owns every TypeScript feature for `.tsrx` files: the
extension never loads or bundles TypeScript and never patches another extension.
It activates Microsoft's installed TypeScript extensions and lets them choose
which server runs, without adding a selection setting of its own. The two rows
below are what happens with TypeScript 5.9 or 6 and with TypeScript 7. Only one
TypeScript ever serves a file.

| Backend   | How it works                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `classic` | TypeScript 7 off: VS Code's built-in TypeScript extension runs its tsserver (its own copy or the workspace version, 5.9 or 6) with `@tsrx/typescript-plugin`, which this extension contributes as a tsserver plugin (`typescriptServerPlugins`) and ships. VS Code manages `.tsrx` documents like `.ts` ones, so its commands and menus work on them and `.ts` importers resolve `.tsrx` modules with no tsconfig `plugins` entry. TypeScript closes tags (`js/ts.autoClosingTags.enabled`). The TSRX language server adds TSRX compile errors, snippets, CSS in `<style>`, document symbols and CSS-class hover and definition. |
| `native`  | TypeScript 7 on: the [TypeScript 7 extension](https://github.com/microsoft/TypeScript/tree/main/packages/vscode-typescript) owns every TypeScript feature for `.tsrx` files through [`@tsrx/content-mapper`](https://www.npmjs.com/package/@tsrx/content-mapper), declared in `tsconfig.json`, including TSRX compile errors. The TSRX language server serves the same TSRX-only features minus compile errors, and closes tags.                                                                                                                                                                                                 |

### Restarting

If `.tsrx` features stop responding, run **TSRX: Restart Language Server** from
the Command Palette. It restarts the TSRX language server and the TypeScript
server that serves `.tsrx` files, which also reloads its projects. VS Code's own
**TypeScript: Reload Projects** only runs in TypeScript and JavaScript files.

### Go to Project Configuration

To open the `tsconfig.json` of the current `.tsrx` file, run **TSRX: Go to Project
Configuration** from the Command Palette. It opens the nearest `tsconfig.json`
above the file, where TSRX reads its settings (`tsrx.compiler`, `tsrx.platform`).
VS Code's own **TypeScript: Go to Project Configuration** only runs in TypeScript
and JavaScript files.

### Sort and remove imports

To sort the imports of the current `.tsrx` file, or to remove the unused ones, run
**TSRX: Sort Imports** or **TSRX: Remove Unused Imports** from the Command
Palette. They apply TypeScript's own source actions, which also appear under
**Source Action…** in the editor's context menu, with **Organize Imports**
(Shift+Alt+O). VS Code's own TypeScript commands only run in TypeScript and
JavaScript files.

On TypeScript 7 these actions work in `.tsrx` files. On TypeScript 5.9 or 6 they
do not change `.tsrx` files yet
([tsrx-org/tsrx#994](https://github.com/tsrx-org/tsrx/issues/994)).

### Native backend setup

TypeScript 7 support for `.tsrx` files is not complete yet. The gaps and the
upstream TypeScript issues behind them are tracked in
[tsrx-org/tsrx#136](https://github.com/tsrx-org/tsrx/issues/136); if you run into
one that is not listed there, please file a new issue.

To type-check `.tsrx` files with TypeScript 7.1 in VS Code:

1. Install `typescript@next` in your project (TypeScript 7.1 is not released yet):

   ```sh
   npm install -D typescript@next
   # or
   pnpm add -D typescript@next
   ```

2. Add these two settings to your VS Code user settings:

   ```json
   {
     "js/ts.experimental.useTsgo": true,
     "js/ts.tsdk.path": "node_modules/typescript"
   }
   ```

   You can also add them to the project's `.vscode/settings.json` instead. VS Code
   then asks once whether to use the project's TypeScript. Choose **Allow** to
   enable it.

   If TypeScript 7 is on without `js/ts.tsdk.path`, TSRX shows a notice. Its **Use
   Project TypeScript** button adds the setting for you.

3. Install the
   [TypeScript 7 extension](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview).

4. Declare the mapper in every `tsconfig.json` that contains `.tsrx` files, and
   install `@tsrx/content-mapper` next to it. TypeScript 7 reads that entry itself
   and resolves `.tsrx` imports across the whole project:

   ```jsonc
   {
     "contentMappers": [
       { "package": "@tsrx/content-mapper", "extensions": [".tsrx"] },
     ],
   }
   ```

   A `.tsrx` file that belongs to no such project (no `tsconfig.json`, or one
   without the `contentMappers` entry) gets no TypeScript features on the native
   backend.

5. The workspace must be trusted. Neither the mapper nor the TSRX compilers run in
   Restricted Mode.

_Note: `js/ts.tsdk.path` makes the TypeScript 7 extension use your project's
TypeScript instead of its built-in 7.0.2, which cannot check `.tsrx` files; it
does not find it by itself yet (microsoft/TypeScript#64565). These steps will get
simpler once that is fixed and TypeScript 7.1 is released (tsrx-org/tsrx#991)._

### Which TypeScript versions work

This table shows what each TypeScript version does with `.tsrx` files. We tested
it with the TypeScript 7 extension 1.0.1 and TypeScript `7.1.0-dev.20260930.4`. To
run the same tests, use `pnpm --filter @tsrx/vscode-plugin test:editor`.

| TypeScript version                                             | Who runs it                                                 | `.tsrx` files                                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 5.9 or 6                                                       | VS Code's built-in TypeScript, with TypeScript 7 off        | Work (classic backend)                                                              |
| 7.1 nightly in the project's `node_modules/typescript`         | TypeScript 7 extension, with `js/ts.tsdk.path` set (step 2) | Work (native backend)                                                               |
| 7.1 nightly in the project, but `js/ts.tsdk.path` is not set   | TypeScript 7 extension, which then uses its built-in 7.0.2  | Get no TypeScript features. A TSRX notice tells you which setting to add.           |
| 7.0, including the 7.0.2 built into the TypeScript 7 extension | TypeScript 7 extension                                      | Get no TypeScript features, because TypeScript 7.0 does not support content mappers |

### How TypeScript features start

TypeScript features start when you open a `.tsrx` file. This also works in a
project that has no `.ts` or `.js` files.

When TSRX starts, it does these steps:

1. It activates Microsoft's TypeScript extensions, the same as opening a `.ts`
   file does.
2. If an extension's API supports content mappers, TSRX calls
   `registerContentMappers` with `[{ extensions: ['.tsrx'] }]`. TypeScript then
   finds the project of each `.tsrx` file: the files that are open now and the
   files that you open later.

Microsoft's extensions choose the TypeScript version and do any first-run setup,
the same as for a `.ts` file.

The mapper comes only from the `contentMappers` entry in each project's
`tsconfig.json` (step 4). TSRX does not add a mapper for files outside such a
project (TypeScript calls these "inferred projects").

### The "server plugins will not be loaded" warning

If you turn on TypeScript 7 in your user settings, the TypeScript 7 extension
shows this warning:

> TypeScript server plugins from the "TSRX.tsrx-vscode-plugin" extension will not
> be loaded because TypeScript 7 is enabled globally.

You can ignore this warning. The plugin in the warning is
`@tsrx/typescript-plugin`. This extension gives it to VS Code's own TypeScript,
and only the classic backend (TypeScript 5.9 or 6) uses it. TypeScript 7 uses the
content mapper instead.

The warning does not come from a `plugins` entry in your `tsconfig.json`, so
removing that entry does not stop it. The TypeScript 7 extension shows it for each
installed extension that gives a plugin to VS Code's TypeScript. It shows the
warning again each time VS Code starts. To hide it, click **Don't Show Again**. An
extension cannot turn this warning off yet
([microsoft/TypeScript#64356](https://github.com/microsoft/TypeScript/issues/64356)).

### Differences from the classic backend

On the native backend (TypeScript 7):

- **Closing tags:** the TSRX language server closes tags. The setting is
  `tsrx.autoClosingTags.enabled`. TypeScript 7 (`tsc --lsp`) can close tags in
  `.tsrx` files, but the TypeScript 7 extension asks it to do this only in
  TypeScript and JavaScript files
  ([microsoft/TypeScript#64564](https://github.com/microsoft/TypeScript/issues/64564)).
  On the classic backend, VS Code's TypeScript closes tags.
- **Compile errors:** TypeScript 7 reports TSRX compile errors, with the source
  `tsrx`. On the classic backend, the TSRX language server reports them, with the
  source `TSRX`.
- **Rename:** you can rename an identifier only if the generated TypeScript has
  the same text for it as the `.tsrx` source
  ([microsoft/TypeScript#63879](https://github.com/microsoft/TypeScript/issues/63879)).
- **Keyword highlights:** when two or more `.tsrx` editors show side by side, the
  keyword highlights from the TSRX language server do not show. In this case, VS
  Code uses only the multi-document highlight provider of the TypeScript 7
  extension.
- **Go to Source Definition:** TSRX's command opens the definition instead, and
  says why the first time. `tsc --lsp` can find the source definition in `.tsrx`
  files, but the TypeScript 7 extension runs its command only in TypeScript and
  JavaScript files
  ([microsoft/TypeScript#64576](https://github.com/microsoft/TypeScript/issues/64576)).
  On the classic backend, the command goes past a `.d.ts` file to the JavaScript
  behind it.

### Known limitation on both backends

TypeScript checks the declarations inside `<script>` bodies, but the Outline does
not list them. The reason is that the generated TypeScript puts each body in a
block statement, and TypeScript's navigation tree skips block statements
([tsrx-org/tsrx#137](https://github.com/tsrx-org/tsrx/issues/137)).

### More about the content mapper

- [`@tsrx/content-mapper` README](https://github.com/tsrx-org/tsrx/tree/main/packages/content-mapper):
  the CLI (`tsc --runExternalCode`), declaration output, and known limitations
- [`ROLLOUT.md`](https://github.com/tsrx-org/tsrx/blob/main/packages/content-mapper/ROLLOUT.md):
  migration and rollback steps
- [`COMPATIBILITY.md`](https://github.com/tsrx-org/tsrx/blob/main/packages/content-mapper/COMPATIBILITY.md)
  and
  [`BENCHMARKS.md`](https://github.com/tsrx-org/tsrx/blob/main/packages/content-mapper/BENCHMARKS.md):
  how the two backends compare

## Formatting

The extension formats `.tsrx` files with your project's Prettier and
[`@tsrx/prettier-plugin`](https://github.com/tsrx-org/tsrx/tree/main/packages/prettier-plugin).
You do not need the Prettier extension.

1. Install both in your project:

   ```sh
   npm install -D prettier @tsrx/prettier-plugin
   # or
   pnpm add -D prettier @tsrx/prettier-plugin
   ```

2. Run **Format Document** or **Format Selection**, or turn on
   `editor.formatOnSave` or `editor.formatOnPaste`.

TSRX is the default formatter for `.tsrx` files. Your Prettier config
(`.prettierrc`), `.editorconfig` and `.prettierignore` apply, so VS Code gives the
same result as the `prettier` command. To run Prettier from the command line, also
add the plugin to your Prettier config:

```json
{ "plugins": ["@tsrx/prettier-plugin"] }
```

**Format Document With…** also lists TypeScript for `.tsrx` files: TypeScript 7
always, and VS Code's own TypeScript when `js/ts.format.enabled` is set. Neither
can format `.tsrx` files
([microsoft/TypeScript#64579](https://github.com/microsoft/TypeScript/issues/64579)).

If a package is missing, TSRX shows a message with the install command, once per
project. To turn formatting off, set `"tsrx.format.enable": false`.

To use the Prettier extension instead, make it the default formatter for `.tsrx`
files. It also needs the plugin in your Prettier config:

```json
{
  "[tsrx]": { "editor.defaultFormatter": "esbenp.prettier-vscode" }
}
```

## Legacy settings

### tsconfig `plugins` entry

Older versions of this extension needed this entry in `tsconfig.json`, so that
`.ts` and `.tsrx` files could import each other:

```jsonc
{
  "compilerOptions": {
    "plugins": [{ "name": "@tsrx/typescript-plugin" }],
  },
}
```

VS Code no longer needs it (only other editors do). On TypeScript 5.9 or 6, this
extension gives the plugin to VS Code's TypeScript. TypeScript 7 ignores `plugins`
and uses the `contentMappers` entry instead (see
[Native backend setup](#native-backend-setup)).

### Prettier settings written by older versions

Older versions of this extension wrote these settings into your user settings
every time VS Code started:

```jsonc
{
  "prettier.documentSelectors": ["**/*.tsrx"],
  "[tsrx]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
}
```

The extension no longer writes them. While they stay, the Prettier extension
formats `.tsrx` files instead of TSRX. To use TSRX, remove both settings (see
[Formatting](#formatting)). Each time, these settings also replaced any other
`[tsrx]` settings and Prettier document selectors that you had set.
