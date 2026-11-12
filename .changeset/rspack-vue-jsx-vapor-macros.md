---
'@tsrx/rspack-plugin-vue': patch
---

Run vue-jsx-vapor's macros, as `@tsrx/vite-plugin-vue` does. Before, the plugin passed `macros: true` to a transform that ignores it, so a component declared no props: `function Greeting({ name, greeting = 'Hello' })` mounted with `{ name: 'Ada' }` rendered `<p name="Ada">Hello, </p>` instead of `<p>Hello, Ada</p>`, and a component that reads `props.name` got `undefined`. `defineModel`, `defineSlots`, `defineExpose` and `defineStyle` now work too. The macros' `include` and `exclude` options apply as in the Vite plugin. The plugin serves the helper modules the macros import as virtual modules under the compiler's `context`, also on warm builds from a persistent cache, and an assigned `const styles = defineStyle(…)` becomes a CSS module that project rules for `.css` files leave alone. A `defineStyle` stylesheet in a language other than CSS fails the build with a message that says so.
