---
'@tsrx/core': patch
---

Text compiles to output that renders what it says and that each target's JSX
compiler builds:

- A `>` in template text compiles to `&gt;`, as a `<` compiles to `&lt;`. The
  bare `>` in the output failed to build with esbuild, oxc, and TypeScript, and
  vue-jsx-vapor gave no output. Braces in a raw-text `<script>` body compile to
  `&#123;` and `&#125;` instead of starting an expression container.
- In an element in a `{…}` container, a `>` is text, as outside one. The text
  before it is no longer dropped when it follows a tag
  (`{c && <b>a > b</b>}` compiled to `<b>&gt; b</b>`), and after a child
  container it no longer reports `Unexpected token`.
- Text in an element in a spread attribute's argument, or in an unbraced
  attribute value in a container, keeps its character references as written.
  `&#123;x&#125;` compiled to the expression `{x}` and `&amp;lt;` to `&lt;`,
  which render something else. The formatter kept those texts decoded too, and
  now keeps them as written.
