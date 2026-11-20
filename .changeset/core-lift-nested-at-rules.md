---
'@tsrx/core': patch
---

An at-rule that a style rule can't hold, such as `@keyframes`, `@font-face` or `@property`, written in a rule of a `<style>` block is now moved out of the rules around it, to just before the outermost one, inside the group rules (`@media`, `@supports`) it was in. It was left nested, which is invalid CSS, so browsers dropped it: `.box { @keyframes fade { … } animation: fade 1s; }` gave no animation. Its keyframes name still gets the scope hash. One in a `@layer`, `@when` or `@else` in the rule stays where it is, since writing the layer again before the rule would change the order of layers and an `@else` belongs after its condition, and so do `@import`, `@charset` and `@namespace`, and one in a rule the output comments out as unused.
