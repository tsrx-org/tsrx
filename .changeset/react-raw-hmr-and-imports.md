---
'@tsrx/core': patch
'@tsrx/vite-plugin-react': patch
'@tsrx/vite-plugin-preact': patch
---

A module that imports `Suspense` or `Fragment` itself can now use `@try … @pending` or a keyed `@for` with a fragment body. The compiler reuses the authored import instead of adding a second one, which failed the build with "Identifier `Suspense` has already been declared".

The React and Preact Vite plugins no longer compile a `.tsrx` file that is only imported as an asset (`?raw`) when it changes, so an incomplete example updates over HMR instead of reporting a compile error.
