---
'@tsrx/prettier-plugin': patch
---

The formatter no longer changes what code means in three more places:

- With `semi: false`, a statement that starts with `(`, `[`, `` ` ``, `/`, `+`,
  `-` or `<` now starts with `;`, as in Prettier. Before, the separator was
  dropped: `const value = 1` followed by `(() => {})()` printed as a call of
  `1`, and array, regex, and template-literal statements continued the line
  before them. The `;` goes after the statement's comments but before a JSDoc
  type cast (`;/** @type {T} */ (value).run()`), and a statement kept verbatim
  by `prettier-ignore` gets one too.
- Tagged templates keep their type arguments. ``sql<Row>`select 1` `` used to
  print as ``sql`select 1` ``, so TypeScript inferred the type instead.
- Directives are printed exactly as written, and only their quotes change, as
  in Prettier. An empty `"";` directive no longer gets parentheses. Before, the
  parentheses ended the directive prologue, so a `"use strict"` after it
  stopped applying.

Statement lists also drop empty statements, as Prettier does. A stray `;` used
to print as a blank line, and a file that started with one started with a
blank line. Blank lines before a statement that starts with `;` are kept on
every pass.
