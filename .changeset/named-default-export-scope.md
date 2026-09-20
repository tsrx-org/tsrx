---
'@tsrx/typescript-plugin': patch
---

Blank `export default` in front of a named `function` or `class` inside an embedded `<script>` body instead of rewriting it to `const _default=`, so the declaration stays in the enclosing scope and later references (and `abstract class`) still type-check.
