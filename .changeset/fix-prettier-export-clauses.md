---
'@tsrx/prettier-plugin': patch
---

Keep export clauses intact when formatting TSRX files. `export {};` was printed
as a bare `export`, which failed to parse at the end of a file and otherwise
exported the next declaration. Empty re-exports (`export {} from "x";`) now keep
their source, `export * from` and `export * as ns from` no longer become an
`Unknown:` comment, re-exports keep their import attributes
(`with { type: "json" }`), and string module export names such as
`export { "a-b" as ab }` are no longer printed as `undefined`.
