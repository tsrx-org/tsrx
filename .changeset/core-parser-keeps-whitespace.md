---
'@tsrx/core': minor
---

Give an element's and a fragment's children exactly the shape TSX's parsers (TypeScript, Babel, oxc, SWC) give them, so every character between the tags is in the tree:

- Whitespace-only text is kept as a `JSXText`, including the layout indentation between children, after an opening tag and before a closing tag, which the parser used to drop.
- Every comment between children is an empty `{}` of its own (a `JSXExpressionContainer` with a `JSXEmptyExpression`, no braces in the source), with the comment in the `JSXEmptyExpression`'s `innerComments`, as `{/* … */}` is in TSX. Before, a comment with nothing rendering on one side attached to a neighbouring child.
- The whitespace and comments right after an `@if`, `@for`, `@switch` or `@try` block are text and comments too. This fixes a space before a comment after a block being lost: `} // c`, then `two` on the next line, now renders ` two` as TSX does.
- Text before a comment that ends an element's children was dropped when the element was in a `{…}` container or an attribute value (`{x && <span>a /* c */</span>}` rendered an empty `<span>`). It is kept now.
- The new `isLayoutWhitespace(node)` export tells whether a `JSXText` renders nothing under JSX's whitespace rule (empty, or only spaces, tabs and line breaks with a line break among them). Tools that read the tree can use it to skip that text, as core's compilers do; what renders is unchanged.
