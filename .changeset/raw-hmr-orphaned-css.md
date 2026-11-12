---
'@tsrx/vite-plugin-react': patch
'@tsrx/vite-plugin-preact': patch
'@tsrx/vite-plugin-hono': patch
---

A styled `.tsrx` file whose importers switch to `?raw` during a dev session no longer reports a compile error on every incomplete edit. Vite keeps the component's stylesheet module after its last component import is gone, so the Vite plugins still compiled the file on hot updates. A failed compile now keeps the last good stylesheet and lets the update through; a file that is still imported as a component reports the error when Vite transforms it again.
