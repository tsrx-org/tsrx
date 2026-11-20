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

A text with a reference to half of a surrogate pair (`&#55296;&#56320;`) keeps
its split edges again, on one line too, where #1381 printed one literal: the
compilers read it differently (oxc and vue-jsx-vapor leave it as written,
TypeScript and esbuild decode the pair, Solid's template reads U+FFFD for each,
and SWC fails to compile it, as it does any such reference in JSX text).

A JSX platform says how its compiled JSX reads text with the new
`jsx.textReading` option (`lines: 'join' | 'keep'`, `html: true`).

The literal reads a text over lines as TypeScript, esbuild and oxc do, so some
compilers now read such a text differently from before, as they already do for
a text on one line:

- SWC (the rspack and turbopack plugins) and Babel keep a line feed written as
  `&#10;` as a line feed, where they split or trimmed the line there, and Babel
  no longer turns a tab inside the text into a space.
- On Solid, a space or tab before the line break after the text's last line is
  dropped, where Solid's compiler kept one space, and a run of spaces or tabs
  inside it stays as written.
- On Vue, a `&#10;` at the text's start or end stays, where vue-jsx-vapor
  dropped it, and a reference after a bare `&` with no `;` between them
  decodes, where vue-jsx-vapor left it as written (`a &⏎&amp;`).
- On Solid and Vue, `&lang;` and `&rang;` read as TypeScript reads them
  (U+2329 and U+232A, not U+27E8 and U+27E9), and in a Solid component,
  `&notin;` reads as `∉`, where Solid's decoder gave `¬in;`.
