---
'@tsrx/prettier-plugin': patch
---

Keep a non-breaking space typed before or after a `@{ … }` block that is an
element's only child. The formatter took it for layout whitespace, hugged the
block (`<section>@{ … }</section>`) and dropped the space, which renders. It now
uses `isLayoutWhitespace` from `@tsrx/core`, so only spaces, tabs and line
breaks count as whitespace, as in JSX.
