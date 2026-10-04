---
'@tsrx/core': patch
---

The parser now reads source phase imports, `import source module from './module.wasm'` and `import.source('./later.wasm')`, as TypeScript 7.1 does, and sets `phase: 'source'` on the `ImportDeclaration` or `ImportExpression`. Before, both failed to parse. `import source from './a.js'`, `import source, { a } from './a.js'`, and `import source from server` are still ordinary default imports named `source`. A source phase import with named or namespace bindings reports TS18112, and one without a binding reports TS18111. Like TypeScript, a collecting parse records both and goes on.

An import with a phase is also no longer read as an import-equals declaration: `import defer x = require('./a.js')` is now a syntax error, as in TypeScript. Before, it parsed as `import x = require('./a.js')` and lost the phase. `import defer from from './a.js'` now reports the deferred import error instead of an unexpected token.
