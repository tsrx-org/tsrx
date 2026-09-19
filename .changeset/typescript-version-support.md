---
'@tsrx/typescript-plugin': patch
'@tsrx/language-server': patch
'@tsrx/content-mapper': patch
'@tsrx/vscode-plugin': patch
---

Support TypeScript 6: the `typescript` peer dependency range of `@tsrx/typescript-plugin` and `@tsrx/language-server` is now `^5.9.3 || ^6.0.0` (the classic path passes its whole test suite on 6.0.3). `@tsrx/content-mapper` declares that range as its own dependency, so a project whose `typescript` is the native TypeScript 7 package (a launcher without a JavaScript API) can still run the mapper. `tsrx-tsc`, the language server and the mapper now stop with an explanation when they resolve a TypeScript 7 package instead of failing on its export map. The mapper documents its minimum TypeScript build (`7.1.0-dev.20260822.1`; the stable 7.0 line has no content-mapper protocol), and the test suite runs against another build through `TSRX_NATIVE_TSC`. The VS Code extension looks the TypeScript 7 extension up under the ids VS Code uses (adding `TypeScriptTeam.native-preview`), tries every installed one for the content-mapper API, and its TypeScript 7 messages now state what the native backend needs, say that TypeScript 7 support is not complete, and link the tracking issue (tsrx-org/tsrx#136) with an "Open Tracking Issue" action.
