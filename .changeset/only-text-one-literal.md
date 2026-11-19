---
'@tsrx/core': patch
'@tsrx/solid': patch
---

An element whose only child is text with a space or tab at an edge gets that
text as one string again. The text prints as one literal,
`<textarea>{' a '}</textarea>`, instead of the edge whitespace and the text as
three children (`{' '}a{' '}`). React's `<textarea>` no longer throws, `<title>`
renders its text, a `<pre>` keeps a leading `&#10;`, and a component whose
`children` is typed `string` gets a string, in the build and in the editor
(TS2322). The editor maps the literal to the text, so a type error on it shows
at the text and `@` completions still work there. The literal reads the text as
React, Preact and Hono already did, so on Solid and Vue such a text now renders
that way too: Solid keeps a run of spaces or tabs inside it as written instead
of one space, Solid and Vue read `&lang;` as TypeScript does (U+2329), and Vue
and SWC keep a line feed written as `&#10;` at the text's edge. A fragment's
only text and text beside other children print as before, and so does a text
that spans lines or holds whitespace other than spaces and tabs, a character
reference the compilers read differently from the parser (such as `&check;`,
which the parser leaves as written), or a reference to a control character
other than a tab or a line feed, or to U+2028, U+2029 or U+FEFF.
