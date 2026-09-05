---
'@tsrx/rspack-plugin-react': patch
'@tsrx/rspack-plugin-preact': patch
'@tsrx/rspack-plugin-solid': patch
'@tsrx/rspack-plugin-vue': patch
'@tsrx/turbopack-plugin-react': patch
'@tsrx/bun-plugin-react': patch
'@tsrx/bun-plugin-preact': patch
'@tsrx/bun-plugin-solid': patch
'@tsrx/bun-plugin-vue': patch
---

Emit each module's virtual CSS import after its JavaScript imports, so an imported theme's CSS comes before the CSS of the block that applies it and the local rule wins at equal specificity. The Rspack and Turbopack loaders now keep the compiler's source map when a module has styles, since nothing above the import moves.
