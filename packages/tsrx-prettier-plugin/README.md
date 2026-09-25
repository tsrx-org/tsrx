# tsrx-prettier-plugin

An experimental Prettier plugin for [TSRX](https://tsrx.dev) that formats
everything except TSRX syntax with Prettier's own JavaScript and TypeScript
printer. It is meant to replace [`@tsrx/prettier-plugin`](../prettier-plugin),
which prints every node itself, and is not published yet.

## How it works

- **Parser** (`src/parse.js`): parses with `@tsrx/core`, then reshapes the
  acorn-typescript AST into the typescript-estree shape that Prettier's printer
  expects (for example `superTypeParameters` → `superTypeArguments`). Comments are
  handed to Prettier, which attaches them itself.
- **Printer** (`src/printer.js`): Prettier's `estree` printer from
  `prettier/plugins/estree`, with TSRX syntax printed by the plugin: `@{ … }`,
  `@if`, `@for`, `@switch`, `@try`, `{value}` shorthand props, and `<style>` and
  `<script>` bodies, which are formatted as CSS and TypeScript.

`@{ … }` is printed as a block statement with an `@`, and the directives are
presented to Prettier as `do { … }` expressions, their closest JavaScript
relative, so its layout rules (such as keeping an arrow body on the `=>` line)
apply to them too.

## Prettier's tests

`tests/prettier/` holds Prettier's own format tests for JavaScript, JSX, and
TypeScript, and `tests/prettier.test.js` runs every case through this plugin. A
case expects exactly what Prettier prints with its `typescript` parser.

- `tests/prettier/manifest.json` records the Prettier version, the cases that were
  left out and why, and the imported cases that the TSRX parser rejects.
- `tests/prettier-known-failures.json` lists the cases that don't pass yet. They
  run as expected failures, and a listed case that starts passing fails the run,
  so the list only shrinks. Refresh it after a change with
  `UPDATE_KNOWN_FAILURES=1 pnpm test --project tsrx-prettier-plugin`.
- `tests/prettier-overrides.js` holds the cases where TSRX deliberately differs
  from Prettier, each with its reason.

To update the tests after upgrading Prettier, run
`pnpm --filter tsrx-prettier-plugin import-prettier-tests`, which clones the
installed release's tests (or pass `--source <prettier checkout>`), then refresh
the known failures.

The files in `tests/prettier/` come from Prettier and are under
[Prettier's MIT license](tests/prettier/LICENSE).
