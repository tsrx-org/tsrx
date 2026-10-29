---
'@tsrx/core': patch
---

On Solid, Vue and Hono DOM, whose components can't be async, an `await` anywhere in a component body is now reported as TSRX2021. Before, an `await` in an attribute of the component's root element, in an `if` test, in a `switch` discriminant or case test, or in a `catch` parameter default, and an `await using` declaration, compiled to an async component with no error. On Hono DOM, a module that also renders the component got no error in the editor either. The errors for a component now come in source order, so strict mode throws at the first `await`. `findFirstTopLevelAwait` now also returns an `await using` declaration.

On React, Preact and Hono server, which accept async components, an `await using` in an `@for` body, or in an `@if` or `@switch` body with setup statements, now makes the generated callback async, as an `await` there does. Before, the callback stayed synchronous and TypeScript reported TS2852 on the output. In an `@catch` body, whose callback the target calls itself, it is now reported as TSRX2021, as an `await` there is. Their output is otherwise unchanged.
