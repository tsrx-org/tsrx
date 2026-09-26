---
'@tsrx/prettier-plugin': patch
'@tsrx/core': patch
---

Comments in the parentheses around a type print where Prettier puts them:

- A comment at the start of the parentheses around the type an intersection, an array or indexed access type, or a conditional type starts with, or after an intersection's leading `&`, prints Prettier's stable layout in one pass: `type S = (// ref` / `Foo<T>) & X;` breaks after the `=` with the comment above `Foo<T> & X`. The comment printed after the `=` with the type at the start of the next line, and the next format moved it.
- A union member of a union or an intersection prints its comments outside its parentheses, like Prettier: `X & /* c */ (B | C)` keeps the comment before the `(`.
- The comment attachment in `@tsrx/core` looks through a type's parentheses, which Prettier's parsers don't keep: a comment on its own line after the `(` of a union's member trails the member before, one that ends the line after the `(` trails the type before the parentheses (`X & // c` / `(B | C)`), one on its own line before the `)` leads the type after them, one that ends its line after a union in parentheses in an intersection, a union, or an array type trails the union's last member, and one after the `(` around a type parameter's constraint or default, or a mapped type's `in` type, stays after the keyword. These stayed in the parentheses, and some moved on the next format.
- A line comment after an intersection's `&` stays after it, where it moved to its own line with the next type below it.
- A line comment that ends the line after the `(` around an array or indexed access type, in an intersection with an object type, prints at the end of that line: `{ a: 1 } & (// c` / `A)[]` becomes `{ a: 1 } & A[]; // c`. It broke after the `&`, with the comment above the array. After any other type it stays above the array, where the intersection already breaks.
