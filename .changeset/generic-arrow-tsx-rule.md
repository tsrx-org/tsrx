---
'@tsrx/core': minor
'@tsrx/react': minor
'@tsrx/preact': minor
'@tsrx/solid': minor
'@tsrx/vue': minor
'@tsrx/hono': minor
---

In a `.tsrx` file, and any other file with JSX, a `<` where an expression starts begins a generic arrow function only where TypeScript's rule for `.tsx` files says it does (#183): a type parameter followed by a comma, a default, or a constraint. A lone type parameter without one is now a tag, as in TSX, so `<T>(x) => x` no longer compiles or formats, and neither does `async <T>(x) => x`, which TypeScript reads as a call. To migrate, add the trailing comma: `<T>(x) => x` becomes `<T,>(x) => x`, `async <T>(x) => x` becomes `async <T,>(x) => x`, and `<const T>` becomes `<const T,>`. The errors for the old forms, an unclosed `<T>` tag and TS7060, now say to add it.

The rule reads no further than the type parameter, so a generic arrow with a constraint compiles whatever its parameters hold (comments, regular expressions, template literals), and an element whose text starts like an arrow function, such as `<b>(i) => i</b>` or `<script>(i) => i</script>`, is read as an element (#734). A template's render node or child is a tag wherever it starts, as before.

A `.ts`, `.mts`, or `.cts` file has no JSX, as in TypeScript: `<T>(x) => x` stays a generic arrow function there, and `<T>x` is now read as a type assertion instead of a tag (TS7059 in a `.mts` or `.cts` file).
