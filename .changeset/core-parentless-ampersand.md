---
'@tsrx/core': minor
---

An `&` with no rule around it no longer crashes the compiler. In a component's `<style>` block, `& { … }`, `:global.w, & { … }` and `.p:has(&) { … }` threw "Cannot read properties of null (reading 'prelude')" while pruning; in an assigned block they compiled to a top-level `&`, which matches the page's root element. They are now reported with a new code, `TSRX3015`, as Svelte reports a nesting selector outside a rule, and so is an `&` in a `:global { … }` block outside a rule, which the output drops (`:global { &.w { … } }` gave a top-level `&.w`).

Directly in a `@scope`, an `&` stands for the scope's root, which CSS reads as `:where(:scope)`. It now compiles in a component too, and gets the hash `:scope` gets there, in a component and in an assigned block alike: `@scope (.card) { & { … } }` gives `&.<hash>`, which matches a `.card` that is one of the scope's elements, where an assigned block gave `&`, which matched every `.card` on the page. It is pruned as `:scope` is. `:global(&)` keeps the `&` as written.

A declaration in a `:global { … }` block outside a rule (`:global { color: red; }`, or in a `@media` in it) is `TSRX3011`, unless an at-rule that holds declarations, such as `@font-face`, is around it: the output left it outside any rule, which is invalid CSS, or, in a `@scope`, a style for the root of every such scope on the page.

Migration: for the root element write `:root { … }`, or `:global(&) { … }` to keep the `&`; otherwise nest the rule in the rule the `&` refers to. In a `@scope`, write `:global(&)` for any root of the scope, not only the scope's own elements.
