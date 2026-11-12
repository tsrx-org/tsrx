---
'@tsrx/core': patch
---

A block `@ts-expect-error` or `@ts-ignore` comment whose last line starts with `*`, such as `/*` followed by ` * @ts-expect-error */`, now applies in `tsrx-tsc` and the editor, as it does in TypeScript. Before, the type view dropped it, so the error it suppresses was reported.
