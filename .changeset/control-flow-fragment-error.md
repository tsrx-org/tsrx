---
'@tsrx/core': patch
---

The editor reports the fragment error for a `@{ … }` body in which `@for`, `@if`, `@switch` or `@try` is followed by another output node ([#197](https://github.com/tsrx-org/tsrx/issues/197)). Before, the loose compile that the editor tools and `tsrx-tsc` use threw `Not implemented: JSXForExpression` (or `JSXIfExpression`, `JSXSwitchExpression`, `JSXTryExpression`) on React, Preact, Vue and Hono, so the editor showed that message at the top of the file, lost the collected errors, and dropped every TypeScript diagnostic in the file. The control flow's body now keeps its types too.
