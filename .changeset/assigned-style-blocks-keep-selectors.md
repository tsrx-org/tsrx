---
'@tsrx/core': minor
'@tsrx/mcp': patch
---

Assigned `<style>` blocks (`const theme = <style>…</style>`) now always keep
every selector. Before, a block that wasn't exported, applied, or read as
`theme.$class` was treated as a class map, and its element and descendant rules
were emitted only as `/* (unused) … */` comments, with no diagnostic. But
`$class` is an ordinary string that JavaScript carries anywhere. A theme whose
`$class` was destructured (`const { $class: cls } = theme`), read through an
object (`themes.red.$class`), passed to a component, returned from a helper, or
iterated lost its styles while its elements still carried the hash class.

Every assigned block is now a theme: `metadata.styleKind` is always `'theme'`,
and `prepareStylesheetForRender` prunes nothing in any mode (`'class-map'` and
the boolean form render as `'theme'`). Target compilers that choose the render
mode from `styleKind` (Ripple, Octane) keep every selector after upgrading
`@tsrx/core`. An element that carries a class entry such as `styles.card` also
carries the hash, so the block's element rules now match it too. The
classification-only `metadata.styleExported` and `metadata.styleClassRead`
fields are gone.

`createScopes` now records `value as T`, `value!`, `value satisfies T`, and
`fn<T>` as references to `value` and `fn`. It used to skip every identifier
whose parent was a TypeScript node, so these runtime reads were missing from
`binding.references`.
