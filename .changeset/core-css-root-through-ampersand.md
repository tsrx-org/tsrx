---
'@tsrx/core': patch
---

A compound with an `&` that stands for `:root` or `:host` is now read as one with `:root` or `:host`, as `:root.dark` is: it matches the page's root element (or an `<html>` the component renders, whatever its state) or the shadow host. In a component, `:root { --c: black; &.dark { --c: white } }` pruned `&.dark` as unused, and `:root { &.dark .icon { … } }` and, for a rendered `<html><body>`, `:root { &.dark > body { … } }` were pruned whole, so dark mode never applied; they are now kept. The arguments of such a compound's `:not()`, `:is()` and `:where()` are kept as written, as they are for `:root:not(.dark)`: an assigned block compiled `:root { &:not(.dark) { … } }` to `&:not(.dark.<hash>)`, which also matched in dark mode. A list such as `:root { :global.w, &:is(.z) {} }`, which was `TSRX3011`, now compiles, as `:global.w, :root:is(.z)` does.
