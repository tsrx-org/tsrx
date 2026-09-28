---
'@tsrx/prettier-plugin': minor
---

Switch to a new formatter architecture that uses Prettier's own JavaScript and
TypeScript printer, with custom printing for TSRX-specific syntax. JavaScript,
TypeScript, and JSX formatting now follows Prettier, while the plugin handles
`@{ ... }` blocks, template directives, shorthand props, scoped styles, script
bodies, and comments between JSX children.

The package name and configuration remain `@tsrx/prettier-plugin`. Existing
projects may see formatting changes as the previous formatter's output is aligned
with Prettier. Selection formatting, cursor preservation, and browser usage
through `prettier/standalone` are supported.

Notable formatting changes when upgrading:

- **More consistent parentheses around multiline markup values.** Multiline JSX
  and TSRX values use Prettier's parenthesized layout:

  ```diff
  -const a = <div>
  -  <div>Hello</div>
  -</div>
  +const a = (
  +  <div>
  +    <div>Hello</div>
  +  </div>
  +)
  ```

  Assigned `<style>` blocks also gain parentheses, like other multiline JSX
  values: `const theme = (` followed by the style block and `);`. A function or
  arrow's `@{ ... }` body stays attached to its signature.

- **String expressions in attributes keep their braces.** An authored
  `<div class={"card"} />` stays an expression instead of becoming
  `<div class="card" />`, matching Prettier's JSX formatting.
- **Comments between JSX children stay in their intended positions.** Comments
  after an opening tag or between words are preserved instead of being dropped or
  moved after the text. For example, `<div>Hello /* note */ world</div>` keeps the
  comment between `Hello` and `world`.
- **Embedded script bodies follow their declared language.** For example,
  `<script type="application/json">{"a":1}</script>` formats its body as
  `{ "a": 1 }`. JSON, HTML, and Markdown bodies use their matching Prettier
  parsers; browser consumers supply those plugins as described in the README.

The Prettier peer dependency is now `>=3.6.0`, with no upper limit. Prettier 3.9.9
or newer is recommended for more correct formatting; older versions have known
compatibility gaps, including `prettier-ignore` on template outputs.
