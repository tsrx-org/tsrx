---
'@tsrx/core': patch
---

Read `index` and `key` clauses only in an `@for` head. A regular `for…of` with them (`for (const item of items; index i)`) now fails with TypeScript's `')' expected.` (TS1005) at the `;`, as TypeScript reports it; before, it parsed and the compiled code and the formatters dropped the clause (#896).
