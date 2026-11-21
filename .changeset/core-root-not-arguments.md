---
'@tsrx/core': patch
---

The arguments of the `:not()`, `:is()` and `:where()` of a compound with `:root` or `:host` are kept as written: they are about the page's root element or the shadow host, never one of the component's elements. In a component, `:root:not(.dark) { … }` compiled to `:root:not(/* (unused) .dark*/)`, an empty `:not()`, which is invalid, so the browser dropped the rule (the usual light-mode rule); `:root:is(.dark, .light) .icon` lost both arguments the same way, and an argument that matched an element got the hash, as in `:root:not(.icon.<hash>)`, which an assigned block gave every argument. The arguments of the compound's `:has()` are its descendants and stay scoped. A bare `:global` list beside such a compound (`:global.w, :host:is(.a)`) is no longer `TSRX3011`.
