---
'@tsrx/content-mapper': patch
'@tsrx/typescript-plugin': patch
'@tsrx/core': patch
---

Add `@tsrx/content-mapper`, a TypeScript 7 content mapper that type-checks `.tsrx` files under native `tsc --runExternalCode`; factor the type-only transform out of the Volar plugin into `@tsrx/typescript-plugin/src/transform.js`, and drop the unused `suppressedDiagnostics` mapping metadata, and blank `<script>` bodies in the generated TSX (they are checked as embedded scripts) so a `<` inside one no longer parses as a JSX tag.
