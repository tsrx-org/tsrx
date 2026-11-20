---
'@tsrx/core': patch
'@tsrx/solid': patch
'@tsrx/vue': patch
---

An element whose only child is text with a space or tab at an edge gets that
text as one string when the text spans lines too. `<textarea> a⏎  b </textarea>`
prints `<textarea>{' a b '}</textarea>` on React, Preact, Hono and Solid, which
join a text's lines with a space as JSX does, and
`<textarea>{' a\n  b '}</textarea>` on Vue, whose compiler keeps them. React's
`<textarea>` no longer throws for it, `<title>` renders it, and a component
whose `children` is typed `string` gets a string, in the build and in the
editor (TS2322). An `@` that starts such a text still gets directive
completions.

On React, Preact and Hono, a text with an `&` before a name (`R&D`, or `&copy`
without a semicolon), a name the parser leaves as written (`&check;`), or a
non-breaking space on one line prints as one literal too: their compilers read
each as written, as the literal keeps it. Solid's and Vue's compilers read
those as HTML, so the text keeps its split edges there.

A JSX platform says how its compiled JSX reads text with the new
`jsx.textReading` option (`lines: 'keep'`, `html: true`).

On Solid, a text over lines now reads as it does on React: a space or tab
before the line break after its last line is dropped, where Solid's compiler
kept one space, and a run of spaces or tabs inside it stays as written. On Vue,
a reference after a bare `&` with no `;` between them now decodes in a text
over lines, as it already does in a text on one line, where vue-jsx-vapor left
it as written (`a &⏎&amp;`).
