---
'@tsrx/core': minor
---

A type selector or `*` that doesn't start its compound selector, as in `[x]div`, `.wrap*`, `&div` or `.wrap/**/div` (a comment with no whitespace around it is no combinator), is now a CSS syntax error (`TSRX3013`) at the type selector. CSS reads no rule with such a selector, and browsers drop it (in a forgiving `:is()` or `:where()` list, just that selector). The output was invalid CSS for a type name (`[x]div.<hash>`), and for `*` it styled the rest of the compound: `.wrap*` gave `.wrap.<hash>`. CSS Nesting also wants the type selector before an `&` (`div&`); `&div` passed through as written, which Chromium drops and a build that lowers nesting with lightningcss turned into `div.wrap`. A type selector can still follow a bare `:global` (`:global*`) or a `:global(...)` (`:global(.x)div`, which the output writes as `.x:is(div)`). The arguments of a pseudo-element (`::part(a b)`) and of other pseudo-classes (`:lang()`, `:nth-child()` up to an `:is()` or the like in it) are read as before.

Migration: put the type selector first (`[x]div` becomes `div[x]`, `&div` becomes `div&`), and drop a `*` that follows other selectors (`.wrap*` becomes `.wrap`), or put a space before it if the rule was meant for the descendants (`.wrap *`).
