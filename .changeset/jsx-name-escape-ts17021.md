---
'@tsrx/core': minor
'@tsrx/prettier-plugin': patch
'@tsrx/content-mapper': patch
---

A JSX name written with a Unicode escape is now reported as TS17021, "Unicode escape sequence cannot appear here.", as TypeScript reports it in a `.tsx` file: on the tag name (`<Inn\u0065r />`, `</Inn\u0065r>`), on the part of a member or namespaced name that has the escape (`<ns.Inn\u0065r />`, `x:t\u0069tle`), and on an attribute name (`data-\u0061`, `\u0074itle`). A build throws it. The editor and other collecting compiles report it, once per name, and still read the name as the one the escapes spell, so its hover, definition, rename, diagnostics and closing tag keep working. Under TypeScript 7 the error hides TypeScript's own errors on the name only, not in the rest of the element. Prettier's `typescript` parser rejects such a name too, and so does the formatter now, rather than rewriting it.

In 0.8.1 a name with an escape after its first character compiled to broken output (`<Inn\u0065r n={3} />` to `<Inn er n={3} />`, `data-\u0061="1"` to two attributes) or didn't parse, but a name that starts with one compiled and worked (`<b \u0074itle="t" />` gave `title="t"`), and now fails to compile.

Migration: write the name without the escape: `\u0074itle` becomes `title`, and `Inn\u0065r` becomes `Inner`.
