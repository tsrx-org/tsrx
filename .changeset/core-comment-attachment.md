---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

The parser attaches three kinds of comments where Prettier does, so the
formatter no longer moves or deletes them:

- The function of a generic method, getter, or setter in an object literal
  (`{ m<T>() {} }`) now starts at its type parameters, as in typescript-estree,
  instead of at its `(`. A comment in the type parameters
  (`m</* c */ T>() {}`) stays there instead of moving after the name, or being
  deleted when it is a line comment on its own line.
- A comment on its own line before the `;` that ends a file with no line break
  after it (`const x = 1` / `// c` / `;`) now trails the statement, as it does
  when a line break follows, instead of being deleted.
- A comment in a spread attribute's braces before its argument
  (`{.../* note */ b}`) now leads the argument, and prints before the `...`,
  instead of moving after the attribute or to the next attribute. A
  `prettier-ignore` there no longer prints twice.

The formatter also prints the comments that lead an object method's function,
like the one in `"m" /* c */ () {}`, right after the key, like Prettier,
instead of deleting them. A comment before the type parameters
(`m /* c */ <T>() {}`) now leads the function too and prints the same way.
