---
'@tsrx/language-server': patch
---

When an editor starts the server without choosing a backend (Zed, Neovim, Sublime Text, IntelliJ), the server now uses the project's `typescript`: it looks for `node_modules/typescript` in each open workspace folder and its parent folders, then next to the server. The `typescript.tsdk` initialization option still comes first. Any version below 7 works. When it finds no `typescript`, or finds TypeScript 7, the server still starts without TypeScript features and shows one warning that says what it found and what to do, instead of refusing to start.

`typescript` is now an optional peer dependency, and `@tsrx/typescript-plugin`, whose code the server's build already contains, a dev dependency. npm and pnpm no longer install a `typescript` with the server: a global install or an editor's own install used to get a TypeScript 7 nightly, which the server cannot run.
