<p align="center">
  <a href="https://tsrx.dev/">
    <picture>
      <source srcset="assets/tsrx-logo.svg" type="image/svg+xml">
      <img src="assets/tsrx-logo.png" width="192" height="192" alt="TSRX">
    </picture>
  </a>
</p>

<p align="center">
  <a href="https://discord.gg/HCYpT5QHQR">
    <img src="https://img.shields.io/badge/Discord-Join%20the%20community-7289da?logo=discord&logoColor=white" alt="Join the TSRX Discord community">
  </a>
</p>

# TSRX

TSRX (TypeScript Render Extensions) is a TypeScript language extension for
building declarative user interfaces. It keeps TypeScript setup, JSX-shaped
structure, template control flow, and lexically scoped styles together in `.tsrx`
files, then compiles that source into idiomatic output for the runtime you choose.

**[Documentation](https://tsrx.dev/)** · **[Features](https://tsrx.dev/features)**
· **[Specification](https://tsrx.dev/specification)** ·
**[Playground](https://tsrx.dev/playground)** ·
**[Discord](https://discord.gg/HCYpT5QHQR)**

> TSRX is in active beta development.

## Example

A component is an ordinary TypeScript function. A statement container (`@{ ... }`)
lets local setup live beside the template that uses it, while template directives
provide declarative control flow. A `<style>` block styles the lexical template
scope it sits in, so the rules below apply to this fragment's `<ul>`.

```tsx
type Todo = {
  id: string;
  title: string;
  hidden?: boolean;
};

export function TodoList({ items }: { items: Todo[] }) @{
  const visibleItems = items.filter((item) => !item.hidden);

  <>
    <ul>
      @for (const item of visibleItems; index i; key item.id) {
        <li>{i + 1}. {item.title}</li>
      } @empty {
        <li>No todos yet</li>
      }
    </ul>

    <style>
      ul {
        display: grid;
        gap: 0.5rem;
      }
    </style>
  </>
}
```

## Features

- TypeScript-compatible `.tsrx` modules that interoperate with JavaScript,
  TypeScript, and TSX code.
- JSX statement containers that keep setup and rendered output in one lexical
  scope.
- Template-native `@if`, `@for`, `@switch`, and `@try` control flow.
- Lazy object and array destructuring with `&{ ... }` and `&[ ... ]`.
- Lexically scoped `<style>` blocks with automatic class hashing, plus assignable
  style themes that expose `$class` and compose through `<style apply={theme} />`.
- Language-server, TypeScript, Prettier, ESLint, and editor integrations.

See the [features guide](https://tsrx.dev/features) for examples and the
[TSRX specification](https://tsrx.dev/specification) for the language grammar, AST
shape, and static constraints.

## Supported targets

TSRX parses source into a framework-neutral AST and hands it to a target compiler.
The same language currently supports:

| Target | Compiler integration | Home                                          |
| ------ | -------------------- | --------------------------------------------- |
| React  | `@tsrx/react`        | This repository                               |
| Preact | `@tsrx/preact`       | This repository                               |
| Solid  | `@tsrx/solid`        | This repository                               |
| Vue    | `@tsrx/vue`          | This repository                               |
| Ripple | `@tsrx/ripple`       | [Ripple](https://github.com/Ripple-TS/ripple) |
| Octane | `octane/compiler`    | [Octane](https://github.com/octanejs/octane)  |

Additional targets can be added as standalone compiler plugins without changing
the TSRX language itself.

## Tooling

This repository includes the core compiler, target compilers and runtime helpers,
build integrations for Vite, Rspack, Turbopack, and Bun, plus Prettier, ESLint,
TypeScript, language-server, and editor tooling.

Install the
[TSRX Syntax for VS Code](https://marketplace.visualstudio.com/items?itemName=TSRX.tsrx-vscode-plugin)
for syntax highlighting, diagnostics, navigation, completions, formatting, and
TypeScript integration. The
[TSRX extension for Zed](https://zed.dev/extensions/tsrx) is available from the
Zed Extension Marketplace. The
[TSRX plugin for JetBrains IDEs](https://plugins.jetbrains.com/plugin/33991-tsrx)
has been submitted to JetBrains Marketplace and is under review. Integrations for
Neovim and Sublime Text are also maintained here.

## Learn and contribute

- Read the [full documentation](https://tsrx.dev/).
- Experiment in the [TSRX playground](https://tsrx.dev/playground).
- Report bugs or propose improvements in
  [GitHub Issues](https://github.com/tsrx-org/tsrx/issues).
- Join the [TSRX Discord community](https://discord.gg/HCYpT5QHQR).
- See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

TSRX was created by [Dominic Gannaway](https://github.com/trueadm) and is released
under the [MIT License](LICENSE).
