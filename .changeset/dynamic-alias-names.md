---
'@tsrx/core': patch
'@tsrx/solid': patch
---

The `const` a dynamic tag's expression is bound to (`TsrxDynamic_1`), a `<style ref>` block's temporary (`_tsrx_style_ref_1`) and the editor's anchor for a `<style>` block (`_tsrx_style_anchor_1`) now skip names the module already uses, as the compiler's other generated names do. A component with `const TsrxDynamic_1 = 'mine';` beside `<{as} />` declared `TsrxDynamic_1` twice on React, Preact, Solid, Hono and Hono DOM, and on Vue the alias shadowed it, so `title={TsrxDynamic_1}` read the tag instead. The check of a generated name against the source is also faster: it reads the source's words once instead of scanning the whole source for each name.
