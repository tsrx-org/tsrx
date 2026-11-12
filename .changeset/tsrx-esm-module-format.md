---
'@tsrx/typescript-plugin': patch
'@tsrx/language-server': patch
---

Under `"module": "node16"` or `"nodenext"`, `.tsrx` files now take their module format from the nearest `package.json`, as `.ts` files do. Before, `tsrx-tsc`, the tsserver plugin and the language server treated every `.tsrx` file as CommonJS, so `import.meta` reported `TS1470` ("The 'import.meta' meta-property is not allowed in files which will build into CommonJS output") even in a `"type": "module"` package. A `.tsrx` file in a `"type": "commonjs"` package still reports it. TypeScript 7 (`@tsrx/content-mapper`) already did this.
