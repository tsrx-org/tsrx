---
'@tsrx/core': patch
'@tsrx/react': patch
'@tsrx/preact': patch
'@tsrx/solid': patch
'@tsrx/vue': patch
'@tsrx/hono': patch
---

Keep compiler-added imports after a leading `'use client'` or `'use server'` directive, so the directive still applies.
