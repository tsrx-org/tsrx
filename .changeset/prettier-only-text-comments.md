---
'@tsrx/prettier-plugin': patch
'@tsrx/core': patch
---

Keep an element's only text one child when a comment sits before or after it. The compiler leaves out a comment-only `{/* … */}` (or a TSRX `/* … */`) at either end of an element's children, so `<textarea>{/* note */} Some text </textarea>` still gives the `<textarea>` one string. The formatter laid such an element out as Prettier does once it broke, with the edge spaces as `{" "}` children, which gave it three children again. The comments now stay beside the text, and the text keeps its edge spaces as an element's only text does. A comment the compiler keeps (a `@ts-expect-error` or a JSDoc comment), a TSRX `// …` comment, which ends its line, and a text beside a comment whose words can't go on separate lines (one with a non-breaking space, U+200B or a reference to whitespace) print as before. `@tsrx/core` exports `renderChildren`, the children a compiler renders for a template node, which the formatter uses to decide.
