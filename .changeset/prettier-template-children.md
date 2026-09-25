---
'@tsrx/prettier-plugin': patch
---

Template children now lay out the way Prettier lays out the same JSX in a TSX
file. Text and the children next to it fill their lines, a child that touches
text with no whitespace (`</code>.`) stays against it, and each child gets a
line of its own only when there's no text. An element breaks its children onto
their own lines when it has more than one attribute, a child element, more
than one `{…}` child, or an opening tag that breaks, and otherwise stays on one
line when it fits. A multi-line element after `return`, `=`, `=>`, or `&&`
prints between parentheses, and so does a template value there (`@if`, `@for`,
`@switch`, `@try`, or a `@{ … }` value, but not a function's `@{ … }` body), and a `{…}` child that starts with a comment breaks
inside its braces. The opening tag follows Prettier too: a lone string
attribute never breaks the tag, and a blank line between attributes stays.

The formatter also keeps every significant space between template children. A
space between two children, or between a child and a tag, renders, so it no
longer becomes a line break, which dropped it and changed the rendered text. A
space prints as `{" "}` where a line breaks, and `{" "}` itself is treated as
a plain space.

A non-breaking space (U+00A0) in template text is text, as in JSX, so the
formatter no longer collapses it into a plain space or drops it.

A `<script>` body that doesn't parse is no longer given extra blank lines on
every pass. Like Prettier's HTML printer, the formatter keeps its lines and
their relative indentation, and indents them under the element.

A JSX attribute value in `{…}` that doesn't fit now breaks onto its own lines
inside the braces, like Prettier, instead of staying attached to `={` and
`}` with its continuation lines at the attribute's column. Arrays, objects,
functions, calls, and templates still hug the braces.

A JSX attribute value written as an element or fragment without braces
(`prop=<Bar />`) is no longer deleted.
