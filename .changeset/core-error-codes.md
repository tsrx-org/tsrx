---
'@tsrx/core': minor
'@tsrx/solid': patch
'@tsrx/mcp': patch
---

Give every error `@tsrx/core` reports a code (#843):

- A mistake TypeScript also reports has TypeScript's code, such as `TS1005` for `'}' expected.` or `TS2300` for a redeclared name, so an editor shows the code TypeScript would. This includes acorn's and acorn-typescript's errors.
- A mistake only TSRX reports has a `TSRX` code: `TSRX1xxx` for markup, `TSRX2xxx` for template rules, `TSRX3xxx` for style blocks and CSS, and `TSRX4xxx` for everything else. They replace the `tsrx-*` strings, and every code is listed in the specification's new appendix B.
- `DIAGNOSTIC_CODES` keeps its names with the new values. `JSX_EXPRESSION_VALUE` is removed, since no error used it.
- An import or export inside a block is reported with TypeScript's error for its kind instead of acorn's `'import' and 'export' may only appear at the top level`: TS1232 for an import, TS1233 for `export { … }` or `export *`, TS1258 for `export default` of an expression, TS1231 for `export =`, TS1316 for `export as namespace`, TS1235 for a namespace, and TS1184 (`Modifiers cannot appear here.`) otherwise.
- `using` and `await using` in a `for…in` head are reported with TypeScript's messages, TS1493 and TS1494.

`@tsrx/solid` gives its two `try` errors their codes, and `@tsrx/mcp` reports the new codes, also for a target that still reports a `tsrx-*` code.
