---
'@tsrx/core': patch
'@tsrx/react': patch
'@tsrx/preact': patch
'@tsrx/solid': patch
'@tsrx/vue': patch
'@tsrx/hono': patch
---

Organize Imports and Sort Imports now work in a `.tsrx` module that reads an `import.meta.env.platform` flag, with TypeScript 7 and with the TypeScript 5.9 plugin. They returned no edits there, while Remove Unused Imports worked. The compiler appended `export {};` to such a module to keep it a module. Both actions also rewrite export declarations, and an edit to code that exists only in the generated output made the editor drop the whole action. The marker is now added only when the generated code has no import or export of its own (#1207). `withPlatformTypes` takes the generated program as an optional third argument to decide this, and keeps adding the marker when it is not passed.
