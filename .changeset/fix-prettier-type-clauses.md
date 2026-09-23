---
'@tsrx/prettier-plugin': patch
---

Keep type arguments on `typeof` type queries (`typeof identity<string>`) and
`import()` types, print polymorphic `this` types instead of an
`Unknown: TSThisType` comment, and keep superclass type arguments and
`implements` clauses on classes when formatting TSRX files.
