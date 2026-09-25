---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

A comment on its own line after the expression in a template literal's `${…}`
is no longer deleted. The parser gave it to the template's next text, which
prints as written, and it now trails the expression, like Prettier, so the
formatter keeps it in the `${…}` (also in CSS, GraphQL, HTML, and Markdown
templates). In a template literal type, a comment on its own line before the
next type leads that type, as in Prettier.

The formatter honors two more `prettier-ignore` comments, like Prettier:

- `{/* prettier-ignore */}` keeps the element or fragment after it as written,
  in JSX and in templates, when only whitespace with a line break separates
  them.
- A `// prettier-ignore` after the last node of a `@{ … }` code block keeps
  that node as written, as it does after the last statement of a block. The
  rest of the code block still formats.

A `<script>` body now formats by the script's `type` or `lang`, like Prettier's
HTML printer, instead of always as TypeScript, which added a `;` to JSON bodies
such as `[1,2]` and made them invalid. JSON, `importmap`, `ld+json`, and
`speculationrules` bodies format as JSON, `text/markdown` and `text/html`
bodies as Markdown and HTML, and a body with no type, an empty type, `module`,
or another JavaScript type, or with `lang="ts"`, formats as TypeScript. A body
of any other type (such as `text/template` or `text/typescript`), or of a
script with `src`, stays as written.
