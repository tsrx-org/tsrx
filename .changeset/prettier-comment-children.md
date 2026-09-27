---
'@tsrx/prettier-plugin': patch
---

Lay out a comment between JSX children as Prettier lays out `{/* … */}`, which it now renders like in TSX, and print it as written, without braces. A line comment ends its line and keeps whitespace before it after text; a `// prettier-ignore` before a child keeps that child as written. The text around comments is printed as written, so formatting no longer adds a space next to a comment that would now render.
