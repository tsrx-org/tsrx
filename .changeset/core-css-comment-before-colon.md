---
'@tsrx/core': patch
---

A comment between a declaration's name and its colon is now read as nothing, as CSS reads it. `animation /* c */ :spin 1s` and `animation/**/: spin 1s` left `spin` without the scope hash, so the animation named keyframes that don't exist, where `animation: spin 1s` gets the hash. With the comment right after the name, a component also dropped such a rule when no element matched it, where it keeps one with `animation: spin 1s`. The parser read such a comment into the declaration's `value` (`/* c */ :spin 1s`), or into its `property` when it came right after the name (`animation/**/`); both now hold what CSS reads (`animation`, `spin 1s`). A declaration with no colon is read as before.
