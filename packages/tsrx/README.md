# @tsrx/core

**TypeScript Render Extensions (TSRX)** — the shared parser and compiler
infrastructure that powers TypeScript UI frameworks.

`@tsrx/core` is framework-agnostic. It provides the parser, AST definitions, scope
analysis, and code-generation utilities needed to target _any_ framework runtime
using TSRX syntax. Framework-specific packages—such as
[`@tsrx/react`](../tsrx-react), [`@tsrx/solid`](../tsrx-solid), and the external
[`@tsrx/ripple`](https://github.com/Ripple-TS/ripple)—build on `@tsrx/core` to
produce target-runtime output.

## What is TSRX?

TSRX is an extension to TypeScript's syntax — in the same spirit that JSX is an
extension to JavaScript. It adds a small set of orthogonal syntactic forms that
are ergonomic for describing reactive UI, and leaves the semantics of those forms
to the consuming framework.

A `.tsrx` file is a TypeScript module with TSRX enabled.

## Installation

```bash
pnpm add @tsrx/core
```

## Usage

```js
import { analyzeTsrx, parseModule } from '@tsrx/core';

const ast = parseModule(source, 'App.tsrx');
const analysis = analyzeTsrx(ast, 'App.tsrx');
```

The parser produces an ESTree-compatible AST, augmented with the TSRX node types
listed below. Framework compilers walk this AST to emit their own output.

## Language docs

The TSRX website is the canonical source for language documentation:

- [Getting Started](https://tsrx.dev/getting-started) — install TSRX for React,
  Preact, Solid, Vue, or Ripple and configure editor/AI tooling.
- [Features](https://tsrx.dev/features) — examples of function components,
  statement templates, control flow, scoped styles, submodules, and lazy
  destructuring.
- [Specification](https://tsrx.dev/specification) — the current grammar and
  parser-level semantics.

Keeping the language reference on the website avoids duplicating the specification
here and keeps package docs focused on the core parser API.

## What `@tsrx/core` provides

- **`parseModule(source, filename, options?)`** — parse a TSRX module into an
  ESTree AST.
- **`analyzeTsrx(ast, filename, options?)`** — run target-neutral semantic
  validation before framework analysis or transformation. Pass `collect: true`,
  `typeOnly: true`, or `to_ts: true` to collect non-fatal diagnostics for
  editor/type-only output.
- **Scope analysis** — `createScopes`, `Scope`, `ScopeRoot`, binding tracking
  (`import`, `prop`, `let`, `const`, `function`, `for_pattern`, …).
- **AST utilities** — pattern walkers, identifier extraction, builders, location
  helpers, obfuscation helpers.
- **CSS support** — `parseStyle`, `analyzeCss`, `renderStylesheets`.
- **Scoped styles** — `analyzeTsrx` resolves every `<style>` block: standalone
  blocks scope the template they sit in (nested `@{ … }` and control-flow bodies
  are scopes of their own), assigned blocks (`const theme = <style>…</style>`) are
  classified as `theme` (exported or applied) or `class-map`, and `apply` targets
  are resolved through real bindings with declared-before-use enforced. Results
  ride on each block's `metadata` (`styleKind`, `styleApplies`, `styleApplied`,
  `styleExported`) and on `program.metadata.styles`, and the analysis result
  exposes `scopes`. Target compilers use `prepareStylesheetForRender(sheet, mode)`
  with `mode: 'scope' | 'class-map' | 'theme'` (a boolean still means
  `class-map`/`scope`) and `createStyleClassMapFromStylesheet(sheet, options)`,
  whose object starts with `$class` and accepts `{ applied }` for composed themes.
  Style diagnostics use the `STYLE_*` and `CSS_GLOBAL_PLACEMENT` codes in
  `DIAGNOSTIC_CODES`.
- **HTML helpers** — `isVoidElement`, `isBooleanAttribute`, `isDomProperty`,
  `validateNesting`.
- **Event helpers** — delegated-event utilities, event-name normalization.
- **Source maps** — `convertSourceMapToMappings`.

See `src/index.js` for the full exported surface.

## Non-goals

- `@tsrx/core` does **not** emit runtime code. Code generation lives in framework
  packages (e.g. `@tsrx/ripple`).
- `@tsrx/core` does **not** ship a runtime. There is no reactivity, rendering, or
  DOM code here.
- `@tsrx/core` does **not** lock consumers to a specific output format. Multiple
  compile targets can share the same parser and analysis.

## License

MIT © Dominic Gannaway
