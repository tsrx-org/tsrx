---
'@tsrx/core': minor
---

`:root`, `:host`, `:is()`, `:where()`, `:not()` and `:has()` written in another case or with an escape (`:ROOT`, `:r\6f ot`, `:HOST(.open)`, `:IS(.a)`, `:h\61s(.b)`) now compile as the lowercase names do, since CSS reads pseudo-class names that way. The compiler compared the names as written: `:ROOT { --c: red }` compiled to `.<hash>:ROOT`, which the page's `<html>` doesn't match (only an `<html>` the component renders gets the hash), `:ROOT.dark .icon` was pruned in a component, and the arguments of `:HAS()` or `:IS()` were neither scoped nor pruned. The parsed selector's `name` is now the lowercase name for these six pseudo-classes; `:global` stays as written.

So that they don't spread to these spellings, bugs of a `:root` compound are fixed too:

- An argument of its `:not()`, `:is()` or `:where()` with an `&` (`.wrap { :root:not(&.missing), .icon {} }`, `.doc { :root:is(&.dark) {} }`), or one of a `:has()` in its `:not()`, `:is()` or `:where()` (`:root:not(:has(.missing)), .icon {}`), that matched nothing was pruned. That left an empty `:not()` or `:has()`, which is invalid (outside a forgiving `:is()` or `:where()` the browser drops the whole selector list with it), or, in an `:is()`, dropped a state of the root the page may set (`<html class="doc dark">`). It is now kept, scoped, as an assigned block keeps it.
- `:root` never matched an element the component renders. It now matches an `<html>` (`html:root` too, not `div:root`), so `:root > body {}` and `:root:has(> body) {}` in a document component are no longer pruned.

Migration: the `:global` placement errors (`TSRX3011`) these pseudo-classes give in lowercase now apply to the other spellings too: a bare `:global` in an argument (`:IS(.x:global), .z {}`), a `:global(...)` in the middle of an argument's selector (`:IS(.a :global(.b) .c), .z {}`), or a `:global(...)` selector list in one (`:IS(.a:global(.b, .c)), .z {}`). That argument never matched, since browsers don't know `:global`, but the rest of its list (`.z`) did. Move the `:global` out of the pseudo-class, or drop it, as for the lowercase name.
