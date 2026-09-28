---
'@tsrx/core': patch
'@tsrx/solid': patch
'@tsrx/vue': patch
'@tsrx/hono': patch
'@tsrx/prettier-plugin': patch
---

Define each error message `@tsrx/core` reports once, with its code (#947). The messages and codes don't change.

- `@tsrx/core` exports the errors it reports as `TSRX_ERRORS`, for TSRX's own codes, and `TS_ERRORS`, for mistakes TypeScript also reports. An entry is `{ code, message }`, or, when its message takes values, a function of them that gives one, with the `code` too: `TS_ERRORS.MODIFIER_MUST_PRECEDE('export', 'abstract')`.
- `error()` also takes an entry in place of a message and code.
- The parser, the analysis and the transform give each error its code where they raise it, instead of looking it up by its message. Only acorn's and acorn-typescript's own messages are still looked up.
- The `TSRX_*_ERROR` message exports are the messages of the matching entries.

`@tsrx/solid`, `@tsrx/vue` and `@tsrx/hono` pass their own errors' codes where they raise them, and `@tsrx/prettier-plugin` finds a modifier before `export` by its position instead of its message.
