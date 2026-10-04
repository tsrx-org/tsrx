---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Import and export mistakes now report the errors TypeScript reports, instead of TS1012 `Unexpected token`:

- A missing `from` reports TS1005 `'from' expected.`: `import { a } "./a.js"`, `export { a } "./a.js"` and `export * "./a.js"`. `import a "./a.js"` reports `'=' expected.`, because TypeScript reads a single name after `import` as the start of `import a = require(…)`. `export as N` reports `'namespace' expected.`.
- A `from` written with an escape (`fr\u006fm`) reports TS1260 `Keywords cannot contain escape characters.`.
- A module specifier that isn't a string reports TS1141 `String literal expected.`, and a missing one reports TS1109 `Expression expected.`.
- `import type "./a.js"` now reports `'=' expected.`. Before, it parsed as a type-only import. `import type from from "./a.js"` and `import type from = require("./a.js")` now parse as type-only imports of a binding named `from`, as in TypeScript.

A deferred import with a default binding now reports TS18058 `Default imports are not allowed in a deferred import.`, and one with named bindings TS18059 `Named imports are not allowed in a deferred import.`. Before, both reported TS18059 with one message. TypeScript reports both from its checker, so a collecting parse records them and goes on, as it does for a source phase import. A phase import from an inline module (`import defer * as ns from server`) reports TS1141 the same way.

A deferred import without bindings (`import defer "./a.js"`) is still an error, now with TSRX's code TSRX4003 instead of TS18059. TypeScript accepts it without an error and leaves out `defer` (microsoft/TypeScript#64627), but the proposal allows only a namespace import.

`import.defer()` and `import.source()` with an escape in the phase name now report TS1260 at the name, as TypeScript 7.1 does, instead of an error about `import.meta`.

The formatter still refuses a deferred import with a default or named binding, as Prettier does.
