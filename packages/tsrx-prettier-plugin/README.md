# tsrx-prettier-plugin

An experimental Prettier plugin for [TSRX](https://tsrx.dev) that formats
everything except TSRX syntax with Prettier's own JavaScript and TypeScript
printer, unlike [`@tsrx/prettier-plugin`](../prettier-plugin), which prints every
node itself. It is not published yet: whether it replaces `@tsrx/prettier-plugin`
or is released on its own is decided later.

The goal is Prettier's output wherever TSRX is TSX, so TSRX only differs where its
syntax does: `@{ … }` blocks, `@if`/`@for`/`@switch`/`@try`, `{value}` shorthand
props, `<style>`/`<script>` bodies, and comments between JSX children.

## How it works

- **Parser** (`src/parse.js`) parses with `@tsrx/core` in `collect` mode, so
  mistakes TypeScript only reports as diagnostics (a redeclared variable) still
  format. An unclosed or mismatched tag is still an error: the parser would guess
  the markup's structure. Then it reshapes the acorn-typescript AST into the
  typescript-estree shape that Prettier's printer expects:
  - renames, such as `superTypeParameters` → `superTypeArguments`, `accessor`
    fields → `AccessorProperty`, `namespace A.B` → `TSQualifiedName`, and
    `export import` → `ExportNamedDeclaration`;
  - the parts of Prettier's parser postprocess that its printer relies on:
    `__contentEnd`, `locEnd` for statements, rebalanced logical expressions,
    merged touching JSDoc comments, dropped single-type unions;
  - JSX text children are rebuilt from the source, since the parser leaves out the
    whitespace between children and Prettier reads it;
  - a comment between JSX children becomes a `TSRXJSXComment` child;
  - comments go to Prettier as a flat list with their source text, and Prettier
    attaches them itself.
- **Printer** (`src/printer.js`) is Prettier's `estree` printer from
  `prettier/plugins/estree`. It sees the options as its own `typescript` parser's,
  because it checks the parser's name for TypeScript-only rules. The plugin prints
  the TSRX syntax:
  - `@{ … }` is a block statement with an `@`, and `@case` bodies are blocks, so
    blank lines and comments follow Prettier's statement rules.
  - Directives are presented to Prettier as `do { … }` expressions. A directive's
    head is printed while the node presents itself as its statement
    (`IfStatement`, `ForOfStatement`), so `@if (…)` breaks like `if (…)`.
  - A directive, or a `@{ … }` block used as a value, lays out like a JSX element:
    wrapped in `(` … `)` where it's assigned, returned, thrown, or an arrow's
    body, with its comments inside the parentheses. While its parent prints, it
    presents itself as a `JSXElement` (`withTsrxValuesAsJsx`), so Prettier's
    JSX-specific layout applies to it. A `@{ … }` function or arrow body stays on
    its line.
  - A comment before a tag name: after a line comment, Prettier would print
    `<// note` with the name below it, which TSX can't parse, so the comment and
    the name go on their own indented lines after `<`, as in Prettier's closing
    tags. A block comment prints straight after `<` (`</* note */ div />`).
  - `<style>` bodies are formatted as CSS. A `<script>` body is formatted with
    this plugin's own parser when it holds JavaScript or TypeScript, and kept as
    written otherwise (JSON, import maps).
- **JSX children** (`src/jsx.js`): an element whose children include TSRX comments
  is laid out by a copy of Prettier's `printJsxElementInternal` and
  `printJsxChildren`, in which a comment keeps its line. Every other element is
  printed by Prettier itself. Keep the copy in step with Prettier when upgrading.

The plugin needs no other Prettier plugin, including in `prettier/standalone`.

## Tests

- `tests/prettier/` holds Prettier's own format tests for JavaScript, JSX, and
  TypeScript, imported by `scripts/import-prettier-tests.js`. A case is imported
  when Prettier's `typescript` parser prints the snapshot's output and the input
  is TSRX: valid TSX, in a strict-mode module. `tests/prettier.test.js` runs every
  case through this plugin and expects exactly Prettier's output.
- `tests/prettier/manifest.json` records the Prettier version, the cases that were
  left out and why, and the imported cases that the TSRX parser rejects.
- `tests/prettier-known-failures.json` lists the cases that don't pass yet. They
  run as expected failures, and a listed case that starts passing fails the run,
  so the list only shrinks. Refresh it after a change with
  `UPDATE_KNOWN_FAILURES=1 pnpm test --project tsrx-prettier-plugin`.
- `tests/prettier-overrides.js` holds the cases where TSRX deliberately differs
  from Prettier, each with its reason. An override skips the case (for example,
  syntax that is only a proposal), expects Prettier's output for the input as a
  `.tsx` file, or replaces the input or the expected output.
- `tests/tsrx.test.js` covers the TSRX syntax. Each formatting test also checks
  that a second format changes nothing.

To update the tests after upgrading Prettier, run
`pnpm --filter tsrx-prettier-plugin import-prettier-tests`, which clones the
installed release's tests (or pass `--source <prettier checkout>`), then refresh
the known failures.

The files in `tests/prettier/` come from Prettier and are under
[Prettier's MIT license](tests/prettier/LICENSE).
