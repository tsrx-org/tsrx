---
'@tsrx/content-mapper': patch
---

Under TypeScript 7, a name the compiler maps twice over the same text, once for diagnostics only, keeps its hover, Go to Definition, Find References, rename and completion. The content mapper kept the first of two such mappings, and when the diagnostics-only one came first the name lost every feature: `item` in a Vue `@for` body such as `{item.label}`, a Solid `@for` index used as the key (`key i`), a return type such as `T` in `function identity<T>(x: T): T`, and `name` in `<{registry[name]} />`. A mapping without features no longer takes the place of one with features over the same ranges.
