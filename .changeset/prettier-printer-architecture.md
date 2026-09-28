---
'@tsrx/prettier-plugin': minor
---

Switch to a new formatter architecture that uses Prettier's own JavaScript and
TypeScript printer, with custom printing for TSRX-specific syntax. JavaScript,
TypeScript, and JSX formatting now follows Prettier, while the plugin handles
`@{ ... }` blocks, template directives, shorthand props, scoped styles, script
bodies, and comments between JSX children.

The package name and configuration remain `@tsrx/prettier-plugin`. Existing
projects may see formatting changes as the previous formatter's output is aligned
with Prettier. Selection formatting, cursor preservation, and browser usage
through `prettier/standalone` are supported.

The Prettier peer dependency is now `>=3.6.0`, with no upper limit. Prettier 3.9.9
or newer is recommended for more correct formatting; older versions have known
compatibility gaps, including `prettier-ignore` on template outputs.
