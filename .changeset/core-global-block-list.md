---
'@tsrx/core': patch
---

Fix two ways a bare `:global` (no parentheses, as in `:global .note` or a nested `:global.open`) compiled to the wrong CSS.

A selector list with a selector that starts with a bare `:global` beside one that needs scoping is now the `TSRX3011` error. Such a selector leaves its whole rule unscoped, so the other selectors lost their hash (`:global .w, .z` compiled to `.w, .z`), or the rule was read as a `:global { ... }` block and its selector dropped, putting its declarations in the parent rule (`.p { .z, :global.w { color: red; } }` turned `.p` red). A lone `:global` in a list of several is the same error. A list compiles as before when its other selectors, and the rules nested in it, would get no hash on their own anyway (`:global.w, :global(.a)`, `.p { :global .a, &.b { ... } }`), and `:global(.a), :global.w` now compiles to `.a, .w` instead of being read as a `:global { ... }` block.

A `:global` modifier whose only parent rule is a `:global { ... }` block no longer gets an `&`: `:global { :global.w { ... } }` compiles to `.w { ... }`, where it gave a top-level `&.w`, which matches the root element.
