---
'@tsrx/core': minor
---

`:root`, `:host`, `:is()`, `:where()`, `:not()` and `:has()` written in another case or with an escape (`:ROOT`, `:r\6f ot`, `:HOST(.open)`, `:IS(.a)`, `:h\61s(.b)`) now compile as the lowercase names do, since CSS reads pseudo-class names that way. The compiler compared the names as written: `:ROOT { --c: red }` compiled to `.<hash>:ROOT`, which `<html>` never matches, `:ROOT.dark .icon` was pruned in a component, and the arguments of `:HAS()` or `:IS()` were neither scoped nor pruned. The parsed selector's `name` is now the lowercase name for these six pseudo-classes; `:global` stays as written.

So that they don't spread to these spellings, three bugs of a `:root` compound are fixed too. An argument of its `:not()` with an `&` (`.wrap { :root:not(&.missing), .icon {} }`), or one of a `:has()` in its `:not()`, `:is()` or `:where()` (`:root:not(:has(.missing)), .icon {}`), that matched nothing was pruned and left the `:not()` or `:has()` empty, which is invalid and lost the whole selector list; it is now kept. And `:root` now matches an `<html>` the component renders, so `:root > body {}` in a document component is no longer pruned.

Migration: a bare `:global` in the argument of one of these pseudo-classes written in another case or with an escape (`:IS(.x:global), .z {}`) is now `TSRX3011`, as it already was in lowercase (`:is(.x:global)`). Its output never matched, since browsers don't know `:global`, but the rest of its list (`.z`) did. Move the `:global` out of the pseudo-class, or drop it, as for the lowercase name.
