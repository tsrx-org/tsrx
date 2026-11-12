---
'@tsrx/core': patch
'@tsrx/language-server': patch
'@tsrx/typescript-plugin': patch
---

A loose compile, the one the editor, `tsrx-tsc` and `@tsrx/content-mapper` run, now reports an unclosed tag (TSRX1001) or a mismatched closing tag (TSRX1002), as a collecting compile does, instead of recovering silently. `<div>` with no closing tag, `<div><span></div>` and `return <div>;` now show an error in the editor and through TypeScript 7's `tsc --runExternalCode`, where the build's strict compile already rejected them.

The editor's generated code now closes such a tag, with a closing tag that has no mapping, so it is valid TSX: TypeScript no longer adds TS17008 or TS1005 to the parser's error, and hover, completions and diagnostics elsewhere in the file keep working. An undefined component left unclosed, such as `<div><Missing>valid</div>`, is reported as undefined once, at its name, not again on a closing tag around it, including a dynamic one or one followed by more text. The language server shows an error whose position has no mapping (an unclosed tag is reported at the `}` or `;` that ends its template) on the nearest code before it, not at the start of the file. The tsserver plugin's closing-tag answer (`getJsxClosingTagAtPosition`) reads the parsed source for such a tag, as the language server's auto-insert does. Strict and collecting compiles are unchanged.
