---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Comments around a superclass's type arguments format where Prettier settles, in
one pass:

- A comment after the type arguments that ends its line, before `implements`,
  now dangles on the class, as in Prettier, instead of trailing the type
  arguments. It prints on a line of its own before `implements`
  (`extends B<T>` / `// c` / `implements C {}`) instead of at the end of the
  `extends` line, and so does a line comment after the superclass
  (`class A extends B // c` then `<T> implements C {}`). A second line comment
  no longer joins the first (`// d // c`), and a block comment after the type
  arguments moves there once the heading breaks.
- A block comment on a line of its own before the type arguments
  (`class A extends B` / `/* c */` / `<T> {}`) prints after them
  (`class A extends B<T> /* c */ {}`) instead of ending the superclass's line,
  which the next format changed.
