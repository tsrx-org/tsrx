---
'@tsrx/core': patch
---

An at-rule that a style rule can't hold, such as `@keyframes`, `@font-face` or `@property`, written in a rule of a `<style>` block is now moved out of the rules around it, to just before the outermost one, inside the group rules (`@media`, `@supports`) it was in. It was left nested, which is invalid CSS, so browsers dropped it: `.box { @keyframes fade { … } animation: fade 1s; }` gave no animation. Its keyframes name still gets the scope hash, and `@import`, `@charset` and `@namespace` stay where they are.
