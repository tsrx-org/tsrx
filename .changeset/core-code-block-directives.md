---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Read the strings that start a `@{ … }` function body as its directive prologue,
as in a `{ … }` body. The parser now marks them as directives, so Prettier no
longer wraps them in parentheses:

```diff
 function App() @{
-  ('use client');
+  'use client';
   <div>Hello</div>
 }
```

`'use strict'` there with a parameter list that isn't simple is now TS1347, as
it is in a `{ … }` body. A `@{ … }` value and a directive body aren't function
bodies, so a string at their start still gets parentheses, as in a block.
