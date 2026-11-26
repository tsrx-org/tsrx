---
'@tsrx/core': patch
---

Minified CSS (`renderStylesheets(sheets, true)`, as Ripple's `minify_css` uses it) no longer keeps the scope hash of a selector it prunes. An argument that matched an element on its own (`.icon` in `.missing:is(.icon)`) still got the hash after the pruned selector's text was removed, so `.missing:is(.icon), .wrap` gave `.<hash> .wrap.<hash>`, which matches only a `.wrap` inside an element with the hash, and `.wrap, .missing:is(.icon)` gave `.wrap.<hash>.<hash>`. Unminified output no longer writes the hash into the `/* (unused) … */` comment either.
