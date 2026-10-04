---
'@tsrx/core': patch
---

An import or export without its `from` now reports TS1005 `'from' expected.`, as TypeScript does, instead of TS1012 `Unexpected token`: `import { a } "./a.js"`, `export { a } "./a.js"` and `export * "./a.js"`. `import a "./a.js"` reports `'=' expected.`, because TypeScript reads a single name after `import` as the start of `import a = require(…)`, and `export as N` reports `'namespace' expected.`. A `from` written with an escape (`fr\u006fm`) reports TS1260 `Keywords cannot contain escape characters.`, as in TypeScript.
