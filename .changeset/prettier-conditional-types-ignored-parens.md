---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

The formatter now lays out conditional type chains, parentheses around `prettier-ignore` nodes, and comments in type lists like Prettier:

- A chain of nested conditional types breaks as one group, like a chain of ternaries: when the outer conditional breaks, every conditional in its branches breaks too, and a conditional used as the check or extends type breaks inside its parentheses.
- A node kept by `prettier-ignore` prints in the parentheses it needs where it is, not the ones it was written with: `foo(/* prettier-ignore */ (a  +  b))` prints as `foo(/* prettier-ignore */ a  +  b)`, while `(a,  b)` as an argument keeps them.
- An own-line `prettier-ignore` comment before a union written in parentheses keeps only the union's first member as written, as it does for a union without parentheses.
- A comment after a comma in type arguments, type parameters, or a tuple type stays after the comma: `Foo<A, /* note */ B>` no longer prints as `Foo<A /* note */, B>`.
