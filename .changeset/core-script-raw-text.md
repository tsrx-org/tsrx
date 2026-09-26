---
'@tsrx/core': minor
'@tsrx/react': minor
'@tsrx/preact': minor
'@tsrx/hono': minor
'@tsrx/solid': minor
'@tsrx/vue': minor
'@tsrx/prettier-plugin': patch
'@tsrx/typescript-plugin': patch
'@tsrx/mcp': patch
---

A `<script>` element is raw text, like `<style>`, in templates and in plain
JSX. Its body is `content`, taken as written, and the element has no children:
the `JSXText` child that mirrored the body is gone. None of JSX text's rules
apply to the body: comments, `<`, `>`, character references, and line breaks
stay as written, and `<script>{code}</script>` is a script whose text is
`{code}`, not an expression container.

Each target now outputs the body in the form that renders it exactly, on the
client and in server HTML:

- React: `<script>{"…"}</script>`, a string child.
- Preact and Hono: `<script dangerouslySetInnerHTML={{ __html: "…" }} />`.
- Solid: `<script innerHTML={"…"} />`.
- Vue: `<script v-html={"…"} />`.

Before, the body compiled to JSX text: its lines were joined, so a `// c` line
commented out the rest of the script, and `&amp;` rendered `&`. In Solid and
Vue, a `<` rendered `&lt;`. `<script>{code}</script>` threw
`ReferenceError: code is not defined`. Whether a script runs is still each
target's decision: a client render runs it in Preact and `hono/jsx/dom`, not in
React, Solid, and Vue, and server HTML runs it.

A body ends where HTML ends it: at `</script`, optional whitespace, and `>`, so
`</script >` closes it. Any other `</script` in the body, in any letter case
(`</SCRIPT>`), is the `tsrx-script-end-tag-in-body` error, with a hint to write
`<\/script`. A body of only whitespace outputs an empty script, as the formatter
prints it.

The formatter formats a script body from `content`, and the TypeScript plugin's
fallback for a file that doesn't compile ends a body where the parser does.
