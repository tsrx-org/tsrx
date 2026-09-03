# TSRX Project Guide for AI Agents

TSRX (TypeScript Render Extensions) is a framework-neutral language for authoring
declarative user interfaces in `.tsrx` files. This monorepo owns the language,
shared compiler infrastructure, target compilers, build integrations, language
tooling, and editor extensions.

Ripple is one supported target, but its runtime and compiler package live in the
separate `Ripple-TS/ripple` repository. Keep Ripple-runtime behavior explicitly
target-gated here; do not treat it as the default meaning of TSRX.

## Start From Current Sources

Use the nearest live source rather than historical summaries:

- `website-tsrx/public/llms.txt` for current TSRX syntax and examples
- `README.md` for project positioning, supported targets, and repository scope
- `packages/*/README.md` for package-specific usage and public APIs
- `vitest.config.js` for current test projects and file globs
- `package.json` and `pnpm-workspace.yaml` for scripts and workspace structure

If guidance conflicts with nearby code or package documentation, trust the nearby
current source.

## RuleSync

This repository uses RuleSync as the source of truth for shared AI-agent
instructions. Edit `.rulesync/rules/` and run `pnpm rules:generate`; do not edit
generated `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, Copilot, or Cursor rules
directly.

## Monorepo Map

- `packages/tsrx/` and `packages/tsrx-runtime/`: core parser, transforms, shared
  compiler infrastructure, and target-neutral runtime helpers
- `packages/tsrx-react/`, `packages/tsrx-preact/`, `packages/tsrx-solid/`, and
  `packages/tsrx-vue/`: target compilers, with matching runtime packages
- `packages/vite-plugin-*`, `packages/rspack-plugin-*`,
  `packages/turbopack-plugin-*`, and `packages/bun-plugin-*`: target-specific
  build integrations
- `packages/language-server/` and `packages/typescript-plugin/`: shared language
  intelligence and consumer-compiler resolution
- `packages/vscode-plugin/`, `packages/zed-plugin/`, `packages/nvim-plugin/`,
  `packages/intellij-plugin/`, and `packages/sublime-text-plugin/`: editor tooling
- `packages/prettier-plugin/`, `packages/eslint-parser/`, and
  `packages/eslint-plugin/`: formatting and linting
- `grammars/`: TextMate and Tree-sitter grammars
- `playground/`: retained React, Solid, and Vue examples plus shared editor
  settings in `playground/.vscode/`
- `website-tsrx/` and `website-mcp/`: documentation and MCP-facing sites

`@tsrx/ripple`, `ripple`, and Ripple-owned integrations are external catalog
dependencies, not workspace packages.

## Authoring Assumptions

- Component files use `.tsrx`; the editor language ID is `tsrx`.
- Prefer `function Component(props) @{ ... }` when setup and output share a scope,
  or a normal function returning JSX for simple output.
- Use `@if`, `@for`, `@switch`, and `@try` for template control flow.
- A template scope with setup statements finishes with one output node. Wrap text,
  expression containers, or sibling outputs in a fragment.
- `<style>` blocks are lexically scoped, not component-scoped. A scope may hold
  several `<style>` blocks, and nested `@{ ... }` and control-flow bodies are
  style scopes of their own.
- Assigned blocks (`const theme = <style>...</style>`) expose `$class` and one key
  per class; `<style apply={theme} />` applies a theme to a scope,
  `class={theme.$class}` opts single elements in, `apply={[a, b]}` composes, and a
  theme must be declared before the block that applies it.
- Target-specific behavior must be selected through the consumer compiler. In
  particular, Ripple API completions must only appear for the Ripple target.
- Use `pnpm` and match the conventions of the package being changed.

## Validation

Prefer the smallest validation that covers the touched surface. Common commands:

```bash
pnpm rules:generate
pnpm format:check
pnpm test
pnpm test --project typescript-plugin
pnpm test --project language-server
pnpm test --project vscode-plugin
pnpm typecheck
```

## Changesets

Add a changeset for user-facing package or marketplace-extension changes. Skip
changesets for docs-only, test-only, and internal tooling updates. Use only
`patch` bumps unless a release plan explicitly changes that policy.

```bash
pnpm changeset
pnpm changeset:check
```

Preserve historical names in changelogs and migration records. In current code and
documentation, use TSRX terminology except for genuine target-specific Ripple
behavior.
