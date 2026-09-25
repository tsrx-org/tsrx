---
'@tsrx/prettier-plugin': patch
---

The formatter keeps every significant space between template children. A space
between two children, or between a child and a tag, renders, so it no longer
becomes a line break, which dropped it and changed the rendered text. Like
Prettier, children separated by a space stay on one line when they fit, and a
space prints as `{" "}` where a line breaks. `{" "}` itself is treated as a
plain space.
