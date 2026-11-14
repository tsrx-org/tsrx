---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

A `pending` block on a plain `try` (not `@try`) is now an error on the React, Preact, Solid, Vue and Hono targets: TS1472 (`'catch' or 'finally' expected.`) at `pending`, where TypeScript reports it. So is a reset parameter after a plain `catch` parameter, `catch (e, reset)`: TS1005 (`')' expected.`) at the comma. Both compiled with no error before, the `pending` block and the reset parameter left out, so a `try` with only a `pending` block compiled to JavaScript that doesn't parse. A collecting or loose compile records the error and keeps the `pending` block's code in a `finally` block, so the editor reports TS1472 at `pending` instead of failing to compile the file, and still checks that code. The parser still reads both for `@tsrx/ripple`, which compiles them.

The Prettier plugin now prints a plain `try`'s `pending` block, which formatting deleted before.
