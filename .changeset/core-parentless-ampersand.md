---
'@tsrx/core': minor
---

An `&` with no rule around it no longer crashes the compiler. In a component's `<style>` block, `& { … }`, `:global.w, & { … }` and `.p:has(&) { … }` threw "Cannot read properties of null (reading 'prelude')" while pruning; in an assigned block they compiled to a top-level `&`, which matches the page's root element. They are now reported as `TSRX3011`, as Svelte reports a nesting selector outside a rule, and so is an `&` in a `:global { … }` block outside a rule, which the output drops (`:global { &.w { … } }` gave a top-level `&.w`). Directly in a `@scope`, an `&` stands for the scope's root and compiles in a component too: it gets no hash and is never pruned, as in an assigned block (`@scope (.c) { & > .p { … } }` gives `& > .p.<hash>`). A declaration in a `:global { … }` block outside a rule (`:global { color: red; }`) is `TSRX3011` too: the output left it outside any rule, which is invalid CSS.

Migration: for the root element write `:root { … }`, or `:global(&) { … }` to keep the `&`; otherwise nest the rule in the rule the `&` refers to.
