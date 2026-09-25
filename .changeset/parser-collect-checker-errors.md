---
'@tsrx/core': patch
---

In `collect` and `loose` mode (the language server, the formatter, and other
editor tooling), the parser now records mistakes that TypeScript's own parser
accepts and reports only from its checker, and keeps parsing, instead of
throwing. It already did this for a redeclared variable. Now it also does it
for a redeclared type alias, `abstract` members in a class that isn't abstract,
initializers in ambient contexts, modifiers out of order, repeated, or used
together where they can't be, accessibility or `abstract` modifiers on private
names, an optional binding pattern parameter, a comma or another parameter
after a rest parameter, a repeated import attribute, `export` of an undefined
name, optional-chaining assignment targets, `import.source(…)`, `new.target`
outside a function, `super` outside a method or a derived class's constructor,
`await` in a namespace, `#x in obj` outside a class, and a `const` without an
initializer. Each is recorded in `errors` with its message, and the file gets
an AST as TypeScript would read it. A compile, which doesn't collect, still
throws for all of them.
