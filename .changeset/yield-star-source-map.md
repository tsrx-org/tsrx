---
'@tsrx/core': patch
---

The source map of a delegating `yield` written with a space or a comment before its `*` (`yield * items`, `yield /* c */ * items`) maps the printed `*` from the source `*` and what follows from after it. esrap prints `yield*` as one token and mapped its end to the keyword's start plus six, which in these spellings is the space or the comment, so a debugger or a stack trace that read a position after `yield*` landed before the `*`. `yield*` written without a gap maps as before, and the editor's mappings don't change.
