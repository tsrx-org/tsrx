---
'@tsrx/core': patch
---

Scoped CSS keeps more rules that the browser matches but the compiler commented out as `(unused)`:

- Attribute selectors on attributes whose values HTML matches in any case, such as `type` and `dir`. Before, `input[type="TEXT"]` next to `<input type="text">` was dropped. An `s` flag still asks for an exact match.
- Sibling rules (`+` and `~`) whose elements are apart in the source but siblings in the DOM. Before, `.a + .b` was dropped when text, a fragment, or a `@if`, `@else if`, `@for`, `@switch`, `@try`, or `@{ … }` body sat between or around the two elements, and `.a + .a` was dropped for an element repeated by `@for`.
- Sibling rules whose siblings the compiler cannot place: an element in an expression (`{show && <i class="a" />}`), an element passed to a component as a child or prop, and an element with a dynamic `class`. A `<title>`, `<meta>`, or `<link>` between two elements no longer separates them either, since React moves those into `<head>`.
