---
'@tsrx/solid': patch
---

Report TSRX2034 (and TSRX2021 for an `await`) in a hydratable server build (`ssr: true`) for a `textContent` `yield` beside a call babel-preset-solid doesn't fold, such as `Math.toString()`, `Number.hasOwnProperty('x')` or `'a'.missing()`. The check counted every `Math`, `Number` or `String` method but `random`, and every method of a string or number literal, as one babel might fold into the template, so it didn't group the `yield` with that value; babel's `evaluate` calls only an own property of those globals and only a method the literal has, so babel-preset-solid groups them, the `yield` moves into an arrow, and the server build failed in Vite's transform instead.
