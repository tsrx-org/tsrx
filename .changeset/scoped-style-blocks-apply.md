---
'@tsrx/core': patch
---

Scope `<style>` blocks lexically: several blocks per scope share one hash instead of erroring, nested `@{ … }` and control-flow bodies are style scopes of their own, `<style>` may sit beside the output node in a code block or directive body, element-rooted assigned templates now emit their CSS, exported or applied assigned blocks keep every selector, every assigned block exposes `$class`, `<style apply={theme} />` stamps a theme's classes on a scope, `cssHash` is deduped per scope, and new `STYLE_*`/`CSS_GLOBAL_PLACEMENT` diagnostic codes replace the raw style throws.
