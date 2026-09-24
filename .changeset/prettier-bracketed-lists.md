---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

More bracketed lists now break the way Prettier breaks them.

- The parameters of class methods (including constructors, accessors, abstract
  and overload signatures, and methods in a `declare class`), interface and
  type literal method signatures, call and construct signatures, and function
  and constructor types break one per line when they don't fit, like the
  parameters of functions and arrows already did. A constructor with a
  parameter property (`private readonly a: string`) and more than one
  parameter always breaks, as in Prettier.
- A lone simple type argument (`Promise<void>`, `useState<SomeType>`, a keyword
  type, or an object type) stays against its brackets instead of breaking
  onto its own line.
- Array destructuring patterns and tuple types break one element per line, like
  array literals. A rest element at the end of a pattern gets no trailing comma.
- An object stays expanded only when the source has a line break between its
  `{` and its first property, as with Prettier's default
  `objectWrap: "preserve"`. An object whose first property is on the `{` line
  collapses when it fits, and `objectWrap: "collapse"` is now supported. The
  same rule applies to type literals, mapped types, and import attributes.
  An object pattern that destructures a nested pattern breaks, except in a
  parameter list.
- Object patterns, type literals, mapped types, and import attributes follow
  `bracketSpacing`.
- Mapped types break like Prettier's, keep `+readonly` and `+?`, and keep a
  comment written after their `{`, which used to be deleted.
- A comment inside an empty array or object stays inside its brackets: a block
  comment stays inline (`[/* none */]`), a line comment breaks the literal. The
  parser now keeps these comments as inner comments of the empty literal.
- Import attributes keep the `assert` keyword and an empty `with {}`, break like
  an object when they don't fit, and never break a lone `type` attribute.
- An element written on one line whose children mix text and expressions now
  takes its final layout on the first pass. It used to break only the attributes
  first, then move the children onto their own lines on the next pass.
