---
'@tsrx/core': patch
'@tsrx/hono': patch
'@tsrx/solid': patch
'@tsrx/vue': patch
---

The compiler now imports the components it generates for `@try … @pending`, `@try … @catch` and keyed fragment rows under private names (`__Suspense`, `__TsrxErrorBoundary`, `__Fragment`). A module can declare its own `Suspense`, `TsrxErrorBoundary` or `Fragment` (a type-only import, an import from another module, a local, or a `@for` loop variable) without the build failing with "Identifier `Suspense` has already been declared", and the generated element no longer renders the authored binding in its place. Vue's generated `Suspense` uses the private name too, so an authored `import { type Suspense } from 'vue'` no longer leaves it unbound.

Imports the compiler adds now go after the module's directive prologue, so a `'use client'` or `'use server'` directive stays first in a module that uses `@pending`, `@catch`, a keyed fragment row or any other construct that needs a generated import. Before, the generated imports went above it and turned it into a plain string, which Next.js treated as a server component.
