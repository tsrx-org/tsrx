# TSRX in Storybook

These runnable consumer projects use ordinary `.stories.ts` or `.stories.tsx`
files to import native `.tsrx` components. Each project keeps its target compiler
in `vite.config.ts` and uses an existing Storybook framework. The examples live in
this repository; no Storybook repository changes or new published preset are
required.

## Run

From the TSRX repository root, using the repository's Node and pnpm versions:

```sh
pnpm install --frozen-lockfile
pnpm --filter @tsrx/storybook-examples dev:react
pnpm --filter @tsrx/storybook-examples build:react
```

Replace `react` with `preact`, `solid`, `vue`, `hono`, or `ripple` for the other
`dev:<target>` and `build:<target>` scripts. Each static build writes to its
target directory's `dist/`.

```sh
pnpm --filter @tsrx/storybook-examples typecheck
pnpm --filter @tsrx/storybook-examples exec playwright install chromium
pnpm --filter @tsrx/storybook-examples test
```

The browser checks exercise the native components through Storybook's canvas and
Controls, including local state, template control flow, scoped styles, and cleanup
when switching stories.

## Choose a target

| Example            | Storybook framework      | Consumer Vite plugins                                                                 |
| ------------------ | ------------------------ | ------------------------------------------------------------------------------------- |
| [React](./react)   | `@storybook/react-vite`  | `tsrxReact()` from `@tsrx/vite-plugin-react`                                          |
| [Preact](./preact) | `@storybook/preact-vite` | `tsrxPreact()` from `@tsrx/vite-plugin-preact`                                        |
| [Solid](./solid)   | `storybook-solidjs-vite` | `tsrxSolid()` from `@tsrx/vite-plugin-solid`, then `solid()` from `vite-plugin-solid` |
| [Vue](./vue)       | `@storybook/vue3-vite`   | `tsrxVue()` from `@tsrx/vite-plugin-vue`                                              |
| [Hono DOM](./hono) | `@storybook/html-vite`   | `tsrxHono({ mode: 'dom' })` from `@tsrx/vite-plugin-hono`                             |
| [Ripple](./ripple) | `@storybook/html-vite`   | `ripple()` from `@ripple-ts/vite-plugin`                                              |

Copy the chosen project's `vite.config.ts`, `.storybook/`, and target settings
from `tsconfig.json` into your consumer project, then install the matching
compiler, runtime, Vite plugin, and Storybook framework. Storybook loads the
consumer Vite config; add the compiler there once. The examples do not duplicate
it in `viteFinal`.

React, Preact, Solid, and Vue stories set `component: Counter` directly after
importing `Counter` from `./Counter.tsrx`. Explicit `args` and `argTypes` supply
Controls. Automatic `.tsrx` prop extraction and docgen are outside these examples;
React's native docgen pass is disabled in its Storybook config.

### Target setup details

- **Preact:** the small [preview override](./preact/.storybook/preview.ts) renders
  `storyFn()` through Preact's native `render`, keeping component state across
  Controls updates and unmounting on story cleanup.
- **Solid:** the TSRX plugin emits Solid TSX; `vite-plugin-solid` performs the
  final JSX transform. The framework selects its native Solid 2 renderer.
- **Vue:** Storybook creates a Vue VDOM app, while TSRX emits Vapor components.
  The standard [preview setup](./vue/.storybook/preview.ts) installs Vue's
  `vaporInteropPlugin` with `setup((app) => app.use(vaporInteropPlugin))`.
  Storybook 10's `Meta` component slot accepts VDOM component types, so the
  [story](./vue/Counter.stories.ts) replaces only that slot with the public
  `DefineVaporSetupFnComponent<CounterProps>` type. Native component props and
  story args remain checked without casts or ambient `.tsrx` declarations.
- **Hono DOM:** the [story render function](./hono/Counter.stories.tsx) creates a
  native Hono DOM root with `createRoot`. Storybook's `useMemo` keeps the host and
  root stable across args updates; `useEffect` registers root cleanup.
- **Ripple:** the [story render function](./ripple/Counter.stories.ts) uses native
  `mount` and its disposer with the same Storybook memo/effect lifecycle.
  [StoryRoot.tsrx](./ripple/StoryRoot.tsrx) creates a `RippleObject` in a native
  component scope and passes that live object to the counter. Controls update the
  proxy while preserving local state. Ripple's compiler, runtime, and Vite
  integration are maintained in
  [Ripple-TS/ripple](https://github.com/Ripple-TS/ripple).

Octane's existing consumer example is maintained separately in
[octanejs/octane/examples/storybook](https://github.com/octanejs/octane/blob/main/examples/storybook/README.md).

## Version baseline and limits

The examples pin Storybook and its official frameworks to `10.6.2`, and
`storybook-solidjs-vite` to `10.7.2`. They use the repository's Vite 8 catalog.
Solid uses `solid-js` and `@solidjs/web` `2.0.0-rc.3` with
`vite-plugin-solid@3.0.0-next.5` and the repository's Babel overrides. Vue uses
`vue@3.6.0-beta.12` and `vue-jsx-vapor@3.2.14`.

Two upstream peer mismatches remain: the pinned Solid Vite plugin and
`solid-refresh` declare prerelease ranges that exclude Solid rc.3;
`@vue-jsx-vapor/runtime@3.2.14` declares the exact Vue peer `3.6.0-beta.10`. The
browser checks use the versions above; they do not establish compatibility with
every version in the frameworks' peer ranges.

These examples render browser canvases, including when the Storybook site is built
statically. Hono's example selects its DOM compiler mode. Server rendering and
hydration need their own target setup and are not exercised here. The same limit
applies to native mobile rendering, `.stories.tsrx` discovery, and automatic
component documentation.
