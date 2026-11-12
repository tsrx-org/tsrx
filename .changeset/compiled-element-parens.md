---
'@tsrx/core': patch
---

Keep the parentheses around an element or fragment in compiled output wherever TSX needs them. That covers the object of a member access, call, index, tagged template, non-null assertion or instantiation expression (`(<b />)<T>`), a `new` callee, a superclass, and the end of the left operand of `<`. `return (<b>ok</b>).type === x ? 1 : 2;` compiled to `return <b>ok</b>.type === x ? 1 : 2;`, which TypeScript reads as `return <b>ok</b>;` followed by a separate statement (#1166). `class A extends (<div />) {}` compiled to `class A extends <div /> {}`, which TypeScript doesn't parse (#745). `(<b />) < x` compiled to `<b /> < x`, where TypeScript reads the `<` as the start of another element. The editor output already kept them.
