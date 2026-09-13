# TSRX

TSRX (TypeScript Render Extensions) is a framework-neutral language for
declarative UIs: `.tsrx` source is parsed into a framework-neutral AST, then a
target compiler lowers it to idiomatic output for a chosen runtime.

## Language

**Statement container**: A `@{ ... }` body on a function or template node: setup
statements followed by one output node, sharing one lexical scope. _Avoid_: code
block, template body

**Template directive**: Control flow authored in template position: `@if`, `@for`,
`@switch`, `@try`. Distinct from ordinary `if`, which `import.meta.env.platform.*`
guards use for compile-time selection. _Avoid_: control-flow block (that's the
`{ ... }` a directive opens)

**Sibling-scoped style block**: A `<style>` block that styles its siblings and
everything below them — never the element containing it — with sibling blocks
sharing one hash class. Assignable blocks produce a **style theme** exposing
`$class` and one key per class; `<style apply={theme} />` applies one to a scope.
_Avoid_: scoped CSS, component styles (they are not component-scoped)

## Compiler

**Compile pipeline**: The owned sequence
`parse → specialize platform → analyze → transform`, plus the Volar/editor variant
ending in mappings construction. Created per target by
`createTargetCompiler(descriptor)`; previously re-implemented by every target
package. _Avoid_: build pipeline, transform chain

**Platform descriptor**: The `JsxPlatform` object a target supplies — import
sources, JSX flags, hooks, validation — the adapter at the compiler seam. _Avoid_:
config, target options

**Target compiler**: A package that lowers TSRX AST to a specific runtime's
output. In-repo: `@tsrx/react`, `@tsrx/preact`, `@tsrx/solid`, `@tsrx/vue`.
External: `@tsrx/ripple`, `octane/compiler`. _Avoid_: framework plugin, renderer

**Consumer compiler**: The target compiler a project actually resolved for a file
— declared in tsconfig `tsrx.compiler`, discovered through the language tooling's
resolution chain. Naming distinguishes "a compiler that exists" from "the one this
file uses." _Avoid_: active compiler

**Platform specialization**: Compile-time selection of
`import.meta.env.platform.web|ios|android` branches before analysis and lowering.
The platform comes from tsconfig `tsrx.platform` or a builder override; there is
no implicit web default. _Avoid_: conditional compilation, feature flags

**Volar compile**: The editor-facing variant of the pipeline
(`compile_to_volar_mappings`): type-only transform plus generated↔source mappings.
Never wants module-scoped hook components — the flag is forced off on this path.
_Avoid_: editor mode, IDE compile
