---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

A comment right before an empty body or list no longer deletes the comments
inside it. The comments in `class A /* a */ { // b }`, `f(/* a */ [ // b ])`, or
an empty function body, block, interface, namespace, object, array, or type
literal, or an empty template body (`@if (x) /* a */ { // b }`), stay inside it,
as Prettier keeps them. The comments in an empty tuple type (`[ // b ]`) stay
inside its brackets too, instead of moving after the statement.
