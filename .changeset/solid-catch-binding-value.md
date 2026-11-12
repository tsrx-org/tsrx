---
'@tsrx/solid': minor
---

**Breaking (Solid target):** the `@catch` binding is now the thrown value, as on
every other target, instead of Solid's error accessor. Code written for the old
shape must drop the call: `@catch (err) { <p>{err().message}</p> }` becomes
`@catch (err) { <p>{err.message}</p> }`. Because the binding is the value itself,
`err()` now calls the thrown value instead of reading it. Destructuring patterns
such as `@catch ({ message })` now bind the thrown value's properties, and the
`@catch` body can reassign its binding. The binding is typed `unknown`, so check
it before reading `message`.
