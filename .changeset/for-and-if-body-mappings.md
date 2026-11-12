---
'@tsrx/core': patch
---

Two editor mapping fixes in `.tsrx` files (#1210):

- `tsrx-tsc` and the TypeScript 5.9 plugin reported unreachable code inside a `for (;;)` body 3 columns late, or 7 when the body is on one line, because the whole loop mapped by offset and the printer writes `for (; ; )` and a blank line after `return;`. A `for…of` or `for…in` body was 1 column late, or 5 on one line. These loops now map only their start and end, so an error inside one lands where it is written, and an unreachable loop is still reported.
- On TypeScript 7, hover returned nothing on the names in a braceless `if` or `else` body, such as `c` and `b` in `if (c) c = b`. The `{` and `}` mappings meant for a block body were also added on the body's first and last characters, and replaced the names' own mappings. They are now added only for a block body.
