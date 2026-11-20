---
'@tsrx/core': patch
---

A `/// <reference path>` in a `.tsrx` file now works in the editor as in a `.ts` file: Find File References lists it, Go to Definition on its path opens the file, the edits TypeScript computes when that file moves include it, and its path completes. The editor output printed a triple-slash directive with an extra space (`///  <reference`) and mapped the comments it keeps for checking and completion only, so TypeScript's answers inside them were dropped, and the "file not found" error (TS6053) on a missing path was one character late. A comment the editor output prints as written now maps for navigation too, so a JSDoc `{@link Name}` in a `.tsrx` file is also found among the references to `Name` and renamed with it. A comment like `// /<reference …>`, which TypeScript doesn't read as a directive, is no longer printed as one.
