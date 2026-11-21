---
'@tsrx/solid': patch
'@tsrx/core': patch
---

On Solid, an `@case` test that the `@switch` value can never equal is now reported on the test in the editor, as on the other targets. Solid compares a copy of the value with each test (`<Match when={value === test}>`), and TypeScript reports TS2367 on the whole comparison, which had no mapping of its own: the error covered everything from the `@switch` value to the test, often several lines. The editor output now writes each copy in parentheses and maps the comparison to its test, under the classic language server and under TypeScript 7. The build output doesn't change.
