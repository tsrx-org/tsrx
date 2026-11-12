---
'@tsrx/core': patch
---

A `static` class index signature stays static in the build output, the editor output and the declarations `tsrx-tsc` emits (#1253). esrap, which prints the output, writes `readonly` before an index signature but not `static`. So `class Store { static [key: string]: number }` became an instance signature. Two static signatures were then reported as duplicates (TS2374), `new Store()['y']` type-checked, and the emitted declaration gave consumers an instance signature.
