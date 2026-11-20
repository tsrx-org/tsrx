---
'@tsrx/core': patch
---

A rule in a component's `<style>` block with an `animation` or `animation-name` declaration that matches none of the component's elements now gets the scope hash. Such a rule is kept rather than pruned, as before, but it was kept with no hash, so `.zz { color: red; animation: spin 1s; }` styled every `.zz` on the page; it now gives `.zz.<hash> { … }`, which only matches the component's own elements.
