---
'@tsrx/core': patch
---

Compiled output now keeps the source phase of `import source module from './module.wasm'` and `import.source('./later.wasm')`. Before, the printer kept only `defer` and printed these as an ordinary default import and an ordinary `import()`, so the program loaded the evaluated module instead of its source. This happened when another parser, such as `@tsrx/oxc`, built the tree. Core's own parser does not read source phase imports yet. An import phase the printer does not know now throws instead of printing an ordinary import. The AST types now allow `phase: 'source'`.
