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
