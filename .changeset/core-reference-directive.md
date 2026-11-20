---
'@tsrx/core': patch
---

A `/// <reference path>` in a `.tsrx` file now works in the editor as in a `.ts` file: Find File References lists it, Go to Definition on its path opens the file, the edits TypeScript computes when that file moves include it, its path completes, and the "file not found" error (TS6053) for a missing path covers the path. The editor output printed a triple-slash directive with an extra space (`///  <reference`) and mapped it back for checking only, so TypeScript's answers inside it were dropped and that error was one character late. A comment like `// /<reference …>`, which TypeScript doesn't read as a directive, is no longer printed as one.
