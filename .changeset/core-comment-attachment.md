---
'@tsrx/core': patch
---

The parser attaches three kinds of comments where Prettier does:

- The function of a generic method, getter, or setter in an object literal
  (`{ m<T>() {} }`) now starts at its type parameters, as in typescript-estree,
  instead of at its `(`. A comment in the type parameters
  (`m</* c */ T>() {}`) stays there instead of moving after the name, or being
  deleted when it is a line comment on its own line.
- A comment on its own line before the `;` that ends a file with no line break
  after it (`const x = 1` / `// c` / `;`) now trails the statement, as it does
  when a line break follows, instead of being deleted.
- A comment in a spread attribute's braces before its argument
  (`{.../* note */ b}`) now leads the argument instead of attaching after the
  attribute or to the next attribute.

A comment before an object method's type parameters now leads its function node.
