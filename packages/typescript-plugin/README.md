# @tsrx/typescript-plugin

[![npm version](https://img.shields.io/npm/v/%40tsrx%2Ftypescript-plugin?logo=npm)](https://www.npmjs.com/package/@tsrx/typescript-plugin)
[![npm downloads](https://img.shields.io/npm/dm/%40tsrx%2Ftypescript-plugin?logo=npm&label=downloads)](https://www.npmjs.com/package/@tsrx/typescript-plugin)

TypeScript plugin for `.tsrx` files. It selects the compiler for the active
project, generates TypeScript virtual code, and maps language-service results back
to TSRX source.

The
[TSRX Syntax for VS Code](https://marketplace.visualstudio.com/items?itemName=TSRX.tsrx-vscode-plugin)
already bundles this plugin through `@tsrx/language-server`; no separate VS Code
configuration is needed.

## Supported TypeScript versions

The plugin, `tsrx-tsc` and the TSRX language server run on TypeScript's JavaScript
API and support `typescript@^5.9.3 || ^6.0.0` (the peer dependency range). The
`typescript@7` package is the native compiler: it only launches the platform
binary and has no JavaScript API, so `tsrx-tsc` stops with an explanation when it
resolves one instead of failing on the package's export map. To type-check `.tsrx`
files with TypeScript 7 itself, use
[`@tsrx/content-mapper`](../content-mapper/README.md) with
`tsc --runExternalCode`; it needs a TypeScript 7.1 nightly (`7.1.0-dev.20260822.1`
or newer), because the stable 7.0 releases have no content-mapper protocol.
TypeScript 7 support is not complete yet; the gaps are tracked in
[tsrx-org/tsrx#136](https://github.com/tsrx-org/tsrx/issues/136).

## Configuration

For a standalone tsserver integration, install this package and add it to the
project's `tsconfig.json`. The compiler and `jsxImportSource` should match the
chosen target. For example, a React project can use:

```json
{
  "tsrx": {
    "compiler": "@tsrx/react",
    "platform": "web"
  },
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "react",
    "plugins": [
      {
        "name": "@tsrx/typescript-plugin"
      }
    ]
  }
}
```

All targets use the `.tsrx` extension. The `tsrx.compiler` value must be a bare
package specifier such as `@tsrx/react`, `@tsrx/preact`, `@tsrx/solid`,
`@tsrx/vue`, `@tsrx/ripple`, `octane`, or a third-party TSRX compiler. Package
subpaths are supported; relative and absolute paths are not.

`tsrx.platform` is optional. When present, it must be exactly `"web"`, `"ios"`, or
`"android"`; it selects compile-time `import.meta.env.platform` guards in virtual
TSX. In-repo build integrations read the same setting automatically. Their
explicit `platform` option is only an override/fallback and must agree with
tsconfig when both are present. There is no implicit default. Both `compiler` and
`platform` follow the active project's complete `extends` graph, including nested
projects.

Compiler declarations follow the active TypeScript project's `extends` graph. If
no compiler is declared, the plugin detects installed target packages and uses the
nearest `package.json` to resolve ambiguity.

The language server, tsserver plugin, and `tsrx-tsc` share the same compiler
selection behavior. See the [TSRX documentation](https://tsrx.dev/) for target
setup and authoring guidance.

## Command-line type checking

Install this package, TypeScript, and your target compiler, then run
`tsrx-tsc --noEmit -p tsconfig.json` to check TypeScript and `.tsrx` files.

With Deno 2.8 or newer and the npm dependencies installed locally, add a task to
`deno.json`:

```json
{
  "tasks": {
    "check": "tsrx-tsc --noEmit -p tsconfig.json"
  }
}
```

Run `deno task check`. This uses the npm-installed TypeScript version and your
`tsconfig.json`, including `tsrx.compiler`. No custom loader script is needed.
