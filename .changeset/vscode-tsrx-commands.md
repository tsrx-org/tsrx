---
'@tsrx/vscode-plugin': patch
---

New Command Palette commands for `.tsrx` files, because VS Code's own TypeScript commands only run in TypeScript and JavaScript files:

- **TSRX: Go to Project Configuration** opens the nearest `tsconfig.json` above the file, where TSRX reads its settings.
- **TSRX: Sort Imports** and **TSRX: Remove Unused Imports** apply TypeScript's source actions. They work on TypeScript 7; on TypeScript 5.9 or 6 they do not change `.tsrx` files yet (tsrx-org/tsrx#994).

The extension no longer adds VS Code's own commands to menus for `.tsrx` files, where they never appeared or refused the file: Reload Projects (**TSRX: Restart Language Server** covers it), Go to Project Configuration, Sort Imports, Remove Unused Imports, and Find File References (tsrx-org/tsrx#993). TSRX's commands appear in the Command Palette only in a TSRX workspace, and Go to Source Definition only in `.tsrx` files.
