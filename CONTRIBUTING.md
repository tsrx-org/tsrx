# Contributing to TSRX

TSRX is a TypeScript superset for authoring components that compile to multiple
frameworks. This repository owns the language, shared compiler infrastructure,
non-Ripple compiler targets, tooling, editor integrations, grammars, playgrounds,
and TSRX websites.

Before starting a substantial change, please search the
[existing issues](https://github.com/tsrx-org/tsrx/issues). Open an issue first
when a proposal changes syntax, public APIs, compiler output, or package
ownership. Small fixes and focused documentation improvements can go directly to a
pull request.

Questions and early ideas are welcome in the
[TSRX Discord](https://discord.gg/HCYpT5QHQR).

## Development setup

You need Node.js 22 or newer and the pnpm version declared in the root
`package.json`.

```bash
pnpm install
```

Use pnpm for workspace commands and dependency changes. Do not use npm or yarn for
the monorepo.

## Finding the right package

- `packages/tsrx` owns parsing, syntax transforms, and shared compiler behavior.
- `packages/tsrx-{react,preact,solid,vue}` own target-specific compilation.
- The matching Vite, Bun, Rspack, and Turbopack packages own bundler behavior.
- `packages/typescript-plugin` and `packages/language-server` own diagnostics,
  completions, navigation, and TypeScript integration.
- Editor-specific behavior belongs in the corresponding editor plugin package.
- `packages/eslint-*` and `packages/prettier-plugin` own linting and formatting.
- `grammars/` owns the TextMate and Tree-sitter grammars.

Ripple is a supported external target. Its runtime, compiler target, adapters, and
bundler plugin are developed in the
[Ripple repository](https://github.com/Ripple-TS/ripple). Keep Ripple-runtime
behavior isolated and target-gated in this repository.

## Validation

Run the smallest checks that cover your change, followed by the broader checks
when the change crosses package boundaries:

```bash
pnpm format:check
pnpm typecheck
pnpm test
```

Vitest projects are listed in `vitest.config.js` and can be run individually:

```bash
pnpm test --project language-server
pnpm test --project typescript-plugin
pnpm test --project vscode-plugin
```

When changing a generated grammar or shared agent rules, regenerate the checked in
outputs:

```bash
pnpm regenerate-textmate
pnpm copy-tree-sitter-queries
pnpm rules:generate
```

## Code and documentation

- Treat `.tsrx` as the canonical component extension.
- Follow the style and language of the package you are changing; the repository
  intentionally contains JavaScript, JSDoc-typed JavaScript, TypeScript, Rust,
  Kotlin, Lua, and grammar sources.
- Prefer nearby implementation and tests over historical summaries.
- Keep target-neutral syntax separate from target runtime APIs.
- Edit `.rulesync/rules/` and regenerate derived instruction files rather than
  editing generated agent guidance directly.

Current language documentation is available at [tsrx.dev](https://tsrx.dev/),
including the [specification](https://tsrx.dev/specification) and
[playground](https://tsrx.dev/playground).

## Changesets

Add a changeset for user-facing package changes. Documentation-only, test-only,
and internal tooling changes do not need one. This repository uses patch
changesets only.

```bash
pnpm changeset
pnpm changeset:check
```

## Pull requests

Keep pull requests focused and explain the user-visible behavior, validation, and
any compatibility considerations. Include tests for behavior changes and update
documentation when public usage changes.

By contributing, you agree that your contribution is licensed under the
repository's MIT License.
