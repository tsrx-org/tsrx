---
'@tsrx/core': patch
'@tsrx/language-server': patch
---

The errors a `<style>` block's CSS analysis finds, such as `TSRX3011` for a misplaced `:global`, are now each reported on the CSS they are about, and all of them are: the compiler re-anchored the first one on the whole `<style>` element and dropped the rest. Outside collect mode the first in the source is thrown. A `// @tsrx-ignore` comment before the block still covers all of them. The language server shows an error in a `<style>` body, these and `TSRX3012` (`@import`) or a CSS syntax error (`TSRX3013`), in the body's embedded CSS, so it lands on that CSS instead of on the opening tag's `>`.
