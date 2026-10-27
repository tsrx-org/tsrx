---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

More parse errors now have the code and position TypeScript reports for the same source, instead of the code TSRX read from acorn's message:

- A missing `;` after a statement (`x = 1 2;`, `import "m" x;`) is TS1005 `';' expected.`, and `',' expected.` after a variable declaration's declarator, instead of TS1012 `Unexpected token`. After a lone name (`a b;`) it's TS1434 `Unexpected keyword or identifier.` at the name, or TS1435 with the keyword TypeScript takes it for (`cosnt x = 1;`, `constructr x;`). A modifier that starts no statement (`accessor x;`, `readonly x;`) is TS1128 `Declaration or statement expected.`
- `import` after `new` (`new import.meta`) is TS1109 `Expression expected.`
- A `let`, `const` or `using` declaration after `if (…)` or a loop head (`if (a) let x = 1;`) is TS1156, which collecting parses record.
- A word reserved in strict mode used as a name (`let`, `interface`, `public`, `static`, `yield`, …) is TS1214, or TS1213 inside a class, instead of TS1212. Collecting parses (the editor and the formatter) now record it and keep parsing for every such word, not only `let`, so the formatter formats `class public {}` as Prettier does. A `let` or `const` declaration named `let` also reports TS2480, but not a function named `let`. In an ambient context (`declare const public: number;`), or as the name an export specifier exports (`export { public }`), there's no error, as in TypeScript, and a parameter property modifier on a function's parameter in an ambient context (`declare function f(private x: number): void;`) is TS2369 at the modifier, in a strict compile too.
- A parameter after a rest parameter is TS1014 at the `...`, and an element after a rest element of a destructuring pattern TS2462 (at the name in an arrow function's parameters, and at each such rest element), instead of TS1013 at the comma. TS1013 stays for a trailing comma.
- A call of `import.<name>` (`import.foo()`) is TS18061, naming the property without its escapes; without a call it stays TS17012. The formatter refuses both, as Prettier does.
- Type arguments after `?.` with no call (`` a?.<T>`c` ``) report TS1358 or TS1005 `'(' expected.` at the token after them, or TS1003 `Identifier expected.` at the `<` where TypeScript reads no type arguments (`a?.<T>[0]`), where the error said `Unexpected token (1:NaN)`.
