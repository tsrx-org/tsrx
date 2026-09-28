---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Read a rest element's default in a destructuring pattern, as TypeScript's parser does, and report TypeScript's TS1186 `A rest element cannot have an initializer.` at its `=` (#770). `const [...a = 1] = b`, `const { ...a = 1 } = b` and `function f([...a = 1]) {}` failed with `Unexpected token`, and `[...a = 1] = b` with `Rest elements cannot have a default value`, in every mode. Now the editor gets the file's tree with the error, and a compile still fails, with TS1186. The formatter refuses to format such a file, since the tree leaves the default out.
