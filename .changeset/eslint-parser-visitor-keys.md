---
'@tsrx/eslint-parser': patch
---

Give ESLint typescript-eslint's visitor keys, under the parser's own. For a node type without keys, ESLint visited the node's properties in the order the parser set them: a label after its statement, a `case` test after its consequent, a call's type arguments after its arguments, and decorators last. So rules that follow the code path reported falsely even in plain JavaScript. For example, `no-useless-assignment` reported a value read only in a `case` test or a labelled block. `no-inline-comments` also reported a comment that is all a JSX expression container holds, since ESLint walked into the comment as if it were a node. For the same reason, `indent` skipped a comment that is all a block holds; it now checks that comment's indentation, as it does with espree and typescript-eslint's parser, so it can report lines it didn't before.
