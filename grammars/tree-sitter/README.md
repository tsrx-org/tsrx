# @tsrx/tree-sitter

Tree-sitter grammar for [TSRX](https://tsrx.dev/).

## Overview

TSRX extends TypeScript with JSX-shaped templates, statement containers, control
flow directives, and scoped styles. This grammar provides editor parsing support
for `.tsrx` files independently of the selected runtime target.

## ast-grep

[ast-grep](https://ast-grep.github.io/) can search and rewrite `.tsrx` files by
syntax tree, with this grammar loaded as a
[custom language](https://ast-grep.github.io/advanced/custom-language.html).

### Build the parser library

From the repository root, after `pnpm install`:

```sh
pnpm --filter @tsrx/tree-sitter build:library
```

This compiles `src/` into `grammars/tree-sitter/tsrx.so` with the tree-sitter CLI,
which needs a C compiler. Without the workspace installed, run
`npx tree-sitter-cli@0.26.6 build --output tsrx.so` in this directory instead.
ast-grep doesn't depend on the file extension, so `tsrx.so` works on macOS too.
Copy the file into your project, or point `libraryPath` at it.

### Configure the language

In `sgconfig.yml` at your project root:

```yaml
customLanguages:
  tsrx:
    # Relative to this file, or absolute.
    libraryPath: tools/tsrx.so
    extensions: [tsrx]
```

Leave `expandoChar` unset. `$` is an identifier character in TSRX, so `$NAME`
meta-variables already parse. With `expandoChar: _`, ast-grep replaces every `$`
in a pattern, so the pattern can no longer match TSRX's own `$` names, such as
`theme.$class`.

### Search and rewrite

ast-grep 0.50 and later load a custom parser only when you allow it: pass
`--custom-languages allow`, or `--custom-languages trust` once in an interactive
shell.

```sh
# Every @if that has an @else branch
ast-grep run --custom-languages allow -l tsrx \
  -p '@if ($COND) { $$$THEN } @else { $$$ELSE }' src

# Rename a prop wherever it sits among the attributes, in place
ast-grep run --custom-languages allow -l tsrx \
  -p '<Button $$$BEFORE label={$LABEL} $$$AFTER />' \
  -r '<Button $$$BEFORE text={$LABEL} $$$AFTER />' -U src
```

Patterns are TSRX code, so they can contain directives, `@{ … }` statement
containers, dynamic tags (`<{$TAG} $$$ATTRS>$$$CHILDREN</{$TAG}>`) and
`<style apply={$THEME} />`. The body of a `<style>` or `<script>` element is a
single raw-text node, so a meta-variable can't match inside it.

A rule file takes `language: tsrx`:

```yaml
# rules/swap-if-else.yml. Run it with:
# ast-grep scan --custom-languages allow -r rules/swap-if-else.yml src
id: swap-if-else
language: tsrx
rule:
  pattern: |
    @if ($COND) {
      $$$THEN
    } @else {
      $$$ELSE
    }
fix: |-
  @if (!($COND)) {
    $$$ELSE
  } @else {
    $$$THEN
  }
```

ast-grep doesn't reformat what it writes. An empty `$$$BEFORE` or `$$$AFTER`
leaves a double space, and in a tab-indented file the lines of a multi-line `fix`
aren't re-indented. Format the files afterwards, for example with Prettier and
`@tsrx/prettier-plugin`.
