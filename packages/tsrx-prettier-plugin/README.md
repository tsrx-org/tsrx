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
  - a comment between JSX children, which renders like `{/* … */}` in TSX, is the
    `{…}` child that `{/* … */}` is in the parser's tree (a
    `JSXExpressionContainer` with a `JSXEmptyExpression`, and no braces in the
    source), so Prettier lays it out; it becomes the plugin's comment child, which
    prints without the braces, and a `prettier-ignore` one keeps the next child as
    written;
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
  - A `@{ … }` block that is an element's or fragment's only child hugs its tags
    (`<div>@{`, the statements, `}</div>`), as a function's `@{ … }` body hugs its
    `)`, and one in an expression container hugs the braces (`{@{`, `}}`), as
    Prettier hugs a function there.
  - A comment before a tag name: after a line comment, Prettier would print
    `<// note` with the name below it, which TSX can't parse, so the comment and
    the name go on their own indented lines after `<`, as in Prettier's closing
    tags. A block comment prints straight after `<` (`</* note */ div />`).
  - `<style>` bodies are formatted as CSS. A `<script>` body is formatted as
    Prettier's HTML formatter formats it: its `type` or `lang` picks the parser
    (JavaScript without either; JSON for JSON, import maps, and speculation rules;
    Markdown; HTML), JavaScript and TypeScript bodies are formatted with this
    plugin's own parser, and a body without a parser (`src`, an unknown type), or
    that its parser can't read, is kept as written on its own lines, as Prettier
    keeps it. With `embeddedLanguageFormatting: "off"`, `<style>` bodies are kept
    as written and `<script>` bodies are kept on their own lines.
  - Comments between a directive's branches are placed by Prettier's own comment
    handling for `if` and `try`, while `@if` and `@try` present themselves as
    those statements. A comment before `@empty` is handled like one before `else`.
- **JSX children** (`src/jsx.js`): a comment between children prints without the
  braces, as written. An element with such comments is laid out by a copy of
  Prettier's `printJsxElementInternal` and `printJsxChildren` with the two rules a
  bare comment needs: a line comment ends its line, and it keeps whitespace before
  it after text or a comment (touching them, `//` is text); text that starts with
  `//` right after a block comment stays on its line. Every other element is
  printed by Prettier itself. Keep the copy in step with Prettier when upgrading.
- **Range formatting** (`src/range.js`): Prettier formats a selection
  (`rangeStart`, `rangeEnd`) only for its own parsers, by the parser's name. For
  one such format, the plugin names its parser `typescript` and resolves that name
  to itself, so Prettier chooses the statements to format as it does for
  TypeScript. A range of template content (an output, a directive, a branch, a
  body) can't be formatted on its own, so the plugin prints it where it is in the
  file. A range that Prettier grows to several children of an element keeps its
  text.

The plugin needs no other Prettier plugin, including in `prettier/standalone`,
except to format JSON, HTML, or Markdown `<script>` bodies there.

## In the browser

`prettier/standalone` loads no parser by itself, and this plugin brings only its
own and the CSS one for `<style>`. JavaScript and TypeScript `<script>` bodies are
formatted with the plugin's parser, but a JSON, HTML, or Markdown body is kept as
written unless you pass the Prettier plugins that parse and print it: Prettier
finds a body's parser and printer among all the plugins in `plugins`.

```js
import * as prettier from 'prettier/standalone';
import tsrx from 'tsrx-prettier-plugin';
// JSON, import maps, and speculation rules: babel parses JSON, estree prints it
import * as babel from 'prettier/plugins/babel';
import * as estree from 'prettier/plugins/estree';
// <script type="text/html">
import * as html from 'prettier/plugins/html';
// <script type="text/markdown">
import * as markdown from 'prettier/plugins/markdown';

const formatted = await prettier.format(code, {
  parser: 'tsrx',
  plugins: [tsrx, babel, estree, html, markdown],
});
```

In Node, `prettier` loads its own plugins, so these bodies are formatted without
passing them.

It supports Prettier 3.9 (`~3.9.9`): range formatting relies on how Prettier 3.9
passes a range's options from the file's parse to the range's. When upgrading
Prettier, check `src/main/range.js` and `formatRange` in `src/main/core.js`, as
well as the JSX printing that `src/jsx.js` copies.

## Tests

- `tests/prettier/` holds Prettier's own format tests for JavaScript, JSX, and
  TypeScript, imported by `scripts/import-prettier-tests.js`. A case is imported
  when Prettier's `typescript` parser prints the snapshot's output and the input
  is TSRX: valid TSX, in a strict-mode module. `tests/prettier.test.js` runs every
  case through this plugin the way Prettier's harness does (with its cursor, range
  and line endings) and expects exactly Prettier's output.
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
