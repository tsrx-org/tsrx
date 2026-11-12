---
'@tsrx/core': patch
---

A target that sets `requireUseServerForAwait` without an `await` validator of its own now allows a top-level `await` in a TSRX function when the module has a `"use server"` directive, as TSRX2025's message says. Without the directive, TSRX2025 is still reported. Before, it was reported with or without the directive. Only a real directive counts: a `'use server'` after an import, or a parenthesized one, doesn't. A target's `validateComponentAwait` hook now gets whether the module has the directive as its `moduleUsesServerDirective` argument, which was always `false`, unless the target sets `scanUseServerDirectiveForAwaitWithCustomValidator: false`. No bundled target is affected: Solid and Vue set that flag, and Solid, Vue and Hono DOM report their own TSRX2021 first.
