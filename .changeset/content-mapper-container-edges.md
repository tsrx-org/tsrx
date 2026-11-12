---
'@tsrx/content-mapper': patch
---

On TypeScript 7, an error that TypeScript reports over a whole construct whose printed text differs from the source now starts where the construct does. For example, TS1340 on `import(  './store.ts'  )` (with spaces inside the parentheses) was reported two columns early, on the `=`. Before, the mapper dropped a container span that encloses token spans, so the start of the construct was unmapped. Now the container keeps its uncovered edges, before its first token and after its last, as spans that place diagnostics and carry no editor features. Inside an edge, text that matches the source maps one-to-one, so an error on a node that has no span of its own, such as the `{}` in `Record< {}, 1 >` or the `[]` in `f( [] )`, lands where `tsc` reports it in a `.ts` file.
