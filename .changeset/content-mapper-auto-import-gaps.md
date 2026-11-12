---
'@tsrx/content-mapper': patch
---

On TypeScript 7, auto-import completions are offered in more places in `.tsrx` files. TypeScript 7 offered none at the end of a name when the text after it was unmapped up to the next mapped token, as for `helperB` in `<p>{helperB()}<Button label="x" /></p>` ([#1028](https://github.com/tsrx-org/tsrx/issues/1028)) or `const m = useMem;` in a template body ([#1064](https://github.com/tsrx-org/tsrx/issues/1064)). Text that is the same in the source and in the generated code now always maps, without language features of its own. A name directly followed by text that the generated code adds, such as the `;` after `const m = useMem` when the source has none, still gets no auto-import on TypeScript 7.
