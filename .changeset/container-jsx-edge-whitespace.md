---
'@tsrx/core': patch
'@tsrx/solid': patch
---

JSX inside an expression container now prints the spaces and tabs at the edges of its children as `{' '}`, as the same JSX in a children list does (#1351). `<>{<div> 123 </div>}<div> 123 </div></>` prints `<div>{' '}123{' '}</div>` for both elements on every target.

- React, Preact and Hono: since `@tsrx/core` 0.6.0, an element hoisted out of a container kept its text as written. It gets `{' '}` again, as in 0.5.x. A container inside a hoisted element (`<div>{<span> a </span>}</div>`) now gets it too, which no earlier version did.
- Solid: the rule only reached the elements a component's output lists directly. JSX in a container, an attribute value, a callback, a `const` or a module-level declaration, and an element nested in an `@if`, `@switch`, `@for` or `@try` body, kept its text as written. All of these now get `{' '}`.
- Vue already printed both forms the same and is unchanged.

This changes what renders in those places, in the same way the same JSX in a children list already rendered:

- On Solid, text with two or more whitespace characters or a tab at an edge now renders as written. Solid's compiler reads a whitespace run in JSX text as one space but keeps a `{'  '}` literal, so `{<b>  1  </b>}` rendered `" 1 "`; it now renders `"  1  "`, and an edge tab stays a tab.
- On React, Preact, Hono and Solid, an element or component whose text has edge whitespace gets three children instead of one string. A component that expects `children` to be a string gets `[' ', 'a', ' ']`, React server rendering writes `<!-- -->` between the parts, and React throws for `<textarea> a </textarea>` and renders `<title> a </title>` empty.

In the editor, text whose edge whitespace prints as `{' '}` now maps from where the text starts rather than from the whitespace before it, so a `@` typed after a space at the start of an element's text, as in `<div> @</div>`, gets directive completions.
