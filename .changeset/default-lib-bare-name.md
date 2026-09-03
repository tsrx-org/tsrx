---
'@tsrx/typescript-plugin': patch
'@tsrx/language-server': patch
---

Fix the language server dropping the ES standard library when a project's `tsconfig.json` omits `lib`. The default lib entry was built from `CompilerHost#getDefaultLibFileName`, which returns an absolute path (then lower-cased), so TypeScript could not load `lib.esnext.full.d.ts` and globals such as `Array`, `Promise`, `Function`, `Exclude`, and `Pick` went missing — surfacing as bogus `unknown` inference and JSX attribute errors in `.tsrx` files. The entry is now the bare lib name from `ts.getDefaultLibFileName`.
