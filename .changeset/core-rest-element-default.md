---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Read the default of a rest element or rest parameter, as TypeScript's parser does, and keep it in the tree (#770, #726):

- `const [...a = 1] = b`, `const { ...a = 1 } = b` and `[...a = 1] = b` failed to parse in every mode. When collecting, TypeScript's TS1186 `A rest element cannot have an initializer.` is now recorded at the `=`, and a compile throws it.
- A rest parameter's default (`function f(...a: number[] = []) {}`, TS1048) was left out of the tree, so the formatter and the editor's virtual code dropped it. It's now kept.
- In both cases the rest element's argument is an `AssignmentPattern` (for a rest parameter, with its `?` and type annotation on the target, as for a parameter with a default), so the formatter prints the default as written.

A property after an object binding pattern's rest element (`const { ...a, b } = c`) threw in every mode. When collecting, it's now recorded at the comma, as for an array binding pattern, and the formatter formats it as Prettier does (#771).
