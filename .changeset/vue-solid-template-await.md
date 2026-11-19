---
'@tsrx/core': patch
'@tsrx/vue': patch
'@tsrx/solid': patch
---

On Vue and Solid, an `await` in a plain async function's JSX that the target's JSX compiler would move into an effect, a getter or a callback is now reported as TSRX2021 at the authored `await`, with its own message ("does not support `await` in this part of the template … Await the value before the template"), instead of compiling to output the build rejects with `` `await` is only allowed within async functions `` (#1370). The check works like the TSRX2034 check for a `yield` (#259): it reads TSRX's final output as that compiler does. It covers a `@{ … }` template, plain JSX such as `const el = <p>{await t}</p>;`, and JSX at the module's top level. On Vue, that is any `await` in an element or fragment: `<p>{await load()}</p>`, an attribute value, an `@if`, `@switch` or `@for` body inside an element, and a nested `@for` whose inner loop awaits. An awaiting `@for` that is the template's only output still compiles, since TSRX awaits `map_iterable_async` in the function itself. On Solid, babel-preset-solid compiles an `await` as it compiles a `yield`, so the same values are reported: `<p>{await load()}</p>` is, `<p>{await text}</p>` stays in place and still compiles, and a server build (`ssr: true`) also follows the SSR output. On Vue, a host spread that awaits is now evaluated before the element, as one that yields is (#1108), so `<input {...(await attrs)} />` compiles and builds.

Solid's check now also counts TSRX's generated control-flow components (`__Show`, `__Switch`/`__Match`, `__ErrorBoundary`, `__Loading`) as components, as babel-preset-solid does for a tag that doesn't start with a letter. A static value in an `@if`, `@switch`, `@try` or `@pending` body, such as `@if (c) { <p>{yield t}</p> }`, is passed to that component in a getter, so TSRX2034 now reports the `yield` there, and TSRX2021 the `await`, where the build failed before. A static value of a control-flow component in a fragment, such as `<>@if (yield t) { <p>a</p> }</>`, stays in place and is no longer reported.

Setup statements before the output, nested async functions, and React, Preact and Hono output are unchanged.
