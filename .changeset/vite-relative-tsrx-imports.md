---
'@tsrx/vite-plugin-solid': patch
'@tsrx/vite-plugin-vue': patch
---

Under Vitest, a `.tsrx` test file can import another `.tsrx` file by a relative path. Vitest asks for the test module by its root-relative URL, which the plugins kept as the module's id; imports from the module then resolved against the project root and failed with `ENOENT`. The id is now anchored to the file, spelled the way Vite's resolver spells it (real path, `/` separators), so a file reached through a symlinked root still has one module id.
