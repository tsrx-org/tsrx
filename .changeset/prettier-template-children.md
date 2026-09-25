---
'@tsrx/prettier-plugin': patch
---

The formatter keeps every significant space between template children. A space
between two children, or between a child and a tag, renders, so it no longer
becomes a line break, which dropped it and changed the rendered text. Like
Prettier, children separated by a space stay on one line when they fit, and a
space prints as `{" "}` where a line breaks. `{" "}` itself is treated as a
plain space.

A non-breaking space (U+00A0) in template text is text, as in JSX, so the
formatter no longer collapses it into a plain space or drops it.

A `<script>` body that doesn't parse is no longer given extra blank lines on
every pass. Like Prettier's HTML printer, the formatter keeps its lines and
their relative indentation, and indents them under the element.

A JSX attribute value in `{…}` that doesn't fit now breaks onto its own lines
inside the braces, like Prettier, instead of staying attached to `={` and
`}` with its continuation lines at the attribute's column. Arrays, objects,
functions, calls, and templates still hug the braces.
