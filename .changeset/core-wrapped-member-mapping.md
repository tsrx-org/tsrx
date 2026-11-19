---
'@tsrx/core': patch
---

In the editor, a member expression or call that starts with a name, `this` or `super` now maps from its own text when other code starts at the same source position and is printed before it. A platform's AST pass that wraps a member expression in a call with the member's location, as Octane does for template reads, made `value.list[0]` map to `read(value.list[0]`, so an editor diagnostic on it started at `read(`. The same happened with the `(` of a parenthesized sequence (`(count.a++, next())`) and with the key function the Solid target makes from a `@for` key. A member expression or call that starts with other code, such as `(a as B).k`, keeps its mapping.
