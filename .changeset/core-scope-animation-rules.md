---
'@tsrx/core': minor
---

A rule in a component's `<style>` block with an `animation` or `animation-name` declaration that matches none of the component's elements now gets the scope hash. Such a rule is kept rather than pruned, as before, but it was kept with no hash, so `.zz { color: red; animation: spin 1s; }` styled every `.zz` on the page; it now gives `.zz.<hash> { … }`, which only matches the component's own elements. The same goes for a `:is()` or `:has()` argument of such a rule that matches nothing, which raises the specificity of a rule that starts with the `:is()` by one class (`:is(.p, #never)` goes from (1,0,0) to (1,1,0)). A rule that matches one of the component's elements is unchanged.

So a rule that only applied through an element outside the component, such as an ancestor class on `<html>` (`.reduce-motion .icon`), an element returned from a callback, or another component's elements, no longer applies.

Migration: mark the part outside the component `:global(...)`, as in `:global(.reduce-motion) .icon { animation: none; }`.
