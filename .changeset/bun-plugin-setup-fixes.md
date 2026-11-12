---
'@tsrx/bun-plugin-react': patch
'@tsrx/bun-plugin-preact': patch
'@tsrx/bun-plugin-solid': patch
'@tsrx/bun-plugin-vue': patch
'@tsrx/bun-plugin-hono': patch
'@tsrx/core': patch
---

Fix four Bun plugin bugs:

- Plugin instances that split `.tsrx` files with `include`/`exclude` now each emit the scoped CSS of the files they compile. Before, the first instance served an empty stylesheet for every file another instance compiled (React, Preact, Solid, Vue).
- Production builds now use the production JSX runtime when the tsconfig selects an automatic JSX setting such as `"jsx": "react-jsx"`, or none. Before, compiled `.tsrx` modules always called `jsxDEV` from the development runtime, which is undefined in React's production build, so components threw when they rendered (React, Preact, Hono). Under the classic `"jsx": "react"`, Bun keeps using the development runtime, as before. The Hono plugin no longer requires `Bun.Transpiler`.
- When `Bun.build()` omits `root`, `tsrx.platform` is read from the tsconfig nearest the entrypoints' common directory, which is Bun's default root, instead of the working directory. When every entrypoint is an in-memory `files` entry, the working directory is still used, as Bun does.
- With `Bun.plugin()`, including `bun:test` preloads, `import.meta.env.platform.*` values in compiled `.tsrx` output are now written in. Before, reading a flag as a value threw `undefined is not an object`.

`@tsrx/core/config` adds `resolveTsconfigJsx()`, which reads the effective `compilerOptions.jsx` of the nearest tsconfig.
