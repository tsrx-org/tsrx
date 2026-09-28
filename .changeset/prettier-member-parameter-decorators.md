---
'@tsrx/core': patch
---

Keep comments around class-member and parameter decorators on the correct AST
nodes:

- Comments between a decorator and a member's modifiers trail the decorator.
  Comments between the modifiers and the member name lead the key.
- Comments after a parameter decorator trail that decorator, including on a
  parameter property, rather than leading the whole parameter.
- Comments inside decorator arguments stay on their arguments.
- Comments between a parameter property's modifiers and its name lead the
  parameter inside the property.
