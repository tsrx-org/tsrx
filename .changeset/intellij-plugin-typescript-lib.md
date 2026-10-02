---
'@tsrx/intellij-plugin': patch
---

New setting: **Settings → Languages & Frameworks → TSRX → TypeScript lib folder**. Set it to the `lib` folder of a TypeScript installation, and the TSRX language server runs that TypeScript. For example, use TypeScript 6 when the project is on TypeScript 7. A relative path starts at the project folder. When you change the setting, the language server restarts. Leave it empty to use the project's `typescript`, as before.
