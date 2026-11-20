---
'@tsrx/core': patch
---

A compound selector with `:root` or `:host` no longer gets the scope hash, whatever else it has. `:root.dark .icon` in a component compiled to `:root.dark.<hash> .icon:where(.<hash>)` whenever `.icon` had an ancestor element in the component, and always in an assigned block, so the rule needed `<html>` to carry the hash and never applied; `:root.dark { --c: … }` compiled to `:root.dark.<hash>` everywhere. These now compile as `:root` alone does: `:root.dark .icon.<hash>`, `:root.dark { --c: … }`, `:host.open .icon.<hash>`. In an assigned block, `:root` and `:host` alone no longer take the class bump either, so `:root .icon` gives `:root .icon.<hash>`, as in a component. A bare `:global` list beside such a compound (`:global.w, :root.dark`) is no longer `TSRX3011`, since neither is scoped.
