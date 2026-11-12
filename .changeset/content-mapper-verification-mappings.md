---
'@tsrx/content-mapper': patch
---

New opt-in mapper option, `verificationMappings` (off by default), for command-line checkers (#1081). With `true`, each transform result also has `verificationMappings`: every compiler mapping marked for diagnostics, in Volar's `CodeMapping` shape and in the transform's order. A checker that runs TypeScript on the generated text can map each diagnostic back with `@volar/source-map`'s `toSourceRange`, exactly as `tsrx-tsc` does, through `@tsrx/content-mapper/mapper` alone. `mappings` and everything TypeScript 7 reads are unchanged, with or without the option.
