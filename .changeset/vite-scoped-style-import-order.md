---
'@tsrx/vite-plugin-react': patch
'@tsrx/vite-plugin-preact': patch
'@tsrx/vite-plugin-solid': patch
'@tsrx/vite-plugin-vue': patch
---

Emit each module's virtual CSS import after its JavaScript imports, so an imported theme's CSS comes before the CSS of the block that applies it and the local rule wins at equal specificity.
