---
'@tsrx/language-server': patch
'@tsrx/typescript-plugin': patch
'@tsrx/vscode-plugin': patch
---

Declarations inside `<script>` bodies are document symbols again: the Outline, breadcrumbs and Go to Symbol in File list each body as a `<script>` symbol whose children are the body's top-level declarations (variables, functions, classes, interfaces, type aliases and enums, with the members and locals other declarations show). They went missing when bodies became blocks of the generated TypeScript, which TypeScript's navigation tree skips. It works on every TypeScript backend. Data blocks such as `<script type="application/json">` get no symbol. Enums declared elsewhere in a `.tsrx` file are now listed too.
