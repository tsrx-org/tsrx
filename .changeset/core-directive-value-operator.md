---
'@tsrx/core': patch
---

A `/`, `<`, `<=` or `<<` right after a control-flow directive used as a value inside brackets is now read as an operator, as after an element. `(a = @if (c) { … } / 2) => a`, `foo(@for (…) { … } < y)`, `[@switch (k) { … } / 2]`, `{ a: @try { … } @catch (e) { … } / 2 }` and `` `${@if (c) { … } / 2}` `` used to fail with "Unterminated regular expression" or "Unexpected token". Outside brackets nothing changes: a semicolon can be inserted after the directive there, and a `/` or `<` on the next line still starts the next statement, so `const x = @if (c) { … } / 2;` still fails. A `@try … @catch (e)` statement also no longer leaves two entries on the tokenizer's context stack each time.
