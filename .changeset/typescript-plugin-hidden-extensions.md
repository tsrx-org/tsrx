---
'@tsrx/typescript-plugin': patch
---

Resolve extensionless `.tsrx` imports, including `moduleSuffixes` variants (`./Card` → `Card.tsrx` / `Card.web.tsrx`), through Volar's `resolveHiddenExtensions` mapping. TypeScript only probes `.ts`/`.tsx`/`.d.ts`/`.js` for bare specifiers, so `.tsrx` leaves previously required explicit specifiers in type-checking lanes even though bundlers resolved them.
