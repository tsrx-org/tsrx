---
'@tsrx/prettier-plugin': patch
---

Class headings format like Prettier in two more cases:

- An element or fragment used as a superclass keeps its parentheses
  (`class A extends (<div />) {}`), which TypeScript needs to read it, and one
  that breaks starts on a line of its own inside them.
- A line comment between a superclass and type arguments on the next line
  (`class A extends B // c` then `<T> {}`) prints after an empty class
  (`class A extends B<T> {} // c`) instead of moving into its body. One on a
  line of its own before the type arguments prints where Prettier settles in
  one pass: after an empty class, at the start of a nonempty body, or before
  `implements`.
