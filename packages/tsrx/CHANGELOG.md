# @tsrx/core

## 0.6.1

### Patch Changes

- [#1357](https://github.com/tsrx-org/tsrx/pull/1357)
  [`1668091`](https://github.com/tsrx-org/tsrx/commit/1668091afe1eb8e59bdca59621b11aee3ce40e5c)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A name exported twice,
  by two blocks of one namespace or ambient module or by the module itself
  (`export default 1; … export default 2;`), is now reported by position among the
  other errors, as tsc sorts them: a collecting parse records those errors at
  their positions, and a strict parse throws the first, where it threw an error
  that comes later. Before, they came after every error found while the module was
  read, such as a redeclaration later in a namespace's second block
  (`namespace N { export const a = 2; export const a = 3; }`) or a duplicate
  parameter (`function f(x, x) {}`).

- [#1344](https://github.com/tsrx-org/tsrx/pull/1344)
  [`760f9fe`](https://github.com/tsrx-org/tsrx/commit/760f9fe5bc5bf51b8eec56743da154f88160a08a)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A CSS syntax error in a
  `<style>` block (TSRX3013) now has a position: where the CSS parser stopped,
  such as a stray `}` or the end of a rule left without its `}`. A build throws it
  with its line and column, as other syntax errors, and Prettier reports it there.
  The editor's compile, which used to drop it and keep the rules before it, now
  reports it too; an unclosed `<style>`, still being typed, gets only its
  TSRX1001. `parseStyle` gives such an error `pos`, and `loc` for a sheet with a
  `body` origin.

- [#1354](https://github.com/tsrx-org/tsrx/pull/1354)
  [`7e4aaf0`](https://github.com/tsrx-org/tsrx/commit/7e4aaf007deda3af77f24a7daf38ba196802c5d1)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A directive's clause
  that no directive takes in element children is now an error, TSRX1012, at its
  keyword, in every mode: `@else` before `{` or `if`, `@empty` or `@pending`
  before `{`, `@catch` before `{` or `(`, `@case …:` and `@default:`, written
  after text, an element or an expression container
  (`@if (ok) { <i /> } note @else { <b /> }`), in the wrong order
  (`@try { … } @catch (e) { … } @pending { … }`), or with no directive before it.
  It compiled before as text, and its `{ … }` rendered whatever the directive did.
  A clause right after its block, with only comments between, is unchanged, and
  `&[#64](https://github.com/tsrx-org/tsrx/issues/64);else` writes the text.

  `@tsrx/eslint-parser` reports TSRX1012 as a parse error, as it does a clause
  written without its `@` (TSRX1009).

- [#1332](https://github.com/tsrx-org/tsrx/pull/1332)
  [`3376fa2`](https://github.com/tsrx-org/tsrx/commit/3376fa2ad40d6ba7cf43845c17e0a10dd130dd89)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - An attribute with an
  empty value, such as `title={}` or `title={/* c */}`, is now an error: TS17000,
  at its braces, where TypeScript reports it, in acorn-typescript's words
  (`JSX attributes must only be assigned a non-empty expression`). A strict
  compile throws it, and a collecting or loose compile records it and keeps the
  attribute. It compiled before with no error, and the next tool rejected
  `title={}` in the output.

- [#1342](https://github.com/tsrx-org/tsrx/pull/1342)
  [`440bd21`](https://github.com/tsrx-org/tsrx/commit/440bd21bedc3e32a939f7cd9130bc6e0728ab6cd)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - An `@for` body can
  declare the item's or the index's name again, as a `for...of` body can:
  `@for (const { id } of rows) { const { id } = other; ... }` no longer compiles
  to a duplicate declaration on React, Preact, Hono, Solid or Vue. The body runs
  in a block of its own, and a key the head gives (`key id`, or the index an index
  loop is keyed by) still reads the head's name.

  A default in an `@for` item pattern can read the loop's index, as in
  `@for (const [a = 'r' + i, b] of rows; index i)`. It no longer throws "Cannot
  access 'i' before initialization" when a row needs the default, and on Solid a
  keyed loop's default reads the index number instead of its accessor. The loop
  callback takes the item whole and destructures it once the index is set.

- [#1343](https://github.com/tsrx-org/tsrx/pull/1343)
  [`1148a6e`](https://github.com/tsrx-org/tsrx/commit/1148a6e66512d73b21ae36c1497032f9fa6076d4)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - When a generic arrow
  function's body has a syntax error
  (`const f = <T,>(x: T) => { const z; return x +; };`), a collecting parse now
  records the checker errors before it, such as TS1155 for `const z;`, and then
  throws the syntax error, as it does for an arrow function without type
  parameters. Before, it recorded nothing, where a strict parse threw TS1155. A
  generic async arrow function keeps its body's errors only; its parameters'
  errors come once it's read, as before. In a signature's parameter default, a
  strict parse now throws that TS1155 too, as for an arrow function without type
  parameters.

- [#1341](https://github.com/tsrx-org/tsrx/pull/1341)
  [`462cdbb`](https://github.com/tsrx-org/tsrx/commit/462cdbb17b8f5e2696fe59c02db26313331d7b5b)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The arguments of a
  `:not()`, `:is()`, `:where()` or `:has()` right after `:global(…)` in the same
  compound are now kept as written: they are global like the rest of the compound,
  so they are never commented out as unused or scoped. Before,
  `:global(.x):not(.z) .y` compiled to `.x:not(/* (unused) .z*/) .y.<hash>`, an
  empty `:not()` that lightningcss rejects (`Invalid empty selector`), so a
  production build failed; `:is()`, `:where()` and `:has()` were emptied the same
  way and then matched nothing, and an argument that matched an element of the
  component got the hash (`.x:not(.y:where(.<hash>))`). Now they compile to
  `.x:not(.z) .y.<hash>`, `.x:is(.z) .y.<hash>` and `.x:not(.y) .y.<hash>`. The
  same holds in themes. Whether the rule as a whole can match an element of the
  component is decided as before.

- [#1334](https://github.com/tsrx-org/tsrx/pull/1334)
  [`522adf4`](https://github.com/tsrx-org/tsrx/commit/522adf487da2e085cd72f4623934e53cde8b335c)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The `/* (unused) … */`
  comment over a pruned selector no longer loses its opening or closing marker
  when it sits at the edge of a `:global(…)` or `:global` selector. Before,
  removing the `:global(`, `)` or `:global` text also removed the marker, so in
  `.y:is(.z,:global(.w))`, `.z,:global(.w)`, `:global(.x) .z, .y`,
  `.y, .z:global(.k)` or `.y, .z:global` the comment ran to the end of the
  stylesheet and swallowed the rules after it (a production build failed in
  lightningcss with `Unexpected end of input`), or a stray `*/` was left behind.
  `.y:is(.z,:global(.w))` now compiles to `.y.<hash>:is(/* (unused) .z,*/.w)`, as
  `.y:is(.z, :global(.w))` with a space already did.

- [#1347](https://github.com/tsrx-org/tsrx/pull/1347)
  [`af56597`](https://github.com/tsrx-org/tsrx/commit/af56597e28b606a56a0864bb4401b50520e729fa)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Parsing a module with
  many `let`, `const` or `using` declarations in one scope no longer spends time
  quadratic in their number on TSRX's own redeclaration check: it looks a name up
  in an index instead of scanning the scope's list of names. acorn's own
  redeclaration check still scans arrays, so very large scopes still parse in more
  than linear time.

- [#1333](https://github.com/tsrx-org/tsrx/pull/1333)
  [`ab88cd8`](https://github.com/tsrx-org/tsrx/commit/ab88cd80e8109ca8273383328ed40de180674dba)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - In a `.mts` or `.cts`
  file, a type assertion that holds another (`<A>(<B>x)`) now reports its own
  TS7059 first, as tsc does: a strict parse throws the outer assertion's TS7059,
  and a collecting parse records it before the errors in the operand, by position.
  Before, both reported the innermost assertion first.

- [#1335](https://github.com/tsrx-org/tsrx/pull/1335)
  [`dcf9704`](https://github.com/tsrx-org/tsrx/commit/dcf9704fd1c1e7ead0e608a1faaa4316ce4e462e)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A `pending` block on a
  plain `try` (not `@try`) is now an error on the React, Preact, Solid, Vue and
  Hono targets: TS1472 (`'catch' or 'finally' expected.`) at `pending`, where
  TypeScript reports it. So is a reset parameter after a plain `catch` parameter,
  `catch (e, reset)`: TS1005 (`')' expected.`) at the comma. Both compiled with no
  error before, the `pending` block and the reset parameter left out, so a `try`
  with only a `pending` block compiled to JavaScript that doesn't parse. A
  collecting or loose compile records the error and keeps the `pending` block's
  code in a `finally` block, so the editor reports TS1472 at `pending` instead of
  failing to compile the file, and still checks that code. The parser still reads
  both for `@tsrx/ripple`, which compiles them.

  The Prettier plugin now prints a plain `try`'s `pending` block, which formatting
  deleted before.

- [#1358](https://github.com/tsrx-org/tsrx/pull/1358)
  [`463bd99`](https://github.com/tsrx-org/tsrx/commit/463bd999b2ae1b9c686ad989ff0bd5298964773f)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Sort Imports and
  Organize Imports now sort the re-exports of a `.tsrx` file as in a `.tsx` file,
  with the React, Preact, Solid, Vue and Hono targets, on TypeScript 5.9 and 6 and
  on TypeScript 7. TypeScript sorts each block of imports and re-exports that no
  blank line splits, and the editor code put a blank line between an import and a
  re-export and between the two kinds of re-export, so each was sorted on its own.
  The editor code now has the source's blocks: a blank line between imports and
  re-exports where the source has one, and only there. It also writes a re-export
  as it is in the source, not as `export *  from` with two spaces, and maps its
  module string and `;` as an import's, which TypeScript 7 needs to apply the
  edit.

- [#1345](https://github.com/tsrx-org/tsrx/pull/1345)
  [`1c472c2`](https://github.com/tsrx-org/tsrx/commit/1c472c26802cef015346b2a82d1f66863f1c3ca7)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - In the editor, a member
  expression or call written right after a `{`, as in `function f() {user.a.b;` or
  `<p>@{user.a.b}</p>`, now maps to its own text. It mapped from the line break
  and indent the printer puts after the `{`, so a diagnostic on it started that
  many characters late: TypeScript's `'user.a' is possibly 'undefined'` showed on
  `er.a`, and `TSRX2035` on `a.b`.

- [#1339](https://github.com/tsrx-org/tsrx/pull/1339)
  [`55cb0b1`](https://github.com/tsrx-org/tsrx/commit/55cb0b1640918979802fff5eb053078d21eaf863)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Text right after a
  directive's block that the tokenizer can't read as code, such as `1st prize`,
  `10px`, `[#1](https://github.com/tsrx-org/tsrx/issues/1)`, `0x`, `'s` or an
  unclosed quote, is now read as text, as after an element, in every mode: it
  threw `Identifier directly after number` (TS1351) or a similar error. In an
  element in a `{ … }` container, the same text after a later child
  (`@if (ok) {<i />}<b /> 1st prize`) no longer throws either.

- [#1356](https://github.com/tsrx-org/tsrx/pull/1356)
  [`ba3db46`](https://github.com/tsrx-org/tsrx/commit/ba3db468c6b2bf067374ddcb6ded12381b8d9bf3)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - In a `.mts` or `.cts`
  file, a collecting parse no longer records TS7060 for a generic arrow function
  in a parameter default that TypeScript's checker doesn't check, as tsc reports
  only TS2371 there: in a function or constructor type, a call, construct or
  method signature, a `declare` function or class, or an abstract method. A
  default keeps it where tsc needs the parameter's type: an overload's, a binding
  pattern's, and without a type annotation, a rest parameter's or one whose
  parameter a `typeof` in the signature names. The errors of a function's or
  method's parameter list and return type now come in tsc's order, by position, so
  an overload's or abstract method's TS2371 comes before the errors after it, and
  a strict parse throws it.

- [#1355](https://github.com/tsrx-org/tsrx/pull/1355)
  [`a0e9a7a`](https://github.com/tsrx-org/tsrx/commit/a0e9a7a85a2f478fa63b05f085c9952a1fe317b4)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The editor shows an
  unclosed `<>`'s TSRX1001 on the `<>`, as TypeScript 7 does, instead of on its
  first child or on the function's name. The compile gives an error an anchor
  mapping where the editor's code leaves its source out, but it skipped any error
  whose position esrap's source map records, and a `<>` the editor's code prints
  has no mapping of its own. Such an error now gets an anchor on that `<>`, or,
  where esrap records the `<>` at code other than a `<>`, as for the inner one of
  `<><><div>`, the anchor any such error gets, so each `<>` left open shows on
  itself.

- [#1353](https://github.com/tsrx-org/tsrx/pull/1353)
  [`10059ac`](https://github.com/tsrx-org/tsrx/commit/10059ac90e00ab4dbeb6aa26dc96de5b2795672a)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A collecting or loose
  parse reports an unclosed tag (TSRX1001) and goes on, instead of throwing a
  later error caused by it, in these shapes:

  - A tag left open in code, where the text right after it, or after its last
    child, starts with what the code around it goes on with: `)` or `,` in
    parentheses (`return (<div>);`, `f(<div>, x)`), `]` or `,` right after `[` or
    `,` (`[<div>]`), `:` after a conditional's `?` (`c ? <b> : null`), or `}` in a
    template literal's `${…}`. That text is read as code again, so Prettier,
    ESLint and the editor show TSRX1001 instead of `Unexpected token`. Other text
    stays the element's, as before (`@{ <div>: label }`).
  - An unclosed `<style>` or `<script>`, whose body now ends at the next tag
    inside a template, or at the `}` that closes the block it's in
    (`@{ <style>.a {} }`; braces in strings and comments don't count), in a
    collecting parse as in a loose one. A collecting parse no longer throws the
    CSS error (`Expected identifier`) of the rest of the file, and the editor no
    longer reports `'}' expected` at the end of the file.

  The editor's code no longer moves an unclosed element or fragment to a
  module-level constant, where it lost the closing tag that keeps the code valid.

- [#1346](https://github.com/tsrx-org/tsrx/pull/1346)
  [`2015571`](https://github.com/tsrx-org/tsrx/commit/20155718ffe8c8d445dd93729168d8a888a5e7bb)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - An unclosed tag or `<>`
  inside `{…}` no longer breaks a collecting or loose compile. On React, Preact
  and Hono's server target, an element holding one was hoisted to a module-level
  static before the compile closed the tag, so `<div>{<>}</div>` threw
  `TypeError: Cannot read properties of null (reading 'type')`, which the editor
  showed at the start of the file, and `<div>{<b>}</div>` left the editor's code
  unclosed, so TypeScript added five errors to TSRX1001. Such an element is no
  longer hoisted: the compile reports TSRX1001 alone and the editor's code closes
  the tag. The closing tag the editor's code adds to an unclosed tag has no
  mapping on Solid in braces and on every target for a dynamic tag (`<{Tag}>`), as
  for other tags, and the mapping of the braces around it no longer covers it, so
  TypeScript's error on it, such as TS2304 for an undefined `<Missing>`, isn't
  shown a second time at the end of the braces. Compiled output of valid files
  doesn't change.

- [#1336](https://github.com/tsrx-org/tsrx/pull/1336)
  [`fb920eb`](https://github.com/tsrx-org/tsrx/commit/fb920eb190d03ee81dc4b2b2ee57cddc93333429)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - TypeScript's errors on
  an authored `return` of an element, such as TS7027 `Unreachable code detected.`
  for `return; return <div></div>;`, now map back to the `.tsrx` file, in
  `tsrx-tsc` and the editor. The `return` that the element lowers to keeps the
  authored statement's location, so its keyword and its end map as for any other
  `return`, also when the output hoists the element out of it or the `return` has
  no `;`.

- [#1359](https://github.com/tsrx-org/tsrx/pull/1359)
  [`a0f7749`](https://github.com/tsrx-org/tsrx/commit/a0f77497f4370b2ff04412b35f8b3f0a0c0748a8)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On the Vue target, a
  keyed `@for` row whose body is a fragment no longer throws
  `ReferenceError: __Fragment is not defined` when the loop doesn't render through
  `VaporFor`: a loop with `@empty`, or a body with setup statements before the
  fragment. The row is a `<Fragment key>` with `Fragment` imported from `vue`,
  which vue-jsx-vapor renders as a keyed fragment in the browser and on the
  server, and the editor no longer reports TS2304 for it. In a module that
  declares something else named `Fragment`, the row is an unkeyed fragment
  instead; such a loop recreates its rows when they move, so the key kept no row
  state there. `@tsrx/core` exports `FRAGMENT_INTERNAL_NAME`, the name the Vue
  target finds the generated rows by.

## 0.6.0

### Minor Changes

- [#1223](https://github.com/tsrx-org/tsrx/pull/1223)
  [`73c170b`](https://github.com/tsrx-org/tsrx/commit/73c170b4d14f961ce49080c604e233886e71e79d)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A `var` declared in an
  `@if`, `@for`, `@switch` or `@try` body (including `@else`, `@empty`, `@case`,
  `@default`, `@pending` and `@catch` bodies), in a `@{ … }` block that isn't a
  function's own body (a child or a value, such as
  `<div>@{ var y = 1; <p>{y}</p> }</div>`), or in a plain block or loop inside one
  of these, is now reported as TSRX2030 on every target, at the `var` keyword,
  with a hint to use `const` or `let`. Before, it compiled without an error, but
  the body or block runs in a function of its own, so code after it that read the
  variable threw `ReferenceError` at render. A `var` in a component's own `@{ … }`
  body, or in a function or class inside the body or block, is still allowed.

  Migration: declare the variable with `const` or `let`. If code after the
  directive or block reads the value, compute it before instead, since some
  targets run a directive body later or more than once.

- [#1255](https://github.com/tsrx-org/tsrx/pull/1255)
  [`c28d0b7`](https://github.com/tsrx-org/tsrx/commit/c28d0b7356b9c4456cbe4009c5ea2d38260d7660)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Type arguments after a
  dynamic tag, as in `<{Tag}<T> />`, now parse and report TSRX2033 on every
  target, which says to declare a typed alias above the element:
  `const Typed = Tag<T>;`, then `<{Typed} />`. Most of them used to fail with
  "Unexpected token". Inside an element's `{ }`, such as
  `<div>{<{Tag}<string> />}</div>`, they parsed and compiled, but the editor's
  code passed them to the dynamic helper, so they typed the helper instead of the
  tag's props; that is now an error too. Collect mode and the editor record the
  error and leave the type arguments out of the generated code. The Prettier
  plugin reports the error instead of formatting the file, as it does for
  TSRX2014.

  Migration: declare a typed alias with an instantiation expression above the
  element, `const Typed = Tag<string>;`, and use `<{Typed} />`.

- [#1133](https://github.com/tsrx-org/tsrx/pull/1133)
  [`33022ba`](https://github.com/tsrx-org/tsrx/commit/33022ba2356f9c375242b6edc63ce65fd6215b89)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - An `@for` head that
  assigns to an existing variable or property, as in `@for (state.item of items)`
  or `@for (item of items)`, is now reported as TSRX2027 on every target, wherever
  the loop is nested, instead of compiling to invalid output or to a callback
  parameter that shadows the variable. A `using` or `await using` loop variable is
  reported the same way instead of losing its disposal.

  Migration: a head without `const` or `let` that compiled before, such as
  `@for (item of items)`, is now an error. Declare the loop variable:
  `@for (const item of items)`. To dispose each item, declare the resource in the
  loop body: `@for (const item of items) { using resource = item; ... }`.

  An `await` in a destructuring default of an `@for` head, as in
  `@for (const [item = await load()] of rows)`, no longer produces a module that
  fails to load with "Illegal await-expression in formal parameters of async
  function". The loop callback now destructures the item first and runs the loop
  body in a block of its own, so the body's declarations can't shadow names the
  head reads.

- [#1172](https://github.com/tsrx-org/tsrx/pull/1172)
  [`8d1541b`](https://github.com/tsrx-org/tsrx/commit/8d1541ba83643e51f86b8f46d8034c56bd70d17c)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - An `@for` head that
  declares its loop variable with `var`, as in `@for (var item of items)`, is now
  reported as TSRX2027 on every target, with a hint to use `const` or `let`.
  Before, it compiled without an error, but the variable only existed inside the
  loop, so code after the loop that read it threw `ReferenceError` at render.

  Migration: declare the loop variable with `const` or `let`:
  `@for (const item of items)`. To keep a value after the loop, assign it to a
  variable declared before the loop.

- [#1124](https://github.com/tsrx-org/tsrx/pull/1124)
  [`d18720d`](https://github.com/tsrx-org/tsrx/commit/d18720d75e143c26d015d9837fb5d1c860cc0cb9)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - In a `.tsrx` file, and
  any other file with JSX, a `<` where an expression starts begins a generic arrow
  function only where TypeScript's rule for `.tsx` files says it does
  ([#183](https://github.com/tsrx-org/tsrx/issues/183)): a type parameter followed
  by a comma, a default, or a constraint. A lone type parameter without one is now
  a tag, as in TSX, so `<T>(x) => x` no longer compiles or formats, and neither
  does `async <T>(x) => x`, which TypeScript reads as a call. To migrate, add the
  trailing comma: `<T>(x) => x` becomes `<T,>(x) => x`, `async <T>(x) => x`
  becomes `async <T,>(x) => x`, and `<const T>` becomes `<const T,>`. The errors
  for the old forms, an unclosed `<T>` tag and TS7060, now say to add it.

  The rule reads no further than the type parameter, so a generic arrow with a
  constraint compiles whatever its parameters hold (comments, regular expressions,
  template literals), and an element whose text starts like an arrow function,
  such as `<b>(i) => i</b>` or `<script>(i) => i</script>`, is read as an element
  ([#734](https://github.com/tsrx-org/tsrx/issues/734)). A template's render node
  or child is a tag wherever it starts, as before.

  A `.ts`, `.mts`, or `.cts` file has no JSX, as in TypeScript: `<T>(x) => x`
  stays a generic arrow function there, and `<T>x` is now read as a type assertion
  instead of a tag (TS7059 in a `.mts` or `.cts` file).

- [#1286](https://github.com/tsrx-org/tsrx/pull/1286)
  [`357bbcc`](https://github.com/tsrx-org/tsrx/commit/357bbcc9967848cd48a3ddcc59a4b10ed59db3a1)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Five TypeScript-coded
  errors that no source reached now either match what TypeScript reports or are
  gone:

  - `TS_ERRORS.DECLARED_IN_SCOPE` is removed, and `createScopes` no longer reports
    a name declared twice in one scope. The parser reports those with TypeScript's
    codes, and the scope check also fired on code TypeScript accepts, such as
    `var a; var a;`. The one case only it caught, a parameter that a `let` or
    `const` in a `@{ … }` body redeclares, is now TS2300 from the parser, as in a
    `{ … }` body. In a function's body, of either kind, a function that shares its
    name with another function, a `var` or a parameter is now TS2300 too, as in a
    module.
  - `TS_ERRORS.SIGNATURE_PARAMETER_NAME` is removed: a signature's parameters read
    as nothing it could report. A hole in them (`type F = (a, , b) => void`) is
    now an unexpected `,` (TS1012), as in a function's parameters, where it used
    to crash. A default in a signature without a body
    (`declare function f(a = 1): void;`, an overload, an abstract method) is
    TS2371, as in a function type, and comes by position with the list's other
    errors, before a rest parameter's TS1048. A default after `this` is
    `',' expected.` (TS1005) at its `=`, as TypeScript's parser reports it.
  - `TS_ERRORS.JSX_UNESCAPED_GREATER_THAN` (TS1382) is removed: a `>` in JSX text
    is text in TSRX, now in the JSX of a dynamic tag's expression too.
  - `TS_ERRORS.UNTERMINATED_JSX_CONTENTS` (TS17008) is removed: an element left
    open at the end of the input is TSRX1001, as in a template, in an attribute's
    JSX and in a dynamic tag's expression too.
  - `TS_ERRORS.JSX_UNESCAPED_CLOSING_BRACE` (TS1381) stays, for a `}` in the text
    of the JSX in a dynamic tag's expression, as TypeScript reports it for JSX
    text.

### Patch Changes

- [#1258](https://github.com/tsrx-org/tsrx/pull/1258)
  [`2bc4f1f`](https://github.com/tsrx-org/tsrx/commit/2bc4f1fc5fcb9863c926ab3d01b0407e89bbf639)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A ref list written on
  an element, `ref={[a, b]}`, now calls every ref in it on React, Preact, Hono and
  Vue, as it already did on Solid. These runtimes take a single ref, so the
  compiler passes the list to `__mergeRefs`: React and Hono share the merged ref
  through `merge_element_refs`'s cache, so an inline list is applied once, and
  Preact gets a new callback per render, as its merged refs already do. A list can
  nest, and a falsy entry such as the `false` of `cond && cb` is left out. Beside
  a spread, Preact and Vue no longer drop the list.

  The public `mergeRefs` now reads a ref list as the refs in it and leaves out a
  value that is not a ref instead of throwing, and its type takes lists and the
  falsy `false`, `0` and `''` of `cond && cb`, so the editor accepts
  `ref={[a, b]}` on every target. `merge_element_refs` merges a lone ref object
  from a list rather than giving it back. The `MULTIPLE_REFS` hint no longer
  limits `ref={[a, b]}` to some targets.

- [#1301](https://github.com/tsrx-org/tsrx/pull/1301)
  [`fb35a0b`](https://github.com/tsrx-org/tsrx/commit/fb35a0bf5bbea972889e2024b535d0fee3227856)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - An `await using`
  declaration in a template body now makes that body async, as `await` does.
  Before, a body such as `@try { await using resource = acquire(); … }` compiled
  into a synchronous function, which is invalid output.

- [#1317](https://github.com/tsrx-org/tsrx/pull/1317)
  [`28440d7`](https://github.com/tsrx-org/tsrx/commit/28440d79a59d6cf54530f386471687f99e914ae8)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A block
  `@ts-expect-error` or `@ts-ignore` comment whose last line starts with `*`, such
  as `/*` followed by ` * @ts-expect-error */`, now applies in `tsrx-tsc` and the
  editor, as it does in TypeScript. Before, the type view dropped it, so the error
  it suppresses was reported.

- [#1251](https://github.com/tsrx-org/tsrx/pull/1251)
  [`2646239`](https://github.com/tsrx-org/tsrx/commit/26462399753081501e78478de7495d15775e411e)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Two kinds of TypeScript
  errors in `.tsrx` files are now reported where they are written
  ([#1248](https://github.com/tsrx-org/tsrx/issues/1248)):

  - An unreachable `break` or `continue` (TS7027). Inside an arrow function,
    `tsrx-tsc` and the TypeScript 5.9 plugin reported it several columns late,
    mapped by offset through the arrow. Inside a function expression or
    declaration, it was dropped on TypeScript 5.9 and 7.
  - A duplicate index signature (TS2374). TypeScript 5.9 dropped it, and
    TypeScript 7 placed it at the nearest earlier position, such as before a
    comment or the `{` of a class.

  The statement and the signature now map their start and end, and their first
  token.

- [#1091](https://github.com/tsrx-org/tsrx/pull/1091)
  [`6eaee99`](https://github.com/tsrx-org/tsrx/commit/6eaee992105984b13c38f9de4edfd6ca99eae399)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Fix four Bun plugin
  bugs:

  - Plugin instances that split `.tsrx` files with `include`/`exclude` now each
    emit the scoped CSS of the files they compile. Before, the first instance
    served an empty stylesheet for every file another instance compiled (React,
    Preact, Solid, Vue).
  - Production builds now use the production JSX runtime when the tsconfig selects
    an automatic JSX setting such as `"jsx": "react-jsx"`, or none. Before,
    compiled `.tsrx` modules always called `jsxDEV` from the development runtime,
    which is undefined in React's production build, so components threw when they
    rendered (React, Preact, Hono). Under the classic `"jsx": "react"`, Bun keeps
    using the development runtime, as before. The Hono plugin no longer requires
    `Bun.Transpiler`.
  - When `Bun.build()` omits `root`, `tsrx.platform` is read from the tsconfig
    nearest the entrypoints' common directory, which is Bun's default root,
    instead of the working directory. When every entrypoint is an in-memory
    `files` entry, the working directory is still used, as Bun does.
  - With `Bun.plugin()`, including `bun:test` preloads,
    `import.meta.env.platform.*` values in compiled `.tsrx` output are now written
    in. Before, reading a flag as a value threw `undefined is not an object`.

  `@tsrx/core/config` adds `resolveTsconfigJsx()`, which reads the effective
  `compilerOptions.jsx` of the nearest tsconfig.

- [#1295](https://github.com/tsrx-org/tsrx/pull/1295)
  [`972010b`](https://github.com/tsrx-org/tsrx/commit/972010b3654c907baa25cf2f03e3cad9b3d6c6fd)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Warn about a `@{ … }`
  with no output whose only statement is an expression there only for its value,
  such as `<p>@{user.name}</p>`, which renders nothing: `TSRX2035`, the first
  warning TSRX itself reports. In a child list the message says how to render an
  `@` and then the value. A call, an assignment and other expressions that may be
  there for their effect don't warn, nor does a directive, a block with output, or
  a block with more than one statement. Like every warning, it shows only in
  compiles that collect diagnostics, such as the editor and `tsrx-tsc`, and a
  build drops it. Compiled output doesn't change.

  `@tsrx/mcp` now gives each compile error a `severity`, and a warning no longer
  makes `ok` false. `@tsrx/content-mapper` leaves warnings out, since TypeScript 7
  would show each as an error, fail `tsc` on code that compiles, and hide
  TypeScript's own errors in the statement that holds it. The VS Code extension
  keeps the language server's warnings when TypeScript 7 serves the workspace, as
  the content mapper doesn't send them. So on TypeScript 7,
  `tsc --runExternalCode`, `tsrx-tsc` and editors that run the language server
  with `--typescript-backend=native` don't show warnings yet.

- [#1119](https://github.com/tsrx-org/tsrx/pull/1119)
  [`dac81a4`](https://github.com/tsrx-org/tsrx/commit/dac81a418448476aa4ab60999096dc629627c9b4)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Parsing a file with
  many statements before a distant comment no longer slows down quadratically.
  Comment attachment scanned all the code between each statement and the next
  comment, once per statement. It now checks for a blank line only when that gap
  is whitespace, and looks for a `)` only after a statement header
  ([#990](https://github.com/tsrx-org/tsrx/issues/990)).

- [#1183](https://github.com/tsrx-org/tsrx/pull/1183)
  [`677d574`](https://github.com/tsrx-org/tsrx/commit/677d5743b8cb3d3cd57504ef81f6323ef45b8399)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Parsing a long list
  before a comment no longer slows down quadratically. Comment attachment searched
  a node's list (the statements of a file or block, the elements of an array, the
  properties of an object, a function's parameters, an element's attributes or
  children, and others) for each of its entries. It now indexes each list once
  ([#1163](https://github.com/tsrx-org/tsrx/issues/1163)).

- [#1167](https://github.com/tsrx-org/tsrx/pull/1167)
  [`72956b0`](https://github.com/tsrx-org/tsrx/commit/72956b0d9a4a55c56b210b1b7669f7e04a77709c)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Keep the parentheses
  around an element or fragment in compiled output wherever TSX needs them. That
  covers the object of a member access, call, index, tagged template, non-null
  assertion or instantiation expression (`(<b />)<T>`), a `new` callee, a
  superclass, and the end of the left operand of `<`.
  `return (<b>ok</b>).type === x ? 1 : 2;` compiled to
  `return <b>ok</b>.type === x ? 1 : 2;`, which TypeScript reads as
  `return <b>ok</b>;` followed by a separate statement
  ([#1166](https://github.com/tsrx-org/tsrx/issues/1166)).
  `class A extends (<div />) {}` compiled to `class A extends <div /> {}`, which
  TypeScript doesn't parse ([#745](https://github.com/tsrx-org/tsrx/issues/745)).
  `(<b />) < x` compiled to `<b /> < x`, where TypeScript reads the `<` as the
  start of another element. The editor output already kept them.

- [#1082](https://github.com/tsrx-org/tsrx/pull/1082)
  [`fe2c377`](https://github.com/tsrx-org/tsrx/commit/fe2c377664bdcac510bcd137b6468bec7efe9eeb)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Compose TSRX platform
  flags into compatible JSON `import.meta.env` defaults so Storybook Vite builds
  and development canvases work with an explicit platform. Keep rejecting
  conflicting or incomplete platform definitions.

  Refresh extracted Solid and Vue CSS before hot-update requests so simultaneous
  template and style edits use matching scope hashes, and removing styles clears
  the cached sheet. An update that doesn't compile keeps the last good CSS and
  still reloads the module, which reports the error.

- [#1113](https://github.com/tsrx-org/tsrx/pull/1113)
  [`6297ffa`](https://github.com/tsrx-org/tsrx/commit/6297ffa6527f297de69edb95af7a74a87b804970)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The editor reports the
  fragment error for a `@{ … }` body in which `@for`, `@if`, `@switch` or `@try`
  is followed by another output node
  ([#197](https://github.com/tsrx-org/tsrx/issues/197)). Before, the loose compile
  that the editor tools and `tsrx-tsc` use threw
  `Not implemented: JSXForExpression` (or `JSXIfExpression`,
  `JSXSwitchExpression`, `JSXTryExpression`) on React, Preact, Vue and Hono, so
  the editor showed that message at the top of the file, lost the collected
  errors, and dropped every TypeScript diagnostic in the file. The control flow's
  body now keeps its types too.

- [#1196](https://github.com/tsrx-org/tsrx/pull/1196)
  [`25e5844`](https://github.com/tsrx-org/tsrx/commit/25e58444734d535385f2ca4310445b34286369cb)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - An export list inside a
  `declare namespace` or `declare module` body can now name a function declared in
  that body, such as `declare namespace Q { function f(): void; export { f }; }`,
  overloads and `export { f as g }` included. It can also name a declaration that
  comes later in the body, such as
  `declare namespace Q { export { c }; const c: number; }`. Before, both failed
  with `Export 'c' is not defined`. An export of a name that the body and the
  scopes around it don't declare is still reported, now also when a later export
  list in another body or namespace names a declaration of the same name.

- [#1197](https://github.com/tsrx-org/tsrx/pull/1197)
  [`8c6d037`](https://github.com/tsrx-org/tsrx/commit/8c6d037fdd16d28d871126bf48fba4b2583d9bbf)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Parse time now grows
  linearly with the number of sibling `@if`, `@for` and `@try` directives in an
  element or fragment. Before, each directive body left one entry on the
  tokenizer's context stack and every later directive copied that stack, so the
  time grew with the square of the sibling count. The parsed AST is unchanged.

- [#1224](https://github.com/tsrx-org/tsrx/pull/1224)
  [`54e7644`](https://github.com/tsrx-org/tsrx/commit/54e7644d256f5506fbde84e35ee5e827aaef15ad)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A control-flow
  directive used as a value in parentheses, as an argument, as a property value or
  inside a template literal's `${ }` no longer changes how the code after it is
  read. `(@if (c) { … }) / 2`, `foo(@for (…) { … }) <= y`,
  `` `${(@if (c) { … })}x` `` and `<div title={(@if (c) { … }) / 2} />` used to
  fail with "Unterminated regular expression", "Unexpected token" or "Unterminated
  template", because the token after the closing `)` or `}` was read as the start
  of a new expression. They now parse as the same code with an element in place of
  the directive does.

- [#1244](https://github.com/tsrx-org/tsrx/pull/1244)
  [`9d8ea3e`](https://github.com/tsrx-org/tsrx/commit/9d8ea3e61a0ed083af98269f703bb73e91421e64)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A `/`, `<`, `<=` or
  `<<` right after a control-flow directive used as a value inside brackets is now
  read as an operator, as after an element. `(a = @if (c) { … } / 2) => a`,
  `foo(@for (…) { … } < y)`, `[@switch (k) { … } / 2]`,
  `{ a: @try { … } @catch (e) { … } / 2 }` and `` `${@if (c) { … } / 2}` `` used
  to fail with "Unterminated regular expression" or "Unexpected token". Outside
  brackets nothing changes: a semicolon can be inserted after the directive there,
  and a `/` or `<` on the next line still starts the next statement, so
  `const x = @if (c) { … } / 2;` still fails. A `@try … @catch (e)` statement also
  no longer leaves two entries on the tokenizer's context stack each time.

- [#1189](https://github.com/tsrx-org/tsrx/pull/1189)
  [`129825c`](https://github.com/tsrx-org/tsrx/commit/129825ce427fb80b31c6fcbb148d48781a83485f)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - In the editor's view of
  a `.tsrx` file, a `@ts-expect-error` or `@ts-ignore` directive above a statement
  written over several lines now covers only the first line of the statement, as
  in TypeScript ([#1144](https://github.com/tsrx-org/tsrx/issues/1144)). The view
  used to print such a statement on one line, so the directive also hid the errors
  of its later lines, and an unused directive went unreported. A directive above a
  long statement written on one line, which the view used to split, now covers all
  of it. The compiled output is unchanged.

- [#1169](https://github.com/tsrx-org/tsrx/pull/1169)
  [`827030c`](https://github.com/tsrx-org/tsrx/commit/827030cd1441ec3156414a54a1ab6d3de1f4c34b)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The editor's view of a
  `.tsrx` file now writes imports and the ends of statements as the source does.
  The compiled output is unchanged.

  - An import is written as in the source, also over several lines, without spaces
    or with a trailing comma. On TypeScript 7, Organize Imports, Sort Imports and
    Remove Unused Imports now work when an import ends without `;`
    ([#1023](https://github.com/tsrx-org/tsrx/issues/1023)) or is written in
    another layout than the printer's
    ([#1033](https://github.com/tsrx-org/tsrx/issues/1033)).
  - On TypeScript 5.9 and 6, removing one unused name from an import also removes
    the comma next to it, as in a `.tsx` file
    ([#1025](https://github.com/tsrx-org/tsrx/issues/1025)).
  - A statement that ends without `;` in the source also ends without one in the
    editor's view, unless the next line could continue it. On TypeScript 7,
    auto-import now offers a name such as `useMemo` at the end of
    `const m = useMem` ([#1064](https://github.com/tsrx-org/tsrx/issues/1064)). On
    TypeScript 5.9 and 6, the code of an edit, such as the imports Sort Imports
    writes, uses `;` as the source does.

- [#1170](https://github.com/tsrx-org/tsrx/pull/1170)
  [`b620e02`](https://github.com/tsrx-org/tsrx/commit/b620e02c284bfdf59c105c2e5d71b14f0cc84228)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The editor and
  `tsrx-tsc` now report more TypeScript diagnostics of a `.tsrx` file where a
  `.ts` file has them:

  - In a `@{` body, the warning for an unused destructuring (TS6198) covers the
    pattern, not the text from the function's `(`
    ([#1062](https://github.com/tsrx-org/tsrx/issues/1062)).
  - A diagnostic that starts at a statement's keyword or at a binding pattern is
    no longer dropped (TypeScript 5.9 and 6) or moved to an earlier position
    (TypeScript 7): unreachable code (TS7027) on a statement that starts with
    `const`, `let`, `var`, `if`, `while`, `do`, `for`, `switch`, `throw`, `try`,
    `debugger`, `new`, `typeof`, `void`, `delete` or `enum`, or on `return 1;`; a
    declaration whose variables are all unused (TS6199); and a `typeof x`
    comparison that is never true (TS2367).
  - On TypeScript 5.9 and 6, Add missing function declaration works for a call in
    a template's output, and adds the function before the output
    ([#1027](https://github.com/tsrx-org/tsrx/issues/1027)).
  - On TypeScript 7, typing `/**` above a function offers the `/** */` JSDoc
    template ([#1066](https://github.com/tsrx-org/tsrx/issues/1066)).

- [#1219](https://github.com/tsrx-org/tsrx/pull/1219)
  [`d0a00dc`](https://github.com/tsrx-org/tsrx/commit/d0a00dc54713b459a208fb2e044158a46b0143da)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - TypeScript errors on an
  array literal or an empty type literal are now reported where they are written
  in `.tsrx` files. On TypeScript 7, TS2344 on the `{}` in `g<{}>()` landed one
  column early, on the `<`, and TS2322 on the `[]` in
  `[ {}, [] ] satisfies number[]` was reported at a generated position past the
  end of the file. `tsrx-tsc` and the TypeScript 5.9 plugin dropped the errors on
  an array inside an array, as in `[[]] satisfies number[]`. Array, object and
  type literals, and spread elements, now map their start, their end and their
  brackets or `...`, so an error on a whole literal or spread keeps both of its
  ends. On TypeScript 7 those bracket spans join the exact span over code printed
  as written. An error after a comment inside an object literal, as in
  `{ /* c */ a: 1 as string }`, is also no longer reported on the comment by
  `tsrx-tsc`, and TS2698 on `{ /* c */ ...s }` lands on the spread on both
  TypeScript 5.9 and 7 ([#1209](https://github.com/tsrx-org/tsrx/issues/1209)).

- [#1093](https://github.com/tsrx-org/tsrx/pull/1093)
  [`d5015d2`](https://github.com/tsrx-org/tsrx/commit/d5015d25b33980d0509ecccf04a341081fee70db)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - ESLint no longer
  crashes on a `.tsrx` file that uses `@switch`
  ([#913](https://github.com/tsrx-org/tsrx/issues/913)). The ESLint parser now
  gives ESLint the file's comments and tokens, so `eslint-disable` and other
  directive comments apply in `.tsrx` files
  ([#454](https://github.com/tsrx-org/tsrx/issues/454)), and rules that read
  tokens work: `no-unused-vars` reports an unused function parameter instead of
  crashing ([#228](https://github.com/tsrx-org/tsrx/issues/228)).
  `template-curly-spacing` and `indent` no longer crash on template literals and
  JSX children.

  Give ESLint the loop of a `@for` as a real `ForOfStatement`, `ForInStatement` or
  `ForStatement`, in a new `loop` field of the `JSXForExpression`. Tools that read
  a `JSXForExpression`'s `left`, `right`, `await`, `init`, `test`, `update` or
  `body` read `loop.left`, `loop.body` and so on now. Its `index`, `key` and
  `empty` stay on the `JSXForExpression`. ESLint gets the arms of a `@switch` as
  `JSXSwitchCase` nodes, not `SwitchCase`, so selectors that match `SwitchCase` no
  longer match an `@case` or `@default`.

  The parser also returns its own scope manager, built with `eslint-scope`, which
  is now a dependency of `@tsrx/eslint-parser`. `semi --fix` no longer rewrites a
  `@for` head into code that does not parse, and `init-declarations` no longer
  reports a `@for` variable. Core `no-undef` and `no-unused-vars` see the loop's
  `index`, `key` and `@empty` branch in the right scopes, so `no-undef` no longer
  reports a declared `index`
  ([#559](https://github.com/tsrx-org/tsrx/issues/559)). Loop rules such as
  `no-await-in-loop` and `guard-for-in` now apply to `@for` too.

  A parse with `keywordTokens` records every token on the program as
  `tsrx_tokens`.

- [#1085](https://github.com/tsrx-org/tsrx/pull/1085)
  [`4d1def9`](https://github.com/tsrx-org/tsrx/commit/4d1def98977820da6206df0c189a7f525203298e)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Require esrap 2.4 and
  pass it the parser's tokens for editor output. esrap 2.4 removed the
  `boundaryTokens` option that kept the keywords and punctuation of the generated
  TypeScript mapped. A fresh install of `@tsrx/core` already got esrap 2.4, so
  `async` and `function` keywords, Vue's imports, interface declarations, and
  lowered dynamic tags lost their editor mappings. Single type parameters also
  printed as `<T,>` everywhere.

  A generic arrow function with one type parameter now compiles to `<T,>(…) => …`,
  which TypeScript reads as an arrow function in TSX instead of a JSX tag
  ([#707](https://github.com/tsrx-org/tsrx/issues/707)). Other type parameter
  lists print as written. Parameter decorators
  ([#606](https://github.com/tsrx-org/tsrx/issues/606)) and the type arguments of
  a tagged template ([#272](https://github.com/tsrx-org/tsrx/issues/272)) are no
  longer dropped from the compiled output. An array pattern parameter with a type
  annotation no longer prints the annotation twice: on esrap 2.4,
  `function f([a]: number[]) {}` compiled to
  `function f([a]: number[]: number[]) {}`, which does not parse.

- [#1225](https://github.com/tsrx-org/tsrx/pull/1225)
  [`6165298`](https://github.com/tsrx-org/tsrx/commit/6165298529f192d72825c7905973ae2acc881921)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Two editor mapping
  fixes in `.tsrx` files ([#1210](https://github.com/tsrx-org/tsrx/issues/1210)):

  - `tsrx-tsc` and the TypeScript 5.9 plugin reported unreachable code inside a
    `for (;;)` body 3 columns late, or 7 when the body is on one line, because the
    whole loop mapped by offset and the printer writes `for (; ; )` and a blank
    line after `return;`. A `for…of` or `for…in` body was 1 column late, or 5 on
    one line. These loops now map only their start and end, so an error inside one
    lands where it is written, and an unreachable loop is still reported.
  - On TypeScript 7, hover returned nothing on the names in a braceless `if` or
    `else` body, such as `c` and `b` in `if (c) c = b`. The `{` and `}` mappings
    meant for a block body were also added on the body's first and last
    characters, and replaced the names' own mappings. They are now added only for
    a block body.

- [#1171](https://github.com/tsrx-org/tsrx/pull/1171)
  [`ee70085`](https://github.com/tsrx-org/tsrx/commit/ee700855c0c7e14b58163f4693c1797be7e96772)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - An element right after
  `key` in an `@for` head, as in `@for (const x of xs; key <b />)`, now parses
  like `key (<b />)` instead of failing with "Unexpected token".

- [#1136](https://github.com/tsrx-org/tsrx/pull/1136)
  [`66a0791`](https://github.com/tsrx-org/tsrx/commit/66a079126a2604436eb2c934ad88f8b78c7c7bc5)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A keyed `@for` whose
  body is another `@for`, directly or inside an `@if` or `@switch` branch, now
  keys each iteration on React, Preact, and Hono. The inner loop's rows render in
  a `<Fragment>` with the outer key, so reordering the outer list moves each
  group's rows, and their state, with it instead of matching them up by position.

  JSX in a directive header (`@for (… of …)`, `@if (…)`, `@switch (…)`, a `@case`
  test) now reads its text the way JSX does anywhere else.
  `@for (const item of [<span>Hello<b /></span>])` no longer fails with
  `Unexpected token`, and `[<span><b>1</b> 2</span>]` in a header inside an
  element keeps its text instead of failing to parse.

- [#1134](https://github.com/tsrx-org/tsrx/pull/1134)
  [`2b465b4`](https://github.com/tsrx-org/tsrx/commit/2b465b432b515c07047e3eadeb66ff34df95de2d)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - `@for` on Solid now
  accepts any iterable, as on React, Preact, and Hono. A `Set`, a `Map` iterator,
  a generator, or an array with its own iterator no longer throws
  `newItems.slice is not a function` and halts Solid's reactivity; the loop reads
  the source the way `for...of` does and hands `<For>` the resulting array. Arrays
  with the built-in iterator, including store arrays, reach `<For>` as they are.
  The helpers `for_items` and `for_keyed_rows` come from the new
  `@tsrx/solid/iterable` and `@tsrx/solid-runtime/iterable` subpaths, and
  `@tsrx/runtime/iterable` gains `iterable_to_array`.

  A Solid `@for` whose key reads its declared index, as in
  `@for (const item of items(); index i; key i)`, no longer throws
  `ReferenceError: i is not defined` when the list updates. Solid's `keyed`
  callback receives the item alone, so such a loop now computes each key from the
  item and its index up front and renders those rows. A sparse array renders its
  holes as `undefined` items instead of halting Solid's reactivity.

  A Solid `@for` that destructures its item in a loop with a key or an index, as
  in `@for (const { id } of items(); key id)`, now renders the item's values
  instead of `undefined`, and the destructured names follow the row when Solid
  reuses it for another item or an item replaced under the same key. A
  destructured component used as a tag (`<Icon />`) renders through Solid's
  `dynamic`, so it follows the row too.

- [#1135](https://github.com/tsrx-org/tsrx/pull/1135)
  [`3603935`](https://github.com/tsrx-org/tsrx/commit/36039352946b9466f337f00dbc4e0662ba78a395)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A keyed Vue `@for`
  whose item is an array pattern, as in
  `@for (const [first, second] of rows; key first)`, now destructures each item
  through its iterator instead of reading `item[0]` and `item[1]`. A `Set`, a
  string with astral characters, or any other re-iterable item now renders its
  real values, defaults in the pattern work, and the loop stays on `<VaporFor>`,
  so keyed rows keep their state and still update in place. The key callback
  destructures the item too, so an item that can be iterated only once, such as a
  generator, still can't be keyed by a name its pattern binds. The slot imports
  `computed` from `vue` in a declaration of its own, beside any authored
  `import type` or `import * as` from `vue`. `Suspense`, which `@try … @pending`
  imports, no longer goes into an authored `import type` or `import * as` from
  `vue`, where it was erased or printed as invalid syntax, and is not imported a
  second time beside an authored `import { Suspense } from 'vue'`.

  A keyed Vue `@for` no longer rewrites type syntax that shares the loop
  variable's name: `function <item>(x: item) {}`, `type item = string`, an
  interface that mentions `item`, and the member name in `typeof Types.item` stay
  as written instead of becoming `item.value` and failing the build.

- [#1120](https://github.com/tsrx-org/tsrx/pull/1120)
  [`c7dc4ef`](https://github.com/tsrx-org/tsrx/commit/c7dc4efa939153f7b800500f1ebdc71093066340)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Closures the compiler
  generates around an `@if` branch, an `@switch` case, or a host element with a
  spread and a `ref` now run in the same function context as the code around them:

  - `<this.Widget />` in a generator method keeps its receiver. Resuming the
    generator threw `Cannot read properties of undefined (reading 'Widget')`
    because the generated generator was called without `this`
    ([#502](https://github.com/tsrx-org/tsrx/issues/502)).
  - `await using` in a template body makes the closure async and awaited. Before,
    the closure stayed synchronous, so a server build failed to load with
    `SyntaxError: Unexpected reserved word`
    ([#501](https://github.com/tsrx-org/tsrx/issues/501)).
  - In an async generator, the generated generator is an async generator, so
    `yield*` on an async iterable works. It threw `is not iterable`
    ([#265](https://github.com/tsrx-org/tsrx/issues/265)).
  - The generated generator gets the enclosing `arguments` object itself, so a
    write such as `arguments[0] = 'changed'` reaches the enclosing generator, and
    `<arguments.Widget />` reads the enclosing object. Before, it got a copy
    ([#264](https://github.com/tsrx-org/tsrx/issues/264)).

- [#1293](https://github.com/tsrx-org/tsrx/pull/1293)
  [`9f90c6a`](https://github.com/tsrx-org/tsrx/commit/9f90c6ae8d85f4a65853d42382f5280e504c08f8)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On React, Preact and
  Hono, static JSX whose member tag starts with an import (`<ui.Button>`,
  `<Menu.Item>`) now stays at render time when the module writes a property under
  that import anywhere (`ui.Button = Replacement`, `delete ui.Button`,
  `[ui.Button] = […]`, `Object.assign(ui, …)`), so the replacement renders.
  Before, it was hoisted to a module-level constant that kept the property's first
  value ([#1292](https://github.com/tsrx-org/tsrx/issues/1292)). A tag on a
  namespace import (`<ns.Button>`) is still hoisted, since a namespace's own
  properties are read-only.

- [#1290](https://github.com/tsrx-org/tsrx/pull/1290)
  [`02e39f6`](https://github.com/tsrx-org/tsrx/commit/02e39f6bf7f0941bb5b7226a02cfadeb5f9ff264)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On React, Preact and
  Hono, static JSX whose tag is a function or class declaration that the module
  assigns anywhere (`Tag = Replacement`, `[Tag] = […]`, `for (Tag of …)`) now
  stays at render time instead of being hoisted to a module-level constant, so the
  replacement renders. Before, the static kept the declaration's first value
  ([#1287](https://github.com/tsrx-org/tsrx/issues/1287)).

- [#1259](https://github.com/tsrx-org/tsrx/pull/1259)
  [`a09bc3d`](https://github.com/tsrx-org/tsrx/commit/a09bc3dffac142c0a8adc347b0683f333b78a705)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On Vue, the helper
  component that renders a `@catch` body under `@pending` is declared once beside
  its component, in the enclosing function or namespace body, when the component
  is inside another function or a namespace and the helper reads nothing from the
  component's scope (only its own `@catch` parameter, its own locals and bindings
  outside the component). Before, it was declared in the component's setup, so
  every instance defined a new helper component. A helper that reads a binding of
  the component's scope stays in the setup.

  On Solid, the temporary that holds a host element's spread props beside a `ref`
  in an `@if`, `@for` or other branch skips a name the module already uses even
  when the component's name contains `$` (`App$__spread_props1`). Before, the
  check missed it, and the temporary shadowed the authored binding of that name.

- [#1279](https://github.com/tsrx-org/tsrx/pull/1279)
  [`bbf7092`](https://github.com/tsrx-org/tsrx/commit/bbf70925ae7944ebba8275b2090247c1e333fe54)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On React, Preact and
  Hono, a static element inside an expression container is now hoisted to a
  module-level constant, like a static element written bare.
  `<>{<div> 123 </div>}</>` hoisted nothing before; now the inner `<div>` gets its
  own constant ([#81](https://github.com/tsrx-org/tsrx/issues/81)). This covers a
  container in an element's or a fragment's children, in an attribute value such
  as `<Card header={<h1>Title</h1>} />`, in either branch of `?:`, on the right of
  `&&`, `||` and `??`, and in a nested container, including in the JSX that a
  render helper or callback in the component body returns, whose bare statics were
  already hoisted. In a branch that may not render, only host elements such as
  `<span>` are hoisted, so a component like `<ui.Button />` in
  `{show && <ui.Button />}` is still read only when it renders, never when the
  module loads. A static fragment in a container keeps its children, each hoisted
  on its own, and consecutive statics are not merged into one fragment, so the
  children React sees keep their shape. An element with a `key`, JSX that reads a
  binding, a bare child of a dynamic element, and JSX inside a function or array
  within a container (such as `{items.map(() => <li />)}`) stay in place. A
  static's name now skips any name the module source already uses, so an authored
  `App__static1`, in the component or at module level, can't redeclare it or
  capture its references. Solid, Vue and Hono DOM output is unchanged, since those
  targets don't hoist.

- [#1187](https://github.com/tsrx-org/tsrx/pull/1187)
  [`964899b`](https://github.com/tsrx-org/tsrx/commit/964899bd268e026dfe5f4832fb44c7cbb0b42141)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Static JSX stays in
  place when its tag reads a binding declared in an earlier `case` of the same
  `switch`. A component in a namespace body keeps its static JSX and helper
  components in place, since a name there can read an export of any declaration of
  the namespace (`Foo` inside `namespace Outer.Foo`, or an export of another
  `namespace Outer` block). Before, such JSX was hoisted to module scope, where
  the tag named a different binding of the same name.

- [#1098](https://github.com/tsrx-org/tsrx/pull/1098)
  [`55d2886`](https://github.com/tsrx-org/tsrx/commit/55d2886718cd9134b5c7e7c2ba4129a24d2d94b6)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A dynamic tag
  (`<{props.tag} />`) no longer gets TS2786 (`cannot be used as a JSX component`)
  in the editor's type view with Hono 4.13. The type-only `Dynamic` helper now
  returns what a Hono function component returns, which Hono 4.13's
  `JSX.ElementType` requires
  ([#1075](https://github.com/tsrx-org/tsrx/issues/1075)).

  A missing or unknown prop on a dynamic tag's component
  (`const C = Card; <{C} />`) is now reported at the authored `{C}`, on every
  target. TypeScript reports it on the generated name of the lowered tag, which
  had no mapping, so `tsrx-tsc` and the editor dropped it.

- [#1109](https://github.com/tsrx-org/tsrx/pull/1109)
  [`9ff7b5d`](https://github.com/tsrx-org/tsrx/commit/9ff7b5d5f80e7697896d91d5674ccccb389a890d)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On React, Preact, and
  Hono, a host spread and a `ref` beside it are now evaluated as they are in plain
  TSX:

  - A getter in a spread bag is read once. In
    `<input {...bag} data-reads={reads} />` with
    `get title() { return String(++reads); }`, the element rendered
    `title="2" data-reads="2"`: the spread normalizer read every getter, handed
    back the original bag, and the JSX runtime read the getters again. The
    runtime's new `copy_spread_props` and `copy_spread_props_for_ref_attr` return
    the normalized copy instead, and these targets import them in place of
    `normalize_spread_props` and `normalize_spread_props_for_ref_attr`. Solid and
    Vue keep the original bag, which their compiled JSX reads property by
    property.
  - A `ref` expression is evaluated where it is written. In
    `<div ref={initRef()} {...{ 'data-ready': String(ready) }} />`, where
    `initRef()` sets `ready`, the element rendered `data-ready="false"`: the
    merged `ref` attribute moved after the spread and every later attribute. The
    merged `ref` now stays where the element's own `ref` is written, and reads the
    ref of a bag spread after it when the ref is applied.

  A custom platform with `jsx.hostSpreadRefBinding: 'in-place'` now imports
  `copy_spread_props` and `copy_spread_props_for_ref_attr` from its
  `imports.refProp` module, so that module must export them. `@tsrx/runtime/ref`
  and every first-party `*/ref` module re-export them.

- [#1193](https://github.com/tsrx-org/tsrx/pull/1193)
  [`418dc53`](https://github.com/tsrx-org/tsrx/commit/418dc530f0897c9c9f54d61eed1269490d3b29aa)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - An element with
  thousands of children no longer fails to parse with "Not enough stack space to
  parse input". The parser read each child one call deeper than the one before it,
  so the limit depended on the available stack, about 2,000 to 4,000 children. It
  now reads the children in a loop, and stack depth follows how deeply elements
  nest, not how many children they have.

- [#1229](https://github.com/tsrx-org/tsrx/pull/1229)
  [`80316d9`](https://github.com/tsrx-org/tsrx/commit/80316d94773c91a182d15e3bca5e7965ebc225b0)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On Vue, the helper
  component that renders a `@catch` body under `@pending` takes the component's
  name as a prefix (`App__StatementBodyHook1`) when the component is inside
  another function or a namespace, as it already did at module level. Before, it
  was declared under the bare name `StatementBodyHook1`, so a setup local of that
  name failed the build with "Identifier `StatementBodyHook1` has already been
  declared", and a binding of that name in the enclosing function rendered the
  helper in its place. The helper's name also skips any name the module source
  already uses, so an authored `App__StatementBodyHook1` no longer collides with
  it either.

- [#1317](https://github.com/tsrx-org/tsrx/pull/1317)
  [`28440d7`](https://github.com/tsrx-org/tsrx/commit/28440d79a59d6cf54530f386471687f99e914ae8)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A capture-free local
  helper of a component declared in a nested block (a bare `{ … }` or a `case`
  body) is now declared once, inside that block. Before, it was declared there and
  again in the enclosing statement list, where the block's own bindings were out
  of scope; on Vue, `defineVaporComponent` ran twice for it.

- [#1273](https://github.com/tsrx-org/tsrx/pull/1273)
  [`135ce77`](https://github.com/tsrx-org/tsrx/commit/135ce776f67596af641c8f2772d0321dbd73274e)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A loose compile, the
  one the editor, `tsrx-tsc` and `@tsrx/content-mapper` run, now reports an
  unclosed tag (TSRX1001) or a mismatched closing tag (TSRX1002), as a collecting
  compile does, instead of recovering silently. `<div>` with no closing tag,
  `<div><span></div>` and `return <div>;` now show an error in the editor and
  through TypeScript 7's `tsc --runExternalCode`, where the build's strict compile
  already rejected them.

  The editor's generated code now closes such a tag, with a closing tag that has
  no mapping, so it is valid TSX: TypeScript no longer adds TS17008 or TS1005 to
  the parser's error, and hover, completions and diagnostics elsewhere in the file
  keep working. An undefined component left unclosed, such as
  `<div><Missing>valid</div>`, is reported as undefined once, at its name, not
  again on a closing tag around it, including a dynamic one or one followed by
  more text. The language server shows an error whose position has no mapping
  (such as an empty unclosed `<>`) on the nearest code before it, not at the start
  of the file. The tsserver plugin's closing-tag answer
  (`getJsxClosingTagAtPosition`) reads the parsed source for such a tag, as the
  language server's auto-insert does. Strict compiles are unchanged.

- [#1317](https://github.com/tsrx-org/tsrx/pull/1317)
  [`28440d7`](https://github.com/tsrx-org/tsrx/commit/28440d79a59d6cf54530f386471687f99e914ae8)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - An element with its own
  `ref`, then a `key`, then a host spread (`<input ref={r} key="a" {...props} />`)
  keeps its written `key` on Preact and Hono again when the spread bag has a `key`
  too. The binding added for the `ref` went in a spread ahead of `key`, which made
  the JSX compiler pass `key` through `createElement`, where the bag's `key`
  replaced it. The `key` now stays ahead of that spread, as written.

- [#1317](https://github.com/tsrx-org/tsrx/pull/1317)
  [`28440d7`](https://github.com/tsrx-org/tsrx/commit/28440d79a59d6cf54530f386471687f99e914ae8)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The binding that holds
  an element's own `ref` written before a host spread, on React, Preact and Hono,
  now skips any name the module already uses, as spread temporaries do. Before, a
  component declaring `App__ref1` itself got a second `let App__ref1`, which
  failed the build or shadowed the authored value.

- [#1122](https://github.com/tsrx-org/tsrx/pull/1122)
  [`3c510ee`](https://github.com/tsrx-org/tsrx/commit/3c510ee11929af366393ce5aa582d72c1c38d3a8)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - More parse errors now
  have the code and position TypeScript reports for the same source, instead of
  the code TSRX read from acorn's message:

  - A missing `;` after a statement (`x = 1 2;`, `import "m" x;`) is TS1005
    `';' expected.`, and `',' expected.` after a variable declaration's
    declarator, instead of TS1012 `Unexpected token`. After a lone name (`a b;`)
    it's TS1434 `Unexpected keyword or identifier.` at the name, or TS1435 with
    the keyword TypeScript takes it for (`cosnt x = 1;`, `constructr x;`). A
    modifier that starts no statement (`accessor x;`, `readonly x;`) is TS1128
    `Declaration or statement expected.`
  - `import` after `new` (`new import.meta`) is TS1109 `Expression expected.`
  - A `let`, `const` or `using` declaration after `if (…)` or a loop head
    (`if (a) let x = 1;`) is TS1156, which collecting parses record. After a label
    it's TS1344 `'A label is not allowed here.` at the label (`l: let x = 1;`),
    then TS1156 when the label itself follows `if (…)` or a loop head, as in
    TypeScript; the formatter formats it, as Prettier does.
  - A word reserved in strict mode used as a name (`let`, `interface`, `public`,
    `static`, `yield`, …) is TS1214, or TS1213 inside a class, instead of TS1212.
    Collecting parses (the editor and the formatter) now record it and keep
    parsing for every such word, not only `let`, so the formatter formats
    `class public {}` as Prettier does. A `let` or `const` declaration named `let`
    also reports TS2480, but not a function named `let`. In an ambient context
    (`declare const public: number;`), or as the name an export specifier exports
    (`export { public }`), there's no error, as in TypeScript, and a parameter
    property modifier on a function's parameter in an ambient context
    (`declare function f(private x: number): void;`) is TS2369 at the modifier, in
    a strict compile too.
  - A parameter after a rest parameter is TS1014 at the `...`, and an element
    after a rest element of a destructuring pattern TS2462 (at the name in an
    arrow function's parameters, and at each such rest element), instead of TS1013
    at the comma. TS1013 stays for a trailing comma.
  - A call of `import.<name>` (`import.foo()`) is TS18061, naming the property
    without its escapes; without a call it stays TS17012. The formatter refuses
    both, as Prettier does.
  - Type arguments after `?.` with no call (`` a?.<T>`c` ``) report TS1358 or
    TS1005 `'(' expected.` at the token after them, or TS1003
    `Identifier expected.` at the `<` where TypeScript reads no type arguments
    (`a?.<T>[0]`), where the error said `Unexpected token (1:NaN)`.

- [#1276](https://github.com/tsrx-org/tsrx/pull/1276)
  [`f38319a`](https://github.com/tsrx-org/tsrx/commit/f38319a6a0f5a133ca0eb9efc864d9e3c69bee4f)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A declaration's
  modifiers now report only the error TypeScript reports, in a collecting parse
  (the editor) too. `declare public class A {}` in a `declare namespace` is TS1038
  at the inner `declare`, without a TS1044 for `public`, and
  `public private class A {}` is TS1044 at `public` only. The formatter still
  refuses code whose modifiers the tree leaves out, which it now reads from the
  declaration's metadata.

- [#1137](https://github.com/tsrx-org/tsrx/pull/1137)
  [`7484f21`](https://github.com/tsrx-org/tsrx/commit/7484f2135be256f099f6e27af704e894b09ee260)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Some mistakes
  TypeScript reports from its checker are now reported, or recorded in the editor
  instead of failing the whole file:

  - Two default exports that can't merge (`export default 1; export default 2;`)
    report TS2528 at each, and a name that two export specifiers or `export * as`
    export reports TS2300 at each, as TypeScript's binder does. Before, both
    compiled without an error.
  - `import type a, { b } from 'a'` reports TS1363 at `type`. Before, it compiled.
  - `import type A = B.C;` reports TS1392 at the declaration, and the editor
    records it and keeps the file's tree. Before, it threw at `B.C` in every mode.
  - A function body in an ambient context (`declare function f() {}`, a function
    in a `declare namespace`) reports TS1183 at the body, and the editor records
    it and keeps the function. Before, it threw at the function's start in every
    mode.

  The formatter refuses TS1363, TS1392 and TS1183, as Prettier does (Prettier
  formats a function body in a `declare namespace`, which the formatter still
  refuses).

- [#1139](https://github.com/tsrx-org/tsrx/pull/1139)
  [`21edc74`](https://github.com/tsrx-org/tsrx/commit/21edc743be4622090b007d015c2f0d2699248777)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Two outputs in a
  `@{ … }` body, or a statement after its output, now report one error, TSRX2011
  or TSRX2012. Before, the first output was also reported as unused output
  (TSRX2010), which wrapping the outputs in a fragment or moving the statement up
  fixes too.

- [#1269](https://github.com/tsrx-org/tsrx/pull/1269)
  [`3ef0076`](https://github.com/tsrx-org/tsrx/commit/3ef00761631d95ef9fcccbae2673df371d1a4c0d)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - More checker errors now
  match what TypeScript reports, in the same order, in strict, collecting and
  loose parses:

  - `declare` on a declaration in a block
    (`function f() { declare const x: number; }`,
    `if (a) declare const x: number;`) is TS1184 `Modifiers cannot appear here.`
    at `declare`, as `export` already was, before the errors in the declaration.
  - A name bound twice in a signature is TS2300 at each binding: in a
    `declare function`, an overload, an abstract or ambient method or constructor,
    an interface's or a type literal's members, and a function or constructor type
    (`type F = (a, a) => void`). A signature's errors come once it's read, so a
    comparison such as `a < (b, b)`, whose right side acorn-typescript tries as
    type arguments first, still parses.
  - A strict parse throws the error that a collecting parse records first in more
    code. A syntax error, which TypeScript reports alone, drops the checker errors
    reported only after it: a method's TS2369 (`class A { m(public x) { +; } }`),
    a signature's errors (`type F = (a, a) => ;`) and a generic async arrow
    function's parameters' errors. Errors that TSRX throws but TypeScript reports
    from its binder or checker (a repeated label, `break` outside a loop,
    `delete x`, `with`, a second `default` clause, a duplicate regular expression
    flag, and the rest) keep them: each TypeScript code is classified by where
    TypeScript raises it. A comma after a rest parameter (`m(public x, ...z,)`) is
    TS1013 after the TS2369 before it. A generic arrow function's parameters
    (`<T,>(...a, b) => a`, `async <T,>(...a,) => a`) give TS1014, TS1013 or TS2462
    instead of an error at the `<` or after the arrow function, and
    `async <T>(...a, b)` is still read as a call. In a `.mts` file, a collecting
    parse keeps the checker errors in an arrow function that acorn-typescript
    abandons, and a strict parse throws the first by position. The errors of a
    rest parameter property, or of a parameter property on a constructor without a
    body, come by position with the duplicate names around them.
  - At one position, TS1187 for a parameter property with a binding pattern now
    comes before TS2369, as TypeScript sorts them by code.

- [#1191](https://github.com/tsrx-org/tsrx/pull/1191)
  [`15899ed`](https://github.com/tsrx-org/tsrx/commit/15899ed7a3e324f842e5f1662ac3b2c53dbf2605)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - More exports that
  TypeScript's binder declares twice now report its error, at the same places.
  Before, these compiled without an error, or with another code:

  - Two `export =` assignments report TS2300 `Duplicate identifier 'export='.` at
    each.
  - Duplicate exports inside a `declare namespace`, a `declare module "m"` or a
    `declare global` body report TS2300 or TS2528, as at the top of a module.
  - A string export name is the same name as the identifier it spells:
    `export { a as "b" }; export { c as b };` reports TS2300 at each, named as
    written.
  - `export * as default` twice reports TS2300, not TS2528: it exports a name, not
    a default export.
  - A default-exported function is declared before the other statements, as in
    TypeScript, so `export default x; export default function f() {}` reports
    TS2528 at `x` and at `f`.
  - A parenthesized default export (`export default (a)`) is an expression,
    reported at `export`, not an alias of `a`.
  - `import type a, {} from 'a'` reports TS1363 at `type`, as
    `import type a, { b } from 'a'` does. The formatter refuses it, as Prettier
    does.

- [#1092](https://github.com/tsrx-org/tsrx/pull/1092)
  [`b2af266`](https://github.com/tsrx-org/tsrx/commit/b2af26663e24648ca777a6893b2e66b67d5c4d28)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The parser reports
  these modifier mistakes with TypeScript's error code and position, the same way
  in a normal compile and in the editor:

  - `declare` directly inside an ambient namespace or module reports TS1038, as
    TypeScript does. Before, the parser reported nothing unless another modifier
    came with it.
  - A modifier before a class `static` block (`public static {}`) is TS1184 at the
    modifier. Before, it threw a different message after the `{`, even in the
    editor. A decorator before a `static` block (`@dec static {}`) is now TS1206.
    The formatter prints both as `static {}`, as Prettier does.
  - A parameter property on a method, an accessor, an object literal's method, or
    a constructor without a body (`m(public a) {}`) is TS2369, as it already was
    on a function. The formatter now refuses these, as Prettier does.
  - `abstract` before a declaration other than a class inside a block
    (`function f() { abstract interface I {} }`), or in the body of an `if` or a
    label, is TS1184, not TS1242. The formatter still refuses it, also after a
    `declare` whose error TypeScript reports first
    (`{ declare abstract function f(): void; }`).
  - Between `abstract` and `declare` in an ambient namespace, the first one
    reports its error, TS1242 or TS1038, as TypeScript does.
  - `static constructor(…) {}` is TS1089 at `static`, and takes parameter
    properties, as TypeScript reads a constructor there.
  - A modifier order or compatibility error (TS1029, TS1243) in a normal compile
    points at the modifier. Before, it pointed at the modifier's column on the
    first line of the file.

- [#1234](https://github.com/tsrx-org/tsrx/pull/1234)
  [`6dbda19`](https://github.com/tsrx-org/tsrx/commit/6dbda190b1fa875d4d196b80c0dcc2903ad41b72)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Exports that two blocks
  of one namespace or ambient module declare twice now report TypeScript's error
  at each, and two default-exported classes of one name report TS2528 as
  TypeScript does. Before, these compiled without an error, or with another code
  first:

  - `declare namespace N { … }` blocks with one name, and
    `declare module 'm' { … }` blocks with one specifier, share their exports, as
    TypeScript merges them: `export { a }` in one and `export { b as a }` in
    another report TS2300 at each, and `export default` in two report TS2528 at
    each.
  - Declarations that two blocks export with one name report TS2451, TS2300 or
    TS2567 at each, as in `namespace N { export const a = 1; }` twice. That
    includes the declarations an ambient block without export declarations
    exports.
  - `export default class C {}` twice reports TS2528 at each `C`, not TS2300
    `Identifier 'C' has already been declared`, which a strict parse threw first.

- [#1268](https://github.com/tsrx-org/tsrx/pull/1268)
  [`059ba30`](https://github.com/tsrx-org/tsrx/commit/059ba30018bb3a74d7fbaf2de2d88068c8b30636)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - More exports that two
  blocks of one namespace declare twice now report TypeScript's error, in its
  order. Before, these compiled without an error:

  - A namespace's own name: an instantiated namespace conflicts with a variable,
    as in TypeScript (`namespace a { export const x = 1; }` in one block,
    `export const a = 1` in another), and one that declares only types shares its
    name. It no longer hides the other declarations of that name, so `var X` and
    `let X` in two blocks report TS2300 even with a `namespace X {}` in a third.
  - `export import A = …` in one block and `export { b as A }` in another report
    TS2300 at each.
  - Errors at one position come in tsc's order, by code.

- [#1140](https://github.com/tsrx-org/tsrx/pull/1140)
  [`829de73`](https://github.com/tsrx-org/tsrx/commit/829de739887b29e42dea5328b5fb370edf5bc58e)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The parser now accepts
  and rejects these as TypeScript does:

  - A `const` type parameter in a function type, a constructor type, or a call,
    construct or method signature (`type F = <const T>(value: T) => T;`) parses.
    Before, it failed with `Unexpected keyword 'const'`.
  - `asserts` in a return type is a type predicate's modifier only before a name
    or `this` on its line. Before, `asserts` with the name on the next line parsed
    as a predicate, and the formatter joined the lines into code TypeScript
    accepts. Now it reports TypeScript's error after the return type, TS1434 or
    TS1005.
  - An element or fragment as a class's superclass without parentheses
    (`class A extends <div /> {}`) reports TS1109 `Expression expected.` at its
    `<`, as TypeScript does. In parentheses it still parses.

- [#1131](https://github.com/tsrx-org/tsrx/pull/1131)
  [`2aa4bf8`](https://github.com/tsrx-org/tsrx/commit/2aa4bf8b1e38e8be96e149a2b5ba5b6d3c727164)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A normal compile now
  reports the same error as the editor for mistakes that TypeScript reports from
  its checker. Before, it threw acorn's message, or compiled without an error:

  - `type A = readonly string;` reports TS1354 at `readonly` in a normal compile
    too. Before, it compiled.
  - `await`, `for await` and `await using` directly in a namespace report TS1308,
    TS1103 and TS2852, not `Cannot use await in class static initialization block`
    or `Unexpected token`.
  - `const;` and `for (let;;)` report TS1123, and `const x: number;` reports
    TS1155, instead of `Unexpected token`.
  - A parameter property on a function's parameter reports TS2369, and one on a
    rest parameter TS1317, instead of a reserved word or `Unexpected token` error.
  - `let` in a `for` head always starts a declaration list, as in TypeScript:
    `for (let.a of b)` reports TS1134 `Variable declaration expected.` at the `.`.
  - A private name that no class around it declares (`this.#x`) is now recorded in
    the editor (TS1111), as a normal compile already reported it.
  - A generic arrow function with one type parameter and no trailing comma
    (`<T>() => 1`) no longer reports TS7060 in a `.ts` file, where TypeScript
    accepts it. In a `.mts` or `.cts` file a normal compile now reports it too, as
    TypeScript does. The editor still shows it in a `.tsrx` file.

- [#1235](https://github.com/tsrx-org/tsrx/pull/1235)
  [`da9bec8`](https://github.com/tsrx-org/tsrx/commit/da9bec849cd988e39637654951864d1dba98cfc9)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A strict parse (a
  normal compile) now throws the error TypeScript reports first, and a collecting
  parse (the editor) records it first, for more mistakes. Before, another error
  came first:

  - Duplicate parameter names report TS2300 at each binding in the order they're
    written, so `function f(a, b, b, a) {}` throws at the first `a`, not the first
    `b`.
  - A parameter property outside a constructor implementation reports TS2369 at
    its first modifier before the modifiers' own errors
    (`(public public x: number) => x` throws TS2369, not TS1028) and before any
    error in a method's body (`class A { m(public a) { let let = 1; } }`), but
    after a duplicate parameter name before it (`function f(x, public x) {}`
    throws TS2300 at the first `x`).
  - `async <T,>(public [a]: T[]) => a` throws TS2369 at `public`, not
    `Unexpected token` at the `(`.
  - Decorators written before `export` and after it report TS1206 at the first
    one: `@a export @b function f() {}` throws at `@a`.
  - Decorators or modifiers before a class `static` block report TS1206 or TS1184
    before the checker errors in the block. A syntax error in the block still
    comes first.
  - In a `.mts` or `.cts` file, a generic arrow function's TS7060 comes before the
    checker errors in it, such as the TS7060 of the arrow functions in its
    parameters, and isn't reported after a mistake in its parameter list
    (`<T>(...a?: T[]) => a` reports TS1047 only), as in TypeScript.

- [#1192](https://github.com/tsrx-org/tsrx/pull/1192)
  [`4bdbe57`](https://github.com/tsrx-org/tsrx/commit/4bdbe572d5e5e0ac4a746248f7b4a9109f52e02d)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A normal compile now
  reports the same error as the editor, at the same place, for three more kinds of
  mistakes. Before, it threw another error, or the same code somewhere else:

  - A parameter property modifier on an arrow function's parameter or in a
    function type (`const k = (public x: number) => x;`,
    `type F = (readonly x: number) => void;`, `async <T,>(public x: T) => x`)
    reports TS2369 at the modifier, or TS1317 before a rest parameter. Before, it
    reported `'public' is a reserved word` or `Unexpected token`.
  - Decorators before something other than a class (`@dec function f() {}`,
    `export default @dec function f() {}`, `@dec export { a };`) report TS1206 at
    the first decorator, as TypeScript does, instead of at the declaration after
    them.
  - A duplicate parameter name (`function f(a, a) {}`) reports TS2300 at its first
    binding, as TypeScript does first, instead of at the second.

- [#1138](https://github.com/tsrx-org/tsrx/pull/1138)
  [`0fc3819`](https://github.com/tsrx-org/tsrx/commit/0fc3819e6c91a9cc8a2723737dd47f72374ae25f)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A `<style>` body now
  ends at a closing tag with whitespace before its `>` (`</style >`, or `</style`
  and `>` on the next line), as JSX allows and as a `<script>` body already does.
  Before, the element was reported as unclosed. This also applies inside a CSS
  string or comment: `content: "</style >"` now ends the body there, as HTML and
  TSX end it, where only an exact `</style>` did before.

  An element closed by a fragment's closing tag (`<b>x</>`) now reports
  `Expected '</b>' but found '</>'`, where the message said `found '</null>'`.

- [#1230](https://github.com/tsrx-org/tsrx/pull/1230)
  [`644583f`](https://github.com/tsrx-org/tsrx/commit/644583f0abf521bf04b615e1394d96a3fd1f0d35)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Organize Imports and
  Sort Imports now work in a `.tsrx` module that reads an
  `import.meta.env.platform` flag, with TypeScript 7 and with the TypeScript 5.9
  plugin. They returned no edits there, while Remove Unused Imports worked. The
  compiler appended `export {};` to such a module to keep it a module. Both
  actions also rewrite export declarations, and an edit to code that exists only
  in the generated output made the editor drop the whole action. The marker is now
  added only when the generated code has no import or export of its own
  ([#1207](https://github.com/tsrx-org/tsrx/issues/1207)). `withPlatformTypes`
  takes the generated program as an optional third argument to decide this, and
  keeps adding the marker when it is not passed.

- [#1175](https://github.com/tsrx-org/tsrx/pull/1175)
  [`91d958d`](https://github.com/tsrx-org/tsrx/commit/91d958de44c9e582cd66a5b66aff6bb37ff0ece2)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The compiler now
  imports the components it generates for `@try … @pending`, `@try … @catch` and
  keyed fragment rows under private names (`__Suspense`, `__TsrxErrorBoundary`,
  `__Fragment`). A module can declare its own `Suspense`, `TsrxErrorBoundary` or
  `Fragment` (a type-only import, an import from another module, a local, or a
  `@for` loop variable) without the build failing with "Identifier `Suspense` has
  already been declared", and the generated element no longer renders the authored
  binding in its place. Vue's generated `Suspense` uses the private name too, so
  an authored `import { type Suspense } from 'vue'` no longer leaves it unbound.

  Imports the compiler adds now go after the module's directive prologue, so a
  `'use client'` or `'use server'` directive stays first in a module that uses
  `@pending`, `@catch`, a keyed fragment row or any other construct that needs a
  generated import. Before, the generated imports went above it and turned it into
  a plain string, which Next.js treated as a server component.

- [#1222](https://github.com/tsrx-org/tsrx/pull/1222)
  [`e0c07b5`](https://github.com/tsrx-org/tsrx/commit/e0c07b55b199acc4fe05b705255e79020b500376)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Solid now imports the
  components it generates for `@if`, `@for`, `@switch` and `@try` under private
  names (`__Show`, `__For`, `__Switch`, `__Match`, `__Errored`, `__Loading`), and
  Vue imports the `VaporFor` it generates for `@for` as `__VaporFor`. A module can
  declare its own binding with one of those names (an import from another module,
  a type-only import, a module or setup local, or a `@for (const Match of rows)`
  loop variable) without the build failing with "Identifier `Show` has already
  been declared", and the generated element no longer renders the authored binding
  in its place. An authored `import type { VaporFor } from 'vue-jsx-vapor'` now
  stays type-only beside the generated value imports. The compiler now counts a
  tag as a component whenever its name doesn't start with a lowercase letter, as
  JSX does, so a tag like `<_Card>` is treated as a component rather than a host
  element, and Solid doesn't hoist a static `@if`, `@switch` or `@pending` subtree
  that renders one of its private components.

  Vue's `defineVaporComponent` keeps its public name, because vue-jsx-vapor finds
  components by calls to that name. A Vue module that declares its own binding
  named `defineVaporComponent` (an import from another module, a module function
  or `const`, or a local in a component) now gets a compile error, `TSRX2032`,
  instead of a duplicate declaration or every component wrapped in the authored
  function. A type-only import of `defineVaporComponent` from `vue-jsx-vapor`
  becomes the value import the compiler needs.

- [#1102](https://github.com/tsrx-org/tsrx/pull/1102)
  [`6b60554`](https://github.com/tsrx-org/tsrx/commit/6b60554c73958e7b2d00f385760d533031417f1f)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A module that imports
  `Suspense` or `Fragment` itself can now use `@try … @pending` or a keyed `@for`
  with a fragment body. The compiler reuses the authored import instead of adding
  a second one, which failed the build with "Identifier `Suspense` has already
  been declared".

  The React and Preact Vite plugins no longer compile a `.tsrx` file that is only
  imported as an asset (`?raw`) when it changes, so an incomplete example updates
  over HMR instead of reporting a compile error.

- [#1168](https://github.com/tsrx-org/tsrx/pull/1168)
  [`6b207b6`](https://github.com/tsrx-org/tsrx/commit/6b207b65e8a339d5fe301c60e72db271ffb9a572)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A host element with
  scoped styles keeps the class a props spread passes it. Beside a `<style>`
  block, `<span {...props} />` used to render only the scope hash and drop
  `props.className`, and `<span className="base" {...props} />` dropped the scope
  hash. Both now render the spread's class followed by the scope classes, which is
  what plain JSX renders plus the scope hash, on React, Preact, Solid, and Hono.
  Vue already joined them. On Preact and Hono, a spread's `className` written
  before a scoped `class` attribute no longer replaces that attribute
  ([#722](https://github.com/tsrx-org/tsrx/issues/722)).

- [#1232](https://github.com/tsrx-org/tsrx/pull/1232)
  [`2473538`](https://github.com/tsrx-org/tsrx/commit/247353854e918f119dafe88f6474a2738cb82ed8)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Scoped style classes
  now join an element's class the way its target renders that class. Beside a
  `<style>` block, `<div className={props.c} />` rendered
  `class="undefined tsrx-…"` when `c` was unset, and on Solid and Vue
  `class={{ active: on }}` rendered `[object Object] tsrx-…` and
  `class={['a', on && 'b']}` rendered `a,false tsrx-…`. A class that may not be a
  string now joins through the runtime's new `join_scope_class`, which follows the
  target's rendering, set by the new `jsx.classValue` platform option:

  - React and Hono DOM leave out `null`, `undefined`, `true` and `false`, Preact
    renders `true` as text, and Hono's server renders `true` and `false` as text.
    Any other value joins as text.
  - Solid and Vue keep an object or a list class, and leave out other values that
    are not strings, such as numbers and functions.
  - A props spread's class joins the same way on each target.
  - A class that is always a string (a template literal, a choice between string
    literals, a `$class` read) still joins as text, and the editor's type-only
    output is unchanged.

  On Solid and Vue, an authored `className` attribute on an intrinsic element now
  compiles to `class`, joined with a `class` attribute (or, with a spread between
  them, kept in its place, so the target handles them as two `class` attributes:
  Solid keeps the last, Vue joins them), so React-style source keeps its class
  with or without scoped styles. Solid ignored `className`, and Vue rendered a
  static one as a `classname` attribute. The editor checks it as `class` too, so
  it no longer reports that `className` doesn't exist on these targets' elements,
  and hover, rename and go-to-definition still point at the authored `className`.
  Components, member and dynamic tags (which may be components) and spread bags
  keep `className` as written.

- [#1089](https://github.com/tsrx-org/tsrx/pull/1089)
  [`baf1452`](https://github.com/tsrx-org/tsrx/commit/baf1452ef56f7e481112dd7138a69f9010f113c7)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Scoped CSS keeps more
  rules that the browser matches but the compiler commented out as `(unused)`:

  - Attribute selectors on attributes whose values HTML matches in any case, such
    as `type` and `dir`. Before, `input[type="TEXT"]` next to
    `<input type="text">` was dropped. An `s` flag still asks for an exact match.
  - Sibling rules (`+` and `~`) whose elements are apart in the source but
    siblings in the DOM. Before, `.a + .b` was dropped when text, a fragment, or a
    `@if`, `@else if`, `@for`, `@switch`, `@try`, or `@{ … }` body sat between or
    around the two elements, and `.a + .a` was dropped for an element repeated by
    `@for`.
  - Sibling rules whose siblings the compiler cannot place: an element in an
    expression (`{show && <i class="a" />}`), an element passed to a component as
    a child or prop, and an element with a dynamic `class`. A `<title>`, `<meta>`,
    or `<link>` between two elements no longer separates them either, since React
    moves those into `<head>`.

- [#1173](https://github.com/tsrx-org/tsrx/pull/1173)
  [`ab3d989`](https://github.com/tsrx-org/tsrx/commit/ab3d989a68c1c2d68a2d0bfa2a94c4b9019f3f6e)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Scoped CSS keeps
  attribute selectors whose attribute an element sets through its React prop name.
  Before, `label[for]` next to `<label htmlFor="x">` was commented out as
  `(unused)`, and so were `meta[http-equiv]` with `httpEquiv`,
  `form[accept-charset]` with `acceptCharset`, and SVG rules such as
  `circle[stroke-width]` with `strokeWidth`, although the browser matches them.

- [#1088](https://github.com/tsrx-org/tsrx/pull/1088)
  [`bb15638`](https://github.com/tsrx-org/tsrx/commit/bb156380f69d2a7fe23d7522a02580d3f4d276af)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Scoped keyframes now
  keep working in more valid CSS forms. Before, a newline or tab after
  `@keyframes` put the hash on the at-rule keyword (`@keyframestsrx-…-`), a quoted
  name got the hash outside its quotes (`tsrx-…-"fade"`), a comment right after a
  name (`fade/*note*/`) kept the reference from being renamed, and an `animation`
  shorthand keyword such as `linear` was renamed as well when local keyframes
  shared its name. The compiler now finds the name after any whitespace or
  comment, prefixes a quoted name inside its quotes, reads names in `var()` and
  `env()` fallbacks, and in the `animation` shorthand reads a keyword as a
  keyframes name only when CSS does: once the longhand the keyword belongs to
  already has a value. Keyframes or animation names such as `constructor` or
  `toString` no longer make the compiler throw.

- [#1107](https://github.com/tsrx-org/tsrx/pull/1107)
  [`e9330ea`](https://github.com/tsrx-org/tsrx/commit/e9330ea841e6113e10be39980aae7c0ebfd4b63a)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On Solid, a host
  element with spreads and its own `ref` now behaves as it does in plain Solid
  TSX:

  - `ref={el}` assigns the element to `el`. Before, the compiler put the ref in an
    array with the spreads' refs, and Solid only calls the functions in an array,
    so `el` stayed `undefined`.
  - A `ref` inside a spread is called once. Before, it was called twice (`bag`,
    `own`, `bag`): once through the element's ref array and again by Solid's
    `spread()`.
  - The spread updates when its expression changes, as in
    `<button {...bag()} ref={cb} />`. Before, the bag was read once in a setup
    declaration, so its attributes kept their first values.

  The element now keeps its `ref` as written, and Solid's `spread()` applies the
  spreads' refs. One spread is normalized in place. Solid keeps only the last of
  several spreads' refs, so an element with more than one spread goes through the
  Solid runtime's new `spread_ref_bags`: each bag is normalized lazily in a memo,
  its spread gets it without its `ref`, and one more spread carries every bag's
  ref, so each of them still applies, in order, after the element's own. A bag
  that gains or loses a ref while mounted updates, and the bags stay reactive
  without rebuilding the element's children. The new
  `jsx.hostSpreadRefStrategy: 'spread'` platform option selects this lowering.

- [#1280](https://github.com/tsrx-org/tsrx/pull/1280)
  [`190f797`](https://github.com/tsrx-org/tsrx/commit/190f7970cf968c978b3e5df37b4e3a97c4e7efa5)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On Solid and Vue, a
  `yield` in a template value that the target's JSX compiler moves into an effect,
  a getter or a callback is now a TSRX compile error, TSRX2034, at the authored
  `yield`:
  ``Solid TSRX does not support `yield` in this part of the template: Solid's JSX compiler evaluates it in an effect, a getter or a callback, which cannot yield from the enclosing generator. …``
  (and the same for Vue). Before, the build failed later in `babel-preset-solid`
  or `vue-jsx-vapor` output, with
  `A 'yield' expression is only allowed in a generator body.` or
  `The keyword 'yield' is reserved` pointing at compiled code. Yield the value
  first instead: `const title = yield bag.title;`.

  A `yield` those compilers leave in place still compiles, so code that builds
  today is unchanged. On Solid that is a static value (no member access, call,
  spread or `in`) in an attribute, a component prop or a lone component child, any
  event handler or non-array `ref` on an element without a spread (except a
  `[handler, data]` array on an event the compiler doesn't delegate, such as
  `onScroll`, which it wraps in a new listener), any attribute but `ref` beside a
  host spread unless it's dynamic, and an element nested in the returned one. A
  `class` or `style` object is split into one setting per key, as the compiler
  does, so only a dynamic key's value is reported, unless a method or accessor
  keeps the whole object. The check follows the compiler's folding of literal
  values and its dropping of an attribute that a later one of the same name
  replaces, of the children of a void element or a `<noscript>`, of a
  `<textarea>`'s children when a literal `value` or `defaultValue` (or a bare
  `value`) replaces them, of a `children` attribute on an element or component
  that has children (or an element that writes none), of an element's `$key`, and
  of an event array's elements after the first two, wherever the element is
  created, so a `yield` in a branch it drops, as in `false && (yield x)`,
  compiles. A `<select>`'s value is reported, since the compiler also assigns it
  in a microtask. On Vue, which wraps every element, it is a host spread, which
  TSRX evaluates before the element. A `yield` in a nested generator function or
  before the template is allowed on both. React, Preact and Hono evaluate
  templates eagerly and are unchanged.

- [#1218](https://github.com/tsrx-org/tsrx/pull/1218)
  [`0ee439a`](https://github.com/tsrx-org/tsrx/commit/0ee439a5d94e071ecae594229f61e9b5ee022296)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On React and Hono, a
  host spread whose bag carries several refs, such as a `ref` and a ref prop made
  with `create_ref_prop`, no longer detaches and reattaches them on every render.
  In `<div {...{ title, ref: a, extra: named }} />`, each update ran `a(null)`,
  `named(null)`, `a(el)` and `named(el)`, with or without a `ref` of the element's
  own, because the spread normalizer merged the bag's refs into a new callback
  each time. On these targets it now merges them as `merge_element_refs` does, so
  a new bag carrying the same refs gets the same `ref`, and its refs are applied
  again only when one of them changes. `merge_element_refs` now also keys a ref
  list by the refs in it, so an inline `ref: [a, b]` written each render is
  applied once as well, and a list whose refs change is applied again.

  Preact is unchanged, for the reason given for `merge_element_refs`. A custom
  platform that sets `jsx.shareMergedRefs` with `hostSpreadRefBinding: 'in-place'`
  imports the runtime's new `copy_spread_props_sharing_refs` and
  `copy_spread_props_for_ref_attr_sharing_refs` from its `imports.refProp` module,
  which `@tsrx/runtime/ref` and the first-party `*/ref` modules export.

- [#1176](https://github.com/tsrx-org/tsrx/pull/1176)
  [`56dd6f5`](https://github.com/tsrx-org/tsrx/commit/56dd6f573f9c7c822db9d33313317bed16f7fa45)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On React and Hono, an
  element with its own `ref` and a host spread no longer detaches and reattaches
  its refs on every render. In `<input ref={log} {...props.rest} />`, every update
  called `log` with `null` and then with the element again, because the merged
  `ref` was a new callback each time. These targets now merge with the runtime's
  new `merge_element_refs`, which returns a single ref as itself and the same
  callback for the same refs, so a ref is applied again only when one of the refs
  changes, as in plain TSX. A value that is not a ref, such as the `false` of
  `ref={cond && cb}`, is left out.

  Preact is unchanged: it stores a ref's cleanup on the callback itself, so
  elements that shared one merged callback would run each other's cleanups. It
  keeps a new `mergeRefs` callback per element and render.

  A `ref` written before a spread is still evaluated where it is written: it is
  assigned to a binding there, and the merged `ref` follows the spreads. The new
  `jsx.shareMergedRefs` platform option selects `merge_element_refs`; a custom
  platform that sets it imports `merge_element_refs` from its `imports.mergeRefs`
  module, which `@tsrx/runtime/ref` and the first-party `*/ref` modules export.

- [#1256](https://github.com/tsrx-org/tsrx/pull/1256)
  [`10a8901`](https://github.com/tsrx-org/tsrx/commit/10a89015088a283db1f067ffe7803fef4e621859)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A `static` class index
  signature stays static in the build output, the editor output and the
  declarations `tsrx-tsc` emits
  ([#1253](https://github.com/tsrx-org/tsrx/issues/1253)). esrap, which prints the
  output, writes `readonly` before an index signature but not `static`. So
  `class Store { static [key: string]: number }` became an instance signature. Two
  static signatures were then reported as duplicates (TS2374), `new Store()['y']`
  type-checked, and the emitted declaration gave consumers an instance signature.

- [#1121](https://github.com/tsrx-org/tsrx/pull/1121)
  [`1589310`](https://github.com/tsrx-org/tsrx/commit/1589310147fa30e065a10199e75092813ed4bb53)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Fixes bugs in hoisting
  static JSX to module-level constants:

  - Static JSX is hoisted only when every tag it reads is ready when the module
    loads and cannot change later: an import, a function declaration, or a `const`
    or class declared earlier. A member tag like `<Menu.Item>` is hoisted only
    when it starts with an import, since the module can assign `Menu.Item` after
    it loads. A tag that reads `this`, `super`, a local binding, a `let` or `var`,
    an enum, a namespace, an import alias, or a name the module does not declare
    is read at render time. Before, `<Screen.Tag>` in a method of `class Screen`
    threw `Cannot access 'Screen' before initialization` on import, and
    `<Menu.Item>` rendered an undefined type when `Menu.Item` was assigned later
    ([#204](https://github.com/tsrx-org/tsrx/issues/204)). Intrinsic tags like
    `<div>` read no binding and are still hoisted.
  - A component declared inside another function keeps its static JSX in place.
    Before, it referenced a static that was never declared and threw a
    `ReferenceError` when it rendered.
  - The temporary that holds a host element's spread props beside a `ref` is named
    apart from every identifier in the module, so it can't shadow or redeclare a
    binding the author wrote.
  - A raw `<script>` in an expression container or prop of static JSX keeps its
    body, as in `<div>{<script type="application/json">{"a":1}</script>}</div>`.
    The script rendered empty
    ([#845](https://github.com/tsrx-org/tsrx/issues/845)).

- [#1130](https://github.com/tsrx-org/tsrx/pull/1130)
  [`04ea4f0`](https://github.com/tsrx-org/tsrx/commit/04ea4f0bb85bc3fe25d09366cf04e70d809cc66e)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A `<style>` block
  rendered as an expression child, such as
  `<div>{<style>.card { … }</style>}</div>` or `{ready && <style>…</style>}`, now
  reports TSRX3014
  (`A <style> block inside an expression container … evaluates to its class map, so as a child it styles nothing`)
  in the compiler, the editor and `tsrx-tsc`. Before, it compiled to the block's
  class-map object rendered as a child, and the elements beside it got no scope
  hash. A block whose value is used, such as an attribute value or a member read,
  is still an assigned block.

- [#1090](https://github.com/tsrx-org/tsrx/pull/1090)
  [`0546961`](https://github.com/tsrx-org/tsrx/commit/0546961247f011b32370c6c16be3961b2bb5f533)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A style theme that
  applies itself, such as `const theme = <style apply={theme} />`, now reports
  TSRX3003 (`'theme' is applied before its declaration`). Before, compiling,
  collecting diagnostics, and generating virtual TSX for the editor all threw
  `RangeError: Maximum call stack size exceeded`, so the editor showed no
  diagnostics or mappings for the file. A block of an object literal that applies
  a later block of the same object reports TSRX3003 too, since the two could apply
  each other. Applying an earlier block of the same object still works.

- [#1261](https://github.com/tsrx-org/tsrx/pull/1261)
  [`42e3e49`](https://github.com/tsrx-org/tsrx/commit/42e3e4934d2beaa86d5048c303dfa27498599fec)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Any type arguments
  after a tag name now parse, as in TSX: `<Tag<T, U> />`,
  `<List<string | number> />`, `<a.b<[T]> />`, `<Tag<{ a: T }> />`,
  `<Tag<() => void> />` and the like. Only a single name, a literal or a nested
  generic used to parse; anything else failed with "Unexpected token", except
  inside an element's `{ }`.

- [#1220](https://github.com/tsrx-org/tsrx/pull/1220)
  [`70825fb`](https://github.com/tsrx-org/tsrx/commit/70825fb73774dce8753fcff7b6a8bbcdebe3a7fb)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On Solid, Vue and Hono
  DOM, whose components can't be async, an `await` anywhere in a component body is
  now reported as TSRX2021. Before, an `await` in an attribute of the component's
  root element, in an `if` test, in a `switch` discriminant or case test, or in a
  `catch` parameter default, and an `await using` declaration, compiled to an
  async component with no error. On Hono DOM, a module that also renders the
  component got no error in the editor either. The errors for a component now come
  in source order, so strict mode throws at the first `await`.
  `findFirstTopLevelAwait` now also returns an `await using` declaration.

  On React, Preact and Hono server, which accept async components, an
  `await using` in an `@for` body, or in an `@if` or `@switch` body with setup
  statements, now makes the generated callback async, as an `await` there does.
  Before, the callback stayed synchronous and TypeScript reported TS2852 on the
  output. In an `@catch` body, whose callback the target calls itself, it is now
  reported as TSRX2021, as an `await` there is. Their output is otherwise
  unchanged.

- [#1198](https://github.com/tsrx-org/tsrx/pull/1198)
  [`14a664d`](https://github.com/tsrx-org/tsrx/commit/14a664d8485a89c9cece8cc2080266cd89cc1329)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On Solid, Vue and Hono
  DOM, whose components can't be async, each `await` in a component is now
  reported once, as TSRX2021 with the target's own message. Before, an `await` in
  a part of the template that renders through a callback (an `@for` body on Solid
  and Vue, an `@try` or `@pending` body on Vue, an `@catch` body on all three, an
  `@if` or `@switch` body with setup statements on Solid) was reported twice: once
  by the target and once by the shared check, whose advice to await the value in
  the component body doesn't apply on these targets. An `@for await` on Vue and
  Hono DOM is no longer also reported as TSRX2024. In collecting mode and in the
  editor, every `await` of a component is now reported, not only the first. An
  `await` in a nested function is still allowed.

  The three messages now live in the error tables in `@tsrx/core/diagnostics`:
  `TARGET_COMPONENT_AWAIT_UNSUPPORTED`
  (`Solid TSRX components do not support \`await\`.`, and the same for Vue) and `HONO_DOM_COMPONENT_AWAIT_UNSUPPORTED`, which keeps Hono DOM's advice to use `use(promise)`with`<Suspense>`. Solid's message was `` `await` is not allowed inside Solid components. `` and Vue's was `` `await`
  is not yet supported in Vue TSRX components. ``.

- [#1228](https://github.com/tsrx-org/tsrx/pull/1228)
  [`f762c09`](https://github.com/tsrx-org/tsrx/commit/f762c09eea9f1071663bdc9d90524f21250132ff)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The last target error
  messages written outside the error tables now come from
  `@tsrx/core/diagnostics`, with their codes unchanged. Hono DOM's error for an
  async component it renders is the new `HONO_DOM_ASYNC_COMPONENT_UNSUPPORTED`
  entry, and now formats `use(promise)` and `<Suspense>` as code. Hono's error for
  `@catch (error, reset)` is the new `TARGET_CATCH_RESET_UNSUPPORTED` entry
  (TSRX2026). Solid's error for the `finally` of a JavaScript `try` that throws in
  a component body raises core's `TEMPLATE_TRY_FINALLY`, so its wording follows
  core's:
  ``Solid TSRX does not support JavaScript `try/finally` in TSRX templates. …``
  (was "in component templates"). When such a `try` has no `catch`, that is now
  its only error. Before, Solid also reported
  ``Solid try statements must have a `pending` or `catch` block.`` over the whole
  statement. Solid's missing-handler check now raises core's
  `TEMPLATE_TRY_HANDLER`.

- [#1281](https://github.com/tsrx-org/tsrx/pull/1281)
  [`ed8c38c`](https://github.com/tsrx-org/tsrx/commit/ed8c38c9fd948270d1136bf269f896402c0d359a)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A `//` right after a
  block comment in element children, as in `<b />/* c */// c`, is now text after
  an `@if`, `@for`, `@switch` or `@try` block too, as it is without one. After a
  directive it used to read as a line comment, so the rest of the line disappeared
  from the output and the comment list had a comment the same source didn't have
  elsewhere.

- [#1271](https://github.com/tsrx-org/tsrx/pull/1271)
  [`c07323a`](https://github.com/tsrx-org/tsrx/commit/c07323a54009fc3fbf95503de00d50ddb2b00725)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Text right before a tag
  now parses after a directive's block, as in `<p>@if (ok) {<b />}a<br /></p>` or
  `<p>@if (ok) {<b />}, write to me@x.dev<br /></p>`, and after an element that
  follows a directive in an element inside a `{ }` container, as in
  `{ok ? <p>@if (ok) {<b />}<i />x<em /></p> : null}`. Both used to fail with
  "Unexpected token", because the `<` after the text's last letter was read as the
  start of type arguments.

- [#1086](https://github.com/tsrx-org/tsrx/pull/1086)
  [`4344150`](https://github.com/tsrx-org/tsrx/commit/4344150cc4786dd717c1df722370e519ad349647)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Report more TypeScript
  errors where they are written in `.tsrx` files, using the parser's tokens:

  - A failed `satisfies` check (TS1360) reports on the `satisfies` keyword instead
    of being dropped ([#243](https://github.com/tsrx-org/tsrx/issues/243)).
  - A literal that starts a sequence expression, such as `0` in `(0, plain)`,
    reports at its own column
    ([#232](https://github.com/tsrx-org/tsrx/issues/232)).
  - A missing return on a composite return type (`number[]`, `{ a: number }`,
    `keyof T`) reports TS2355 on the type
    ([#216](https://github.com/tsrx-org/tsrx/issues/216)).
  - A superclass with a non-null assertion, such as `extends maybe!`, reports
    TS2507 ([#230](https://github.com/tsrx-org/tsrx/issues/230)).
  - A computed key's bracket span maps whatever spaces, comments or line breaks
    sit inside the brackets.
  - The `class` keyword maps correctly after a decorator, `abstract` or `declare`
    ([#193](https://github.com/tsrx-org/tsrx/issues/193)).

  A target that builds editor output from a parse without `keywordTokens` still
  gets these mappings: the tokens are read from a second parse of the source when
  the AST does not carry them.

- [#1114](https://github.com/tsrx-org/tsrx/pull/1114)
  [`c49216e`](https://github.com/tsrx-org/tsrx/commit/c49216e86d15b68c4d84f8763691418d74ad8744)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On React, Preact and
  Hono, a `@try` body's setup statements now run inside its boundary, as they
  already do on Solid and Vue. A synchronous throw in the body, such as
  `const data = load();`, renders the `@catch` fallback instead of escaping the
  boundary, and `use(promise)` called in the body shows the `@pending` fallback
  instead of leaving the root blank
  ([#510](https://github.com/tsrx-org/tsrx/issues/510)). The compiled body renders
  through a new `TsrxTryBody` component from the new `try-body` runtime modules
  (`@tsrx/react/try-body`, `@tsrx/preact/try-body`, `@tsrx/hono/try-body` and the
  matching `-runtime` packages). These modules import nothing, so a `@try` with
  only `@pending` still works in React Server Components. Each `@try` site is
  keyed, so two `@try` blocks rendered in the same place, such as the arms of an
  `@if`, no longer share boundary state or body hooks. A body that uses `await` or
  `yield` still runs inline in the enclosing function, which has to settle it.

  `@catch` now also catches a thrown `null` on React and Preact
  ([#847](https://github.com/tsrx-org/tsrx/issues/847)). Preact itself turns a
  `null` or `undefined` thrown while rendering into a `TypeError`, so on Preact
  the value arrives unchanged only when it is thrown from an effect.

- [#1301](https://github.com/tsrx-org/tsrx/pull/1301)
  [`fb35a0b`](https://github.com/tsrx-org/tsrx/commit/fb35a0bf5bbea972889e2024b535d0fee3227856)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On React and Preact,
  when rendering on the client, a `@pending` body now runs only while the `@try`
  body suspends, as it already does on Solid, and a throw in it reaches `@catch`.
  Before, the body ran on every render of the parent component, even when nothing
  suspended, and a throw in it escaped the same `@try`'s `@catch` and rejected the
  render. The fallback now renders as the `TsrxTryBody` component that the `@try`
  body already uses.

  What moves with it:

  - Hooks in a `@pending` body now belong to the fallback rather than the parent
    component, so their state starts fresh each time the fallback appears.
  - `useContext` in a `@pending` body now sees providers that the same component
    renders around the `@try`. Before, it saw the parent's context.
  - A `@pending` body that uses `await` or `yield` still runs inline in the
    enclosing function, which has to settle it, so it still runs on every render
    and a throw in it still escapes the same `@try`'s `@catch`.

  Limits:

  - On Preact, when the `@pending` body itself suspends, nothing renders in its
    place until the `@try` body resolves. React shows the enclosing `@pending`
    instead, and so did Preact before this change. preact/compat's `Suspense`
    counts a suspension thrown by its own fallback as one more suspension of its
    children.
  - On the server, `@catch` doesn't apply, because React's server renderer doesn't
    run error boundaries. When a `@pending` body throws while the `@try` body
    suspends, `renderToString` now fails with React's "A component suspended while
    responding to synchronous input" message instead of the thrown error.
  - React Server Components render the fallback eagerly, so there the `@pending`
    body still runs even when nothing suspends.

  Hono keeps the inline fallback. Its DOM renderer can't recover when a `Suspense`
  fallback component throws, and with the inline fallback an enclosing `@catch`
  still catches the throw. A new `jsx.pendingFallback` platform option selects the
  new behavior.

- [#1294](https://github.com/tsrx-org/tsrx/pull/1294)
  [`910dbae`](https://github.com/tsrx-org/tsrx/commit/910dbaea2d709ff2f53bf800042c8914bd336939)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Carry diagnostic
  severity and codes through the collected-error channel end to end.
  `CompileError` gains an optional `severity: 'error' | 'warning'` (absent means
  error) and `error()` accepts it as a trailing parameter, so consumer compilers
  can publish warning-severity diagnostics. `error()` never throws a warning: in a
  compile that doesn't collect, such as a build, it drops it. `tsrx-tsc` now
  prints collected diagnostics in tsc convention —
  `[tsrx-tsc] file(line,col): <error|warning> <code>: message` — instead of
  dropping `code`. The language server's compile-diagnostic plugin maps
  `severity: 'warning'` entries to real editor warnings.

- [#1318](https://github.com/tsrx-org/tsrx/pull/1318)
  [`d3e8fe4`](https://github.com/tsrx-org/tsrx/commit/d3e8fe44c53fdc64030307dbaaca1448d591cc2e)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - `TSRX2035` now also
  warns when the only statement of a `@{ … }` puts a `<style>` block, a `@{ … }`
  block or a directive behind `&&`, `||`, `??` or `?:`, such as
  `@{ok && @if (c) { <b /> }}`, as it already did for an element or a fragment.
  The statement throws that output away, so the block renders nothing. Output that
  runs statements of its own, such as `@{ok && @{ log(user) }}` or a directive
  with a statement in one of its bodies, doesn't warn, as a call doesn't. Compiled
  output doesn't change.

- [#1087](https://github.com/tsrx-org/tsrx/pull/1087)
  [`e423279`](https://github.com/tsrx-org/tsrx/commit/e423279be7250a493c555bd98e243db4540d654e)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Next App Router builds
  with Turbopack no longer fail on components with a scoped `<style>` block. The
  loader now imports the generated stylesheet by a relative path, and the
  stylesheet is linked into the page when a server component imports the
  component, in `next dev` and `next build`
  ([#565](https://github.com/tsrx-org/tsrx/issues/565)). The Pages Router still
  rejects these imports with Next's "Global CSS cannot be imported from files
  other than your Custom <App>" error.

  `create_tsrx_react_turbopack_css_rule()` and the `TsrxReactTurbopackCssRule`
  type now use `as: '*.css'` instead of `type: 'css'`. If you spread or inspect
  this rule, expect `as: '*.css'`.

  The `next` peer dependency is now `>=16.2.0`, the first release whose
  `turbopack.rules` accept the `condition.query` these rules use. Next 16.1
  rejects the config with "Unrecognized key(s) in object: 'query'".

  With a platform selected, ordinary `.js`, `.jsx`, `.ts` and `.tsx` modules are
  read with their own grammar while platform flags are replaced: comment-like JSX
  text such as `<pre>/*</pre>` no longer fails with "Unclosed tag", a flag inside
  `{…}` next to such text is replaced, and `.ts` files can use `<T>value` type
  assertions ([#910](https://github.com/tsrx-org/tsrx/issues/910)).

- [#1096](https://github.com/tsrx-org/tsrx/pull/1096)
  [`5391890`](https://github.com/tsrx-org/tsrx/commit/539189010bd47564395b7ab2c7108e2b9cc53f76)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - `tsrx-tsc` and the
  editor now report TypeScript errors that start at a keyword or punctuation of a
  `.tsrx` file that had no mapping:

  - TS7057 at an authored `yield` in a generator without a return type, also in a
    template condition such as `@if (yield 1)`
    ([#257](https://github.com/tsrx-org/tsrx/issues/257)).
  - TS2370 at the `...` of a rest parameter whose type is not an array, in
    function declarations, class methods, declared functions and components
    ([#823](https://github.com/tsrx-org/tsrx/issues/823)).
  - TS1316 on a nested `export as namespace`, whose `export`, `as` and `namespace`
    keywords now map to the source
    ([#979](https://github.com/tsrx-org/tsrx/issues/979)).

  A closing tag (`</div>`) and the `/>` of a self-closing tag now map to exactly
  their generated text, without the next character
  ([#982](https://github.com/tsrx-org/tsrx/issues/982)). The `;` that ends an
  expression or variable statement gets a mapping of its own, so unreachable code
  (TS7027) still reports on a statement that ends with an element, and now also on
  one such as `foo();`.

- [#1095](https://github.com/tsrx-org/tsrx/pull/1095)
  [`5552aa5`](https://github.com/tsrx-org/tsrx/commit/5552aa5ff936fabbec7ee652155df64905968c6a)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - `tsrx-tsc` and the
  editor now report TypeScript errors in parts of a `.tsrx` file whose mappings
  were missing:

  - The type arguments of an import type, as in `import('./store').Store<Missing>`
    and `typeof import('./store').create<Missing>`
    ([#552](https://github.com/tsrx-org/tsrx/issues/552)).
  - A whole import type, so an ES module used as a type without `typeof`
    (`type M = import('./store')`) reports TS1340
    ([#594](https://github.com/tsrx-org/tsrx/issues/594)).
  - The options of `import(source, options)` and `import.defer(source, options)`
    ([#599](https://github.com/tsrx-org/tsrx/issues/599)).
  - The parameter types of a `declare function` and of an overload signature
    ([#935](https://github.com/tsrx-org/tsrx/issues/935)).
  - The key remapping (`as`) clause of a mapped type, including a key type that is
    not a property key, as `as {}` or `as T[K]`
    ([#939](https://github.com/tsrx-org/tsrx/issues/939)).

- [#1097](https://github.com/tsrx-org/tsrx/pull/1097)
  [`4885ba3`](https://github.com/tsrx-org/tsrx/commit/4885ba3808edf0b2a74bb84b880b9c7f4966e5de)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Compiled output and the
  editor's type view now keep more of a `.tsrx` file as written:

  - An optional binding pattern parameter keeps its `?`, as in
    `declare function f({ a }?: T): void`. Calling `f()` no longer reports TS2554
    ([#556](https://github.com/tsrx-org/tsrx/issues/556)).
  - A string statement that is not a directive keeps its parentheses, so
    `('use strict');` no longer compiles to a `'use strict'` directive
    ([#968](https://github.com/tsrx-org/tsrx/issues/968)). An empty directive
    (`'';`) stays a directive.
  - Block-form `/* @ts-expect-error */` and `/* @ts-ignore */` directives now
    apply in `tsrx-tsc` and the editor, as in TypeScript, including one whose last
    line holds the directive
    ([#866](https://github.com/tsrx-org/tsrx/issues/866)). The comments around a
    directive keep their lines, so a plain block comment between a directive and
    its code still ends the directive's reach, for the line form too. A directive
    on the line where its statement starts covers the line after it in the source,
    which the printed code need not keep, so it is left out.
  - Block comments print as written. A JSDoc comment no longer gets an extra space
    after `/**`, and one over several lines keeps its closing line
    ([#1065](https://github.com/tsrx-org/tsrx/issues/1065)).

- [#1298](https://github.com/tsrx-org/tsrx/pull/1298)
  [`1e58a65`](https://github.com/tsrx-org/tsrx/commit/1e58a65f2be6ff7d3aee1f4bff521d172b997159)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Each unclosed tag's
  TSRX1001 is now reported on its own tag, not all of them at the token that ends
  the template. In `<main><section>`, the editor and TypeScript 7's
  `tsc --runExternalCode` show one error on `main` and one on `section`. Before,
  the editor showed both on the `>` of `<section>`, and TypeScript 7 showed both
  at the `}`. At module level or inside a closed parent, they show an unclosed
  `<style>` or `<script>` on its opening tag.

  The change is to collected errors, so `@tsrx/prettier-plugin` and
  `@tsrx/eslint-parser`, which report the first one, now report an unclosed
  element or fragment at the tag as well: `const y = <div>` is reported at `1:12`,
  where Prettier's `typescript` parser reports it, and no longer at `2:1`. A
  collected error's `raisedAt` doesn't move, except at the end of the file, where
  it's now one past the input. A strict compile, the one builds run, throws the
  same error at the same place as before.

  A `<>` has no mapping in the editor's code, in a template or not, so the
  language server shows an unclosed one on the nearest code it can. That's its
  first child when the child has a mapping, as in `<><div>` and `<>{1}`, and
  otherwise the code before it, as with `<>` and `<>hello`. TypeScript 7 shows it
  on the `<>`.

  On the TypeScript 7 language server, an unclosed tag hides what it hid before:
  TypeScript's errors in whatever holds the place the parser stopped, until the
  tag is closed. That's usually the enclosing function, and it can be a namespace,
  block, object or class, along with any component inside it. A tag that runs to
  the end of the file has nothing holding that place, so it hides errors only on
  its own name: `export const y = <Missing>` no longer repeats TS2304 beside the
  TSRX1001, and `@{` components after it at the top level keep their errors. An
  unclosed `<style>` or `<script>` stops at its body, which it hides. A plain
  `{ }` function after such a tag is still a parse error in the file.

  An error's anchor, the mapping for a token that isn't in the generated code, now
  stays on its generated line. It can still sit on other code on that line.

- [#1282](https://github.com/tsrx-org/tsrx/pull/1282)
  [`228d7bd`](https://github.com/tsrx-org/tsrx/commit/228d7bd028e879cde8b481a0209d1c3449380c5f)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A target that sets
  `requireUseServerForAwait` without an `await` validator of its own now allows a
  top-level `await` in a TSRX function when the module has a `"use server"`
  directive, as TSRX2025's message says. Without the directive, TSRX2025 is still
  reported. Before, it was reported with or without the directive. Only a real
  directive counts: a `'use server'` after an import, or a parenthesized one,
  doesn't. A target's `validateComponentAwait` hook now gets whether the module
  has the directive as its `moduleUsesServerDirective` argument, which was always
  `false`, unless the target sets
  `scanUseServerDirectiveForAwaitWithCustomValidator: false`. No bundled target is
  affected: Solid and Vue set that flag, and Solid, Vue and Hono DOM report their
  own TSRX2021 first.

- [#1103](https://github.com/tsrx-org/tsrx/pull/1103)
  [`5422ee1`](https://github.com/tsrx-org/tsrx/commit/5422ee180deb0422f0359629b0cdbf5533abf07b)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The Vite plugins
  restart the dev server when a tsconfig change selects a different
  `tsrx.platform`, including a change to an `extends` target or project reference
  outside the Vite root. `@tsrx/core/config` exports `getBuildPlatformConfigFiles`
  for the files a platform comes from. Before, both `.tsrx` modules and ordinary
  modules kept the previous platform until you restarted Vite by hand.

  Without a configured platform, the Vite plugins now reject an
  `import.meta.env.platform` flag in an ordinary `.ts`, `.tsx` or JavaScript
  module with the same "Platform flag usage requires a configured TSRX platform"
  error a `.tsrx` module gets. Before, the build succeeded and the bundle failed
  when it ran (`(void 0).web`).

- [#1125](https://github.com/tsrx-org/tsrx/pull/1125)
  [`c19818c`](https://github.com/tsrx-org/tsrx/commit/c19818ce37642c4508fb2ffd41a8325367d46c36)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - More Vue components are
  now wrapped in `defineVaporComponent`, and wrapped components can be read above
  their declaration:

  - An arrow component that contains a nested function, such as an inline
    `onClick={() => …}` handler or a `.map()` callback, is now wrapped. Before, it
    stayed a plain function, and mounting it as the app root threw
    `Cannot read properties of undefined (reading 'config')`.
  - A component that builds its JSX in a local variable and returns it
    (`const element = <div />; return element;`) is now wrapped. Before, its props
    never reached it and mounting it as the app root threw. A local binding counts
    when it holds JSX anywhere, the same rule already used for a returned
    expression, so a `function Config() { const c = { icon: <i /> }; return c; }`
    is wrapped just as `function Columns() { return [{ header: <b /> }]; }`
    already was.
  - A default-exported component (`export default function Card`) now compiles to
    `const Card = defineVaporComponent(…); export default Card;`, so the module
    keeps its `Card` binding. Before, one with a nested function compiled to the
    invalid `export default const …`, and `typeof Card` or `export { Card }` lost
    the binding.
  - A component read above its declaration while the module loads, as in
    `export const registry = { inner: Inner }` before `function Inner`, now loads:
    the compiler moves the wrapped `const` above that read when doing so changes
    nothing else. When the component's destructured prop defaults read a binding
    that the statements it would move past declare, assign or mutate
    (vue-jsx-vapor evaluates `{ label = PREFIX }` when the component is defined),
    the compiler reports the new TSRX2028 at the read and asks you to move the
    declaration up instead. That includes a binding mutated through a TypeScript
    wrapper, a destructuring target or `delete` (`(cfg as any).size = 2`,
    `cfg!.size = 2`, `[cfg.size] = [2]`), and an enum, namespace or `import x = …`
    alias declared in between, which sets its binding when it runs; a namespace's
    own `var`s don't count. Reads that do not run at load (in a function, a class
    instance field, a branch a constant condition skips, or a scope with its own
    binding of the name) move nothing. Calls are not followed: a read through a
    call or IIFE still hits the constant before it is initialized, and a call in
    between to a function that assigns a binding a default reads (`bump()` setting
    `size`) runs after the moved component captured the old value; reads from
    another `case` of the declaring `switch` or through a circular import cannot
    be seen either.
  - A destructured prop default that vue-jsx-vapor would silently drop now reports
    the new TSRX2029 at the default. vue-jsx-vapor turns those defaults into prop
    options and keeps only a string, number, boolean or `null` literal, an
    identifier, an object or array literal, or a function, so `{ s = cfg.size }`,
    `-1`, `SIZE + 1`, a call or a template literal left the prop `undefined` when
    the caller left it out. This applies to every wrapped component, including
    ones wrapped before this change; read the prop in the body instead
    (`const s = props.s ?? cfg.size`).

- [#1231](https://github.com/tsrx-org/tsrx/pull/1231)
  [`ab5a0ff`](https://github.com/tsrx-org/tsrx/commit/ab5a0ff13138746ade811808f27f52d34668ae3f)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Vue now reports a
  destructured prop that vue-jsx-vapor reads wrongly, instead of compiling a
  component that silently gets the wrong value:

  - The new TSRX2031 reports a key vue-jsx-vapor misreads. It reads a destructured
    prop by its key's name, so `function Card({ [k]: v })` read the prop `k`,
    whatever `k` held, and lost any default. It reads only keys that are names, so
    a binding at any other key (`{ 'a-b': v }`, `{ ['s']: v }`, `{ [1]: v }`)
    never got the prop: it was left out of the component, and a component with no
    key it reads got no prop options at all, so Vue passed it no props.
  - TSRX2031 also reports a props parameter with a default
    (`function Card({ s } = {})`), which vue-jsx-vapor skips, so the component got
    no props; remove the default, since Vue always passes a props object. And it
    reports a rest element inside a prop (`{ t: { a, ...r } }`,
    `{ t: [a, ...r] }`): vue-jsx-vapor gives the pattern's last rest element the
    component's attrs, an array's rest element the whole array, and any other the
    rest of `t` only as it was at setup, so `r` never followed the rest of `t`. A
    rest element of the props themselves (`{ s, ...rest }`) still compiles.
  - TSRX2029 now also reports a default inside a destructured prop
    (`{ s: { a = 3 } }`), which vue-jsx-vapor applies only when the whole prop is
    missing, so it was lost whenever `s` was passed without `a`.

  The errors suggest taking a `props` parameter and reading the prop where it is
  used, so it stays reactive: for example `{props.s === undefined ? 3 : props.s}`,
  which, like a default, replaces only `undefined`, or a `computed`. A kebab-case
  key is read by its camelized name (`props.aB`), and a value inside a prop with
  optional chaining (`props.t?.a`), since the prop can be missing. TSRX2029's
  existing advice, to read the prop once into a constant, changes the same way.
  The TSRX2028, TSRX2029 and TSRX2031 messages are now in `@tsrx/core/diagnostics`
  (`TSRX_ERRORS`).

- [#1108](https://github.com/tsrx-org/tsrx/pull/1108)
  [`04ef167`](https://github.com/tsrx-org/tsrx/commit/04ef16724d4c3d0a85cebef45fbd081673987fa0)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On Vue, a host spread
  now updates when its expression changes, as in `<button {...bag.value} />` after
  `bag.value = { disabled: true }`. Before, the compiler read the spread once in a
  setup declaration, so the element kept its first attributes and a button stayed
  enabled. The bag is now assigned where it is spread,
  `{...(bag = __normalize_spread_props_for_ref_attr(expr))}`, inside
  vue-jsx-vapor's render effect, which reads it again when it changes and sets the
  element's template ref after it.

  A new `jsx.refAfterProps` platform option says the compiled JSX applies an
  element's `ref` after its other attributes, so with the in-place binding the
  merged `ref` still goes last. Vue sets it.

- [#1118](https://github.com/tsrx-org/tsrx/pull/1118)
  [`0246e95`](https://github.com/tsrx-org/tsrx/commit/0246e95f983c2efd83e3e99100d00a5ba24c9233)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On Vue, `@catch` now
  handles errors under `@pending`. When an async child's loader rejects, the
  `@catch` fallback replaces the `@pending` one instead of `@pending` staying up
  with an unhandled rejection
  ([#1078](https://github.com/tsrx-org/tsrx/issues/1078)), and `reset()` renders
  the body again after it threw while setting up
  ([#937](https://github.com/tsrx-org/tsrx/issues/937)); it did nothing before.

  The boundary also catches errors from child components when the app sets
  `app.config.errorHandler`, and in production builds, including a `@try` inside
  element children, which now compiles to a boundary component like every other
  `@try`. It used to rely on Vue re-throwing unhandled errors, which Vue does only
  in development and only when no `errorHandler` is set. As with Vue's
  `errorCaptured`, an error that `@catch` handles no longer reaches
  `app.config.errorHandler`.

  An error now goes to the boundary around the component it came from, even when
  another boundary is rendering at the time; `reset()` also recovers after a
  thrown `null`; and the boundary's `fallback` and `content` props no longer
  appear as attributes on the element it renders.

- Updated dependencies
  [[`2bc4f1f`](https://github.com/tsrx-org/tsrx/commit/2bc4f1fc5fcb9863c926ab3d01b0407e89bbf639),
  [`bf6d334`](https://github.com/tsrx-org/tsrx/commit/bf6d3349a59f8ec1769d5a2f789801af7cd74ff7),
  [`2b465b4`](https://github.com/tsrx-org/tsrx/commit/2b465b432b515c07047e3eadeb66ff34df95de2d),
  [`ced2603`](https://github.com/tsrx-org/tsrx/commit/ced260375637359686e521cce628be3057d455df),
  [`9ff7b5d`](https://github.com/tsrx-org/tsrx/commit/9ff7b5d5f80e7697896d91d5674ccccb389a890d),
  [`6b207b6`](https://github.com/tsrx-org/tsrx/commit/6b207b65e8a339d5fe301c60e72db271ffb9a572),
  [`2473538`](https://github.com/tsrx-org/tsrx/commit/247353854e918f119dafe88f6474a2738cb82ed8),
  [`0ca1023`](https://github.com/tsrx-org/tsrx/commit/0ca10232569e9beaad7d1d0d53d209e6520385fa),
  [`153b526`](https://github.com/tsrx-org/tsrx/commit/153b5267ad6445abdb81f85d5ad32409d6101d7e),
  [`384972f`](https://github.com/tsrx-org/tsrx/commit/384972fcdd5eaeb09b92a852bb3d9ee186689286),
  [`0ee439a`](https://github.com/tsrx-org/tsrx/commit/0ee439a5d94e071ecae594229f61e9b5ee022296),
  [`56dd6f5`](https://github.com/tsrx-org/tsrx/commit/56dd6f573f9c7c822db9d33313317bed16f7fa45)]:
  - @tsrx/runtime@0.2.5

## 0.5.5

### Patch Changes

- [#1054](https://github.com/tsrx-org/tsrx/pull/1054)
  [`0a967fc`](https://github.com/tsrx-org/tsrx/commit/0a967fcc3df20b9e9e22921ca90d604dd93cf7ec)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Import and export mistakes
  now report the errors TypeScript reports, instead of TS1012 `Unexpected token`:

  - A missing `from` reports TS1005 `'from' expected.`: `import { a } "./a.js"`,
    `export { a } "./a.js"` and `export * "./a.js"`. `import a "./a.js"` reports
    `'=' expected.`, because TypeScript reads a single name after `import` as the
    start of `import a = require(…)`. `export as N` reports
    `'namespace' expected.`.
  - A `from` written with an escape (`fr\u006fm`) reports TS1260
    `Keywords cannot contain escape characters.`.
  - A module specifier that isn't a string reports TS1141
    `String literal expected.`, and a missing one reports TS1109
    `Expression expected.`.
  - `import type "./a.js"` now reports `'=' expected.`. Before, it parsed as a
    type-only import. `import type from from "./a.js"` and
    `import type from = require("./a.js")` now parse as type-only imports of a
    binding named `from`, as in TypeScript.

  A deferred import with a default binding now reports TS18058
  `Default imports are not allowed in a deferred import.`, and one with named
  bindings TS18059 `Named imports are not allowed in a deferred import.`. Before,
  both reported TS18059 with one message. TypeScript reports both from its
  checker, so a collecting parse records them and goes on, as it does for a source
  phase import. A phase import from an inline module
  (`import defer * as ns from server`) reports TS1141 the same way.

  A deferred import without bindings (`import defer "./a.js"`) is still an error,
  now with TSRX's code TSRX4003 instead of TS18059. TypeScript accepts it without
  an error and leaves out `defer` (microsoft/TypeScript#64627), but the proposal
  allows only a namespace import.

  `import.defer()` and `import.source()` with an escape in the phase name now
  report TS1260 at the name, as TypeScript 7.1 does, instead of an error about
  `import.meta`.

  The formatter still refuses a deferred import with a default or named binding,
  as Prettier does.

- [#1052](https://github.com/tsrx-org/tsrx/pull/1052)
  [`5d7314a`](https://github.com/tsrx-org/tsrx/commit/5d7314a0615d1dfcf5ba36cf832d7b4b656885e8)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser now reads source
  phase imports, `import source module from './module.wasm'` and
  `import.source('./later.wasm')`, as TypeScript 7.1 does, and sets
  `phase: 'source'` on the `ImportDeclaration` or `ImportExpression`. Before, both
  failed to parse. `import source from './a.js'`,
  `import source, { a } from './a.js'`, and `import source from server` are still
  ordinary default imports named `source`. A source phase import with named or
  namespace bindings reports TS18112, and one without a binding reports TS18111.
  Like TypeScript, a collecting parse records both and goes on.

  An import with a phase is also no longer read as an import-equals declaration:
  `import defer x = require('./a.js')` is now a syntax error, as in TypeScript.
  Before, it parsed as `import x = require('./a.js')` and lost the phase.
  `import defer from from './a.js'` now reports the deferred import error instead
  of an unexpected token.

- [#1048](https://github.com/tsrx-org/tsrx/pull/1048)
  [`a420dd1`](https://github.com/tsrx-org/tsrx/commit/a420dd1bd2e3fe7d03d4e93eb666d7d070e7bdb5)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Compiled output now keeps the
  source phase of `import source module from './module.wasm'` and
  `import.source('./later.wasm')`. Before, the printer kept only `defer` and
  printed these as an ordinary default import and an ordinary `import()`, so the
  program loaded the evaluated module instead of its source. This happened when
  another parser, such as `@tsrx/oxc`, built the tree. Core's own parser does not
  read source phase imports yet. An import phase the printer does not know now
  throws instead of printing an ordinary import. The AST types now allow
  `phase: 'source'`.

- [#1045](https://github.com/tsrx-org/tsrx/pull/1045)
  [`5ce0b5f`](https://github.com/tsrx-org/tsrx/commit/5ce0b5fdff3f86abf578a685869d63b8dfb61f60)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Parentheses around a
  `<style>` block or an `apply` value now give the same result in the editor as in
  the build. Before, `const dark = (<style>…</style>)`, the form Prettier prints
  for a multi-line block, built fine, but the editor and type checkers reported
  `'dark' is not a style block` for `apply={dark}`. `apply={(dark)}` crashed the
  editor compile, and a parenthesized `(<style>…</style>);` statement was not
  reported as a standalone block.

## 0.5.4

### Patch Changes

- [#1036](https://github.com/tsrx-org/tsrx/pull/1036)
  [`885adfb`](https://github.com/tsrx-org/tsrx/commit/885adfb87ddf6907d46e8a98267bdfdad5103d76)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Comments now attach to the
  same code whatever line breaks a file uses. Before, in a file with U+2028 or
  U+2029 line breaks, a comment at the end of a line became a leading comment of
  the code on the next line: `const a = 1 // note` led `const b = 2` instead of
  trailing `const a = 1`. In a file with only CR line breaks, a comment between
  two blank lines led the next statement, and a block comment over several lines
  kept its indentation. Now CR, U+2028 and U+2029 end a line like LF and CRLF, as
  in Prettier.

- [#1034](https://github.com/tsrx-org/tsrx/pull/1034)
  [`87dda2d`](https://github.com/tsrx-org/tsrx/commit/87dda2d5c8d6154ffe32e7494aaadfc8ac7a27aa)
  Thanks [@everton-dgn](https://github.com/everton-dgn)! - Recognize Unicode line
  and paragraph separators between setup statements and markup, and in directive
  trivia, without changing authored text or offsets. End template line comments at
  these separators and keep UTF-16 locations aligned after JSX text, including
  lone carriage returns.

- [#1032](https://github.com/tsrx-org/tsrx/pull/1032)
  [`d2f42e8`](https://github.com/tsrx-org/tsrx/commit/d2f42e8e8403c1653c2928ac7b92c71ee04b9e42)
  Thanks [@leonidaz](https://github.com/leonidaz)! - **Organize Imports**, **Sort
  Imports** and **Remove Unused Imports** now change `.tsrx` files in which a
  comment follows an import on the same line. As in a `.ts` file, the comment
  moves with its import, and Remove Unused Imports removes it with its import.
  Before, these actions did not change such a file. On TypeScript 7, they now also
  work when spaces end the line of an import, but the imports must still end with
  `;` ([#1023](https://github.com/tsrx-org/tsrx/issues/1023)).

  `@tsrx/core` now exports `getLineCommentsAfter` and `isOrganizedImport`, so that
  a compiler with its own type-only printer can print these comments too.

- [#1022](https://github.com/tsrx-org/tsrx/pull/1022)
  [`7accf3c`](https://github.com/tsrx-org/tsrx/commit/7accf3c7fb0d56288827c1804a2d2c1fd1120bff)
  Thanks [@leonidaz](https://github.com/leonidaz)! - On TypeScript 5.9 and 6,
  **Organize Imports**, **Sort Imports** and **Remove Unused Imports** now change
  `.tsrx` files. Before, they did nothing. The quick fix that removes an unused
  import, **Fix All** for unused imports, and the auto-import quick fix that adds
  a new import line now work in `.tsrx` files too.

  When an import does not end with `;`, the warning for an unused import now shows
  in `.tsrx` files on TypeScript 5.9 and 6. Before, it did not show.

## 0.5.3

### Patch Changes

- [#135](https://github.com/tsrx-org/tsrx/pull/135)
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee)
  Thanks [@leonidaz](https://github.com/leonidaz)! - `@tsrx/content-mapper`
  reports every compile error under the source `TSRX`, in capitals like
  TypeScript's own `TS2322`: a TSRX error with its code's number, so it shows with
  its own code (`TSRX2002`) instead of a hash of the code, and an error with a
  TypeScript code with `11` before its number (`TS1005` shows as `TSRX111005`).
  The generated code can lose a mistake, such as a repeated modifier or a rest
  parameter's `?`, so TypeScript can't always report it itself. Where it does, an
  `ignore` diagnostic directive over the generated code of the statement, member
  or element that holds the error hides TypeScript's copy until the error is
  fixed, so each mistake shows once. The mapper's own errors are `771000` to
  `771003`. `@tsrx/core/diagnostics` exports the source, codes and prefixes as
  `DIAGNOSTIC_SOURCE`, `MAPPER_CODES`, `TYPESCRIPT_CODE_PREFIX` and
  `MAPPER_CODE_PREFIX`.

- [#135](https://github.com/tsrx-org/tsrx/pull/135)
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee)
  Thanks [@leonidaz](https://github.com/leonidaz)! - `@tsrx/core/diagnostics` runs
  nothing when it loads, so a bundler keeps only the tables a consumer reads: a
  bundle that imports the diagnostic source and codes now takes under 2 KB of it
  instead of about 45 KB, with Rolldown, esbuild or Rollup and no bundler
  settings. The upstream message lookup is built the first time it is used.

- [#135](https://github.com/tsrx-org/tsrx/pull/135)
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee)
  Thanks [@leonidaz](https://github.com/leonidaz)! - A `<script>` whose `type`
  makes its body data rather than code, such as `application/json`, `importmap` or
  `text/template`, no longer gets an embedded TypeScript region, so the language
  service and TypeScript 7 stop reporting TypeScript errors in valid JSON
  ([#846](https://github.com/tsrx-org/tsrx/issues/846)). A body with no `type`,
  `module`, a JavaScript MIME type, a TypeScript or JSX type (`text/typescript`,
  `text/babel`), or a `type` only known at run time is still checked.

- [#985](https://github.com/tsrx-org/tsrx/pull/985)
  [`5abd474`](https://github.com/tsrx-org/tsrx/commit/5abd474b108bdd780cece1e88e02ccfec265aad4)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Stop moving hooks out of
  template control flow for Vue, Solid and Hono DOM. A hook (or, on Vue, a
  `ref()`, `computed()` or similar call) inside an `@if`, `@for`, `@switch` or
  `@try` body now stays in that body, as it already does for React and Preact, so
  the Rules of Hooks apply as they do in TSX. Give hook state that belongs to a
  branch its own component.

  The type-only output for editors no longer declares an untyped
  `let <Component>__StatementBodyHook<N>;` cache, which TypeScript 7 reported as
  TS7034 and TS7005 under `noImplicitAny`.

  Platform authors: the `moduleScopedHookComponents` and `isTopLevelSetupCall`
  platform hooks, the `moduleScopedHookComponents` transform option, and the
  `planSwitchLift`, `cloneSwitchHelperInvocation` and
  `rewriteLoopContinuesToBareReturns` exports are removed. `createHookSafeHelper`
  now takes `(bodyNodes, sourceNode, ctx, options)`, and the new
  `summarize_switch_case` export returns a `@switch` case's own body.

- [#135](https://github.com/tsrx-org/tsrx/pull/135)
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Add `@tsrx/content-mapper`, a
  TypeScript 7 content mapper that type-checks `.tsrx` files under native
  `tsc --runExternalCode`; factor the type-only transform out of the Volar plugin
  into `@tsrx/typescript-plugin/src/transform.js`, and drop the unused
  `suppressedDiagnostics` mapping metadata, and blank `<script>` bodies in the
  generated TSX (they are checked as embedded scripts) so a `<` inside one no
  longer parses as a JSX tag. Migration and rollback steps, the compatibility
  matrix against the classic path, and benchmarks are in
  `packages/content-mapper/ROLLOUT.md`, `COMPATIBILITY.md` and `BENCHMARKS.md`.
  `<script>` bodies are no longer separate supplemental `.mts` outputs: the shared
  transform appends each body to the generated TSX as a block statement, mapped
  back to the source, and hoists a `<script type="module">` body's `import`
  declarations to module level in front of it (its `export` syntax is blanked in
  place, since nothing can import an inline script, and top-level `await` stays
  valid). Composite (`--build`) projects therefore accept `.tsrx` files with
  `<script>` bodies (the TS6307 limitation is gone), and `--declaration` emits no
  `*.tsrx.<n>.d.mts` files. Verbatim spans now also cover the identical whitespace
  that follows them, so edits that end at the start of the next line (Organize
  Imports, Sort Imports, Remove Unused Imports) map and apply instead of being
  dropped by TypeScript 7.

- [#135](https://github.com/tsrx-org/tsrx/pull/135)
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee)
  Thanks [@leonidaz](https://github.com/leonidaz)! - A tag that the loose parser
  recovers as unclosed (for example `<b>` typed before its `</b>`) now stays
  unclosed in the type-only output used by editors, as authored, instead of
  getting a synthesized closing tag. TypeScript then reports it ("JSX element 'b'
  has no corresponding closing tag", TS17008) as it does in a `.tsx` file, and
  TypeScript's own closing-tag completion can find the open tag. Compiled output
  is unchanged.

- [#988](https://github.com/tsrx-org/tsrx/pull/988)
  [`f518cb9`](https://github.com/tsrx-org/tsrx/commit/f518cb91a120e8a368cece21efbc954135f99dfe)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Lower a `@catch` body once
  when the target renders it through a fallback component. For Vue, a `@try` with
  `@pending` and `@catch` no longer hoists a static catch body a second time for
  an inline fallback that is never used; the fallback renders the component
  instead.

  Type `TsrxErrorBoundary` as returning Vue's `Block`, so `<TsrxErrorBoundary>` in
  the type-only output for `@try` / `@catch` is a valid `vue-jsx-vapor` JSX
  element. Under `strict` it reported TS2786 because its declared return type
  included `undefined`.

## 0.5.2

### Patch Changes

- [#972](https://github.com/tsrx-org/tsrx/pull/972)
  [`a836f17`](https://github.com/tsrx-org/tsrx/commit/a836f1730d868f4a06b6de019d5c6ff1112db34e)
  Thanks [@leonidaz](https://github.com/leonidaz)! - A `JSXText` node's `value`
  now has its character references decoded, as in every JSX parser, and `raw`
  keeps the text as written. Before, both held the text as written. For
  `<p>a &quot;b&quot; &amp; c</p>`:

  ```text
  value: a "b" & c
  raw:   a &quot;b&quot; &amp; c
  ```

  `value` also reads each CRLF line break as LF.

  Compiled and formatted output doesn't change: the compilers and the formatter
  print `raw`, and JSX's whitespace rules read it, so text that is only a
  reference, such as `<>&nbsp;</>`, is still text. A tool that prints JSX text
  from `value`, or decodes it again, should use `raw` instead, or `&amp;lt;`
  renders `<` instead of `&lt;`.

## 0.5.1

### Patch Changes

- [#967](https://github.com/tsrx-org/tsrx/pull/967)
  [`b213995`](https://github.com/tsrx-org/tsrx/commit/b213995b75c1c294d76efc20445e450b3b876eb7)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Read the strings that start a
  `@{ … }` function body as its directive prologue, as in a `{ … }` body. The
  parser now marks them as directives, so Prettier no longer wraps them in
  parentheses:

  ```diff
   function App() @{
  -  ('use client');
  +  'use client';
     <div>Hello</div>
   }
  ```

  `'use strict'` there with a parameter list that isn't simple is now TS1347, as
  it is in a `{ … }` body. A `@{ … }` value and a directive body aren't function
  bodies, so a string at their start still gets parentheses, as in a block.

## 0.5.0

### Minor Changes

- [#879](https://github.com/tsrx-org/tsrx/pull/879)
  [`00d47ed`](https://github.com/tsrx-org/tsrx/commit/00d47edc7469deb1fffc229c642136dd35abbb86)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Give an `@case` or `@default`
  arm its `{ … }` body as a node: its `consequent` is one `BlockStatement` from
  the `{` to the `}`, as a JavaScript `case 1: { … }` has in every parser and as
  the `@if`, `@for` and `@try` bodies are. Tools that read an `@case`'s
  `consequent` as its statements read `consequent[0].body` now. A comment in an
  empty arm is the block's inner comment.

- [#858](https://github.com/tsrx-org/tsrx/pull/858)
  [`bf793b1`](https://github.com/tsrx-org/tsrx/commit/bf793b13bdc05169b98a7c452df37ae2af4ca953)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Read comments between
  template children the way TSX reads `{/* … */}`:

  - A `//` starts a comment when whitespace comes right before it, at the start of
    a line, or right after a tag, an expression container, or a `@{ … }` or
    directive block. It runs to the end of the line, a closing tag on it included.
    A `//` that touches other text stays text, so `https://example.com` and `a//b`
    are text; write `&[#47](https://github.com/tsrx-org/tsrx/issues/47);/` for
    text that starts a line or follows a space.
  - A comment renders like `{/* … */}` in TSX: the text on each side of it follows
    JSX's whitespace rules on its own. For example, `<b>t</b>`, a line break, then
    `/* c */ <i />` renders a space before `<i />`, as TSX does, where it rendered
    none before.
  - The parse tree gives text with comments the children TSX has for it, so every
    target's JSX compiler reads it as TSX: the text between the comments, each
    piece exactly as written, with an empty `{}` (a `JSXExpressionContainer` whose
    `expression` is a `JSXEmptyExpression`, and no braces in the source) between
    two pieces that render. The comments in it are the `JSXEmptyExpression`'s
    `innerComments`. A piece that is whitespace with a line break is left out, as
    such text is anywhere, except around a tooling comment such as
    `// @ts-expect-error`, which gets a `{}` of its own so that the editor's
    TypeScript reads it as `{/* @ts-expect-error */}`. Before, such text was one
    `JSXText` with the comments cut out of it and attached to it; tools that read
    the tree see the new children.

- [#782](https://github.com/tsrx-org/tsrx/pull/782)
  [`de88f59`](https://github.com/tsrx-org/tsrx/commit/de88f59036b5ff6824d85b15d032f79d0b9e36bc)
  Thanks [@leonidaz](https://github.com/leonidaz)! - A dynamic tag expression
  (`<{expr}>`) must now be one of three forms: an identifier (`tag`), a member
  access (`props.as`, `this.tag`, `registry[name]`, `items[0]`, where each
  computed key is an identifier, a string or number literal, or a member access),
  or a string literal (`'section'`). Anything else is reported as
  `tsrx-dynamic-tag-expression`, including code that compiled before: a
  conditional, `||`, `??` or `&&` (`<{c ? A : B} />`), parentheses and type-only
  wrappers (`<{tag as any} />`), optional member access, a template literal, an
  arrow function, and an element. A non-self-closing element repeats the
  expression in its closing tag, so compute the tag above the element instead:
  `const Tag = c ? Child : Fallback;` followed by `<{Tag} />`.

  Any expression parses, and the check doesn't change the tree. A normal compile
  throws the error, and `collect` and `loose` mode record it once per element at
  the part of the expression that isn't allowed and go on, so the editor
  underlines the tag and keeps working. A call or a concatenation in a tag used to
  fail the whole file in `collect` mode.

- [#888](https://github.com/tsrx-org/tsrx/pull/888)
  [`21bb71e`](https://github.com/tsrx-org/tsrx/commit/21bb71eb3ce94d0ba187b59bf5df9f7902582a49)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Give every error `@tsrx/core`
  reports a code ([#843](https://github.com/tsrx-org/tsrx/issues/843)):

  - A mistake TypeScript also reports has TypeScript's code, such as `TS1005` for
    `'}' expected.` or `TS2300` for a redeclared name, so an editor shows the code
    TypeScript would. This includes acorn's and acorn-typescript's errors.
  - A mistake only TSRX reports has a `TSRX` code: `TSRX1xxx` for markup,
    `TSRX2xxx` for template rules, `TSRX3xxx` for style blocks and CSS, and
    `TSRX4xxx` for everything else. They replace the `tsrx-*` strings, and every
    code is listed in the specification's new appendix B.
  - `DIAGNOSTIC_CODES` keeps its names with the new values. `JSX_EXPRESSION_VALUE`
    is removed, since no error used it.
  - An import or export inside a block is reported with TypeScript's error for its
    kind instead of acorn's
    `'import' and 'export' may only appear at the top level`: TS1232 for an
    import, TS1233 for `export { … }` or `export *`, TS1258 for `export default`
    of an expression, TS1231 for `export =`, TS1316 for `export as namespace`,
    TS1235 for a namespace, and TS1184 (`Modifiers cannot appear here.`)
    otherwise.
  - `using` and `await using` in a `for…in` head are reported with TypeScript's
    messages, TS1493 and TS1494.

  `@tsrx/solid` gives its two `try` errors their codes, and `@tsrx/mcp` reports
  the new codes, also for a target that still reports a `tsrx-*` code.

- [#869](https://github.com/tsrx-org/tsrx/pull/869)
  [`f78fada`](https://github.com/tsrx-org/tsrx/commit/f78fadacacff187b666014af086a7b0f3d01430c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Give an element's and a
  fragment's children exactly the shape TSX's parsers (TypeScript, Babel, oxc,
  SWC) give them, so every character between the tags is in the tree:

  - Whitespace-only text is kept as a `JSXText`, including the layout indentation
    between children, after an opening tag and before a closing tag, which the
    parser used to drop.
  - Every comment between children is an empty `{}` of its own (a
    `JSXExpressionContainer` with a `JSXEmptyExpression`, no braces in the
    source), with the comment in the `JSXEmptyExpression`'s `innerComments`, as
    `{/* … */}` is in TSX. Before, a comment with nothing rendering on one side
    attached to a neighbouring child.
  - The whitespace and comments right after an `@if`, `@for`, `@switch` or `@try`
    block are text and comments too. This fixes a space before a comment after a
    block being lost: `} // c`, then `two` on the next line, now renders ` two` as
    TSX does.
  - Text before a comment that ends an element's children was dropped when the
    element was in a `{…}` container or an attribute value
    (`{x && <span>a /* c */</span>}` rendered an empty `<span>`). It is kept now.
  - The new `isLayoutWhitespace(node)` export tells whether a `JSXText` renders
    nothing under JSX's whitespace rule (empty, or only spaces, tabs and line
    breaks with a line break among them). Tools that read the tree can use it to
    skip that text, as core's compilers do; what renders is unchanged.

- [#790](https://github.com/tsrx-org/tsrx/pull/790)
  [`c70964d`](https://github.com/tsrx-org/tsrx/commit/c70964d76055f1bea742bc15b66044042ef5bfcd)
  Thanks [@leonidaz](https://github.com/leonidaz)! - A `<script>` element is raw
  text, like `<style>`, in templates and in plain JSX. Its body is `content`,
  taken as written, and the element has no children: the `JSXText` child that
  mirrored the body is gone. None of JSX text's rules apply to the body: comments,
  `<`, `>`, character references, and line breaks stay as written, and
  `<script>{code}</script>` is a script whose text is `{code}`, not an expression
  container.

  Each target now outputs the body in the form that renders it exactly, on the
  client and in server HTML:

  - React: `<script>{"…"}</script>`, a string child.
  - Preact and Hono: `<script dangerouslySetInnerHTML={{ __html: "…" }} />`.
  - Solid: `<script innerHTML={"…"} />`.
  - Vue: `<script v-html={"…"} />`.

  Before, the body compiled to JSX text: its lines were joined, so a `// c` line
  commented out the rest of the script, and `&amp;` rendered `&`. In Solid and
  Vue, a `<` rendered `&lt;`. `<script>{code}</script>` threw
  `ReferenceError: code is not defined`. Whether a script runs is still each
  target's decision: a client render runs it in Preact and `hono/jsx/dom`, not in
  React, Solid, and Vue, and server HTML runs it.

  A body ends where HTML ends it: at `</script`, optional whitespace, and `>`, so
  `</script >` closes it. Any other `</script` in the body, in any letter case
  (`</SCRIPT>`), is the `tsrx-script-end-tag-in-body` error, with a hint to write
  `<\/script`. A body of only whitespace outputs an empty script.

  The TypeScript plugin's fallback for a file that doesn't compile ends a body
  where the parser does.

- [#877](https://github.com/tsrx-org/tsrx/pull/877)
  [`0212b6f`](https://github.com/tsrx-org/tsrx/commit/0212b6f5eee220a90014eb57eb34926b1e71b8a9)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Give an enum's members in a
  `TSEnumBody` that spans its braces (`enum E { A }`'s `body.members`), as
  typescript-estree and Babel 8 do, not on the declaration as acorn-typescript
  keeps them. Tools that read `TSEnumDeclaration.members` read `body.members` now.

- [#713](https://github.com/tsrx-org/tsrx/pull/713)
  [`f73b676`](https://github.com/tsrx-org/tsrx/commit/f73b676036673cb81975dae7f50ae65c6e4af358)
  Thanks [@leonidaz](https://github.com/leonidaz)! - An element in a spread
  attribute's argument (`<div {...{ k: <b>…</b> }} />`,
  `<div {...(c ? <b>…</b> : null)} />`) and an element that is an attribute value
  without braces (`<div k=<b>…</b> />`) are template markup, as an element in a
  braced value (`<div k={<b>…</b>} />`) is. They were parsed as plain JSX:

  - A comment in them is a comment instead of text (`<b><i /> /* c */ 2</b>`
    rendered `/* c */ 2`).
  - `@if`, `@for`, `@switch`, `@try`, and `@{ … }` in them are directives instead
    of text followed by a `{…}` container.
  - Their text follows the template text rules, and a mismatched closing tag
    reports the template's message.

- [#874](https://github.com/tsrx-org/tsrx/pull/874)
  [`3a355da`](https://github.com/tsrx-org/tsrx/commit/3a355daf22b4f9973e0e63f875de7c03fc0a2c45)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Give a type parameter's name
  (`T` in `<T>`, a mapped type's key, `infer U`) as an `Identifier` with its
  position, as typescript-estree and Babel 8 do, not the string acorn-typescript
  keeps. Tools that read `TSTypeParameter.name` as a string read `name.name` now.

### Patch Changes

- [#530](https://github.com/tsrx-org/tsrx/pull/530)
  [`1b3bbe5`](https://github.com/tsrx-org/tsrx/commit/1b3bbe5722dec196f54632e768a920904581568a)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Improve the parser's comment
  attachment around expressions, parameters, and type annotations:

  - A block comment between two nodes on one line leads the next node when only
    whitespace or `(` separates them, and otherwise trails the preceding node.
  - A comment before a function or method's parameter list trails its name.
  - An own-line comment inside a default value leads the default-value pattern or
    parameter property; an end-of-line comment after `=` trails its name.
  - Comments around a shorthand property's default value attach to the default
    rather than a separate copy of the property's key.
  - A comment below an arrow function's JSX body stays attached to that body.
  - A comment after a parameter list on the same line trails the last parameter;
    comments inside an empty parameter list belong to the function or signature.
  - A comment after a mapped type's constraint attaches to its type parameter.

- [#633](https://github.com/tsrx-org/tsrx/pull/633)
  [`20b17fd`](https://github.com/tsrx-org/tsrx/commit/20b17fd8b8a255e1b32eef17183f710b5b04d4af)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser attaches three
  kinds of comments where Prettier does:

  - The function of a generic method, getter, or setter in an object literal
    (`{ m<T>() {} }`) now starts at its type parameters, as in typescript-estree,
    instead of at its `(`. A comment in the type parameters (`m</* c */ T>() {}`)
    stays there instead of moving after the name, or being deleted when it is a
    line comment on its own line.
  - A comment on its own line before the `;` that ends a file with no line break
    after it (`const x = 1` / `// c` / `;`) now trails the statement, as it does
    when a line break follows, instead of being deleted.
  - A comment in a spread attribute's braces before its argument
    (`{.../* note */ b}`) now leads the argument instead of attaching after the
    attribute or to the next attribute.

  A comment before an object method's type parameters now leads its function node.

- [#950](https://github.com/tsrx-org/tsrx/pull/950)
  [`9cfadf4`](https://github.com/tsrx-org/tsrx/commit/9cfadf4c00dfee8cf546fe1ddbb68cda039d06a1)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Define each error message
  `@tsrx/core` reports once, with its code
  ([#947](https://github.com/tsrx-org/tsrx/issues/947)). The messages and codes
  don't change.

  - `@tsrx/core` exports the errors it reports as `TSRX_ERRORS`, for TSRX's own
    codes, and `TS_ERRORS`, for mistakes TypeScript also reports. An entry is
    `{ code, message }`, or, when its message takes values, a function of them
    that gives one, with the `code` too:
    `TS_ERRORS.MODIFIER_MUST_PRECEDE('export', 'abstract')`.
  - `error()` also takes an entry in place of a message and code.
  - The parser, the analysis and the transform give each error its code where they
    raise it, instead of looking it up by its message. Only acorn's and
    acorn-typescript's own messages are still looked up.
  - The `TSRX_*_ERROR` message exports are the messages of the matching entries.

  `@tsrx/solid`, `@tsrx/vue` and `@tsrx/hono` pass their own errors' codes where
  they raise them, and `@tsrx/prettier-plugin` finds a modifier before `export` by
  its position instead of its message.

- [#959](https://github.com/tsrx-org/tsrx/pull/959)
  [`42d62c7`](https://github.com/tsrx-org/tsrx/commit/42d62c703d55fb73c49637ad6ee1e79ffe64e5d9)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Export the error tables as
  `@tsrx/core/diagnostics`: `DIAGNOSTIC_CODES`, `TS_ERRORS` and `TSRX_ERRORS`, the
  same objects the package root exports, without loading the compiler. Tooling and
  tests that only need an error's code or message can import them from there.

- [#954](https://github.com/tsrx-org/tsrx/pull/954)
  [`b52c55f`](https://github.com/tsrx-org/tsrx/commit/b52c55f38126ecc76b61dd47c4e8a5aee6c0687e)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Report the other
  redeclarations with the code TypeScript reports for them
  ([#952](https://github.com/tsrx-org/tsrx/issues/952)):

  - A `var` in a block below one that declares its name with `let`, `const`, or
    `using` (`{ let a; var a; }`) is TS2481
    `Cannot initialize outer scoped variable 'a' in the same scope as block scoped declaration 'a'.`
  - A `let`, `const`, or `using` declaration of a `catch` clause's parameter in
    its block (`catch (e) { let e; }`) is TS2492
    `Cannot redeclare identifier 'e' in catch clause.`
  - An enum and another declaration of its name but an enum (`enum E {} let E;`)
    is TS2567
    `Enum declarations can only merge with namespace or other enum declarations.`
  - A function declaration that isn't exported comes first in its list, as in
    TypeScript, so `let a; let a; function a() {}` is TS2300, not TS2451.

  These were TS2300 before.

- [#953](https://github.com/tsrx-org/tsrx/pull/953)
  [`454de56`](https://github.com/tsrx-org/tsrx/commit/454de565b60207d4daa8f649e02f3d34deea5ac6)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Report two mistakes with the
  code TypeScript reports for them
  ([#948](https://github.com/tsrx-org/tsrx/issues/948)):

  - A `let`, `const`, or `using` declaration's name declared again in the same
    scope, by another variable or a class (`let a; let a;`, `let a; var a;`), is
    TS2451 `Cannot redeclare block-scoped variable 'a'.` instead of TS2300. A
    redeclaration where a `var`, a class, a function, or a parameter comes first
    stays TS2300, as in TypeScript.
  - A private name outside any class (`this.#x`, `#x in obj`) is TS18016
    `Private identifiers are not allowed outside class bodies.` instead of TS1111.
    A strict parse of `#x in obj` there throws it instead of `Unexpected token`.

- [#945](https://github.com/tsrx-org/tsrx/pull/945)
  [`1fe134b`](https://github.com/tsrx-org/tsrx/commit/1fe134b6316c0fd39688b012ebaaee125a9d2676)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Read the default of a rest
  element or rest parameter, as TypeScript's parser does, and keep it in the tree
  ([#770](https://github.com/tsrx-org/tsrx/issues/770),
  [#726](https://github.com/tsrx-org/tsrx/issues/726)):

  - `const [...a = 1] = b`, `const { ...a = 1 } = b` and `[...a = 1] = b` failed
    to parse in every mode. When collecting, TypeScript's TS1186
    `A rest element cannot have an initializer.` is now recorded at the `=`, and a
    compile throws it.
  - A rest parameter's default (`function f(...a: number[] = []) {}`, TS1048) was
    left out of the tree, so the formatter and the editor's virtual code dropped
    it. It's now kept.
  - In both cases the rest element's argument is an `AssignmentPattern` (for a
    rest parameter, with its `?` and type annotation on the target, as for a
    parameter with a default), so the formatter prints the default as written.

  A property after an object binding pattern's rest element
  (`const { ...a, b } = c`) threw in every mode. When collecting, it's now
  recorded at the comma, as for an array binding pattern, and the formatter
  formats it as Prettier does
  ([#771](https://github.com/tsrx-org/tsrx/issues/771)).

- [#711](https://github.com/tsrx-org/tsrx/pull/711)
  [`1555269`](https://github.com/tsrx-org/tsrx/commit/1555269944da6e0bdbc7623afea8339d8b737af4)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Text compiles to output that
  renders what it says and that each target's JSX compiler builds:

  - A `>` in template text compiles to `&gt;`, as a `<` compiles to `&lt;`. The
    bare `>` in the output failed to build with esbuild, oxc, and TypeScript, and
    vue-jsx-vapor gave no output.
  - In an element in a `{…}` container, a `>` is text, as outside one. The text
    before it is no longer dropped when it follows a tag (`{c && <b>a > b</b>}`
    compiled to `<b>> b</b>`), and after a child container it no longer reports
    `Unexpected token`.
  - Text prints from its `raw`, the text as written, as JSX printers do, in the
    compiled output. Text in an element in a spread attribute's argument, or in an
    unbraced attribute value in a container, has its character references decoded
    in `value`, and printing `value` compiled
    `&[#123](https://github.com/tsrx-org/tsrx/issues/123);x&[#125](https://github.com/tsrx-org/tsrx/issues/125);`
    to the expression `{x}` and `&amp;lt;` to `&lt;`, which render something else.
  - The `raw` of template text leaves out the comments between children, as its
    `value` does.

- [#891](https://github.com/tsrx-org/tsrx/pull/891)
  [`83c64d3`](https://github.com/tsrx-org/tsrx/commit/83c64d3073e532afdc13c60e25862e316e3e6248)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Accept a trailing comma in a
  decorator's arguments (`@dec(a,)`, `@dec<T>(a,)`), before a class, a class
  member or a parameter, as TypeScript does. A formatted decorator whose arguments
  break (Prettier ends them with a comma) now parses again
  ([#773](https://github.com/tsrx-org/tsrx/issues/773)).

- [#925](https://github.com/tsrx-org/tsrx/pull/925)
  [`3aa3b30`](https://github.com/tsrx-org/tsrx/commit/3aa3b30e7eda90482bd933cf6484d6beed60f742)
  Thanks [@leonidaz](https://github.com/leonidaz)! - End an element that is the
  body of an `if`, `else`, loop or label at its `;`, as an expression statement
  ends. `if (x) <div />; else <b />;` and `do <i />; while (x);` now parse as in
  TSX; before, the `;` ended the whole statement, so the `else` or `while` after
  it failed to parse ([#924](https://github.com/tsrx-org/tsrx/issues/924)).

- [#893](https://github.com/tsrx-org/tsrx/pull/893)
  [`fec1d81`](https://github.com/tsrx-org/tsrx/commit/fec1d8133898c043ebf71717f5b666c6357b99b6)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Keep the comments inside an
  empty block, function or class body, interface, namespace, type literal or array
  when a comment comes right before it (`class A /* e */ { // c }`). The parser
  now attaches the inner comments to their container instead of letting the
  preceding comment take them
  ([#741](https://github.com/tsrx-org/tsrx/issues/741)).

- [#892](https://github.com/tsrx-org/tsrx/pull/892)
  [`c3a3200`](https://github.com/tsrx-org/tsrx/commit/c3a320061861625161f58380d26f2eb61c110fcc)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Parse a type assertion
  without parentheses in a `for await` head (`for await (a as T of x)`,
  `for await (a satisfies T of x)`), as TypeScript does. Prettier prints
  `for await ((a as T) of x)` that way, so the formatted code parses again
  ([#769](https://github.com/tsrx-org/tsrx/issues/769)).

- [#908](https://github.com/tsrx-org/tsrx/pull/908)
  [`87df3f4`](https://github.com/tsrx-org/tsrx/commit/87df3f4dac6064b33fbce4f0d7994fd2f31269c6)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Read `index` and `key`
  clauses only in an `@for` head. A regular `for…of` with them
  (`for (const item of items; index i)`) now fails with TypeScript's
  `')' expected.` (TS1005) at the `;`, as TypeScript reports it; before, it parsed
  and the compiled code and the formatters dropped the clause
  ([#896](https://github.com/tsrx-org/tsrx/issues/896)).

- [#555](https://github.com/tsrx-org/tsrx/pull/555)
  [`41be7e8`](https://github.com/tsrx-org/tsrx/commit/41be7e80e576b548448ee836b0e14d9747e63512)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser reads the import
  attributes of an import type, which failed with `Unexpected token`:
  `import("./data.json", { with: { type: "json" } })`,
  `import("pkg", { with: { "resolution-mode": "require" } }).Name`, and the same
  after `typeof`. They go on the `TSImportType` node's `options`, the name
  typescript-estree and acorn's `ImportExpression` use, and an import type without
  them has `options: null`. As in TypeScript, the attributes are an object
  literal, and neither argument takes a trailing comma. The compiled and type-only
  TypeScript keep the attributes, and the editor maps them back to the source.

- [#777](https://github.com/tsrx-org/tsrx/pull/777)
  [`fcc3dc8`](https://github.com/tsrx-org/tsrx/commit/fcc3dc8151d9da9ae7813854de6876aa69c655f6)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Arrow function parameters,
  rest parameters, and `for` heads parse as TypeScript parses them in four more
  cases:

  - A type assertion in the head of a `for…in` or `for…of` loop
    (`for ((a as T) of x)`, `for ([a!] of x)`) parses, and the tree keeps it, as
    it does for an assignment target. It used to fail with
    `Unexpected type cast in parameter position.` in every mode.
  - An async arrow function's rest parameter covers its `?` and its type
    annotation (`async (...a: number[]) => a`), as other rest parameters do, so
    the formatter keeps a comment before the annotation where it is.
  - A rest parameter's default (`function f(...a = []) {}`, `(...a = []) => a`,
    `type F = (...a = []) => void`) is recorded in `collect` and `loose` mode (the
    language server, the formatter, and other editor tooling) as TypeScript's
    `A rest parameter cannot have an initializer.`, and the tree leaves the
    default out, as typescript-estree does. A compile throws that message. It used
    to fail with `Unexpected token` in every mode.
  - A parameter after an arrow function's rest parameter (`(...a, b) => 1`) is
    recorded in `collect` and `loose` mode, as it is for other functions, and the
    arrow function keeps all its parameters. A compile still throws.

  Code that used to parse is now a syntax error, as in TypeScript: a `?` or a type
  annotation after an item of a parenthesized expression, of a call's or `new`'s
  arguments, of an array literal, or of a decorator's arguments, where no `=>`
  follows (`(x: number)`, `f(x?)`, `f(...x: number[])`, `[x: number]`). It fails
  with `Did not expect a type annotation here.` or `Unexpected token` there. The
  compile used to crash with `Not implemented: TSTypeCastExpression`, or print the
  mistake back.

- [#728](https://github.com/tsrx-org/tsrx/pull/728)
  [`d9e9110`](https://github.com/tsrx-org/tsrx/commit/d9e911015458d677a342f70699e4ce45406b785b)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Arrow functions and
  signatures parse as TypeScript parses them in five more cases:

  - An async arrow function's optional rest parameter
    (`async (...a?: number[]) => a`) parses. `collect` and `loose` mode (the
    language server, the formatter, and other editor tooling) record TypeScript's
    `A rest parameter cannot be optional.` at the `?`, and a compile throws it, as
    for other functions. It used to fail with `Unexpected token` in every mode.
  - A syntax error in a generic arrow function (`<T,>(x: T) => { x = ; }`) is
    reported where it is, instead of as `Unexpected token` at the type parameters,
    once the arrow function is read past its `=>`. So are the errors the parser
    reports on its parameters, such as an optional rest or binding pattern
    parameter, async ones included.
  - A parameter's default in a function or constructor type, or in a method, call,
    or construct signature (`type F = (a = 1) => void`), is recorded in `collect`
    and `loose` mode as TypeScript's
    `A parameter initializer is only allowed in a function or constructor implementation.`,
    and the tree keeps it. A compile throws that message, instead of the parser's
    own.

  Two kinds of code that used to compile are now syntax errors, as in TypeScript:

  - A call after `async (…)` followed by `=>` (`async(a)(b) => 1`), which compiled
    to `async (b) => 1`, fails at the `=>`.
  - A type assertion in an arrow function's parameters (`(x as number) => x`,
    `(x!) => x`, `async ([a satisfies number]) => a`), which the output kept,
    fails with `Unexpected type cast in parameter position.` at the assertion. A
    type assertion in an assignment target (`(x as number) = 1`) still parses.

- [#650](https://github.com/tsrx-org/tsrx/pull/650)
  [`1091170`](https://github.com/tsrx-org/tsrx/commit/10911705ab6ab4203c42f4bf329f00b16334fc00)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser reads type
  arguments after a superclass and after class and function expressions as
  TypeScript does, and no longer crashes or drops code after `export` or in array
  patterns:

  - A superclass's type arguments stay on the class (`superTypeParameters`) when a
    line break follows them (`class D extends Base<T>` with the `{` or
    `implements` on the next line), instead of making the superclass an
    instantiation expression. The class then has the AST it has on one line, and
    compiled code prints `extends Base<T>` instead of `extends (Base<T>)`.
  - A superclass's type arguments can start on the line after the superclass
    (`class A extends B` with `<T> {}` on the next line), which the formatter
    prints for a comment before them.
  - Type arguments right after a class or function expression parse as an
    instantiation expression, call, `new`, or tagged template:
    `class<T> {}<string>`, `function <T>() {}<string>()`. On the next line, a `<`
    still starts an element, and an element still takes no type arguments.
  - `export` followed by `abstract`, `type`, `namespace` or `module` and a line
    break (`export abstract` with `class A {}` on the next line),
    `export abstract;`, and `export @if (…) { … }` or another at-sign construct
    report `Unexpected token` instead of crashing with a TypeError.
  - A decorator on an element of an array pattern (`const [@dec x] = y;`) is a
    syntax error at the `@`, as in TypeScript and in an object pattern. It used to
    be accepted and dropped from the output.
  - An object method's type parameters can be `const` (`{ m<const T>(x: T) {} }`).

- [#590](https://github.com/tsrx-org/tsrx/pull/590)
  [`4005d38`](https://github.com/tsrx-org/tsrx/commit/4005d382dba64b7b2e570b3b135a1687139d7aba)
  Thanks [@leonidaz](https://github.com/leonidaz)! - A missing `}` is now reported
  as TypeScript reports it, `'}' expected.`, instead of `Unexpected token`, for
  JavaScript and template blocks alike: function and statement blocks, class
  bodies, object literals and patterns, `switch` bodies, namespaces, enums,
  interfaces, type literals, import and export lists, and `@{ … }`, `@if`, `@for`,
  `@switch`, and `@try` bodies, at the end of the input; and after the expression
  of a template literal's `${ … }` or an expression container (`{value}`,
  `{...spread}`), at whatever token is found in its place. The position doesn't
  change. Every other syntax error keeps its message, and the error is thrown in
  every parse mode, as before.

  An `@if`, `@else`, `@for`, `@empty`, `@try`, `@pending`, or `@catch` body that
  is still open at the end of the input, with nothing around it
  (`const v = @if (ok) {` and then the end of the file), used to be accepted as if
  it were closed: it compiled, and the formatter printed a `}` that was never
  written. It now reports `'}' expected.` too, and an open `@try` body reports it
  instead of a missing `@catch`.

- [#618](https://github.com/tsrx-org/tsrx/pull/618)
  [`2c964db`](https://github.com/tsrx-org/tsrx/commit/2c964dbe23fe1bdae42e9f9c6329dc3bf1ec03b8)
  Thanks [@leonidaz](https://github.com/leonidaz)! - More mistakes that
  TypeScript's parser accepts and reports only from its checker are recorded in
  `collect` and `loose` mode (the language server, the formatter, and other editor
  tooling), which keep parsing, while a compile still throws them:

  - An `import` or `export` inside a block, such as a function body or a `@{ … }`
    body, or the next top-level `export` when a function is missing its `}`. A
    collecting parse now goes on to report the missing `}`.
  - A `const` or `var` with nothing after it, and a bare `let`, as while a
    declaration is being typed. The declaration has no declarators, and
    `Variable declaration list cannot be empty.` is recorded right after the
    keyword, where TypeScript reports it.
  - A modifier where TypeScript doesn't allow one: on an interface or type literal
    member (`interface I { private x: number }`), on a type parameter
    (`interface I<public T> {}`), or `in` and `out` outside the type parameters of
    a class, interface, or type alias (`function f<in T>() {}`). The error used to
    show the source of a JavaScript function instead of a message, at the token
    after the modifier, in every mode. It now reads
    `'private' modifier cannot appear on a type member.`, at the modifier.

  An optional binding pattern parameter in a signature without a body, such as an
  overload (`function f({ a }?: T): void;`) or an abstract method, is valid
  TypeScript and now parses in every mode. It's still an error in a function with
  a body.

- [#647](https://github.com/tsrx-org/tsrx/pull/647)
  [`8eeec66`](https://github.com/tsrx-org/tsrx/commit/8eeec666600f8fc431f78c0040103a1c1314ce09)
  Thanks [@leonidaz](https://github.com/leonidaz)! - More mistakes that
  TypeScript's parser accepts and reports only from its checker are recorded in
  `collect` and `loose` mode (the language server, the formatter, and other editor
  tooling), which keep parsing, while a compile still throws them:

  - A repeated accessibility modifier (`public protected x`).
  - Decorators before a declaration other than a class, such as
    `@dec function f() {}`, `@dec const x = 1;`, `export @dec function f() {}`,
    `export default @dec function f() {}`, or `@dec export function f() {}`, and
    decorators on a constructor. Decorators before a statement that isn't a
    declaration (`@dec x;`) still throw in every mode, as TypeScript's parser
    rejects them.
  - A modifier on a rest parameter (`constructor(public ...rest: T[])`).

  A repeated modifier is now reported at the modifier instead of at the token
  after it, in every mode. An optional rest parameter (`...rest?: T[]`) is
  reported as `A rest parameter cannot be optional.`, at the `?`, instead of as an
  optional binding pattern. A `?` after an element of an array pattern
  (`const [a?] = b;`) is a syntax error in every mode, as in TypeScript; it used
  to parse, or report the optional binding pattern error.

- [#666](https://github.com/tsrx-org/tsrx/pull/666)
  [`c8ec9cc`](https://github.com/tsrx-org/tsrx/commit/c8ec9cc0bfa3c1986ac23f6e3bd67cddf971848b)
  Thanks [@leonidaz](https://github.com/leonidaz)! - More mistakes that
  TypeScript's parser accepts and reports only from its checker are recorded in
  `collect` and `loose` mode (the language server, the formatter, and other editor
  tooling), which keep parsing, while a compile still throws them:

  - A parameter property with a binding pattern
    (`constructor(public [a]: number[])`).
  - A parameter property modifier on a function's parameter
    (`function f(public x: number) {}`), at the first modifier.
  - A `for` head's declaration with no name (`for (var; ;)`,
    `for (const of items)`, also in `@for`), as for a statement.
  - `let` as a binding name or an assignment target (`var let`, `class let {}`),
    reported once for each `let`.

  Decorators on a member of an object literal (`{ @dec m() {} }`) are a syntax
  error in every mode, as in TypeScript. They used to parse, and the output left
  them out.

- [#558](https://github.com/tsrx-org/tsrx/pull/558)
  [`c9469b3`](https://github.com/tsrx-org/tsrx/commit/c9469b3bfe1ab5fd1f8ed615fe84ba094ac8ffac)
  Thanks [@leonidaz](https://github.com/leonidaz)! - In `collect` and `loose` mode
  (the language server, the formatter, and other editor tooling), the parser now
  records mistakes that TypeScript's own parser accepts and reports only from its
  checker, and keeps parsing, instead of throwing. It already did this for a
  redeclared variable. Now it also does it for a redeclared type alias, `abstract`
  members in a class that isn't abstract, initializers in ambient contexts,
  modifiers out of order, repeated, or used together where they can't be,
  accessibility or `abstract` modifiers on private names, an optional binding
  pattern parameter, a comma or another parameter after a rest parameter, a
  repeated import attribute, `export` of an undefined name, optional-chaining
  assignment targets, `import.source(…)`, `new.target` outside a function, `super`
  outside a method or a derived class's constructor, `await` in a namespace,
  `#x in obj` outside a class, and a `const` without an initializer. Each is
  recorded in `errors` with its message, and the file gets an AST as TypeScript
  would read it. A compile, which doesn't collect, still throws for all of them.

- [#614](https://github.com/tsrx-org/tsrx/pull/614)
  [`d746930`](https://github.com/tsrx-org/tsrx/commit/d7469303cbc6ca6c4679251a0ee30eda04f744c8)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser reads
  default-exported classes and decorators the way TypeScript does. Each change
  works around a bug in `@sveltejs/acorn-typescript` until a release fixes it:

  - An anonymous default-exported class can start with `implements` or be
    `abstract` (`export default class implements I {}`,
    `export default abstract class<T> extends B {}`) instead of failing with
    `The keyword 'implements' is reserved` or `Unexpected token`. A class
    expression that starts with `implements` now has `id: null`, like any other
    anonymous class.
  - A decorated default-exported class (`export default @dec class B {}`) is a
    class declaration instead of a class expression: its name is a module binding,
    and the class ends the statement, as without the decorator. With `abstract`
    (`export default @dec abstract class {}`) it parses instead of failing with
    `Unexpected token`.
  - Decorators written before `export` must be followed by an exported class, as
    TypeScript requires. Before anything else (`@dec export function f() {}`,
    `@dec export const A = class {}`, `@dec export default (class {})`) they used
    to be dropped or moved onto a class expression inside; they are now an error,
    `Leading decorators must be attached to a class declaration.`, as they already
    were before a statement that isn't a class.
  - A rest parameter can have decorators (`m(@dec ...rest: T[]) {}`), like any
    other parameter, instead of failing with `Unexpected token`.

- [#695](https://github.com/tsrx-org/tsrx/pull/695)
  [`e3a627a`](https://github.com/tsrx-org/tsrx/commit/e3a627ae47a5b7440959e174eeb78c07778f6148)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Three element shapes that
  crashed, ran out of memory, or failed to parse now parse or report a syntax
  error:

  - An element as an attribute value without braces
    (`<div attr=<b>/* c */</b> />`) no longer runs out of memory when its text
    holds a block comment or starts with a line comment. The comment is text
    there, as in TSX, and as a line comment on its own line already was. A text
    read there that reads nothing now reports `Unexpected token` instead of
    repeating.
  - A closing tag where an expression starts (`x = </>;`, `export default </>;`)
    reports `Unexpected token` at its `<`, where TypeScript expects an expression,
    instead of failing with `RangeError: Invalid array length`. This works around
    a bug in `@sveltejs/acorn-typescript` until a release fixes it. A closing tag
    in parentheses, in an argument, or where a statement starts is now reported at
    its `<` too, instead of at its `/`.
  - In a template, a `/` in an opening tag reads as code, as it does in an element
    that is a value. A self-closing tag with a space or line break before its `>`
    (`<div / >`) is self-closing instead of reporting a mismatched closing tag,
    and a division, regular expression, or private name in a spread attribute's
    argument (`<div {...(b / 2)} />`, `<div {...this.#p} />`) no longer fails with
    `Unexpected token`.

- [#696](https://github.com/tsrx-org/tsrx/pull/696)
  [`c4fa258`](https://github.com/tsrx-org/tsrx/commit/c4fa258840b04b226f9f527d22b8b5401bdb13af)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser reads the words
  after `export` as TypeScript does:

  - `abstract` or `declare` followed by a line break is no modifier.
    `export default abstract` with `class A {}` on the next line exports the value
    of `abstract` and declares the class `A` on its own; it used to parse as one
    abstract class, the default export. `export declare` with a declaration on the
    next line, and decorators before `abstract` or `declare` and a line break
    (`@dec abstract` with `class A {}` on the next line), are syntax errors. The
    decorators used to go to the class, and `declare` made it ambient.
  - `abstract`, `type`, `namespace` or `module` after `export`, before a
    declaration it doesn't start, is an error instead of being left out of the
    output. `export abstract function f() {}` used to compile to
    `export function f() {}`. `abstract` before a function, variable, or import
    declaration is an error that TypeScript reports from its checker, so it's
    recorded in `collect` and `loose` mode, and a compile throws it. The others,
    such as `export type const x = 1;`, are syntax errors.
  - The syntax errors are TypeScript's, at its positions. Where what follows
    `export` starts no declaration, including `export abstract` before a line
    break, that's `Declaration or statement expected.` at `export`, instead of
    `Unexpected token` at the word after it.

- [#615](https://github.com/tsrx-org/tsrx/pull/615)
  [`b98651c`](https://github.com/tsrx-org/tsrx/commit/b98651c0173b3cacc9d53650a6625e08afedb48f)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Template text follows JSX's
  whitespace rules after closing tags, around comments, and for non-breaking
  spaces:

  - The text after a closing tag starts at the tag, as it does after a
    self-closing tag. A space there is no longer lost when the closed element's
    body ends in a line break (`<span>` … `</span> 2` rendered `12` instead of
    `1 2`). The text keeps its leading whitespace, which JSX trims as layout when
    it has a line break.
  - A comment between children adds nothing to the text around it: the whitespace
    on its two sides is one run, which is layout when it has a line break. A block
    comment on the line after a closing tag (`<b>t</b>` then `/* c */ <i />`) no
    longer makes the space after it render, as it didn't after a self-closing tag.
  - JSX whitespace is space, tab, and line breaks. Text that is a non-breaking
    space next to a line break is text, and is no longer dropped. The target's JSX
    compiler decides whether it renders at the edge of a line, as it does for TSX.

- [#721](https://github.com/tsrx-org/tsrx/pull/721)
  [`d16852a`](https://github.com/tsrx-org/tsrx/commit/d16852a725f7ed3114ba52a9f78b7fec163c4169)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser reads more
  TypeScript keyword forms as TypeScript does:

  - `abstract declare class A {}` is an abstract ambient class, as
    `declare abstract class A {}` is; it failed to parse. `abstract` before any
    other declaration (`abstract function f() {}`, `abstract interface I {}`,
    `export abstract let x = 1;`, `declare abstract type T = 1;`) is an error that
    TypeScript reports from its checker, so it's recorded in `collect` and `loose`
    mode, and a compile throws it. It used to fail in every mode, or, before an
    interface, compile without an error.
  - `export default interface` with the interface's name on the next line is the
    default-exported interface; it failed to parse.
  - `type as = 1;` and `type satisfies = 1;` are type aliases; they failed to
    parse. `type as number;` is now an error (a type alias missing its `=`), as in
    TypeScript, instead of an `as` expression, and so is `export type as = 1;`
    (`'{' expected.`), which used to compile as a type alias.
  - `export global {}` and `export declare global {}` are global augmentations
    that TypeScript reports from its checker
    (`'export' modifier cannot be applied to ambient modules and module augmentations since they are always visible.`),
    recorded when collecting and thrown by a compile. They failed to parse.
  - A TypeScript keyword written with a Unicode escape where TypeScript reads the
    keyword (`\u0061bstract class A {}`, `export d\u0065clare class A {}`,
    `\u0074ype T = 1;`, `let x: \u0073tring;`, `class A { \u0073tatic x = 1; }`,
    `x \u0061s T`, `class A { \u0063onstructor() {} }`) is TypeScript's syntax
    error `Keywords cannot contain escape characters.` at the word. Several used
    to compile as the keyword written out. Where TypeScript reads the word as a
    name (`let \u0061bstract = 1;`, `declare \u0067lobal {}`), it stays one.

- [#788](https://github.com/tsrx-org/tsrx/pull/788)
  [`5508243`](https://github.com/tsrx-org/tsrx/commit/5508243824b9984184dd936684a76e67d669d931)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser reads more
  TypeScript keyword forms as TypeScript does:

  - A TypeScript word in parentheses at the start of a statement is an expression,
    so `(abstract) class A {}`, `(declare) class A {}` and `(type) T = 1;` are
    syntax errors, as in TypeScript. A compile read the word as the keyword.
  - `type T = intrinsic;` is the `intrinsic` keyword, and `type T = interface;` a
    reference to a type named `interface`; the two were swapped. `intrinsic`
    written with an escape is an error, and so is anything after the keyword but
    `;` (`type T = intrinsic[];`), as in TypeScript.
  - The options of an import type are `{ with: … }` or `{ assert: … }` around the
    import attributes, as TypeScript requires. Any other object literal
    (`import("m", { foo: {} })`) is TypeScript's syntax error now; it compiled.
  - `type` written with a Unicode escape in an import or export clause
    (`import \u0074ype { a } from "m";`, `import { \u0074ype a } from "m";`) is a
    type-only import or export, as in TypeScript; it failed to parse.
  - A class member's modifier, or a repeated or misplaced one, before a
    declaration (`public class A {}`, `readonly function f() {}`,
    `async class A {}`, `declare declare class A {}`,
    `abstract export class A {}`, `declare import x from "m";`) is an error that
    TypeScript reports from its checker, so it's recorded in `collect` and `loose`
    mode, and a compile throws it. It failed to parse in every mode. `async` in an
    ambient declaration is one of these errors, so a compile of
    `export declare async function f(): void;` throws it now.
  - `export default @dec declare class A {}` (also with `abstract`) is a
    default-exported ambient class; it failed to parse.

- [#701](https://github.com/tsrx-org/tsrx/pull/701)
  [`3ea944c`](https://github.com/tsrx-org/tsrx/commit/3ea944c41c0fb35d9118f337cfa68cee1b1424ac)
  Thanks [@leonidaz](https://github.com/leonidaz)! - More parameter mistakes that
  TypeScript's parser accepts and reports only from its checker are recorded in
  `collect` and `loose` mode (the language server, the formatter, and other editor
  tooling), which keep parsing, while a compile still throws them:

  - A parameter property modifier on the parameter of a function or constructor
    type, or of a method, call, or construct signature
    (`type F = (public x: number) => void`), at the first modifier.
  - A parameter property modifier on an arrow function's parameter
    (`(public x: number) => x`, `async (readonly x: number) => x`), where
    TypeScript reads the list as the arrow function's parameters.

  Three mistakes that used to compile are now reported, and a compile throws them,
  as TypeScript's checker reports them:

  - A parameter property whose binding pattern has a default
    (`constructor(public [a] = [1])`), as one without a default is. Its output
    didn't build.
  - An arrow function's optional rest parameter (`(...a?: number[]) => a`), as a
    function's is.
  - An arrow function's optional binding pattern parameter (`({ a }?: T) => a`),
    as a function's is.

- [#657](https://github.com/tsrx-org/tsrx/pull/657)
  [`d1785a1`](https://github.com/tsrx-org/tsrx/commit/d1785a10fda6517901795dc19e8560a09d1bb50e)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Template text in an element
  inside a setup statement of a `@{ … }` or control-flow body, or of an `@case`,
  reads as it does everywhere else, wherever the statement holds the element (a
  declaration, a `return`, an argument, an array or object, a conditional, an
  arrow, a nested function or component, or an `@if`, `@for`, `@switch`, or
  `@{ … }` value):

  - Leading spaces after an opening tag, a closing tag, and a child container are
    kept (`const a = <span><b>1</b> 2</span>;` rendered `12` instead of `1 2`),
    and a non-breaking space there no longer fails with `Unexpected character`.
  - Text right before a tag (`const a = <span>Hello<b /></span>;`) no longer fails
    with `Not enough stack space to parse input`.

  A syntax error in an element that is a value now reports that error instead of
  an internal one (`A parse effect shortened an append-only array`,
  `A parse branch shortened the token context stack below its checkpoint`). A
  tag's missing `>` (`const el = <div>x</div;`) reports `'>' expected.` at the
  token in its place, as TypeScript does, instead of `Unexpected token`.

  The token after a self-closing tag with a space before its `>` (`<div / >`) in a
  value reads as code, as after `<div />`.

- [#641](https://github.com/tsrx-org/tsrx/pull/641)
  [`4701beb`](https://github.com/tsrx-org/tsrx/commit/4701beb167f160945836bb9cc122aa6779bd682d)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Template text in an element
  inside a `{…}` container or a `switch` case reads as it does everywhere else:

  - In an element inside a `{…}` container, a child container or an attribute
    value, the text after a closing tag keeps its leading space
    (`{x && <div><b>1</b> 2</div>}` rendered `12` instead of `1 2`), and a
    non-breaking space there no longer fails with `Unexpected character`. The same
    holds in an element in a control-flow body inside a container, after a closing
    tag or a child container.
  - In an element in an `@switch` case, or in a `switch` case of a function
    (`case 1: return <div> 1<b /></div>;`), text is no longer read as code: its
    leading spaces are kept, a non-breaking space parses, and text before a tag
    (`<div>1<b /></div>`) no longer overflows the stack.

  Template text that the parser can't read now fails with `Unexpected token`
  instead of `Not enough stack space to parse input`.

- [#635](https://github.com/tsrx-org/tsrx/pull/635)
  [`4b38c47`](https://github.com/tsrx-org/tsrx/commit/4b38c47d28e84437e074306c31d90324ccac4ffa)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser reads five kinds
  of code by the token's context, as TypeScript's TSX parser does:

  - A comment between a directive's keyword and what follows it parses, as it does
    after the statement's keyword: `@try /* c */ {`, `@if /* c */ (x) {`,
    `@for /* c */ await (…)`, `@switch // c` with the `(` on the next line. The
    `@` and the keyword still have to touch. In element children, such a directive
    used to be read as text and an expression container.
  - `yield` takes an argument that starts with `@`: `yield @{ <div /> }`,
    `yield @if (ok) { <b /> }`, and a decorated class (`yield @dec class {}`). A
    line break after `yield` still ends it.
  - A regular expression that starts with `>` (`/>/g`) no longer breaks the code
    after it; `/>` still ends an open tag.
  - `</` right after an operand starts a closing tag, as in TSX, instead of a
    less-than and a regular expression. A missing `}` before a closing tag
    (`<p>{count</p>`) now reports `'}' expected.` at the `</` instead of
    `Unterminated regular expression` after the tag. `a < /re/` with a space is
    still a comparison; `a </re/` is now a syntax error, as in TSX.
  - An element or fragment isn't a left-hand-side expression, and neither is a
    `@{ … }` value or a directive used as a value. A `(`, `[`, or template literal
    on the line after one starts a new statement instead of calling, indexing, or
    tagging it, and a call, member access, index, non-null assertion, or tagged
    template right after one (`<b />.foo`) is a syntax error. In parentheses
    (`(<b />).foo`, `(@{ … })(x)`) they work as before. Operators after one,
    including on the next line, are unchanged.

- [#551](https://github.com/tsrx-org/tsrx/pull/551)
  [`4a5d385`](https://github.com/tsrx-org/tsrx/commit/4a5d3859e47e6a9ad82cb8a7343f52b56bf23218)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser reads four
  TypeScript forms the way TypeScript does. Each works around a bug in
  `@sveltejs/acorn-typescript` until a release fixes it:

  - `static` followed by a line break is a modifier. `static` with `count = 0` or
    `create() {}` on the next line used to become an instance field named `static`
    and an instance member, so the compiled class lost its static members.
    `static` still names a member when the next line can't continue it (`static`
    then `()`, `=`, `;`, or `}`), a second `static` is still a name, and the other
    modifiers (`readonly`, `public`, …) still need the next token on their own
    line. In an interface, `static` before a line break is now an error, like
    `static` with the member on its line.
  - An interface whose first member is a generic call signature
    (`interface I { <T>(x: T): T }`) parses instead of failing with
    `Unexpected token`.
  - A class can be named after a TypeScript contextual keyword (`class global {}`,
    `class abstract {}`, `class type {}`, …), as a declaration or an expression,
    instead of failing with `Unexpected token`.
  - `assert` on the line after an `import` or `export … from` without a semicolon
    starts the next statement (`assert(ok)`) instead of import assertions.
    `assert { … }` after a line break is now an error, as in TypeScript.

- [#602](https://github.com/tsrx-org/tsrx/pull/602)
  [`b3f3b03`](https://github.com/tsrx-org/tsrx/commit/b3f3b0384ac7ac94dcc4c6efb6b1c455433cd1bc)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser accepts four kinds
  of valid code that it rejected:

  - `var` in a `catch` block can redeclare a catch parameter that is a plain name
    (`catch (error) { var error = 2; }`), as Annex B allows, instead of failing
    with `Identifier 'error' has already been declared`. A destructured parameter
    still can't be redeclared, as in JavaScript.
  - An `export { … }` or `export type { … }` list can name a namespace, an
    interface, a type alias, or an ambient function declared in the module
    (`interface Props {} export type { Props };`), instead of failing with
    `Export 'Props' is not defined`.
  - Import attributes can have more than one quoted key
    (`with { 'a': 'x', 'b': 'y' }`) instead of failing with
    `Duplicated key in attributes`, and a key written once quoted and once as a
    name (`type` and `'type'`) is now reported as a duplicate.
  - `import()` takes a trailing comma after the module specifier or after the
    options (`import("./a.js",)`), like `import.defer()`. As in acorn and
    typescript-estree, the options of an ordinary `import()` are now on the
    `ImportExpression`'s `options` instead of `arguments`, and a third argument is
    a syntax error instead of a sequence expression.

- [#687](https://github.com/tsrx-org/tsrx/pull/687)
  [`1dd7288`](https://github.com/tsrx-org/tsrx/commit/1dd728863fa9f945c972e94b85925e62854ede52)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Attach comments after
  assignments and property keys to the appropriate AST nodes:

  - Comments around a type alias's `=` lead the type. An end-of-line comment after
    `=` before an object, array, or template value leads that value.
  - An end-of-line comment after `=` before another value trails the left side.
    Comments after a class field's `=` attach to its key.
  - An end-of-line comment inside an object property leads the property.
  - An end-of-line comment after an import attribute's key trails the key, and
    comments after a `for` header clause trail that clause.

- [#768](https://github.com/tsrx-org/tsrx/pull/768)
  [`a5beb97`](https://github.com/tsrx-org/tsrx/commit/a5beb9773e9169d546a1a10623806ea2ec811404)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Correct comment attachment
  after parenthesized arrow-function bodies:

  - A comment after the final body of a chain of immediately called arrows leads
    the first call argument. Its `ownLine` metadata records the required line
    break. Without an argument, the comment stays on the arrow body.
  - A comment after a parenthesized arrow body can trail the enclosing arrow when
    the arrow is a member object or an operand. In a `new` call it leads the first
    argument, or trails the callee when there is no argument.
  - A line comment that belongs to the body stays attached to the body.

- [#585](https://github.com/tsrx-org/tsrx/pull/585)
  [`944a943`](https://github.com/tsrx-org/tsrx/commit/944a943394c9fea12ea72a4e871726c172613136)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser gives a comment
  inside a JSDoc cast's parentheses to the cast value, not to the statement's `;`
  or the class body after them, and a JSDoc cast after a comma to the element it
  casts when its parentheses break, instead of the element before the comma, which
  dropped the cast.

- [#524](https://github.com/tsrx-org/tsrx/pull/524)
  [`9338fdd`](https://github.com/tsrx-org/tsrx/commit/9338fdd35760c4743cf1a79373c8dd2e27849e3b)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser gives a comment
  before the `)` of a function called right away or used as a tag to the function
  instead of the call's arguments.

- [#629](https://github.com/tsrx-org/tsrx/pull/629)
  [`2933f42`](https://github.com/tsrx-org/tsrx/commit/2933f427c289a958d108208262716d828d7dbd67)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Correct the parser's
  attachment of comments in parenthesized expressions and type-parameter defaults:

  - A comment at the end of a parenthesized sequence or assignment trails its last
    expression or right operand when used as an arrow body, initializer, return
    argument, or assignment value.
  - Comments after a parenthesized expression statement, throw argument, or
    chained assignment trail the enclosing statement.
  - Line comments around a type parameter's `=` trail its constraint, while a
    `prettier-ignore` belonging to its default stays on that default.

- [#518](https://github.com/tsrx-org/tsrx/pull/518)
  [`d02b7e6`](https://github.com/tsrx-org/tsrx/commit/d02b7e6119462890b27f4506d9c5d8eb5258e650)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Attach an own-line comment
  after the expression inside a template literal's `${...}` to the expression
  instead of the next text segment. In a template literal type, an own-line
  comment before a type leads that type.

- [#576](https://github.com/tsrx-org/tsrx/pull/576)
  [`a7327be`](https://github.com/tsrx-org/tsrx/commit/a7327be124f3a5f8870acd28b46b67aac9d9691d)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser now gives a
  comment after a spread's argument to the argument, like Prettier, instead of the
  next attribute or the closing tag.

- [#549](https://github.com/tsrx-org/tsrx/pull/549)
  [`d1f89bd`](https://github.com/tsrx-org/tsrx/commit/d1f89bdd27e60ed41b103e546b7b8c280f24fff8)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser now gives a
  comment in text to the text (`innerComments`), even on the line of the child or
  opening tag before it, but a `prettier-ignore` after the text's last word still
  leads the next child. A comment between a closing fragment's `</` and `>`
  dangles on the closing fragment.

- [#595](https://github.com/tsrx-org/tsrx/pull/595)
  [`e82305f`](https://github.com/tsrx-org/tsrx/commit/e82305f84078a5f21f902a30b5cd65e8cb7f633f)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Attach a comment after the
  expression in a JSX expression container to that expression as a trailing
  comment. It no longer attaches outside the braces or to the next attribute.

- [#686](https://github.com/tsrx-org/tsrx/pull/686)
  [`94b9f91`](https://github.com/tsrx-org/tsrx/commit/94b9f91a6279cd3ff03f9c9bf54fe39cf64835e0)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Inside an element in an
  expression container or attribute value, attach a comment before a child to that
  child, as in a template. A trailing comment with no following child attaches to
  the closing element, rather than to the element's body metadata.

- [#568](https://github.com/tsrx-org/tsrx/pull/568)
  [`883a8b6`](https://github.com/tsrx-org/tsrx/commit/883a8b622c5e830433244155e13029038fae26a7)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Keep comments around
  class-member and parameter decorators on the correct AST nodes:

  - Comments between a decorator and a member's modifiers trail the decorator.
    Comments between the modifiers and the member name lead the key.
  - Comments after a parameter decorator trail that decorator, including on a
    parameter property, rather than leading the whole parameter.
  - Comments inside decorator arguments stay on their arguments.
  - Comments between a parameter property's modifiers and its name lead the
    parameter inside the property.

- [#571](https://github.com/tsrx-org/tsrx/pull/571)
  [`935dfe4`](https://github.com/tsrx-org/tsrx/commit/935dfe4242a07abf54d994afe3e87b9582c3ac2a)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Keep comments around a type
  parameter's name and modifiers attached to the type parameter, and attach
  comments before its constraint to that constraint. A comment after a
  parenthesized arrow-function body now trails its statement instead of the body.

- [#688](https://github.com/tsrx-org/tsrx/pull/688)
  [`927aa91`](https://github.com/tsrx-org/tsrx/commit/927aa91ae42f06dca2a1a8809bc4149600eb60c9)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Correct comment attachment
  inside parentheses at the end of expressions:

  - Comments after the last operand of a binary or logical statement value trail
    the statement. In a return argument they trail the argument.
  - Comments belonging to a JSDoc cast or JSX element stay with that expression.
  - A comment before the closing parenthesis of an operand's last operand trails
    the enclosing left operand of the next operator.
  - A line comment following block comments at the end of a parenthesized sequence
    trails the statement; the block comments stay on the sequence's last item.
  - A comment after a parenthesized body of an immediately called arrow can trail
    the arrow itself, while a comment belonging to a conditional body stays there.

- [#690](https://github.com/tsrx-org/tsrx/pull/690)
  [`3a33f71`](https://github.com/tsrx-org/tsrx/commit/3a33f7154fb8995e5cd5dc60847c8b07ce98eee9)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Attach comments after a bare
  `continue`, `break`, `debugger`, or `return` keyword and before its semicolon to
  the statement. They no longer attach to the next statement or the surrounding
  statement's body.

- [#871](https://github.com/tsrx-org/tsrx/pull/871)
  [`fd9481c`](https://github.com/tsrx-org/tsrx/commit/fd9481c43470daf1cb335b74772b97886f0d8646)
  Thanks [@leonidaz](https://github.com/leonidaz)! - End a shorthand attribute's
  braces (`{name}`) at its `}`: with a comment before the `}`, as in
  `{name /* c */}` or a line comment on its own line, the `JSXExpressionContainer`
  ended one character after the name, so the comment fell outside the braces and a
  formatter moved it out of them. The comment is now inside, after the name, as in
  the long form `name={name /* c */}`.

- [#759](https://github.com/tsrx-org/tsrx/pull/759)
  [`b51a77e`](https://github.com/tsrx-org/tsrx/commit/b51a77e08ebf686ca23eddcee6ae2ac26128e58a)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Correct the parser's
  attachment of comments at the end of parenthesized statement values:

  - Comments after a conditional value's alternate trail the enclosing statement
    when they do not belong to a nested conditional or JSX expression.
  - An own-line comment at the end of a parenthesized value trails its statement;
    one in a return argument stays on the argument.
  - A line comment at the end of an initializer before another declarator trails
    that declarator, while block comments remain on the last sequence item.

## 0.4.0

### Minor Changes

- [#251](https://github.com/tsrx-org/tsrx/pull/251)
  [`dcc53cb`](https://github.com/tsrx-org/tsrx/commit/dcc53cba3da00d5f9c155ae48c11cc89764b8333)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Assigned `<style>` blocks
  (`const theme = <style>…</style>`) now always keep every selector. Before, a
  block that wasn't exported, applied, or read as `theme.$class` was treated as a
  class map, and its element and descendant rules were emitted only as
  `/* (unused) … */` comments, with no diagnostic. But `$class` is an ordinary
  string that JavaScript carries anywhere. A theme whose `$class` was destructured
  (`const { $class: cls } = theme`), read through an object (`themes.red.$class`),
  passed to a component, returned from a helper, or iterated lost its styles while
  its elements still carried the hash class.

  Every assigned block is now a theme: `metadata.styleKind` is always `'theme'`,
  and `prepareStylesheetForRender` prunes nothing in any mode (`'class-map'` and
  the boolean form render as `'theme'`). Target compilers that choose the render
  mode from `styleKind` (Ripple, Octane) keep every selector after upgrading
  `@tsrx/core`. An element that carries a class entry such as `styles.card` also
  carries the hash, so the block's element rules now match it too. The
  classification-only `metadata.styleExported` and `metadata.styleClassRead`
  fields are gone.

  `createScopes` now records `value as T`, `value!`, `value satisfies T`, and
  `fn<T>` as references to `value` and `fn`. It used to skip every identifier
  whose parent was a TypeScript node, so these runtime reads were missing from
  `binding.references`.

### Patch Changes

- [#262](https://github.com/tsrx-org/tsrx/pull/262)
  [`bc68cb9`](https://github.com/tsrx-org/tsrx/commit/bc68cb947f616fb83c45f35977156d9a51b6cba7)
  Thanks [@leonidaz](https://github.com/leonidaz)! - `tsrx-tsc` and the editor now
  report errors that TypeScript places on a whole call or parenthesized
  expression, such as spreading a call result that isn't iterable (TS2488,
  `[...createBase()]`), calling a value that isn't callable (TS2349,
  `createBase()()` or `(plain)()`), testing a `void` call for truthiness (TS1345,
  `if (createVoid())`), or `createBase() as const` (TS1355).

  Inside an attribute value, such as `icon={<span class="a" />}`, the editor now
  offers CSS support for style blocks, TypeScript support for `<script>` bodies,
  and CSS hovers for scoped class names, as it already did elsewhere in a
  template.

- [#302](https://github.com/tsrx-org/tsrx/pull/302)
  [`36e131a`](https://github.com/tsrx-org/tsrx/commit/36e131ab416f96647a6b2fbe8b6c2dcdc7a39f6c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Comments in class static
  blocks, namespaces, `@{ … }` code blocks, interfaces, enums, and type literals
  now attach to the statements and members they belong to, as they already did in
  a function body:

  - A block comment on the same line as the next statement now leads that
    statement. `a; /** @type {Foo} */ (x).y();` used to attach the comment to
    `a;`, so the formatter printed `a; /** @type {Foo} */` and then `x.y();`,
    dropping the JSDoc cast. In a code block, a block comment before the rendered
    element on its line now leads the element.
  - A JSDoc comment on the same line as the next interface or enum member now
    documents that member. `a: 1; /** @deprecated */ b: 2;` used to print as
    `a: 1 /** @deprecated */;`, which deprecated `a` instead of `b`.
  - A comment after the last statement of a static block or namespace, or after
    the last member of an interface or enum, stays inside it. It used to move
    after the closing `}`.
  - The comments of an empty static block, namespace, `declare global` block,
    interface, enum, or type literal stay inside it. They used to move after the
    block.

  The formatter also keeps blank lines between the statements of a static block.

- [#309](https://github.com/tsrx-org/tsrx/pull/309)
  [`ce6bd8d`](https://github.com/tsrx-org/tsrx/commit/ce6bd8dae8693096f344c5b0b9bfa9abe66cdcdf)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser no longer attaches
  comments to a `;` empty statement in a statement list, as in Prettier. The
  statement before or after it takes the comment, and when a list has only empty
  statements, its block or file does. Before, the formatter printed such a comment
  on a line of its own with a stray leading space, and the next pass moved it
  again. `a; ; // note` now formats as `a; // note`. In a `switch` case the
  comment was deleted. An empty statement that is a clause's body, as in
  `if (ready) ; // note`, keeps its comments.

  The formatter also keeps the comments of a file that has nothing else. Before,
  it printed an empty file.

- [#233](https://github.com/tsrx-org/tsrx/pull/233)
  [`baaad3d`](https://github.com/tsrx-org/tsrx/commit/baaad3db8a5ec9add8c584351c2d2040bdee6f49)
  Thanks [@leonidaz](https://github.com/leonidaz)! - A host element with a spread
  and a `ref` in a plain-JS expression position (a ternary arm, a declarator init,
  or a callback such as `items.map((item) => <li {...item} ref={cb} />)`) no
  longer throws a `ReferenceError` when it renders. Its generated spread binding
  was declared only in the type-only print, so the runtime output referenced a
  name that was never declared. The element is now wrapped in the same
  `(() => { let bag = …; return <li {...bag} … />; })()` closure on every target.

  The element's spread and ref are also lowered once instead of twice, which
  nested a second normalize call and merged ref around the first. On Solid, an
  element in a `.map()` callback inside a template no longer hoists its normalize
  call out of the callback, where the callback's parameter is not in scope. The
  same holds on every target for an element in a callback inside another element's
  spread argument, such as
  `<List {...{ items: items.map((item) => <li {...item} ref={cb} />) }} />`.

  The same elements no longer report a type error in the editor or `tsrx-tsc`.
  `normalize_spread_props_for_ref_attr` now declares the merged `ref` its result
  carries, as the new `SpreadRefProps` type, so the compiler's `bag?.ref` read
  type-checks for any props bag. Solid elements inside templates now use this
  normalizer too when they carry a `ref`, as core's lowering already did.

- [#495](https://github.com/tsrx-org/tsrx/pull/495)
  [`e927446`](https://github.com/tsrx-org/tsrx/commit/e9274468033a347f4b54b4c5b0a37e725f242da6)
  Thanks [@leonidaz](https://github.com/leonidaz)! - JSX spread children
  (`<div>{...children}</div>`) now parse, in templates and in plain TSX, instead
  of failing with `Unexpected token`, so the formatter, the ESLint parser, and the
  editor can read a file that has one. They are still not supported: every target
  now reports `tsrx-jsx-spread-child` at the spread child, "JSX spread children
  (`{...items}`) are not supported. Render the array as an expression child
  instead: `{items}`." A compile fails with it, and the editor shows it while
  keeping the spread child in its virtual TypeScript.

  The formatter prints spread children like Prettier does, with the spread
  expression's comments inside the braces.

  A spread as an attribute value (`<a b={...c} />`) or as a dynamic tag name
  (`<{...c} />`) is still a parse error, now with a message that says so.

- [#308](https://github.com/tsrx-org/tsrx/pull/308)
  [`68d5218`](https://github.com/tsrx-org/tsrx/commit/68d5218d154c3090fe5b40dec5c254db0a780efe)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser records where a
  parenthesized expression's outermost grouping parenthesis opens, as
  `metadata.paren_start`. The parentheses of a call, an `if`, or other syntax
  around the expression don't count. The formatter uses it to find the parentheses
  of each JSDoc type cast.

- [#471](https://github.com/tsrx-org/tsrx/pull/471)
  [`3b3e128`](https://github.com/tsrx-org/tsrx/commit/3b3e12800e419cadd5e59a9738d724d14e0bd5ee)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser reads two more
  TypeScript shapes the way TypeScript does:

  - An operator after an element or fragment that starts a statement continues the
    expression, with the element as its left operand (`<div /> > 5;`,
    `<div /> ? a : "b";`, `<div /> + 1;`). Operators that can't start a statement
    used to fail with `Unexpected token`, and `+` and `-` split off into a
    separate statement. On the next line, as a `@{ … }` code block's render node,
    and inside templates, an element still ends where it closes.
  - Type parameters that start on the line after the name of a class, interface,
    type alias, function, or method (`class G // comment` with `<T> {}` on the
    next line) are read as type parameters. They used to fail with
    `Unexpected token`, because a `<` at the start of a line reads as the start of
    an element.

- [#500](https://github.com/tsrx-org/tsrx/pull/500)
  [`b30a4ed`](https://github.com/tsrx-org/tsrx/commit/b30a4ed8769958b86fda39d1492a35b4a229d363)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser reads two more
  element shapes the way TypeScript does:

  - An element or fragment with whitespace or a comment after its `<` (`< div>`,
    `<  >`, or `<` with a comment on the next line) now starts at the `<`, and so
    does its opening tag. It used to start inside the gap, with a negative column
    when the gap crossed a line, so its editor mappings started in the gap and the
    comment ended up before the node that contains it. Like Prettier, a comment
    before the tag name now leads the name, and one between a fragment's `<` and
    `>` dangles on the opening fragment.
  - An operator on the line after an element or fragment that starts a statement
    continues the expression, as it does on the element's own line (`<div />` with
    `> 5;` or `? a : b;` on the next line). These used to fail with
    `Unexpected token`, and `+ 1` or `- 1` on the next line split off into a
    separate statement. As in TSX, a `/` on the next line divides, so a regular
    expression that starts the next line needs a `;` after the element. `as` and
    `satisfies` still continue only on the element's line, a `<` that starts the
    next line is still the next element, and a `@{ … }` code block's render node
    and template children don't change.

  The formatter keeps a comment between `<` and the tag name, or between a
  fragment's `<` and `>`, where it is, like Prettier (`</* note */ div>`), instead
  of moving it before the element. A line comment before the tag name, or a block
  comment on a line of its own, starts on the line after the `<`, since `<//`
  would read as a closing tag.

- [#452](https://github.com/tsrx-org/tsrx/pull/452)
  [`bff5325`](https://github.com/tsrx-org/tsrx/commit/bff53256b05142b033d7e1753862e518901bc15f)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser now accepts all
  the syntax that acorn supports instead of stopping at ES2022, and acorn is
  upgraded to 8.18.0:

  - A hashbang (`#!/usr/bin/env node`) on the first line. Compiled output and the
    editor's virtual TypeScript keep it as their first line, ahead of any import
    the compiler adds, and the formatter prints it as written instead of turning
    it into `///usr/bin/env node`. The Vite dependency scan adds its imports after
    the hashbang.
  - `using` and `await using` declarations, with or without type annotations and
    in `for...of` heads (`for (using x of y)`, `for await (await using x of y)`).
    Compiled output prints them unchanged. Like acorn, the parser rejects them in
    `for...in` heads.
  - The regular expression `v` flag (`/[\p{L}--[a-z]]/v`) and modifiers
    (`/(?i:a)b/`).

  These used to fail with `Unexpected character '!'`, `Unexpected token`,
  `Invalid regular expression flag`, or `Invalid group`, also in the Turbopack
  plugin's platform flag pass over plain JavaScript and TypeScript modules.

- [#404](https://github.com/tsrx-org/tsrx/pull/404)
  [`a7246b9`](https://github.com/tsrx-org/tsrx/commit/a7246b96d409708f3dedcab75f0dc045240e29c8)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser now accepts
  statements that TypeScript accepts around elements, and the formatter's
  `semi: false` output parses again:

  - `return <div />`, `throw <div />`, `yield <div />`, and `else <div />` parse
    after a semicolon-less statement that ends with an element with children
    (`const a = <span>x</span>`). They used to fail with `Unexpected token` or
    `A parse branch shortened the token context stack below its checkpoint`.
  - After a statement without a semicolon, an element on the next line starts a
    new statement even when a block comment comes before it on that line
    (`/* render */ <div />`), which is what the formatter prints with
    `semi: false`.
  - A statement in an `@case` or `@default` body can start with a regular
    expression or a template literal, and can divide. These used to fail with
    `Unexpected token` or `Unterminated template`.
  - The declarator of `const theme = <style>…</style>` (and the declaration,
    without a semicolon) ends after `</style>` instead of inside the CSS, so the
    formatter keeps the blank lines after an assigned `<style>` block with
    `semi: false`, and mappings and lint ranges cover the whole declarator.
  - Top-level markup that holds a `<style>` or `<script>` element parses when the
    file ends with a newline, so the formatter's output for it parses again. It
    used to fail with `Unterminated JSX contents`.

- [#497](https://github.com/tsrx-org/tsrx/pull/497)
  [`24f0184`](https://github.com/tsrx-org/tsrx/commit/24f018462d33856dae1f0452e1432a8a5a535a55)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser no longer hangs
  when the input ends inside an `@case` or `@default` body of an `@switch`, as it
  does while a file is being typed in the editor. It now reports
  `Unexpected token` at the end of the input for the missing `}` in every parse
  mode, as it does for an unterminated `@if` or `@for` body. The default mode
  still reports an unclosed element in the body first. Before, every parse mode
  looped forever there (the default mode stopped only at an unclosed element),
  which could freeze the language server, the formatter, the ESLint parser, and
  the build plugins.

- [#427](https://github.com/tsrx-org/tsrx/pull/427)
  [`cb59a43`](https://github.com/tsrx-org/tsrx/commit/cb59a4378cf2403eef1b895343f92648e3112f3b)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser reads the token
  after an element, `await`, a type, and the first token of a code block statement
  the way TypeScript does, so more valid source parses and the formatter's
  `semi: false` output parses again:

  - After a semicolon-less statement that ends with an element with children
    (`const render = (item) => <><Item /></>`), an element with attributes on the
    next line starts a new statement. It used to fail with `Unexpected token`.
  - A template literal after an element with children continues it as a tagged
    template, as after a self-closing element, instead of failing with
    `Unterminated template`.
  - A `/` after an element divides at the module top level and after an element
    with children (`const half = <span /> / 2`). It used to be read as text.
  - `await <div />` awaits the element instead of failing as a comparison, so the
    formatter's output for `await (<div />)` parses again.
  - In a `@{ … }` code block or a directive body, a setup statement can divide
    after its first token (`total / count > 1`, `(a) / b`). It used to fail with
    `Unterminated regular expression`.
  - A `@{ … }` code block used as a value can be divided (`@{ <b /> } / 2`). It
    used to fail with `Unterminated regular expression`.
  - An element on the line after a semicolon-less statement that ends with a type
    (`const x = y as Foo`, `let x: Foo`, `type T = Foo`) starts a new statement,
    as it does after `const x = y`. A `<` that starts a line inside a type is
    still a type operator.

- [#370](https://github.com/tsrx-org/tsrx/pull/370)
  [`b0cb8dd`](https://github.com/tsrx-org/tsrx/commit/b0cb8ddb72bdd2804ae7aad06bb6cc2e83fd2bec)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The formatter now lays out
  statement and member lists, empty bodies, and loop headers the way Prettier
  does:

  - `for await` loops and `@for await` directives keep their `await`. It used to
    be dropped, which made the loop iterate synchronously.
  - An import is followed by a blank line only when the source has one.
  - A switch case keeps the blank lines between its statements, a comment after a
    statement or after `case x:` stays on that line, and a line comment after
    `case x:` above a lone block moves into the block. An `@case` body keeps its
    blank lines, and comments before `@case` and after its `}` are no longer
    deleted.
  - Interfaces, type literals, and enums keep one blank line between members where
    the source has one, and an interface or type literal member ends with its `;`
    before its trailing comment (`a: 1; /* note */`). With `semi: false`, an
    interface keeps the `;` that a bare `get`, `set`, or `static` property or a
    property before a call signature needs, and a multi-line type literal drops
    the others.
  - Every class member starts its own line, and a blank line between members is
    kept (it used to become a double space on one line). A class body with only
    comments keeps them; the parser now attaches them to the body.
  - An empty `for`, `while`, `do`, or `catch` (without `finally`) body prints as
    `{}`, and an empty block in a statement list prints its braces on two lines.
    Template directive bodies keep their layout.
  - The comments of an empty block, function body, interface, enum, type literal,
    or `@{ … }` code block print on consecutive lines, and a code block with only
    comments no longer starts with a blank line. A file with only comments keeps
    its blank lines.
  - A `for` header that doesn't fit puts each clause on its own line, and an empty
    test prints as `for (let i = 0; ;)`.

- [#367](https://github.com/tsrx-org/tsrx/pull/367)
  [`e404adf`](https://github.com/tsrx-org/tsrx/commit/e404adfa3bd3961092d593d01a20ea7edbe6bd72)
  Thanks [@leonidaz](https://github.com/leonidaz)! - More bracketed lists now
  break the way Prettier breaks them.

  - The parameters of class methods (including constructors, accessors, abstract
    and overload signatures, and methods in a `declare class`), interface and type
    literal method signatures, call and construct signatures, and function and
    constructor types break one per line when they don't fit, like the parameters
    of functions and arrows already did. A constructor with a parameter property
    (`private readonly a: string`) and more than one parameter always breaks, as
    in Prettier.
  - A lone simple type argument (`Promise<void>`, `useState<SomeType>`, a keyword
    type, or an object type) stays against its brackets instead of breaking onto
    its own line.
  - Array destructuring patterns and tuple types break one element per line, like
    array literals. A rest element at the end of a pattern gets no trailing comma.
  - An object stays expanded only when the source has a line break between its `{`
    and its first property, as with Prettier's default `objectWrap: "preserve"`.
    An object whose first property is on the `{` line collapses when it fits, and
    `objectWrap: "collapse"` is now supported. The same rule applies to type
    literals, mapped types, and import attributes. An object pattern that
    destructures a nested pattern breaks, except in a parameter list, and a
    destructuring pattern with renamed or defaulted properties breaks before the
    value on its right does. A union type now breaks only when one of its members
    must, not because a member spanned lines in the source.
  - Object patterns, type literals, mapped types, and import attributes follow
    `bracketSpacing`.
  - Mapped types break like Prettier's, keep `+readonly` and `+?`, and keep a
    comment written after their `{`, which used to be deleted.
  - A comment inside an empty array or object stays inside its brackets: a block
    comment stays inline (`[/* none */]`), a line comment breaks the literal. The
    parser now keeps these comments as inner comments of the empty literal.
  - Import attributes keep the `assert` keyword and an empty `with {}`, break like
    an object when they don't fit, and never break a lone `type` attribute.
  - An element written on one line whose children mix text and expressions now
    takes its final layout on the first pass. It used to break only the attributes
    first, then move the children onto their own lines on the next pass.

- [#466](https://github.com/tsrx-org/tsrx/pull/466)
  [`3e09ec2`](https://github.com/tsrx-org/tsrx/commit/3e09ec26a6783ddc8d3b19bdf38bed7c27249a08)
  Thanks [@leonidaz](https://github.com/leonidaz)! - More comments stay where they
  were written, the way Prettier places them.

  - Without a `;`, a comment after a statement whose value ends in parentheses,
    like `const x = a | (b >> 6) // note`, trails the statement. It no longer
    breaks the value over several lines on the first pass and joins it again on
    the next.
  - A comment in the type arguments of a call or a tagged template, in the type
    parameters or parameters of a generic arrow function, or before the test of a
    `case` stays there. It no longer moves to the call's first argument, the arrow
    function's return type, or the case's body. Comments in a template `@try`'s
    `@pending` block, and between it and `@catch`, are no longer dropped.
  - A line comment after the `{` of an import's named specifiers, as in
    `import d, { // note`, stays there on the next pass instead of moving to its
    own line.
  - A comment before `implements` in a class with nothing before the clause, like
    a class expression with no name, stays before the keyword, or after it when
    the class implements one type.

- [#486](https://github.com/tsrx-org/tsrx/pull/486)
  [`c491400`](https://github.com/tsrx-org/tsrx/commit/c49140047c104cb0e46a3e6736e3fb275753548f)
  Thanks [@leonidaz](https://github.com/leonidaz)! - More comments stay where they
  were written, the way Prettier places them.

  - A comment between the blocks of a `try` statement or a template `@try`, like
    `} // note` before `catch`, `finally`, `@pending`, or `@catch`, moves into the
    next block as its first line. It was deleted, or moved on each pass. A line
    comment after a `catch` parameter keeps the parameter on its own line, and a
    comment between `try` and its block stays there.
  - A comment after the last parameter, before a trailing comma or another comment
    (`function f(a, b /* note */,) {}`), is no longer deleted.
  - A comment at the end of a line after the `?` or `:` of a conditional
    expression or type stays before the operator, after the test or the first
    branch, instead of moving onto the next branch.
  - A comment before the `:` of a type annotation or return type
    (`let x /* note */ : T`) stays before the `:`. In a typed object pattern it no
    longer moves inside the braces.
  - A comment between an exported class's decorators and `class`, as in
    `@dec export /* note */ class A {}`, prints after the decorators, before
    `export`, instead of between `class` and the name.

- [#437](https://github.com/tsrx-org/tsrx/pull/437)
  [`d734bfa`](https://github.com/tsrx-org/tsrx/commit/d734bfa8178bda5708b171a32917913b5f56f023)
  Thanks [@leonidaz](https://github.com/leonidaz)! - More comments now stay where
  they were written, the way Prettier's comment handlers place them.

  - A comment at the end of a line that ends with a binary or logical operator
    stays after the operator (`a || // note`) instead of moving to its own line.
  - A comment inside parentheses after their last operand, on a line after it,
    stays inside the parentheses: in a unary operand like `!( … )`, or before the
    `)` of an `if` or `while` condition. It no longer moves out of them, for a
    condition between its `)` and the body's `{`, which took two passes to settle.
  - A comment on its own line before the `.name` of a member lookup prints before
    the `.`, and the member chain breaks one call per line, instead of printing
    after the `.`.
  - A comment between union members prints before the next `|`, and a block
    comment right before a union prints after the first `|` when the union breaks.
  - A comment between a class or interface heading and its `{` moves into the
    body, and a comment before `extends` or `implements` stays before the keyword
    and breaks the heading. A comment in the heading of a decorated class follows
    the last decorator.

- [#391](https://github.com/tsrx-org/tsrx/pull/391)
  [`b932928`](https://github.com/tsrx-org/tsrx/commit/b93292872bfa355a4a1adec58de1be5c8890d9e5)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Comments stay where they were
  written, and print the way Prettier prints them.

  - A comment in the condition of an `if`, `else if`, `while`, `do…while`,
    `switch`, `@if`, or `@switch` stays inside the parentheses, so a JSDoc cast
    keeps its meaning and `@if` formats the same on every pass. A comment after
    the `)` of an unbraced `if` or loop body stays in the body.
  - A body without braces moves to its own indented line when the statement
    doesn't fit or a comment starts it, and a comment around an empty body's `;`
    stays on its side of it. A comment before `else` stays before it.
  - Comments are no longer deleted after the name of a function, class, enum, enum
    member, interface, or type alias, in empty parameter or argument parentheses,
    between a function's parameters and its body, or before an arrow's `=>`. A
    comment in a function body no longer moves into the parameter list.
  - A comment after a stray `;` in a class body, in a JSX attribute, after a JSX
    tag name, or after a tag's last attribute stays there, and a comment in an
    attribute no longer sends the comments of the children to the closing tag.
  - Block comments that share a line stay on it, every comment after a statement
    on its line stays there, and a comment between a statement and its `;` prints
    after the `;`. A switch with no cases keeps its comments inside its braces.
  - A multi-line block comment whose lines start with `*` takes the indentation of
    where it prints; any other block comment prints as written.
  - `yield` keeps the parentheses around an argument that starts with a comment
    ending its line, so the formatter no longer changes the yielded value.

- [#491](https://github.com/tsrx-org/tsrx/pull/491)
  [`b4ea5ca`](https://github.com/tsrx-org/tsrx/commit/b4ea5ca80ca4d258d808840c514e4afd898bab71)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The formatter now lays out
  conditional type chains, parentheses around `prettier-ignore` nodes, and
  comments in type lists like Prettier:

  - A chain of nested conditional types breaks as one group, like a chain of
    ternaries: when the outer conditional breaks, every conditional in its
    branches breaks too, and a conditional used as the check or extends type
    breaks inside its parentheses.
  - A node kept by `prettier-ignore` prints in the parentheses it needs where it
    is, not the ones it was written with: `foo(/* prettier-ignore */ (a  +  b))`
    prints as `foo(/* prettier-ignore */ a  +  b)`, while `(a,  b)` as an argument
    keeps them.
  - An own-line `prettier-ignore` comment before a union written in parentheses
    keeps only the union's first member as written, as it does for a union without
    parentheses.
  - A comment after a comma in type arguments, type parameters, or a tuple type
    stays after the comma: `Foo<A, /* note */ B>` no longer prints as
    `Foo<A /* note */, B>`.

- [#438](https://github.com/tsrx-org/tsrx/pull/438)
  [`0c33754`](https://github.com/tsrx-org/tsrx/commit/0c33754e4e32d92302c11fb6a45f056f67f8e0d4)
  Thanks [@leonidaz](https://github.com/leonidaz)! - `prettier-ignore` comments
  and multi-line template literals now format like Prettier.

  - Any `prettier-ignore` comment attached to a node keeps it as written: one that
    trails a statement or member on its line (`foo(  a ); // prettier-ignore`),
    one followed by another comment (`// prettier-ignore` then
    `/* #__PURE__ */ bar(  1 )`), and one inside an empty body.
  - An ignored statement's `;` follows the `semi` option like Prettier's, a
    comment before that `;` no longer prints twice, an ignored node over several
    lines no longer breaks the list around it, and an exported class keeps the
    decorators written before `export`.
  - Like Prettier, a `prettier-ignore` comment on its own line between union
    members keeps the member after it as written and stays before its `|`. The
    parser marks that member (`metadata.prettierIgnore`) and the comment
    (`unignore`), so the member before the comment is still formatted.
  - A template literal over several lines breaks the call arguments, array,
    object, or condition around it, one item per line. A lone template argument
    that starts on the call's line stays there, except in a member chain.

- [#345](https://github.com/tsrx-org/tsrx/pull/345)
  [`dbe1851`](https://github.com/tsrx-org/tsrx/commit/dbe18512a4e41a2535dd605ebcea1a5188c8ee5e)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Import and export specifier
  lists now format the way Prettier formats them. An export list that doesn't fit
  breaks one specifier per line with a trailing comma, like an import list, and
  follows `bracketSpacing`. A single named import stays on the line
  (`import { a } from "…"` no longer breaks into three lines when the module path
  is long). An alias that repeats the name (`a as a`) is kept.

  An import with empty braces keeps them: `import {} from "mod"` used to print as
  `import "mod"`, and `import type {} from "mod"` as `import type "mod"`, which
  isn't valid TypeScript.

  Comments inside imports and exports are no longer deleted. A comment on a
  specifier, an alias, a default or namespace import, a namespace re-export, the
  module source, or an import attribute stays where it was written, and a line
  comment in a specifier list keeps the list broken. The parser now attaches a
  comment after the last specifier, before `}` or `from`, to that specifier, so
  the formatter prints it inside the braces.

  A block comment between a list element and the comma after it now stays with
  that element in arrays, call and `new` arguments, objects, parameters, object
  patterns, enums, and specifier lists, as in Prettier. `[a /* c */, b]` used to
  format as `[a, /* c */ b]`, which moved the comment onto the next element, and a
  list written across lines changed again on the second pass. A comment after the
  comma still leads the next element.

- [#239](https://github.com/tsrx-org/tsrx/pull/239)
  [`62ef14a`](https://github.com/tsrx-org/tsrx/commit/62ef14a7cbf2a2984849889f52e59d17babd4d2d)
  Thanks [@leonidaz](https://github.com/leonidaz)! - `tsrx-tsc` and the editor now
  report errors on a bare `this` or `super`, such as
  `function readValue() { return this; }` failing with TS2683 under `strict`, or
  `this` before `super()` in a derived constructor failing with TS17009.
  TypeScript reports these errors on the keyword itself, but the source-mapping
  walker never mapped `this` or `super`, so Volar dropped them unless the keyword
  sat inside a larger mapped expression such as `this.value`. Hover and
  go-to-definition on the keywords now work too.

- [#260](https://github.com/tsrx-org/tsrx/pull/260)
  [`3d9fd90`](https://github.com/tsrx-org/tsrx/commit/3d9fd90d3e052eba3a468101e7497db21fc2e3e7)
  Thanks [@leonidaz](https://github.com/leonidaz)! - A generator function that
  returns JSX can now `yield` inside an element that compiles to a closure: a host
  element with a spread and a `ref` in a ternary arm or other expression position,
  an `@switch` case, or an `@if` branch with setup statements. The closure was an
  arrow function, so the `yield` ended up outside the generator, and builds failed
  with "A 'yield' expression is only allowed in a generator body". The compiler
  now turns that closure into a generator and delegates to it with `yield*`, so
  the yielded values and the resumed value still belong to the enclosing
  generator, and `this` and `arguments` still refer to its own. A `yield` in an
  `@for` body is now reported at the `yield` itself, because the loop body runs as
  a callback that cannot yield from the enclosing generator. A `super` inside such
  a closure is reported too, since a generator function expression cannot
  reference it.
- Updated dependencies
  [[`baaad3d`](https://github.com/tsrx-org/tsrx/commit/baaad3db8a5ec9add8c584351c2d2040bdee6f49)]:
  - @tsrx/runtime@0.2.4

## 0.3.3

### Patch Changes

- [#226](https://github.com/tsrx-org/tsrx/pull/226)
  [`ca86115`](https://github.com/tsrx-org/tsrx/commit/ca86115f91e9aec052bff27809b7439fd6fa7dbd)
  Thanks [@leonidaz](https://github.com/leonidaz)! - `createScopes` now scopes a
  `module` declaration as a namespace when it is inside a `declare` block or is an
  inner part of a dotted name, as TypeScript does. Before,
  `declare module A.B { … }` and `declare namespace A { module B { … } }` gave `B`
  a `module` binding and a submodule scope, and two `module B` blocks in one
  `declare namespace` failed with `'B' has already been declared`. The new
  `isSubmoduleDeclaration(node, path)` export applies the same rule for compilers
  that check submodules themselves. `TSModuleDeclaration.body` is now typed as
  optional and as `TSModuleBlock | TSModuleDeclaration`, matching what the parser
  produces for `declare module 'x';` and dotted names.

- [#222](https://github.com/tsrx-org/tsrx/pull/222)
  [`06a9c5c`](https://github.com/tsrx-org/tsrx/commit/06a9c5c699961c7ac1def5196229cc65704f358d)
  Thanks [@leonidaz](https://github.com/leonidaz)! - `tsrx-tsc` and the editor now
  report errors on a class whose base is a call, a parenthesized expression, or an
  array literal, such as `class Model extends createBase() {}` failing with TS2507
  when `createBase()` returns a plain object. TypeScript reports these errors on
  the whole superclass expression, but no mapping reached the end of those
  expressions, so Volar dropped them and the class failed only when the module
  ran.

## 0.3.2

### Patch Changes

- [#217](https://github.com/tsrx-org/tsrx/pull/217)
  [`c426225`](https://github.com/tsrx-org/tsrx/commit/c42622548a877bc5a1d2741c96534447679f2ae5)
  Thanks [@leonidaz](https://github.com/leonidaz)! - `tsrx-tsc` and the editor now
  report missing-return errors on functions and methods with a primitive return
  type, such as `value(): number {}` failing with TS2355. TypeScript reports these
  errors on the return type, but the source-mapping walker never mapped primitive
  type keywords (`number`, `string`, `this`, and the rest), so Volar dropped them.
  A method in a file with no `function` or `async` keyword also no longer gets a
  stray mapping that treated its opening `(` as a `function` keyword.

## 0.3.1

### Patch Changes

- [#213](https://github.com/tsrx-org/tsrx/pull/213)
  [`b12105e`](https://github.com/tsrx-org/tsrx/commit/b12105e60a077559e55f59940cb25c0dd73eda8a)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Classes, methods, and
  properties now always carry a `decorators` array, empty when undecorated, as
  ESTree's decorators extension requires. The parser set it only when a decorator
  was present, and the types declared it optional, so another declaration of the
  extension on the shared `estree` interfaces failed to merge with core's in the
  same program (TS2687, TS2717, TS2430). The types now declare
  `decorators: Decorator[]` on methods, properties, and classes.

## 0.3.0

### Minor Changes

- [#198](https://github.com/tsrx-org/tsrx/pull/198)
  [`fb52feb`](https://github.com/tsrx-org/tsrx/commit/fb52febb0661dd111e15d55b918236125ab65385)
  Thanks [@leonidaz](https://github.com/leonidaz)! - `@import` in a `<style>`
  block is now the `tsrx-css-import` compile error
  (`DIAGNOSTIC_CODES.CSS_IMPORT`). The compiler scopes only the rules written in
  the block and passed `@import` through, so the bundler inlined the imported
  rules unscoped and they applied to the whole page. Share scoped styles through
  an assigned block (`const theme = <style>…</style>`) and `apply={theme}`. For
  global CSS, use `:global` in the block, or import the stylesheet in JavaScript:
  `import './global.css'`.

### Patch Changes

- [#212](https://github.com/tsrx-org/tsrx/pull/212)
  [`3d6fa8c`](https://github.com/tsrx-org/tsrx/commit/3d6fa8cadecf5c550231101a899960e53796483f)
  Thanks [@leonidaz](https://github.com/leonidaz)! - An async component can now
  `await` inside `@for`, `@empty`, `@switch`, and `@if` bodies on React, Preact,
  and the Hono server target. These bodies compile to callbacks and IIFEs that
  were not async, so the output was invalid: builds failed with "`await` is only
  allowed within async functions" and editors reported TS1308. The compiler now
  makes those generated functions async and awaits them in the component. A loop
  body with an `await` compiles to the new `map_iterable_async` runtime helper,
  which finishes one item before it starts the next, like a `for...of` loop in an
  async function. An `await` in a `@catch` body is now reported at the `await`
  itself, because the target calls that fallback during rendering and cannot wait
  for its result.

- [#188](https://github.com/tsrx-org/tsrx/pull/188)
  [`5272aec`](https://github.com/tsrx-org/tsrx/commit/5272aece1c9f0cf2b07cc0f80607b2e8a470b433)
  Thanks [@leonidaz](https://github.com/leonidaz)! - A scoped class selector for a
  class that contains a no-break space (U+00A0) or another non-ASCII space is no
  longer marked unused. Class attributes are now split into tokens on ASCII
  whitespace only, as HTML does, so `class="a&nbsp;b"` is the one class that
  `.a\a0 b` matches, not the two classes `a` and `b`. The `[attr~=value]`
  attribute selector uses the same splitting. Editor hover and go-to-definition
  for such a class now link to its selector.

- [#143](https://github.com/tsrx-org/tsrx/pull/143)
  [`f1a21f6`](https://github.com/tsrx-org/tsrx/commit/f1a21f65557a19d5069f8985dee887ca079e5c4e)
  Thanks [@trueadm](https://github.com/trueadm)! - Map TypeScript constructor
  parameter properties (`private readonly x: T`) and bodyless class methods
  (overload signatures, `abstract` and optional methods) in the source-mapping
  walker, which previously threw `Unhandled AST node type in mapping walker` and
  dropped the file to raw text. Also keep the `override` modifier on parameter
  properties in printed output.

- [#192](https://github.com/tsrx-org/tsrx/pull/192)
  [`61fc4d6`](https://github.com/tsrx-org/tsrx/commit/61fc4d69cc3807ca9ca423a128c0e7854d1bb36b)
  Thanks [@leonidaz](https://github.com/leonidaz)! - `tsrx-tsc` and the editor now
  report errors in class type positions, such as `value!: MissingType` failing
  with `Cannot find name 'MissingType'`. The source-mapping walker skipped class
  field type annotations, class and method type parameters, `extends Base<T>` type
  arguments, `implements` clauses, and class and member decorators. Volar drops
  any diagnostic it cannot map back to the source, so these files type-checked
  clean.

- [#173](https://github.com/tsrx-org/tsrx/pull/173)
  [`ae4131c`](https://github.com/tsrx-org/tsrx/commit/ae4131c5054e77b4bb1c9ac020c1c827de6ddc5c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - A `<style>` selector with a
  CSS hexadecimal escape now compiles and scopes correctly. The whitespace that
  ends a hex escape is part of the escape, so `.\31 23` is the class `123` rather
  than a descendant selector, and an assigned block exposes it as `theme['123']`.
  Hex escapes also decode to their code points when matching elements and naming
  theme entries, so `.\31` matches `class="1"` and appears as `theme['1']` instead
  of `theme['31']`.

  Attribute selectors decode the same way. An unquoted value such as
  `[data-x=\31 23]` no longer fails with `Expected ]`, and attribute names and
  values are unescaped before they are matched against elements. Quoted values
  also keep their leading and trailing whitespace. Before this change, rules like
  `[data-x="\31 23"]`, `[\64 ata-x=y]` and `[title=" a "]` were marked unused even
  when a sibling element matched.

- [#180](https://github.com/tsrx-org/tsrx/pull/180)
  [`bbfe88e`](https://github.com/tsrx-org/tsrx/commit/bbfe88e058bc6eefc9c9f08acf1df61e20d44170)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Keep dotted namespace names
  (`namespace A.B { … }`, `declare namespace A.B.C`) when formatting and compiling
  TSRX files. Prettier printed the keyword again for each name part
  (`namespace A namespace B { … }`), which no longer parses, and the compilers
  emitted `namespace Anamespace B`. Shorthand ambient modules
  (`declare module 'name';`) also keep their semicolon when formatted and no
  longer crash the compilers.

- [#195](https://github.com/tsrx-org/tsrx/pull/195)
  [`9e25e90`](https://github.com/tsrx-org/tsrx/commit/9e25e90a34724b1b89b7a7735dee737d91bfd0c9)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Keep `export` on TypeScript
  import-equals aliases (`export import Alias = Foo;`,
  `export import fs = require('fs');`) when compiling TSRX files. The compilers
  printed a plain `import Alias = Foo`, so the module silently stopped exporting
  the alias. Editor output now also maps the whole exported statement back to its
  source.

- [#177](https://github.com/tsrx-org/tsrx/pull/177)
  [`3bbc283`](https://github.com/tsrx-org/tsrx/commit/3bbc283debdd6e34d598e127259dff27ee154998)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Apply a `@for` key to the
  rows a loop renders through `@if` or `@switch`. The key clause (`key item.id`)
  and the implicit index key were only placed on a body that returned an element
  or a fragment, so a conditional body lost its key: reordering the list moved row
  state to the wrong item on React, Preact, and Hono, and React warned about
  missing keys. The key now lands on the element or fragment each branch renders,
  and a key written on a branch element still wins. A static branch element in a
  keyed loop now stays inline, since it carries a per-row key, instead of being
  hoisted. Vue's `VaporFor` keeps keying rows through `getKey`, and its output is
  unchanged.

- [#176](https://github.com/tsrx-org/tsrx/pull/176)
  [`f8bb16d`](https://github.com/tsrx-org/tsrx/commit/f8bb16dfe59309aa4fe19e10e2412c132d29f0d9)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Recognize a generic arrow
  whose parameter list holds a `)` inside a comment or regular expression literal
  (`<T extends object>(x: T /* ) */) => x`,
  `<T extends object>(x: T, re = /[)]/) => x`). The lookahead that balances the
  parameter list only skipped strings, so the stray `)` ended the scan early and
  the `<T>` was parsed as an unclosed JSX tag. It now skips comments and regex
  literals too, telling a regex from division by the token before the `/`.

- [#166](https://github.com/tsrx-org/tsrx/pull/166)
  [`676d943`](https://github.com/tsrx-org/tsrx/commit/676d94395c6561d3f2f7febad1c42fb40b7b0221)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Read a JSX tag whose prop
  holds a generic arrow with a function-type constraint
  (`<Box fn={<T extends () => void,>(x: T) => x} />`) as JSX. The generic-arrow
  lookahead treated the `>` of `=>` as a closing angle bracket, so the outer tag
  was tokenized as a type parameter list and parsing failed with
  `Unexpected token`. The lookahead now scans an actual type parameter list
  (`<[const] Name [extends Type] [= Type], ...>`), skipping strings, comments,
  `=>`, and nested brackets, instead of counting angle brackets.

- [#211](https://github.com/tsrx-org/tsrx/pull/211)
  [`8916c70`](https://github.com/tsrx-org/tsrx/commit/8916c7091156023e716c0d75f0be4a8465c6d5c4)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Adding a `ref` to a host
  element with a spread no longer changes the order in which its attributes are
  evaluated on React, Preact, and Hono. In
  `<div data-first={next()} {...{ 'data-second': next() }} ref={cb} />` the
  compiler evaluated the spread in a declaration before the element, so
  `data-second` got `1` and `data-first` got `2`; a spread on a nested element
  also ran before its ancestors' attributes. The spread's props bag is now
  assigned where it is spread, `{...(bag = normalize(expr))}`, and the element's
  `ref` reads `bag?.ref` afterward, as before.

  Platforms opt in with the new `jsx.hostSpreadRefBinding: 'in-place'` option.
  Solid and Vue keep the declaration: their compiled JSX evaluates attributes in
  its own order, and Solid reads `ref` before the spread.

- [#159](https://github.com/tsrx-org/tsrx/pull/159)
  [`73c956c`](https://github.com/tsrx-org/tsrx/commit/73c956cf9ea739e948ca2498dcc85fdd2b5954c5)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Parse `<=`, `<<`, and `<<=`
  as whole operators when they are written without surrounding spaces (`value<=0`,
  `1<<n`) or when a later arrow made them look like the start of a generic arrow
  function. Type arguments that open with a generic function type
  (`f<<T>() => T>()`) still parse, and a `<` inside a type is never read as a JSX
  tag, so spaced construct signatures (`new <T>(x: T): T`) and optional generic
  methods (`f?<T>(x: T): T`) in interfaces, type literals and classes parse.

- [#200](https://github.com/tsrx-org/tsrx/pull/200)
  [`69b5a33`](https://github.com/tsrx-org/tsrx/commit/69b5a3359edc09ec90b16a721f2f00909f3e4f21)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Spreading an omitted or
  `null` props bag onto a host element no longer throws when the element also has
  a `ref`: `<input {...props.optional} ref={cb} />` renders `<input />`, as native
  JSX does. The compiler read the spread's ref as `spread.ref`, which threw
  `Cannot read properties of undefined (reading 'ref')` on React, Preact, Solid,
  Vue, and Hono. Vue reads that ref for every host spread, so it threw even
  without an explicit `ref`. The generated read is now `spread?.ref`.

- [#199](https://github.com/tsrx-org/tsrx/pull/199)
  [`4cf5823`](https://github.com/tsrx-org/tsrx/commit/4cf5823525daaf683b80a40037d0b7c3c2538b91)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Keep `var` bindings declared
  in an inactive platform branch. When
  `if (import.meta.env.platform.web) { var value = 'web'; }` compiled for another
  platform, the compilers dropped the whole branch, so `export { value }` failed
  with `Export 'value' is not defined` and a function reading `value` threw a
  `ReferenceError`. The branch's code is still dropped, but its `var` names are
  now declared without initializers, so they read as `undefined`, as in plain
  JavaScript with the flag replaced by `false`.

- [#207](https://github.com/tsrx-org/tsrx/pull/207)
  [`3a13af2`](https://github.com/tsrx-org/tsrx/commit/3a13af2550939c9615048e1b95f6c77ba6dca6d9)
  Thanks [@leonidaz](https://github.com/leonidaz)! - `tsrx-tsc` and the editor now
  report errors on `#private` class members, such as `#value: number = 'bad'`
  failing with `Type 'string' is not assignable to type 'number'` and an
  uninitialized `#value: number` failing with TS2564. The source-mapping walker
  never mapped private names, and TypeScript reports these errors on the `#name`
  itself, so Volar dropped them. Private names in method and accessor keys,
  `this.#name` reads, and `#name in obj` checks now map too.

- [#165](https://github.com/tsrx-org/tsrx/pull/165)
  [`c37eb95`](https://github.com/tsrx-org/tsrx/commit/c37eb95572ec79a369300f4fa69e3a71d76b2703)
  Thanks [@leonidaz](https://github.com/leonidaz)! - An assigned `<style>` block
  with a `.__proto__` class selector now exposes a `theme.__proto__` class entry
  like any other class. The generated theme object defines the key as its own
  property instead of setting the object's prototype, so `theme.__proto__` reads
  the scoped class string rather than `Object.prototype`.

- [#170](https://github.com/tsrx-org/tsrx/pull/170)
  [`3372724`](https://github.com/tsrx-org/tsrx/commit/3372724784db8b8de9ff918b3a048279a587f43d)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Each `@switch` arm
  (`@case x: { … }` or `@default: { … }`) is now its own block scope, so setup
  locals in different arms can share a name. Before, the whole switch shared one
  scope: declaring the same `const` in two arms failed with
  `Identifier has already been declared`, and a `<style apply={theme}>` in one arm
  could resolve to another arm's `theme`. React, Preact, Vue, and Hono output now
  wraps an arm's setup statements in their own block inside the generated
  `switch`.

- [#185](https://github.com/tsrx-org/tsrx/pull/185)
  [`6490e51`](https://github.com/tsrx-org/tsrx/commit/6490e519634a5697310b073495033ecbca05e457)
  Thanks [@leonidaz](https://github.com/leonidaz)! - A `.tsrx` module imported as
  a web worker (`import MyWorker from './worker.tsrx?worker'`) now starts in
  `vite dev`. Vite requested the entry as `worker.tsrx?worker_file&type=module`,
  which its dev server served as a static file, and the plugins skipped the
  query-suffixed id, so the browser received raw TSRX source and the worker failed
  to load. The Vite plugins now route that request through Vite's transform
  pipeline and compile the entry. In the Solid and Vue plugins, editing the entry
  also invalidates the cached worker module, so the next page load gets the new
  code. Production builds were not affected.

  `@tsrx/core` gains a `@tsrx/core/vite/worker` entry point with the shared
  dev-server middleware and id helper.

- Updated dependencies
  [[`3d6fa8c`](https://github.com/tsrx-org/tsrx/commit/3d6fa8cadecf5c550231101a899960e53796483f),
  [`af6475e`](https://github.com/tsrx-org/tsrx/commit/af6475e7ec2a430d9ef5675d0cd512457572fb16)]:
  - @tsrx/runtime@0.2.3

## 0.2.4

### Patch Changes

- Updated dependencies
  [[`ca84d73`](https://github.com/tsrx-org/tsrx/commit/ca84d7333621ad809593add9f8202c9a16cc6ce3)]:
  - @tsrx/runtime@0.2.2

## 0.2.3

### Patch Changes

- [#130](https://github.com/tsrx-org/tsrx/pull/130)
  [`ba0be2d`](https://github.com/tsrx-org/tsrx/commit/ba0be2dd06c7b707912a067c20e276c4428a905b)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Export `isSvgTagName` and
  `isMathmlTagName` predicates for case-sensitive tag-name membership checks.
  Target compilers can reuse the core tag-name sets for lowering decisions,
  including SVG names shared with HTML, without changing ref-type namespace
  inference.

## 0.2.2

### Patch Changes

- [#120](https://github.com/tsrx-org/tsrx/pull/120)
  [`2d053f4`](https://github.com/tsrx-org/tsrx/commit/2d053f421f09c5c4936d8866bbeb44b924411dbb)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix a regression where a
  spread attribute preceded by a comment or non-ASCII whitespace inside the braces
  (`<div {/* c */ ...props} />`) failed to parse with `Unexpected token`. The peek
  that decides how to tokenize the attribute brace only skipped ASCII whitespace,
  so the ellipsis was read as raw template text. The token after an attribute `{`
  is now always tokenized as JavaScript, which also lets shorthand attributes like
  `{/* c */ id}` parse.

## 0.2.1

### Patch Changes

- [#119](https://github.com/tsrx-org/tsrx/pull/119)
  [`33d6093`](https://github.com/tsrx-org/tsrx/commit/33d60939c720d7d0bb8ab03790486a4c033dde96)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix AST line/column locations
  for spread attributes whose `{...` spans multiple lines inside a TSRX template
  body. The `...` was first read as raw template text up to the closing brace and
  then re-tokenized, so the line breaks inside the spread were counted twice. This
  misplaced diagnostics and made source-map generation throw
  `Location line or line offsets length is out of bounds`. The spread is now
  tokenized directly.
- Updated dependencies
  [[`449338e`](https://github.com/tsrx-org/tsrx/commit/449338e4f17ff0e0d0814a1e8dcb8745c5771589)]:
  - @tsrx/runtime@0.2.1

## 0.2.0

### Minor Changes

- [#110](https://github.com/tsrx-org/tsrx/pull/110)
  [`dcc0283`](https://github.com/tsrx-org/tsrx/commit/dcc0283a7470773f8a169c8750344ad147c30c99)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Remove the unused
  `exclude_prop_from_object` language helper (also re-exported from
  `@tsrx/core/runtime/language-helpers`). Its last in-repo callers, the Solid and
  Vue `<Dynamic>` runtime wrappers, were replaced by compiler lowering; props are
  plain objects, so a `const { is, ...rest } = props` spread covers the remaining
  use.

- [#110](https://github.com/tsrx-org/tsrx/pull/110)
  [`dcc0283`](https://github.com/tsrx-org/tsrx/commit/dcc0283a7470773f8a169c8750344ad147c30c99)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Remove the `extractPaths`
  utility and the `DestructuredAssignment` type. Nothing in this repository used
  them, and the emitted `_$_.exclude_from_object` / `_$_.array_slice` calls were
  Ripple runtime names baked into the target-neutral core; the Ripple compiler is
  the only consumer and now owns that lowering.

- [#110](https://github.com/tsrx-org/tsrx/pull/110)
  [`dcc0283`](https://github.com/tsrx-org/tsrx/commit/dcc0283a7470773f8a169c8750344ad147c30c99)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Remove lazy destructuring
  (`&{ ... }` and `&[ ... ]`) from the TSRX language, per
  [RFC #106](https://github.com/tsrx-org/tsrx/discussions/106). `&` followed by
  `{` or `[` in a binding or assignment position is now a plain syntax error, as
  it is in TypeScript. The `transform/lazy.js` pass, the `lazy` flag on
  `ObjectPattern` / `ArrayPattern`, the `lazy` / `lazy_fallback` binding kinds,
  the lazy AST metadata, the `UNSUPPORTED_LAZY_ASSIGNMENT_POSITION` diagnostic,
  and the `createLazyContext`, `collectLazyBindings`,
  `collectLazyBindingsFromStatements`, `preallocateLazyIds`,
  `applyLazyTransforms`, and `validateUnsupportedLazyAssignmentPosition` exports
  are gone. Use ordinary destructuring or the target's own state API instead.

- [#113](https://github.com/tsrx-org/tsrx/pull/113)
  [`79c1359`](https://github.com/tsrx-org/tsrx/commit/79c1359650d7e74914e818bbf179b6a41d06370c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Remove the `array_slice` and
  `iterable_array_from` language helpers (also re-exported from
  `@tsrx/core/runtime/language-helpers`) and the `buildFallback` AST utility. They
  only backed lazy destructuring and the `extractPaths` lowering, both removed;
  their last consumer, the Ripple compiler, now lowers rest and default patterns
  with native destructuring.

### Patch Changes

- Updated dependencies
  [[`6ac7e34`](https://github.com/tsrx-org/tsrx/commit/6ac7e3422a71f19f7defb5dd7df3e8df5d089bfe),
  [`734023b`](https://github.com/tsrx-org/tsrx/commit/734023bbee936d50c67c85396014ad2373f5c550),
  [`dcc0283`](https://github.com/tsrx-org/tsrx/commit/dcc0283a7470773f8a169c8750344ad147c30c99),
  [`79c1359`](https://github.com/tsrx-org/tsrx/commit/79c1359650d7e74914e818bbf179b6a41d06370c),
  [`c2bdb3d`](https://github.com/tsrx-org/tsrx/commit/c2bdb3dbd94f9db0a0a075bc53072da343d73091)]:
  - @tsrx/runtime@0.2.0

## 0.1.71

### Patch Changes

- [#98](https://github.com/tsrx-org/tsrx/pull/98)
  [`727d17f`](https://github.com/tsrx-org/tsrx/commit/727d17f1e535f68dc5e4478920f2de7ab71a3822)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Add validated web, iOS, and
  Android compile-time platform flags, early ordinary-if specialization for TSRX
  source and virtual TypeScript, automatic inherited/project-referenced tsconfig
  resolution, and matching definitions across every in-repo Vite, Rspack,
  Turbopack, and Bun integration, with conflict checks and chained source maps.

## 0.1.70

### Patch Changes

- Updated dependencies
  [[`6908ee3`](https://github.com/tsrx-org/tsrx/commit/6908ee3496562e3c989f2f360cc8a848c2e5ff50)]:
  - @tsrx/runtime@0.1.7

## 0.1.69

### Patch Changes

- [#89](https://github.com/tsrx-org/tsrx/pull/89)
  [`ebba2e4`](https://github.com/tsrx-org/tsrx/commit/ebba2e4a249860242b9a25bccd2c2607c623a288)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix shared editor diagnostics
  for React, Preact, Solid, Vue, and other consumers of the core tooling pipeline.
  Generic arrows with a constrained or defaulted type parameter no longer produce
  a false trailing-comma error. Typed destructuring defaults retain their full
  diagnostic mapping, including when a multiline default ends in an array type
  assertion, instead of crashing source mapping generation.

## 0.1.68

### Patch Changes

- Updated dependencies
  [[`4d8bc9b`](https://github.com/tsrx-org/tsrx/commit/4d8bc9b8ef0b401f4fb0b4186368fdc8895804b2),
  [`8cf6514`](https://github.com/tsrx-org/tsrx/commit/8cf6514f6fecc04e8fb5b9c37c92424f3f8e3532)]:
  - @tsrx/runtime@0.1.6

## 0.1.67

### Patch Changes

- [#73](https://github.com/tsrx-org/tsrx/pull/73)
  [`5369440`](https://github.com/tsrx-org/tsrx/commit/53694402cbc21c4195c201a4e4a70d32e212a9c2)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Keep sibling-combinator rules
  (`.a + .b`, `.a ~ .c`) whose elements sit at the top of a style scope or of a
  control-flow branch fragment. Pruning looked for siblings only under the nearest
  ancestor _element_, so items of a scope's root list — which has no element
  parent by design — and items of a branch fragment had no siblings and their
  rules were commented out as unused. `prune_css` now reads the element's actual
  children list (element or fragment), and the scope pre-pass seeds each scope's
  paths with a root fragment (`createScopeRoot`, exported for consumer compilers)
  that ancestor combinators still never match.

## 0.1.66

### Patch Changes

- [#72](https://github.com/tsrx-org/tsrx/pull/72)
  [`b11381d`](https://github.com/tsrx-org/tsrx/commit/b11381dc10e71e2dae176c6477c4a79113a5bede)
  Thanks [@leonidaz](https://github.com/leonidaz)! - `analyzeCss` now reports
  `:global` placement errors with file-relative `pos`, `end`, and `loc` anchored
  on the misplaced `:global` selector, and accepts
  `{ filename, errors, comments }` to collect them instead of throwing.
  `parseStyle` takes an optional `body` origin (the style body's file offset,
  line, and column) and records it on the sheet as `sourceStart` and a
  file-relative `loc`; CSS node `start` / `end` stay body-relative. Sheets
  produced by `parseModule` carry the origin, so direct `analyzeCss` callers can
  place editor diagnostics without going through `compile`.

- [#53](https://github.com/tsrx-org/tsrx/pull/53)
  [`8efcbc8`](https://github.com/tsrx-org/tsrx/commit/8efcbc85bc3910531715f51c9f592588c2464f4c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Scope `<style>` blocks to
  their siblings (a standalone block styles its siblings and everything below
  them): several blocks per scope share one hash instead of erroring, fragments in
  nested `@{ … }` and control-flow bodies are style scopes of their own,
  element-rooted assigned templates now emit their CSS, exported or applied
  assigned blocks keep every selector, every assigned block exposes `$class`,
  `<style apply={theme} />` stamps a theme's classes on a scope, `cssHash` is
  deduped per scope, and new `STYLE_*`/`CSS_GLOBAL_PLACEMENT` diagnostic codes
  replace the raw style throws. Amendment A1: a standalone block is a child of an
  element or fragment and that children list is its scope, so a block styles the
  items beside it and everything below them and never the element that contains it
  — a selector matching only the container is pruned; a block is an output node,
  so beside the output node of a `@{ … }` or control-flow body it is the
  multiple-outputs parser error and as the lone output there it is the new
  `STYLE_STANDALONE_NEEDS_FRAGMENT` diagnostic; raw CSS in `<style>` is TSRX
  template syntax, so a bodied standalone block outside every
  `@{ … }`/control-flow body is the new `STYLE_STANDALONE_OUTSIDE_TEMPLATE`
  diagnostic; and `<style>{css}</style>` parses as an ordinary `JSXElement` that
  no target scopes, extracts, or stamps.

- [#71](https://github.com/tsrx-org/tsrx/pull/71)
  [`8f5d3f0`](https://github.com/tsrx-org/tsrx/commit/8f5d3f0ac3ddc2454a5e3051e5b3cfd1dc797022)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Recover an unclosed `<style>`
  or `<script>` in loose (editor) mode instead of failing the whole file. Inside a
  template the body runs up to the next tag start, so partial CSS reaches the
  loose CSS parser, which no longer throws on it, and the siblings after it keep
  their token mappings. Closing-tag auto-insert now keys off the typed `>` itself,
  so it works for `<style apply={…}>` without the fatal-compile fallback.

- [#53](https://github.com/tsrx-org/tsrx/pull/53)
  [`8efcbc8`](https://github.com/tsrx-org/tsrx/commit/8efcbc85bc3910531715f51c9f592588c2464f4c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix loose-mode Volar mappings
  for recovered unclosed tags: the synthesized closing name now maps to the
  opening tag name (`span`) instead of `<spa`, and the opening `<` keeps its
  mapping.

- Updated dependencies
  [[`de31ea4`](https://github.com/tsrx-org/tsrx/commit/de31ea41a346e072de42bef3b36716077c681ea8),
  [`e3eaa41`](https://github.com/tsrx-org/tsrx/commit/e3eaa419915db5525829b3a401642c4ffcb16433),
  [`20ff7d5`](https://github.com/tsrx-org/tsrx/commit/20ff7d5ca7c03642e51280690f1e1c875bf75848),
  [`ebab7e0`](https://github.com/tsrx-org/tsrx/commit/ebab7e06fc19b3fe596d6024ea98e75bcd8376a5)]:
  - @tsrx/runtime@0.1.5

## 0.1.65

### Patch Changes

- Updated dependencies
  [[`f16c113`](https://github.com/tsrx-org/tsrx/commit/f16c1138d1ac9969afe39696ebf9b41579bb27c5)]:
  - @tsrx/runtime@0.1.4

## 0.1.64

### Patch Changes

- [#31](https://github.com/tsrx-org/tsrx/pull/31)
  [`d22e79e`](https://github.com/tsrx-org/tsrx/commit/d22e79e1142c1ce55b893c56e20451ab0401be92)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Speed up hook-helper
  binding discovery by collecting referenced bindings in one helper-body
  traversal.

- [#20](https://github.com/tsrx-org/tsrx/pull/20)
  [`c21eb24`](https://github.com/tsrx-org/tsrx/commit/c21eb242086efb49bfb39f3013d533c22cb748de)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Cache parser line-start
  offsets to make location lookups substantially faster in large TSRX modules.

- [#39](https://github.com/tsrx-org/tsrx/pull/39)
  [`09e6adf`](https://github.com/tsrx-org/tsrx/commit/09e6adfa932838c6542b2205846536dd98cbb889)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Preserve lazy loop
  bindings across type-only output, `var` source ordering, computed keys, and
  default values.

- [#37](https://github.com/tsrx-org/tsrx/pull/37)
  [`e1a610a`](https://github.com/tsrx-org/tsrx/commit/e1a610ab16aeda0b6d6d98454609273bb3edc1e8)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Lower lazy
  destructuring in JavaScript loop headers and report unsupported lazy assignment
  positions with a target-neutral diagnostic.

- [#33](https://github.com/tsrx-org/tsrx/pull/33)
  [`d23290e`](https://github.com/tsrx-org/tsrx/commit/d23290e3aba3ed52e620571e26180bb8561f0fd1)
  Thanks [@chenzylab](https://github.com/chenzylab)! - Fix `@for` misparsing its
  own body when nested directly inside an `@if` branch and containing another
  control-flow directive (`@if`, `@if`/`@else`, or a nested `@for`). `parseBlock`
  previously gated the TSRX-aware control-flow block parser on both
  `#isNativeTemplateNode(parent)` and `#templateControlFlowBlockDepth > 0`, but an
  `@if`'s own body-parsing empties the parser's internal path stack while
  tokenizing its body as code, so `#isNativeTemplateNode` saw an empty stack and
  returned `false` even though `#templateControlFlowBlockDepth` correctly signaled
  the nested `@for`'s body. The `@for`'s body then fell through to plain statement
  parsing, which wrapped the inner directive in a bare `ExpressionStatement`
  around a synthetic JSXFragment instead of producing a proper
  `JSXIfExpression`/`JSXForExpression`/etc. Printers with no `JSXFragment` visitor
  (such as esrap's `ts` language, used for Ripple's SSR-target output) then failed
  with `Not implemented: JSXFragment` when serializing that node; other
  JSX-runtime targets were unaffected since they don't route through that printer.

- Updated dependencies
  [[`544ae9a`](https://github.com/tsrx-org/tsrx/commit/544ae9a51f17a39e66cf0eceea862f8b30307047)]:
  - @tsrx/runtime@0.1.3

## 0.1.63

### Patch Changes

- [#11](https://github.com/tsrx-org/tsrx/pull/11)
  [`decbe8f`](https://github.com/tsrx-org/tsrx/commit/decbe8fe82a1403e41a6dc020840c61aae719f13)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Allow lazy binding patterns
  anywhere a destructuring pattern is valid: nested inside destructuring
  assignment targets (`[&{ name }] = pairs`) and as `for`–`of` / `for`–`in` /
  `@for` loop targets (`@for (&{ label } of items)`). Lazy patterns in plain
  expression positions now report a descriptive error instead of a generic
  unexpected-token failure.

- [#9](https://github.com/tsrx-org/tsrx/pull/9)
  [`cab7e94`](https://github.com/tsrx-org/tsrx/commit/cab7e94e000801d951b44cc1258e64d87f10e742)
  Thanks [@ryansolid](https://github.com/ryansolid)! - Support lazy object and
  array binding patterns in synchronous and asynchronous arrow function
  parameters.

## 0.1.62

### Patch Changes

- [#4](https://github.com/tsrx-org/tsrx/pull/4)
  [`6c34d7d`](https://github.com/tsrx-org/tsrx/commit/6c34d7d44dc5bc12b76f0b4687357419fa9c4190)
  Thanks [@trueadm](https://github.com/trueadm)! - Avoid failing virtual
  TypeScript generation when a computed object method's bracket positions are
  absent from the printer source map.

## 0.1.61

### Patch Changes

- [`16a87b2`](https://github.com/tsrx-org/tsrx/commit/16a87b205dc75ce20aa06a1706b603bc4ebb9bcd)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Remove deprecated
  Ripple-named compatibility aliases from the target-neutral compiler and language
  tooling. Ripple remains supported as an explicitly detected compiler target with
  target-gated runtime completions.

## 0.1.60

### Patch Changes

- [#1429](https://github.com/Ripple-TS/ripple/pull/1429)
  [`481d934`](https://github.com/Ripple-TS/ripple/commit/481d934aa17a275aa588d945b4c65b421076f89c)
  Thanks [@trueadm](https://github.com/trueadm)! - Keep multi-style components and
  host ref/spread elements analyzable in type-only virtual TSX output.

## 0.1.59

### Patch Changes

- [#1428](https://github.com/Ripple-TS/ripple/pull/1428)
  [`4fea7fc`](https://github.com/Ripple-TS/ripple/commit/4fea7fc9a1277abe47a5b5c67eeda2e253c9e6d5)
  Thanks [@trueadm](https://github.com/trueadm)! - Preserve declaration
  documentation and annotations in virtual TSX, and map complete export and
  property-signature ranges for declaration tooling.

- [#1427](https://github.com/Ripple-TS/ripple/pull/1427)
  [`2aa2b6f`](https://github.com/Ripple-TS/ripple/commit/2aa2b6f4beff43b61badd1fb7d11433e9e4f52b3)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Align iterable helper types
  with runtime and compiler support for iterators and empty fallbacks, and expose
  a shared compiler-side runtime import mode type.

- [#1398](https://github.com/Ripple-TS/ripple/pull/1398)
  [`6d3417e`](https://github.com/Ripple-TS/ripple/commit/6d3417eb3852a9f0085b273f07079a3b12323712)
  Thanks [@aleclarson](https://github.com/aleclarson)! - Split compiler-emitted
  helpers into shared and renderer-specific runtime packages, and add opt-in
  direct runtime imports across supported build integrations.
- Updated dependencies
  [[`2aa2b6f`](https://github.com/Ripple-TS/ripple/commit/2aa2b6f4beff43b61badd1fb7d11433e9e4f52b3),
  [`6d3417e`](https://github.com/Ripple-TS/ripple/commit/6d3417eb3852a9f0085b273f07079a3b12323712)]:
  - @tsrx/runtime@0.1.1

## 0.1.58

### Patch Changes

- [#1423](https://github.com/Ripple-TS/ripple/pull/1423)
  [`10c6c3d`](https://github.com/Ripple-TS/ripple/commit/10c6c3df0f5dfccf9be34c556afee1c87c678bde)
  Thanks [@trueadm](https://github.com/trueadm)! - Fix a parse error on a callback
  prop whose parameter has a no-argument function type, such as
  `<Boundary fallback={(reset: () => void) => …}>`, by upgrading
  `@sveltejs/acorn-typescript` to a version that restores parser state after
  speculative parse branches.

## 0.1.57

### Patch Changes

- [#1417](https://github.com/Ripple-TS/ripple/pull/1417)
  [`2e65731`](https://github.com/Ripple-TS/ripple/commit/2e657313feb272ef7c32510f8e2aa3de1b53ccb3)
  Thanks [@thejackshelton](https://github.com/thejackshelton)! - Treat `<` in
  markup text as a literal character when it cannot start a tag, so
  `<span><3</span>` parses instead of throwing `Unexpected token`. The JSX printer
  emits such text (and raw-text `<script>` bodies) with `<` escaped as `&lt;`, so
  the compiled output of JSX targets stays parseable by downstream toolchains

## 0.1.56

### Patch Changes

- [#1411](https://github.com/Ripple-TS/ripple/pull/1411)
  [`f03a5af`](https://github.com/Ripple-TS/ripple/commit/f03a5af4c455135767a959f6b45eb3ddb7fadd8f)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Normalize TypeScript module
  declarations to the `kind` discriminator, preserve `declare global` in type-only
  output, and erase ambient modules from Ripple client and server output.

## 0.1.55

### Patch Changes

- [#1404](https://github.com/Ripple-TS/ripple/pull/1404)
  [`9b654b2`](https://github.com/Ripple-TS/ripple/commit/9b654b29339c14e79f8377491946c1419417a002)
  Thanks [@trueadm](https://github.com/trueadm)! - fix: stop dropping TypeScript
  modifiers when formatting

  Formatting silently rewrote what the source declared. `readonly` was dropped
  from interface and type-literal members, turning `readonly id: number` into a
  mutable `id: number`; `abstract` was dropped from classes and their members (and
  abstract methods gained an empty body, making them concrete); and `declare`,
  `override`, `accessor`, accessor kinds on method signatures (`get`/`set`),
  `abstract new`, `declare global` (printed as `declare module global`), computed
  keys, class static blocks, and constructor parameter properties were dropped or
  mangled the same way.

  All of these now round-trip, and `@tsrx/core`'s AST types carry the class
  modifiers the printer needs.

- [#1406](https://github.com/Ripple-TS/ripple/pull/1406)
  [`5e4b38e`](https://github.com/Ripple-TS/ripple/commit/5e4b38ec26c8268b60e3ca4319eb37f8a07b3078)
  Thanks [@trueadm](https://github.com/trueadm)! - fix: stop dropping decorators
  when formatting

  The printer had no decorator handling at all, so formatting silently deleted
  every `@decorator` in a `.tsrx` file — on class declarations, methods, fields,
  accessors, and parameters alike. Decorators have runtime effects, so this
  changed what the code did.

  All four positions now round-trip, following prettier's line breaking: class
  decorators each take their own line, class member decorators keep the lines they
  were written with (and an inline decorator too long to share the member's line
  moves to its own), and parameter decorators stay inline. Decorators on an
  exported class print above the `export` keyword, and a parameter property's
  decorators print before its modifiers. `@tsrx/core`'s AST types now carry the
  `Decorator` node the printer needs.

- [#1409](https://github.com/Ripple-TS/ripple/pull/1409)
  [`7136920`](https://github.com/Ripple-TS/ripple/commit/7136920028537f336c9404493d8c9fde80105408)
  Thanks [@leonidaz](https://github.com/leonidaz)! - fix: terminate expression
  default exports, and print anonymous default-exported functions

  `export default <expression>` is a statement and needs a `;`, but the printer
  only emitted one for the parenthesized class and function expressions handled in
  the previous fix. Every other expression form lost its terminator:
  `export default foo;` was formatted to `export default foo`.

  That is an ASI hazard, not a cosmetic difference. The following line is pulled
  into the exported expression whenever it starts with `(`, `[`, a template
  literal, `+`, `-`, or `/`, so

  ```ts
  export default foo;
  (function () {})();
  ```

  was reformatted into the single call `export default foo(function () {})()`.

  The terminator is now decided by whether the export is a declaration or an
  expression. The declaration forms — `class`, `function`, `interface`, an
  overload signature, and the decorated `export default @dec class Named {}` that
  parses as a `ClassExpression` — still end at their closing brace.

  Separately, `export default function () {}` crashed the printer. It is the one
  position where a `FunctionDeclaration` may be anonymous, and the printer read
  the name unconditionally. Anonymous default-exported functions, async functions,
  and generators now print.

  `@tsrx/core` gains `TSRXExportDefaultDeclaration`, which models the two
  TypeScript-only declaration forms the parser puts in that slot —
  `export default interface Foo {}` and `export default function foo();` — that
  estree's `ExportDefaultDeclaration` does not.

## 0.1.54

### Patch Changes

- [#1401](https://github.com/Ripple-TS/ripple/pull/1401)
  [`d85f9f3`](https://github.com/Ripple-TS/ripple/commit/d85f9f3a8a4f8ed8f77ce54f87fa4387d586884c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix parsing for JSX-valued
  attributes whose element has an expression-container child with JSX inside (e.g.
  `slot={<button>{ok ? <X /> : <Y />}</button>}`) followed by another attribute.

## 0.1.53

### Patch Changes

- [#1399](https://github.com/Ripple-TS/ripple/pull/1399)
  [`7eaf6e8`](https://github.com/Ripple-TS/ripple/commit/7eaf6e8b21f83b73845b8bcd6bc50cc9f8886871)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix a parse error for `as`
  casts around parenthesized JSX in attribute values
  (`prop={((c) => (<Col />)) as any}`). The after-element context fixup popped a
  still-open outer `(` as if it were leaked, so the outer `)` popped the attribute
  container's brace and the `as` tokenized as a JSX name instead of starting the
  cast.

## 0.1.52

### Patch Changes

- [#1395](https://github.com/Ripple-TS/ripple/pull/1395)
  [`7ec87d9`](https://github.com/Ripple-TS/ripple/commit/7ec87d910c62e39e0dc95c80daace036cc6f041c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix parse errors for
  multi-line JSX elements with element children used as attribute values
  (`prop={<div><span>x</span></div>}`), including nested paired elements and
  sibling elements after a nested close. The tokenizer's stale-text fixups counted
  contexts against the whole stack, which is blind inside a `{ … }` container;
  they now scope the count to the container so each still-open element keeps the
  children context its own closing tag pops.

## 0.1.51

### Patch Changes

- [#1394](https://github.com/Ripple-TS/ripple/pull/1394)
  [`6404d3c`](https://github.com/Ripple-TS/ripple/commit/6404d3cc679fde2eb83ec85c9cd98b653f3f2fed)
  Thanks [@leonidaz](https://github.com/leonidaz)! - fix: make `.tsrx` imports
  visible to Vite's dependency scanner in every plugin

  Vite's dep scanner runs through Rolldown without the main plugin pipeline, so
  any npm dependency imported only from `.tsrx` files was invisible at startup and
  got discovered at request time instead, forcing a re-optimize and a full page
  reload. Only `@tsrx/vite-plugin-react` handled this; `@tsrx/vite-plugin-preact`,
  `@tsrx/vite-plugin-solid` and `@ripple-ts/vite-plugin` now do too.

  `@tsrx/core` gains a `@tsrx/core/vite/dep-scan` entry point with the two plugin
  shapes this needs: `createDepScanTransformPlugin` for plugins that transform
  `.tsrx` ids directly, and `createDepScanLoadPlugin` for plugins that rewrite
  them to a virtual `<path>.tsx` form. Both swallow compile failures, so a single
  malformed file no longer costs the whole project its dependency pre-bundling.

  Also fixes the scan's own JSX transform, which defaults to React's automatic
  runtime. It was emitting an unresolvable `react/jsx-dev-runtime` import into
  Preact, Solid and Vue projects, which failed the scan outright — the React-only
  form of this bug appeared when `jsxImportSource` was set to a non-React runtime.
  The React and Preact plugins now point that transform at the configured import
  source, and the Solid and Vue plugins leave JSX untransformed during the scan
  since their own JSX stage runs downstream.

- [#1386](https://github.com/Ripple-TS/ripple/pull/1386)
  [`6025176`](https://github.com/Ripple-TS/ripple/commit/6025176000cafa50d924add8e9a878fe37c0c22b)
  Thanks [@leonidaz](https://github.com/leonidaz)! - fix(parser): recognize
  control-flow directives inside element-valued attribute expressions

  JSX inside an attribute-value `{ … }` container now parses through the TSRX
  template path, so `prop={<h1>@if (ok) { … } @else { … }</h1>}` behaves the same
  as assigning the element to a variable first. Previously the directive was
  either kept as literal text or — when no whitespace preceded the `@` — re-parsed
  into an untransformed directive node that crashed the printer.

  Also fixes template text loss around directives: text (and significant inline
  whitespace) preceding a directive or an `=` was silently dropped in
  container-nested elements, and inline spaces between a sibling element and a
  directive were dropped inside `@switch` bodies and value-position directives
  (`const v = @if …`). Sibling whitespace now survives uniformly, matching how the
  browser renders it; newline-containing layout indentation is still removed.

- [#1389](https://github.com/Ripple-TS/ripple/pull/1389)
  [`7ad580e`](https://github.com/Ripple-TS/ripple/commit/7ad580efd24b338b4774add06afdcdd8876c954c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - chore(types): type the parser
  plugin without `any`

  Every `any` cast in the acorn plugin is gone, and the type declarations it was
  papering over now describe what the parser actually produces:
  `jsx_parseOpeningElementAt` returns `TSRXJSXOpeningElement | JSXOpeningFragment`
  instead of the plain `JSXOpeningElement` it never emits for `<>` or a dynamic
  `<{expr}>` tag, `TSRXJSXFragment` carries the loose-mode `unclosed` flag, and
  `TSRXJSXClosingElement` carries the `isDynamic` flag both halves of a dynamic
  tag get. `@sveltejs/acorn-typescript`'s `tsTryParseAndCatch` and
  `tsParseTypeArgumentsInExpression` are declared on the parser interface, and the
  in-place node retypes (statement to `JSX*Expression` directive, opening/closing
  element to fragment, the under-construction template node's discriminant and
  opening/closing slots) go through named views in the types package. Parser
  behavior is unchanged.

- [#1391](https://github.com/Ripple-TS/ripple/pull/1391)
  [`6eaa2f3`](https://github.com/Ripple-TS/ripple/commit/6eaa2f3e6cd18973d57df06eae770313dd061a1a)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Replace every `any` in
  `@tsrx/solid`, `@tsrx/vue`, `@tsrx/react` and `@tsrx/preact` with the real AST,
  compiler and framework types, and move each package's `@typedef` blocks into its
  `types/` declarations.

  `@tsrx/solid`'s transform carried the bulk of it: all 126 `any` annotations are
  gone, replaced by the parser's AST types plus a new `types/transform.d.ts`
  describing the shapes the Solid lowering passes around (`SolidRenderSource`,
  `SolidIfBranch`, `SolidLoweredList`, `SolidBranchArrow`, …).
  `is_solid_render_child` and `is_branch_arrow` are now type predicates,
  `to_jsx_child` declares that a render source always lowers to a JSX child, and
  the hand-built `JSXElement`/`JSXAttribute` object literals are built through the
  shared builders instead — so generated attributes carry the `shorthand` field
  the type requires. The two places where a statement list is still mid-lowering
  go through `lowered_block`/`lowered_switch_case`, which name that invariant
  instead of hiding it behind `any`. Three unreachable helpers
  (`get_if_consequent_body`, `negate_expression`, `TEMPLATE_FRAGMENT_ERROR`) were
  dropped.

  `@tsrx/vue`'s error boundary no longer casts the `vue` namespace to `any` at
  every call: the Vapor renderer's runtime-internal helpers are declared once in
  `types/vapor-runtime.d.ts` (`VaporRuntime`, `VaporBlock`, `VaporFragment`,
  `VaporComponentInstance`), the namespace is narrowed to that interface a single
  time, and `EffectScope` comes from `vue`'s own published export.
  `TsrxErrorBoundaryProps` describes its render callbacks as returning `unknown`
  rather than `any`, matching what the boundary actually does with them.

  The React and Preact error boundaries declare their props and state through
  `TsrxErrorBoundaryProps`/`TsrxErrorBoundaryState` instead of an `any`
  constructor parameter, Preact's `CompileOptions` typedef moved from
  `src/transform.js` to `types/index.d.ts` where the declaration already lived,
  and all four `compile` entry points return the shared `CompileResult` (a typed
  `map`) instead of an inline shape with `map: any`.

  `@tsrx/core`'s `BaseNodeMetaData` declares the two flags Solid's transform sets
  (`solid_render_control`, `is_branch_arrow`), alongside the Vue-specific flags
  already there.

- [#1390](https://github.com/Ripple-TS/ripple/pull/1390)
  [`9ffd4ba`](https://github.com/Ripple-TS/ripple/commit/9ffd4ba3e5982acb79a02efe0379abdc14c092a1)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Replace every `any` in
  `@tsrx/core` with the real AST, CSS, parser and runtime types, move all
  remaining `@typedef` blocks into the package's `types/` declarations, and
  typecheck `packages/tsrx/tests` alongside `src` and `types`.

  Public type declarations gained accuracy along the way: `TSModuleDeclaration.id`
  accepts a string literal, `TSModuleBlock.body` allows imports and exports,
  `AnalysisResult` declares its `module` field,
  `ImportDeclaration`/`ImportExpression` declare their legacy
  `assertions`/`arguments` slots, `Program` declares `tsrx_keyword_tokens`, and
  `zimmerframe`'s `walk` plus esrap's `print`/`tsx` are generic over their state
  instead of `any`. New builders (`ts_qualified_name`, `ts_import_equals`,
  `assignment_prop`) and shared helpers (`node_children`, `is_style_element`)
  replace hand-built nodes and duplicated predicates.

  The published runtime declarations keep their reach: `normalize_spread_props`,
  `normalize_spread_props_for_ref_attr` and `exclude_prop_from_object` accept any
  object — an interface- or class-typed props bag included — rather than only an
  index-signature type, and `exclude_prop_from_object` now returns `Omit<T, K>` so
  the surviving props stay readable. `create_ref_prop` and `apply_ref_value` now
  resolve their node type through a `RefTarget` overload that mirrors the
  runtime's own resolution order, so a ref to an element carrying a `value`
  property (`input`, `button`, `select`, `textarea`, `option`, `li`, `progress`,
  `meter`, `output`, `data`) resolves to the element instead of to `string`.
  Type-level tests pin the inferred types of every published ref and language
  helper, so a signature change that degrades editor completion fails a test.

## 0.1.50

### Patch Changes

- [#1384](https://github.com/Ripple-TS/ripple/pull/1384)
  [`98cc95c`](https://github.com/Ripple-TS/ripple/commit/98cc95ce2af7edcb9637ff56072bbeda5b837a30)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix a parse error when an
  attribute value contains a control-flow directive (`@if`, `@for`, `@switch`,
  `@try`) — either bare or wrapped in a fragment/element — and the attribute's
  element has children, e.g.
  `<ElementA prop={ @if (ok) { <div /> } }><ElementB /></ElementA>` or
  `<ElementA prop={<>@if (ok) { <A /> } @else { <B /> }</>}></ElementA>`.

## 0.1.49

### Patch Changes

- [#1382](https://github.com/Ripple-TS/ripple/pull/1382)
  [`979b230`](https://github.com/Ripple-TS/ripple/commit/979b2303a98cc85669c899bd3aff757f72a1e7c8)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix a parse error when a
  control-flow directive (`@if`, `@for`, `@switch`, `@try`) is used as an
  attribute value on an element that has children, e.g.
  `<ElementA prop={ @if (ok) { <div /> } }><ElementB /></ElementA>`.

## 0.1.48

### Patch Changes

- [#1380](https://github.com/Ripple-TS/ripple/pull/1380)
  [`81859da`](https://github.com/Ripple-TS/ripple/commit/81859da03464b8865304c70ea2b8b1245018af2c)
  Thanks [@trueadm](https://github.com/trueadm)! - Parse, preserve, and format
  static and dynamic deferred imports. Enable deferred-import evaluation in the
  Rspack integrations; static imports require Rspack 1.6 or newer and dynamic
  imports require Rspack 2 or newer.

## 0.1.47

### Patch Changes

- [#1379](https://github.com/Ripple-TS/ripple/pull/1379)
  [`302dc74`](https://github.com/Ripple-TS/ripple/commit/302dc74143f4143ec7136c036510d258a7866c8a)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Replace the JSX platform
  contract's `any` values with ESTree and ESTree JSX node types, and rename the
  generic AST clone helper to `clone_ast_node`. Remove the obsolete
  pre-parser-native attribute normalization API and its legacy AST types.

## 0.1.46

### Patch Changes

- [#1374](https://github.com/Ripple-TS/ripple/pull/1374)
  [`21a43da`](https://github.com/Ripple-TS/ripple/commit/21a43da09713f28c5d2ae73633e5ca56e4cd8d1f)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Add shared TSRX semantic
  analysis and report free-floating template output in normal function bodies and
  ordinary setup sections of `@{}` blocks. Runtime builds now fail when output
  would be discarded, while type-only and Volar compilation collect the diagnostic
  and continue. Return or retain template values, or make them part of a
  function's rendered output.

## 0.1.45

### Patch Changes

- [#1368](https://github.com/Ripple-TS/ripple/pull/1368)
  [`e9e122f`](https://github.com/Ripple-TS/ripple/commit/e9e122f8620c4b52671b294364a12a65091e0c98)
  Thanks [@trueadm](https://github.com/trueadm)! - Tokenize a `/` in JSX text as
  literal text when the element is nested inside a `{ … }` expression container.
  Previously `{cond && (<a>x/y</a>)}` and adjacent expression children separated
  by a slash (`{a}/{b}`) inside a nested element failed to parse with "Invalid
  regular expression flag" or "Unterminated regular expression", because the
  tokenizer left raw-text mode and read the slash as the start of a regular
  expression.

## 0.1.44

### Patch Changes

- [#1358](https://github.com/Ripple-TS/ripple/pull/1358)
  [`c66215d`](https://github.com/Ripple-TS/ripple/commit/c66215dbd13313a45bc799d5643d2599b3d70d85)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Add an opt-in
  `platform.serverModule` descriptor to `createJsxTransform`: in typeOnly output,
  a platform's file-local `module <blockName> { … }` server-module dialect and its
  boundary `import { x } from '<importSpecifier>'` statements are lowered to plain
  checkable TS (block imports hoisted, the block lowered to a namespace keeping
  the authored name, boundary imports lowered to destructures / `type` aliases,
  colliding hoisted locals aliased through a mangled namespace import). Verbatim,
  the dialect can never typecheck (TS1147 in-block import, TS2307 boundary
  import). Platforms without the option, and all runtime/build output, are
  untouched. The namespace references derived from the authored `'server'`
  specifier map its inner span with hover/navigation but WITHOUT semantic tokens,
  so the specifier keeps its string syntax highlighting instead of being partially
  repainted as a namespace token.

## 0.1.43

### Patch Changes

- [#1354](https://github.com/Ripple-TS/ripple/pull/1354)
  [`73f7eb4`](https://github.com/Ripple-TS/ripple/commit/73f7eb457dd9cc37364ba49b2ddfd56995fd07b0)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Re-emit preserved leading
  comments in typeOnly output: `@jsxImportSource`/`@jsxRuntime`/`@jsxFrag`/`@jsx`
  pragmas join the preserved-comment set, and the shared tsx printer now writes
  preserved comments that lead the program at the top of the virtual TSX.
  Previously comment stripping silently dropped them, retyping a file's JSX or
  re-enabling checking a leading `@ts-nocheck` had disabled.

## 0.1.42

### Patch Changes

- [#1352](https://github.com/Ripple-TS/ripple/pull/1352)
  [`b36ec19`](https://github.com/Ripple-TS/ripple/commit/b36ec1930764f447585a6c31c17bc63b3596511a)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Upgrade acorn to ^8.17.0 for
  improved stack overflow handling in the parser

## 0.1.41

### Patch Changes

- [#1350](https://github.com/Ripple-TS/ripple/pull/1350)
  [`5f5726d`](https://github.com/Ripple-TS/ripple/commit/5f5726d164926f480454143895bf035c9c30929b)
  Thanks [@trueadm](https://github.com/trueadm)! - Fixed parsing multiple paired
  JSX elements on the same line after a comma, including array literals nested in
  JSX expression children.

## 0.1.40

### Patch Changes

- [#1339](https://github.com/Ripple-TS/ripple/pull/1339)
  [`586c6df`](https://github.com/Ripple-TS/ripple/commit/586c6df1dfe52f098d6b48fd94414f69d5e2020d)
  Thanks [@trueadm](https://github.com/trueadm)! - Fixed parsing multiline
  self-closing JSX expressions when whitespace follows `/>`, including
  parenthesized return expressions and ternaries whose other branch is a fragment
  or array. The tokenizer now uses the preceding token boundary when deciding
  whether the following source is template text.

## 0.1.39

### Patch Changes

- [#1337](https://github.com/Ripple-TS/ripple/pull/1337)
  [`09efc09`](https://github.com/Ripple-TS/ripple/commit/09efc09d5149b8ffe9b6334c48ea6b2b4a1795dc)
  Thanks [@crutchcorn](https://github.com/crutchcorn)! - Preserve generic type
  arguments in interface heritage clauses in type-only output and Volar mappings.

## 0.1.38

### Patch Changes

- [#1333](https://github.com/Ripple-TS/ripple/pull/1333)
  [`78502e4`](https://github.com/Ripple-TS/ripple/commit/78502e46929df2165d288dbb2483f48e9254ef35)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Treat `<script>…</script>` as
  a raw-text element (like `<style>`) so its body can contain real JS/TS —
  including markup-significant characters such as `<`, `{`, and `}` — instead of
  being parsed as template markup. The body is captured verbatim on the element's
  `content`.

  Editors now get embedded TypeScript intellisense inside `<script>` bodies
  (type-aware completions, hover, go-to-definition, and diagnostics), mapped back
  to the `.tsrx` source — the same way `<style>` bodies get embedded CSS. Every
  body is treated as TypeScript in the editor (a superset of JavaScript); the
  `type` attribute only matters to the runtime transforms. This works across all
  tsrx targets, since the parser and compiler changes live in shared core and the
  language server is target-neutral.

  The compiler emits a new `scriptMappings` array on `VolarMappingsResult`, and
  every target renders the inline raw-text `<script>` body verbatim (the parser
  mirrors the body as a text child for generic element paths; the Ripple client
  and server inject it as the script's text content). The Prettier plugin formats
  the body as JavaScript/TypeScript in a block layout, the same way `<style>`
  bodies are formatted as CSS.

## 0.1.37

### Patch Changes

- [#1327](https://github.com/Ripple-TS/ripple/pull/1327)
  [`a109586`](https://github.com/Ripple-TS/ripple/commit/a109586774227b4026ffbd813a956e231edb1005)
  Thanks [@trueadm](https://github.com/trueadm)! - Fixed the tokenizer reading `/`
  and `#` as literal template-text characters in JS positions nested under a
  template element: division in a nested element's attribute expression
  (`<g><rect x={a - b / 2} /></g>`), division and private-field access in child
  expression containers (`{a / 2}`, `{this.#x}`), and division in control-flow
  directive headers (`@if (a / 2 > 1)`) all mis-parsed as "Unexpected token". The
  text special-case now skips expression containers and directive headers, where
  acorn's own tokenizer handles division vs regex correctly; literal `/` and `#`
  in template text are unchanged.

## 0.1.36

### Patch Changes

- [#1324](https://github.com/Ripple-TS/ripple/pull/1324)
  [`1925074`](https://github.com/Ripple-TS/ripple/commit/1925074254de0e61c8578cba136c50ea8f89cd35)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Remove the Ripple-normalized
  AST node types (`Element`, `TsrxFragment`, `Text`, `TSRXExpression`,
  `Attribute`, `SpreadAttribute`) and their builders (`builders.text`,
  `builders.tsrx_fragment`, `builders.tsrx_expression`). `@tsrx/ripple` now
  consumes the parser's JSX AST directly, so these shapes are no longer produced
  anywhere.

## 0.1.35

### Patch Changes

- [#1322](https://github.com/Ripple-TS/ripple/pull/1322)
  [`51eed86`](https://github.com/Ripple-TS/ripple/commit/51eed869b7ea26b5554893c9f8dd363f2d2121bc)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Parenthesized multiline JSX
  with nested children inside a ternary branch of an expression container (e.g.
  `{cond ? (<Outer><Inner>hi</Inner></Outer>) : null}` spread across lines) no
  longer fails to parse. After the closing `)`, the tokenizer treated the
  following `: null` as template raw text of the enclosing element and swallowed
  it; raw text inside an expression container is now only read when the innermost
  template element was opened inside that container.

## 0.1.34

### Patch Changes

- [#1315](https://github.com/Ripple-TS/ripple/pull/1315)
  [`cc95ffa`](https://github.com/Ripple-TS/ripple/commit/cc95ffaef3f3d3cd252176ea94308f89739f0212)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Keep single-text template
  output faithful to the source instead of promoting it to a string-literal
  expression. A component or fragment whose only output is a text node (e.g.
  `<>@</>` or `<>Hello</>`) is now emitted as-is in both the editor (type-only)
  view and runtime codegen, rather than being rewritten to `{'@'}` / `{'Hello'}`.
  This fixes valid text characters like `@` being mangled and preserves source
  fidelity/mappings across all targets. Nullish or whitespace-only single-text
  output now renders nothing at runtime instead of emitting a stray empty-string
  expression.

## 0.1.33

### Patch Changes

- [#1283](https://github.com/Ripple-TS/ripple/pull/1283)
  [`ba498cd`](https://github.com/Ripple-TS/ripple/commit/ba498cde76e9f83235ce91da825f403a28441bff)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Print empty fragements as is
  inside expressions {<></>} instead of {null}

- [#1290](https://github.com/Ripple-TS/ripple/pull/1290)
  [`313b351`](https://github.com/Ripple-TS/ripple/commit/313b3513e4a959dd80b546da41c798066c5ccb0f)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix a parser crash when a
  template literal is the first thing in a `@{ … }` code block: `let c = @{`123`}`
  (and `@{ `${x}` }`) threw "Unterminated template" while `@{ '123' }` parsed
  fine. The code block's opening brace reads the next token ahead, and a template
  literal's backtick pushes its own tokenizer context; the setup-statement parser
  then shadowed (or stranded, after a prior statement) that context, so the
  template body tokenized as ordinary code and never closed. The backtick is now
  detected so the template-literal context stays on top and the body parses
  correctly.

- [#1292](https://github.com/Ripple-TS/ripple/pull/1292)
  [`35ac700`](https://github.com/Ripple-TS/ripple/commit/35ac70052d79efae41bb1df2440fee3f052ca115)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Allow a
  `@if`/`@for`/`@switch`/`@try` control-flow directive or a `@{ … }` code block to
  be combined into an expression (React, Preact, Solid, Vue, and Ripple), instead
  of crashing the printer with "Not implemented: JSX…Expression" or leaking a bare
  `if (…) { … }` into expression position.

  A directive combined into an expression — an operator operand
  (`const ad = (@if (…) { … }) || 'fallback'`), a conditional branch, a `@for`
  iterable, an `@if`/`@switch` test — is now wrapped so it lives inside a
  fragment. For the JSX targets the directive is wrapped in a `<> … </>` (kept as
  the truthy fragment value in an operand position, collapsed to its rendered
  value in a "raw value" slot). For Ripple the directive is wrapped before
  normalization, so the client and server lower it to a `_$_.tsrx_element(…)`
  render (the control flow runs inside the render callback) and the `to_ts` output
  keeps the `<> … </>` for its TSX type view.

  For Ripple the wrap covers a directive used in ANY value position, not just
  operators: the sole value of a slot (`let cd = @if (…) { … }`,
  `cd = @switch (…) { … }`, `render(@if (…) { … })`), a concise arrow body
  (`xs.map((x) => @if (x) { … })`), a `return` argument inside a nested function,
  a member object, and so on — all previously leaked a bare `if (…) { … }`
  statement in some or all modes. The positions where a directive is already
  lowered correctly (render children, statements, `@if` branches, a `@{ … }` code
  block's render output) are left untouched. A `@{ … }` code block self-lowers to
  an IIFE in every position and is never wrapped (so it is not redundantly
  fragment-wrapped in, e.g., an array element). The JSX targets already collapse a
  sole-value directive to its rendered value, so they are unchanged.

- [#1288](https://github.com/Ripple-TS/ripple/pull/1288)
  [`bbe6e74`](https://github.com/Ripple-TS/ripple/commit/bbe6e7422c690558f0dfcb3abe5452d4f4cdde91)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Keep an empty expression
  container fragment in expression position: `let c = <>{}</>` (and
  `<>{/* comment */}</>`) now stays `<></>` instead of collapsing to a bare empty
  expression (`let c = ;`), which was a syntax error. Applies to the React,
  Preact, Solid, and Vue to_ts targets (Ripple already produced `<></>`).

- [#1286](https://github.com/Ripple-TS/ripple/pull/1286)
  [`0e9f523`](https://github.com/Ripple-TS/ripple/commit/0e9f52358a615c2fc7759544e96c43dccb533c86)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Keep empty fragments in
  expression position: `let b = <></>` stays `<></>` instead of `null`, and
  `let c = <><></></>` keeps both levels instead of collapsing to `<></>`. Applies
  to the React, Preact, Solid, Vue, and Ripple to_ts targets.

- [#1292](https://github.com/Ripple-TS/ripple/pull/1292)
  [`35ac700`](https://github.com/Ripple-TS/ripple/commit/35ac70052d79efae41bb1df2440fee3f052ca115)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Keep an authored `<> … </>`
  fragment verbatim in EVERY position, instead of unwrapping a single-child
  fragment to its bare child (React, Preact, Solid, Vue, and Ripple `to_ts`).

  Previously a single-child fragment was collapsed — `const v = <>{1}</>` became
  `const v = 1`, `return <>{x}</>` became `return x`, and
  `@if (cond()) { <>{'Hi'}</> }` became `cond() ? 'Hi' : null` — turning the
  author's JSX into a plain value and changing its meaning (a fragment is always a
  truthy element and has a different type, so collapsing can produce the wrong
  output). Authored fragments are now kept everywhere:
  - value positions: a variable initializer, an assignment, an operator operand, a
    conditional branch, an array element, a call argument;
  - render output: a component's `<> … </>` render, a `return <>…</>`, an arrow
    body `() => <>…</>`;
  - the branches of an `@if`/`@for`/`@switch`/`@try` (`@if (c) { <>{'Hi'}</> }` →
    `c ? <>{'Hi'}</> : null`, `@for (…) { <>{x}</> }` → `… => <>{x}</>`);
  - Ripple `to_ts` additionally keeps a fragment in a JSX-child `{ … }` container
    slot (`<div>{<>{x}</>}</div>`), matching the JS targets.

  An empty authored `<></>` is also kept verbatim everywhere — `return <></>`
  stays `return <></>` (not `null`) on all targets.

  A compiler-generated wrapper fragment (the one added around a control-flow
  directive so it lowers to a value) is marked internally and still collapses, so
  `const x = @switch (…) { … }` is unchanged. A nested authored fragment collapses
  outer→inner (`<><>{x}</></>` → `<>{x}</>`) — still a fragment, so no wrong
  output. A `<style>` inside a fragment is still collected and scoped (the re-wrap
  operates on the already style-stripped value). Ripple's client/server runtime
  output is unaffected (it renders fragments via `tsrx_element`).

- [#1292](https://github.com/Ripple-TS/ripple/pull/1292)
  [`35ac700`](https://github.com/Ripple-TS/ripple/commit/35ac70052d79efae41bb1df2440fee3f052ca115)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Keep a `<> … </>` fragment
  that is combined into an expression as a fragment, instead of collapsing its
  single child to a bare value (React, Preact, Solid, Vue, and Ripple `to_ts`).

  A fragment is always a truthy element, but its single child may be falsy, so
  unwrapping `<>{0}</>` to `0` flipped the meaning of `<>{0}</> || 'default'` from
  rendering `0` to rendering `'default'`. When a fragment is the operand of an
  operator, a conditional branch, an array element, or another combined
  expression, the fragment is now preserved. The existing collapse is unchanged
  for a fragment that is the sole value of a render-output slot (a `return`, a
  variable initializer, an arrow body, a call argument), where it only renders and
  the collapse is invisible.

- [#1298](https://github.com/Ripple-TS/ripple/pull/1298)
  [`2b65285`](https://github.com/Ripple-TS/ripple/commit/2b65285bfcd4c6a0aa93d7fa0b25082e6ec74e1f)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Apply lazy `&{ … }` /
  `&[ … ]` destructuring inside nested `@{ … }` code blocks and `@if` / `@for` /
  `@switch` / `@try` directive bodies (React, Preact, Solid, and Vue production
  output), instead of leaving the lazy declaration as a plain destructure while
  its references go unrewritten.

  These scopes lower to compiler-generated function boundaries — scoped IIFEs,
  `.map(...)` callbacks, and `<Show>` / `<For>` / `<Match>` render closures — that
  did not exist when `has_lazy_descendants` was first stamped, so the lazy
  transform's fast-path skipped them. The descendant flag is now re-derived over
  the fully lowered tree before the transform runs, so a `let &{ name } = props`
  declared in a nested block or directive body is rewritten to
  `let __lazy0 = props` + `__lazy0.name` exactly as it is in a flat component
  body. A `@switch` case body's lazy bindings are now collected too (the shared
  switch block scope), so a reference like `{value}` becomes `{__lazy0.value}`
  rather than a half-transformed `let __lazy0 = props` with a dangling `value`.

  Also rewrite a lazy binding used as a JSX element/component name to a member
  expression (`function Comp(&{ Item }) @{ <Item></Item> }` →
  `function Comp(__lazy0) { return <__lazy0.Item></__lazy0.Item>; }`). The bound
  name is no longer a local once the param/declaration is replaced with the
  generated `__lazy0` source, so `<Item>` had been leaking a reference to an
  undefined identifier; it now reads the component off the lazy source like every
  other reference does.

  An untyped lazy object param no longer gets a synthesized `{ … : any }` type.
  The source specified no type, so the generated param is left implicitly `any`
  (`function Comp(__lazy0)`) instead of carrying a fabricated object shape; a
  param with an author-provided type still keeps it
  (`function Comp(__lazy0: Props)`).

  Type-only (virtual TSX) output is unchanged: it never runs the lazy transform,
  so the param keeps printing as a plain destructure (`{ Item }`, untyped) and
  `<Item>` keeps referencing that in-scope binding, which preserves identity-style
  source mappings for editor features.

- [#1307](https://github.com/Ripple-TS/ripple/pull/1307)
  [`f55466b`](https://github.com/Ripple-TS/ripple/commit/f55466bde65d0cff00c0c4525af9d68ae794ffd2)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Skip the wrapper anchor for
  single control-flow / code-block / component root scopes. When a scope's entire
  renderable output is a single `@if`, `@switch`, `@for`, `@try`, or static child
  component — i.e. a component body, a control-flow branch, or a `@{}` body whose
  only output after setup is one of these — the compiler now renders it directly
  before the parent-provided `__anchor` instead of synthesizing a `<!>` fragment
  wrapper and an extra append + clone. For deep recursive trees this measurably
  cuts mount time and shrinks generated output; in the recursive-context benchmark
  it brought mount DOM operations to one clone + one append per element (from
  ~1.5×) and halved the comment-anchor nodes.

  Hydration is preserved. The control-flow runtimes
  (`if_block`/`switch_block`/`for_block`/`for_block_keyed`/`try_block`) capture
  the SSR boundary marker and hand it to `append()` afterward, so the existing
  context-aware cursor advance still runs — including for a root scope used as a
  child of a composite/slot with following siblings. Single-component roots need
  no runtime change at all, since a component's own content advances the hydration
  cursor.

  Also relaxes the compiler's text-expression detection: `string + anything` (e.g.
  `{a + '|' + b}`) is now recognized as text and lowered to the fast `set_text`
  path without requiring an explicit `as string`, since such an expression always
  evaluates to a string in JS.

- [#1281](https://github.com/Ripple-TS/ripple/pull/1281)
  [`b887deb`](https://github.com/Ripple-TS/ripple/commit/b887debf5f47e63d73184ac218ec8b3542a5e21c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix a parser stack overflow
  on a text-then-element sibling that follows newline-separated sibling elements
  (e.g. `<pre><b>2</b>\n<b>3</b>1<b>4</b></pre>`). The newline between two
  siblings leaves a stale `jsxText` token anchored on the next `<`; recovering
  from it used to clear _every_ JSX children context — including the parent
  element's own — so the later `text<tag>` sibling tokenized its `<` as a
  relational operator that `parseTemplateBody` has no branch for, recursing
  forever. The recovery now keeps one children context per still-open ancestor
  when the `<` opens a child/sibling tag, and only clears the full run when it
  opens a closing `</tag>`.

- [#1284](https://github.com/Ripple-TS/ripple/pull/1284)
  [`3668c5f`](https://github.com/Ripple-TS/ripple/commit/3668c5fe9cdaca4862707d653d23af94780f42af)
  Thanks [@leonidaz](https://github.com/leonidaz)! - fix(parser): keep significant
  whitespace before a `@{ … }` code block

  The native template body skipped leading whitespace when repositioning onto a
  `@{ … }` code block, so `<>   @{<b>123</b>}   </>` lost its leading edge space
  (only the trailing one survived). The whitespace is now emitted as a text child,
  matching the equivalent plain-element case; layout indentation (whitespace
  containing a newline) is still dropped.

## 0.1.32

### Patch Changes

- [#1277](https://github.com/Ripple-TS/ripple/pull/1277)
  [`cc3176b`](https://github.com/Ripple-TS/ripple/commit/cc3176b4e40021021986830bdfa3295530715432)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix parsing of sibling
  fragments/elements separated by template text. A `<>` or `<tag>` opening that
  follows template text (e.g. `<> <></> 2 <></> </>`) arrives as a relational `<`
  token; the JSX re-entry fallback now pushes the same tokenizer contexts a real
  `jsxTagStart` would, so the terminating `>` — including the lone `>` of a
  nameless fragment — is read as `jsxTagEnd` instead of a relational operator.
  Also preserve an inline space that separates two sibling elements on the same
  line (`<> <></>  <></>x </>`) as significant JSX text; only layout whitespace
  spanning a newline is still collapsed.

- [#1277](https://github.com/Ripple-TS/ripple/pull/1277)
  [`cc3176b`](https://github.com/Ripple-TS/ripple/commit/cc3176b4e40021021986830bdfa3295530715432)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Preserve significant
  whitespace and keep fragments faithful in TSRX template output.
  - Parser: a sibling after a closing tag (`<b>1</b> 2`, `<> <>x</> y <>z</> </>`)
    now reads as JSX text at the source, so significant inline whitespace is kept
    instead of being eaten by `skipSpace`. This fixes the leading space being
    dropped (`" 2 "` not `"2 "`) and removes several closing-tag
    whitespace/context workarounds.
  - Transform: a single-text fragment used as a JSX child stays a fragment
    (`<>123</>` instead of `{'123'}`), and an empty fragment child stays `<></>`
    instead of `{null}`. Expression/return-position single-text fragments still
    lower to a string (`return <>x</>` -> `return "x"`). Whitespace at a
    fragment/element's content edges is wrapped in a `{' '}` container so it
    survives formatting/JSX collapsing; whitespace between siblings stays bare
    (`<b/> <i/>`). The edge rule is shared (`wrapEdgeWhitespace`) across the
    React/Preact/Solid transforms and the Ripple to_ts view.
  - Ripple target: whitespace-only text that is a significant inline space is kept
    rather than dropped, so edge and inter-element spaces survive in client
    templates and SSR output. The to_ts / Volar type-checking view now matches the
    JSX targets — literal text stays bare (not `{"123"}`), single-text fragments
    stay `<>123</>`, empty fragments stay `<></>` (not `{null}`), `{a}` expression
    containers are preserved for type visibility, and edge whitespace prints as
    single-quote `{' '}`.

## 0.1.31

### Patch Changes

- [#1269](https://github.com/Ripple-TS/ripple/pull/1269)
  [`8747e8f`](https://github.com/Ripple-TS/ripple/commit/8747e8f306628443d3c4d73bce0d79e986f5966e)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Disallow `return` statements
  inside `@try`/`@catch`/`@pending` blocks.

  `return` is only valid in the JS setup at the top of a `@{ … }` code block —
  never inside a `@`-directive block. `@if`/`@for`/`@switch` already rejected
  returns; `@try`/`@catch`/`@pending` previously allowed `return <markup>`
  (lowering it into a reactive boundary fallback). They now reject any `return`
  (with or without an argument) with the same
  `Return statements are not allowed inside TSRX templates` diagnostic,
  consistently across every target (ripple, react, preact, solid, vue). Render
  markup by writing it as the block's output instead of returning it. Returns
  inside nested ordinary functions are unaffected.

- [#1269](https://github.com/Ripple-TS/ripple/pull/1269)
  [`8747e8f`](https://github.com/Ripple-TS/ripple/commit/8747e8f306628443d3c4d73bce0d79e986f5966e)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Treat plain JS control flow
  inside `@{ … }` as ordinary JavaScript that returns JSX.

  Only `@`-directives (`@if`/`@for`/`@switch`/`@try`) lower to template control
  flow. Plain `if`/`for`/`for…of`/`for…in`/`while`/`do…while`/`switch`/`try`
  inside a code block are now compiled exactly like the same control flow in a
  regular `function C() { …; return <jsx> }` body — their JSX returns become
  `tsrx_element` values rather than being template-ized.

  Previously these plain statements were mis-routed into the template transform:
  on **ripple** an early-return guard produced a `_$_.if`/`_$_.switch`/`_$_.try`
  wrapper (with dead code in the `switch`/`try` cases) and plain loops threw a
  compile error; on **solid** they produced
  `<Show>`/`<Switch>`/`<For>`/`<Errored>` (dropping trailing output for `try`).
  They now stay as plain control flow, so early-return guards and loops behave
  like normal JavaScript.

  As part of this, the ripple client and server targets no longer emit the
  `return_guard` bookkeeping variable: a plain early `return` is a real early
  return, so subsequent template output is naturally skipped without a guard flag.

  On **solid**, this means a plain guard (`if (signal()) return …`) inside a
  component body now runs once at setup — exactly like a regular Solid component —
  instead of being lifted into a reactive `<Show>`. Use `@if` (or another
  `@`-directive) when you want reactive conditional rendering.

## 0.1.30

### Patch Changes

- [`b104604`](https://github.com/Ripple-TS/ripple/commit/b10460473fec0ee68b4963cbc2a3d9d5bb3bc633)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix descendant and sibling
  selectors being wrongly pruned as unused in the shared JSX targets (react,
  preact, solid, vue).

  Selector pruning for free-standing `<style>` blocks runs before the transform
  walker has stamped ancestor paths onto template nodes, so combinator matching
  (`.card h2`, `.card > ul`) found no ancestors and marked every such selector
  unused. Element collection for pruning now records each element's ancestor chain
  itself, so descendant matching works the same as in the Ripple target.

## 0.1.29

### Patch Changes

- [#1257](https://github.com/Ripple-TS/ripple/pull/1257)
  [`67de047`](https://github.com/Ripple-TS/ripple/commit/67de047d103f39673b25910e1a97760278820999)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Lower TSRX-only nodes inside
  expression-position `@{ … }` code blocks. Setup statements of a code block used
  as an expression (e.g. `const Test = @{ … }`) were carried into the generated
  scoped IIFE verbatim without re-visiting them, so a style expression
  (`const styles = <style> … </style>`) or a nested `@{ … }` block inside the
  setup reached the printer as a raw `JSXStyleElement` / `JSXCodeBlock` node and
  failed with "Not implemented: JSXStyleElement". The lowered scope is now
  re-visited the same way function-body code blocks are, so style expressions
  compile to their class maps (with the CSS emitted) and nested blocks lower into
  their own scopes.

- [#1262](https://github.com/Ripple-TS/ripple/pull/1262)
  [`1c645c8`](https://github.com/Ripple-TS/ripple/commit/1c645c8f854df23bb1271b3402d1885616b525cd)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Prune unreachable selectors
  from `<style>` blocks consistently across targets.

  For a style expression (`const styles = <style> … </style>`), only standalone
  class selectors — scoped (`.x`) or global-wrapped (`:global(.x)`) — end up in
  the generated class map, but the emitted CSS still contained every selector.
  Top-level selectors that don't contribute a class map entry (element selectors,
  compound selectors, descendant chains, global tag selectors) are now commented
  out as unused, while standalone classes, `:global(.x)` selectors, and rules
  nested inside a reachable rule (e.g. `&:hover`) are kept.

  Free-standing `<style>` blocks in the shared JSX targets (react, preact, solid,
  vue) now prune selectors that match no element, the same way the Ripple target
  always has, instead of keeping every authored selector. Selector matching also
  recognizes `className` as the class attribute for React-style targets.

- [#1260](https://github.com/Ripple-TS/ripple/pull/1260)
  [`b1256fd`](https://github.com/Ripple-TS/ripple/commit/b1256fdb5bf279ee7dd20bf1a71dcfccc47e279c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Make style scope hashes
  unique per style block and per file. The hash was derived from the style block's
  content alone, so two `<style>` blocks with identical CSS — in different
  components of the same file, or in different files — collided and shared a
  scope. The hash input now includes the filename and the line/column where the
  `<style>` tag starts. Because the filename may be an absolute path, the hash
  also switched from the reversible djb2 hash to the truncated SHA-256 hash so
  file structure can't be recovered from class names in the shipped bundle.

  The `filename` parameter of `parse`, `parseModule`, and the per-target `parse`
  wrappers is now required (typed as a non-empty string), and parsing a `<style>`
  element without one throws a clear error instead of silently seeding the hash
  with an empty name. The prettier plugin and eslint parser pass their host's file
  path through, falling back to a plugin-specific placeholder when formatting or
  linting in-memory text.

## 0.1.28

### Patch Changes

- [#1255](https://github.com/Ripple-TS/ripple/pull/1255)
  [`f001849`](https://github.com/Ripple-TS/ripple/commit/f00184940979a77cbf6873a811caaaa436feab46)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Always parse `@{ … }` in
  template text position as a `JSXCodeBlock`. A code block preceded by text on the
  same line (e.g. `Hello @{props.username}`) was split into JSX text ending in a
  literal `@` plus a `{ … }` expression container, because the template raw-text
  scan only stopped at `<`, `{`, `}`, and control-flow directives. The scan now
  also stops at a `@{` code-block start, so inline blocks after text parse the
  same as blocks at the start of a body. A lone `@` not directly followed by `{`
  remains plain text.

- [#1254](https://github.com/Ripple-TS/ripple/pull/1254)
  [`4af2591`](https://github.com/Ripple-TS/ripple/commit/4af259139d118a27d177531aa6a21435a3f3a015)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix `@{ … }` code blocks in
  template children position for the shared JSX transform (react, preact, solid,
  vue). Nesting deeper than two levels leaked a raw code block into the statement
  stream — triggering spurious `_tsrx_child_*` captures and an IIFE whose render
  output was discarded (dropped in react/preact, rendered out of position in
  solid) — and flattened blocks merged lexical scopes, so shadowed declarations
  produced invalid output. Each block is now its own scope and the lowering pays
  only for what the block uses: template-only blocks merge statically into the
  parent, code-only blocks become a plain `{ … }` statement block, blocks with
  both setup code and render output become a scoped IIFE child, and nested chains
  fold into a single closure with nested plain blocks. Empty chains compile to
  nothing at any depth.

- [`87afc5d`](https://github.com/Ripple-TS/ripple/commit/87afc5d3f4c73e604cd245865e27d29e40435482)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Keep native template nodes in
  JSX-child shape inside synthetic fragments on JSX-emitting targets (react,
  preact, solid, vue). A fragment nested in an expression container could collapse
  to a bare expression placed directly in a fragment children list
  (`<>{a} <>{<>{b}</>}</></>` compiled to `<>{a}b</>`), which JSX reads as literal
  text — in both production output and the TS/Volar virtual code.

- [`87afc5d`](https://github.com/Ripple-TS/ripple/commit/87afc5d3f4c73e604cd245865e27d29e40435482)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Parse template text that
  touches a following tag (`<>hello<span>…`) as text plus a tag. The tokenizer
  treated a `<` directly after a text run ending in an identifier character as the
  start of a TypeScript type-argument list (`hello<T>`), so the tag failed to
  parse with "Unexpected token `>`".

- [#1256](https://github.com/Ripple-TS/ripple/pull/1256)
  [`f1a4c10`](https://github.com/Ripple-TS/ripple/commit/f1a4c10d2ad8ed604375f36f7ae3b653fe95ed1a)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Recognize trailing `//` line
  comments in template text after a sibling on the same line. A `//` was only a
  comment when nothing but whitespace preceded it on its line, so
  `@{ … }  // note` (or an element/expression container followed by a trailing
  comment) treated the comment as text — and crashed with `Unexpected token` when
  the comment contained `<`. A `//` preceded only by whitespace since the start of
  its text run (right after a code block, element, or expression container) now
  starts a comment. `//` after real text on the same line is still literal, so
  `https://…` URLs stay text.

## 0.1.27

### Patch Changes

- [#1244](https://github.com/Ripple-TS/ripple/pull/1244)
  [`60a78c9`](https://github.com/Ripple-TS/ripple/commit/60a78c9def09eed6d706c42bc751d2d051d1d57f)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Strip `/* … */` block
  comments from template text on all targets. The template raw-text scanner only
  recognized line comments, so block comments in text position leaked into
  compiled output (production templates, server output, and to_ts virtual code)
  and, in one position, were both recorded as a comment and kept as text. Block
  comments are now removed from `JSXText` and recorded as comments everywhere, and
  the Prettier plugin prints them back (including before closing tags/fragments
  and in comment-only bodies) instead of relying on the leaked text.

## 0.1.26

### Patch Changes

- [#1240](https://github.com/Ripple-TS/ripple/pull/1240)
  [`92982ee`](https://github.com/Ripple-TS/ripple/commit/92982ee5cd2e6d971b5b650ec1df70483c9716aa)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Add parser, formatter, and
  compiler support for `<{expr}>` dynamic element tags.

- [#1241](https://github.com/Ripple-TS/ripple/pull/1241)
  [`b826234`](https://github.com/Ripple-TS/ripple/commit/b8262342111a977ba5a0d44086154e386b06f4b9)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Treat dynamic tags
  (`<{expr}>`) like the runtime `Dynamic` helper during scoped CSS analysis on all
  targets: type selectors are no longer pruned (the tag can resolve to any
  element), the element's classes match scoped selectors, and the scope hash is
  applied to its class.

- [#1241](https://github.com/Ripple-TS/ripple/pull/1241)
  [`b826234`](https://github.com/Ripple-TS/ripple/commit/b8262342111a977ba5a0d44086154e386b06f4b9)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Remove the runtime `Dynamic`
  component exports; dynamic rendering is the `<{expr}>` tag syntax. The `Dynamic`
  type declarations remain so type-only output keeps type-checking, but the JS is
  gone: React and Preact production output now lowers dynamic tags to a scoped
  component alias (`const TsrxDynamic_N = expr;`), Ripple SSR uses the internal
  `_$_.dynamic_element` helper, and the imported-`Dynamic` detection for scoped
  CSS is removed (the element marking is now `metadata.dynamicElement`, set by the
  dynamic-tag lowering).

- [#1241](https://github.com/Ripple-TS/ripple/pull/1241)
  [`b826234`](https://github.com/Ripple-TS/ripple/commit/b8262342111a977ba5a0d44086154e386b06f4b9)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Lower dynamic tags
  (`<{expr}>`) for Solid and Vue production output to scoped component bindings
  instead of the `Dynamic` helper component. Solid binds
  `const TsrxDynamic_N = _tsrx_dynamic(() => expr)` (aliasing `dynamic` from
  `@solidjs/web`); Vue aliases the tag inside an import-free expression-child IIFE
  so vue-jsx-vapor's render block keeps it reactive. Declarations are placed in
  the scope that owns the expression (e.g. inside loop callbacks), and the
  type-only transform keeps the `<TsrxDynamic is={expr}>` shape with source
  mappings for both tag positions.

## 0.1.25

### Patch Changes

- [`d14ec84`](https://github.com/Ripple-TS/ripple/commit/d14ec84f26233e514be9e59ffc94e61db5089587)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Preserve whitespace between a
  control-flow directive's closing `}` and the following template text. A bare
  `else` (or any sibling text) after an `@if` block such as `@if (x) { … } else`
  now keeps the leading space instead of dropping it, matching how text after a
  plain element is handled.

- [`921fb9c`](https://github.com/Ripple-TS/ripple/commit/921fb9ce6485db41527b631f5236b7abbac74986)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix a parser crash ("Invalid
  array length") when a control-flow directive (`@if`/`@for`/`@switch`/`@try`) is
  followed by same-line trailing text that runs straight into the closing tag,
  e.g. `<>@if (a) { … } done</>`. The manual JSX-closing-tag re-entry now restores
  the two tokenizer contexts a real `jsxTagStart` would have pushed, so the
  closing tag no longer underflows the context stack.

- [#1233](https://github.com/Ripple-TS/ripple/pull/1233)
  [`1693c9e`](https://github.com/Ripple-TS/ripple/commit/1693c9e6daf1421e71171fe3c50e37adfc858b69)
  Thanks [@trueadm](https://github.com/trueadm)! - Remove generated React and
  Preact hook helper extraction so hooks remain in authored order.

## 0.1.24

### Patch Changes

- [#1229](https://github.com/Ripple-TS/ripple/pull/1229)
  [`6fd49c9`](https://github.com/Ripple-TS/ripple/commit/6fd49c9dd737e889844e254763f66e13ea4a7241)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Replace the removed `<@...>`
  dynamic tag syntax with runtime `Dynamic` helpers. Ripple now exports `Dynamic`
  and reuses its composite runtime path for dynamic elements/components, while
  React, Preact, Solid, and Vue expose target-specific `Dynamic` helpers with
  typed `is` props.

  React, Preact, Solid, and Vue now mark imported runtime `Dynamic` elements
  during shared JSX analysis so scoped CSS classes are applied through aliases
  without treating local components named `Dynamic` as runtime elements.

  Dynamic component prop forwarding now uses a shared core runtime helper that
  excludes the internal `is` prop without snapshotting getter-backed reactive
  props.

  The TSRX parser, transforms, analyzers, prettier support, and related tests no
  longer recognize dynamic tag syntax. Stale JSX identifier `tracked` plumbing
  from that parser path has also been removed.

## 0.1.23

### Patch Changes

- [`9eb4819`](https://github.com/Ripple-TS/ripple/commit/9eb4819cede6da7e93cbcd2bdf284bcb42d40464)
  Thanks [@trueadm](https://github.com/trueadm)! - Allow bare `else` text after a
  TSRX `@if` block while continuing to reject missing-`@` continuation clauses,
  and remove `finally` parsing from TSRX `@try` control flow.

- [`88a254c`](https://github.com/Ripple-TS/ripple/commit/88a254c69953a5ace33bc10047f11052ec598672)
  Thanks [@leonidaz](https://github.com/leonidaz)! - For Ripple, emit
  `@for @empty` fallback bodies in client `to_ts` output. Mapping of the node for
  all targets.

- [`ba3a7f6`](https://github.com/Ripple-TS/ripple/commit/ba3a7f6485ea163e60cc0750a8e8b06b50728009)
  Thanks [@trueadm](https://github.com/trueadm)! - Allow TSRX `@{}` blocks and
  `@if`/`@for`/`@switch`/`@try` directives as dangling expression statements.

- [#1211](https://github.com/Ripple-TS/ripple/pull/1211)
  [`ac6f358`](https://github.com/Ripple-TS/ripple/commit/ac6f3582ca0b2814004439c882d6aa735c8afe50)
  Thanks [@trueadm](https://github.com/trueadm)! - Add diagnostics, lint autofix,
  and MCP advice for function bodies that forget `@{...}` before TSRX template
  output.

- [`78ffa8d`](https://github.com/Ripple-TS/ripple/commit/78ffa8d90fd01e85bf34e5c6adef0e51caae8da7)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Lower bare
  `@if`/`@for`/`@switch`/`@try` control-flow directives that sit directly in a
  call/`new` argument position
  (`func(@if (status === 'active') { … } @else { … })`). For the React, Preact,
  Solid, and Vue targets these previously leaked an untransformed
  `JSXIfExpression`/`JSXForExpression`/`JSXSwitchExpression`/`JSXTryExpression`
  straight to the printer and crashed with "Not implemented: JSX…Expression". The
  argument is now wrapped in a native TSRX fragment before transform, so it flows
  through the same render machinery as an expression-bodied arrow, `return`, or
  assignment output (a `@{ … }` code-block argument already lowered to an IIFE and
  is unchanged).

- [`16560cb`](https://github.com/Ripple-TS/ripple/commit/16560cb466430bdbe8749d9491bc79e69e58d02c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Lower bare
  `@if`/`@for`/`@switch`/`@try` control-flow directives that sit directly in an
  expression position — an expression-bodied arrow
  (`const M = (props) => @switch (x) { … }`), a `return @switch (x) { … }`, or
  assignment to a variable (`const view = @switch (x) { … }`,
  `view = @switch (x) { … }`). For the React, Preact, Solid, and Vue targets these
  previously leaked an untransformed
  `JSXSwitchExpression`/`JSXIfExpression`/`JSXForExpression`/`JSXTryExpression`
  straight to the printer and crashed with "Not implemented: JSX…Expression". The
  directive is now wrapped in a native TSRX fragment before transform, so it flows
  through the same render machinery as a component-body output and each platform
  emits its existing lowering (an IIFE+`switch` for React/Preact/Vue,
  `<Switch>`/`<Match>` for Solid).

- [`4be6e54`](https://github.com/Ripple-TS/ripple/commit/4be6e54bbfee20927adca473648a94aa173d7d77)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Parse `@{ … }` code blocks
  and `@if`/`@for`/`@switch`/`@try` control-flow directives inside an element
  nested in a `{ … }` expression container (e.g. `{<div>@if (x) { … }</div>}`,
  including in `.map()` callbacks). These previously crashed with "RangeError:
  Invalid array length": the directive parser strips JSX tokenizer contexts so its
  body parses as JS, and inside an expression container it also stripped the
  container's and enclosing element's contexts, underflowing the context stack
  when the surrounding markup closed. The directive filter now preserves every
  context below the innermost expression-container baseline, matching the bare
  `function … @{ … }` form.

- [`2b67f83`](https://github.com/Ripple-TS/ripple/commit/2b67f83d7ed7eab7a39bc33524fcf73f737d977e)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Parse ternaries whose
  branches are JSX elements or fragments with children inside a `{ … }` expression
  container (e.g. `{cond ? <div>a</div> : <span>b</span>}`, including nested
  ternaries, fragment branches, and ternaries in attribute values or `.map()`
  callbacks). A JSX branch left the tokenizer at `exprAllowed === false`, so the
  `<` after the `:` was not recognized as a tag start and parsing failed with
  "Unexpected token". Expression position is now restored after a JSX ternary
  branch so the alternate parses as JSX too.

- [`9918c52`](https://github.com/Ripple-TS/ripple/commit/9918c52e954f2b8e1a994892e7c555e8277f2d59)
  Thanks [@trueadm](https://github.com/trueadm)! - Keep ordinary JavaScript
  control-flow blocks from implicitly rendering bare TSRX templates while
  preserving Solid terminal branch lowering.

- [`e8493be`](https://github.com/Ripple-TS/ripple/commit/e8493be0b3489f402105297251e1919c103c2360)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Preserve leading whitespace
  in JSX text children of elements nested inside `{ … }` expression containers.
  The JSX-expression reader skipped leading whitespace before anchoring the
  JSXText token, so `{<textarea>   a</textarea>}` lost its indentation while the
  bare `<textarea>   a</textarea>` kept it. Both paths now capture text
  identically, so every target (Ripple, React, Preact, Solid, Vue, including
  `typeOnly`/`to_ts` output) emits consistent JSX text.

- [`c424675`](https://github.com/Ripple-TS/ripple/commit/c424675102a9edd4f1e356fb6db30124a9c2d885)
  Thanks [@trueadm](https://github.com/trueadm)! - Extract hook-bearing plain `if`
  return branches in React and Preact TSRX component bodies into helper
  components.

## 0.1.22

### Patch Changes

- [#1199](https://github.com/Ripple-TS/ripple/pull/1199)
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)
  Thanks [@trueadm](https://github.com/trueadm)! - Fix line-tracking desync when a
  code-block setup statement following a render node is mis-read as JSX text.
  Re-reading the statement now rewinds the line counter along with the position,
  so node `loc` lines stay correct and source-map mapping no longer crashes
  ("Location line ... out of bounds") for blocks without a trailing newline.

- [#1199](https://github.com/Ripple-TS/ripple/pull/1199)
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)
  Thanks [@trueadm](https://github.com/trueadm)! - Allow a trailing `;` after the
  render node of a `@{ }` code block or directive body (e.g. `<>…</>;`). The stray
  semicolon is a meaningless empty statement and is now skipped during parsing
  instead of being captured as a statement after the render output. This
  previously produced a "statements cannot follow the rendered output" diagnostic
  and, because the render node was then mis-bucketed as a body statement, could
  crash the transformer with "Not implemented: JSXStyleElement" when the output
  contained a `<style>` element. Prettier still strips the semicolon on format.

- [#1199](https://github.com/Ripple-TS/ripple/pull/1199)
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)
  Thanks [@trueadm](https://github.com/trueadm)! - Map preserved TypeScript pragma
  comments to their original source ranges in Volar TypeScript output.

- [#1199](https://github.com/Ripple-TS/ripple/pull/1199)
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)
  Thanks [@trueadm](https://github.com/trueadm)! - Emit `return null` for
  `continue` inside JSX template `@for` loop callbacks.

- [#1199](https://github.com/Ripple-TS/ripple/pull/1199)
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)
  Thanks [@trueadm](https://github.com/trueadm)! - Preserve scoped CSS classes for
  dynamic TSRX elements when selectors use tag names.

- [#1199](https://github.com/Ripple-TS/ripple/pull/1199)
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)
  Thanks [@trueadm](https://github.com/trueadm)! - Allow empty `<style></style>`
  blocks inside TSRX fragments.

- [#1199](https://github.com/Ripple-TS/ripple/pull/1199)
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)
  Thanks [@trueadm](https://github.com/trueadm)! - Support fenced script-only TSRX
  control-flow directive bodies.

- [#1199](https://github.com/Ripple-TS/ripple/pull/1199)
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)
  Thanks [@trueadm](https://github.com/trueadm)! - Add `@empty { ... }` fallbacks
  for TSRX `@for` loops, require prefixed template continuation clauses such as
  `@else`, `@empty`, `@pending`, `@catch`, `@case`, and `@default`, and reject
  direct `continue`, `break`, and `return` statements inside `@for` loop bodies
  and `@if` template branches.

- [#1199](https://github.com/Ripple-TS/ripple/pull/1199)
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)
  Thanks [@trueadm](https://github.com/trueadm)! - Move native TSRX element
  parsing toward standard JSX AST nodes, add a dedicated `JSXStyleElement` node,
  and cover `---` template fence edge cases.

- [#1199](https://github.com/Ripple-TS/ripple/pull/1199)
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)
  Thanks [@trueadm](https://github.com/trueadm)! - Fix parsing module-scope style
  expressions followed by regular JavaScript statements.

- [#1199](https://github.com/Ripple-TS/ripple/pull/1199)
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)
  Thanks [@trueadm](https://github.com/trueadm)! - Fix native template parsing
  when script-section functions return fragments before a template fence.

- [#1199](https://github.com/Ripple-TS/ripple/pull/1199)
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)
  Thanks [@trueadm](https://github.com/trueadm)! - Preserve spaces between inline
  JSX text and expression children in the parser and formatter.

- [#1199](https://github.com/Ripple-TS/ripple/pull/1199)
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)
  Thanks [@trueadm](https://github.com/trueadm)! - Allow JSX and shared ref helper
  types to accept arrays of ref functions.

- [#1199](https://github.com/Ripple-TS/ripple/pull/1199)
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)
  Thanks [@trueadm](https://github.com/trueadm)! - Remove the stale
  `ScriptContent` AST node typing and dead transform handlers.

- [#1199](https://github.com/Ripple-TS/ripple/pull/1199)
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)
  Thanks [@trueadm](https://github.com/trueadm)! - Fix parsing of a `@{ … }`
  code-block body that follows a function return-type annotation, e.g.
  `function App(): JSX.Element @{}`. The return type was parsed inside
  acorn-typescript while still in type-tokenizer mode, so the trailing `@` threw
  "Unexpected character '@'" before the code block could be recognized. The return
  type is now parsed before the body is inspected, and `@` is tokenized in type
  mode, so typed functions, methods, anonymous function expressions, and generic
  signatures all accept a `@{ … }` body.

- [#1199](https://github.com/Ripple-TS/ripple/pull/1199)
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)
  Thanks [@trueadm](https://github.com/trueadm)! - Prevent TSRX parser hangs when
  JSX switch cases contain elements followed by break statements, and preserve
  dynamic element lowering through Ripple normalization.

- [#1199](https://github.com/Ripple-TS/ripple/pull/1199)
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)
  Thanks [@trueadm](https://github.com/trueadm)! - Fix TSRX parser handling for
  generic function expressions in template setup and parenthesized conditional JSX
  spread attributes.

- [#1199](https://github.com/Ripple-TS/ripple/pull/1199)
  [`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)
  Thanks [@trueadm](https://github.com/trueadm)! - Keep TSRX template replay
  locations aligned so generated TypeScript source maps stay within the source
  document.

## 0.1.21

### Patch Changes

- [#1198](https://github.com/Ripple-TS/ripple/pull/1198)
  [`1de66b8`](https://github.com/Ripple-TS/ripple/commit/1de66b8f851849597b6078dab7af2699e49b0e21)
  Thanks [@trueadm](https://github.com/trueadm)! - Remove the unused namespaced
  TSX island feature and React bridge package.

- [#1189](https://github.com/Ripple-TS/ripple/pull/1189)
  [`e00f596`](https://github.com/Ripple-TS/ripple/commit/e00f5961d5668c054435c8a366ef2a6da6e4a381)
  Thanks [@trueadm](https://github.com/trueadm)! - Restore reactive Solid
  control-flow lowering for native TSRX component bodies.

## 0.1.20

### Patch Changes

- [#1185](https://github.com/Ripple-TS/ripple/pull/1185)
  [`0ea87fb`](https://github.com/Ripple-TS/ripple/commit/0ea87fb3cbef21c3c00d63cc2a1f3c9f34d01c24)
  Thanks [@trueadm](https://github.com/trueadm)! - Remove the reserved `<tsx>`
  expression wrapper and use TSRX fragments as the native expression form.

  Plain `<tsx>` is now treated as an ordinary element. Tooling now uses the
  `TsrxFragment` AST node for native fragments and updates formatting, linting,
  symbols, transforms, and generated docs around the simplified syntax.

## 0.1.19

### Patch Changes

- [#1181](https://github.com/Ripple-TS/ripple/pull/1181)
  [`0574e73`](https://github.com/Ripple-TS/ripple/commit/0574e73830a549f515cef6aa8c0a1e38c79b06cc)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Map style expression
  assignments (`const styles = <style>…</style>`) to their source range in Volar
  type-only output so hovering the `<style>` tags shows intellisense.

- [#1181](https://github.com/Ripple-TS/ripple/pull/1181)
  [`0574e73`](https://github.com/Ripple-TS/ripple/commit/0574e73830a549f515cef6aa8c0a1e38c79b06cc)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Preserve template style
  blocks as embedded CSS regions in Volar type-only output.

## 0.1.18

### Patch Changes

- [`5c0b0ff`](https://github.com/Ripple-TS/ripple/commit/5c0b0ff031ddfb319bb048d627e2d2a2a49c1f1d)
  Thanks [@trueadm](https://github.com/trueadm)! - Add support for reusable style
  element expressions and update React/Preact target behavior.

  Style elements can now be assigned to variables and used as class maps, while
  inline style blocks inside returned TSRX stay scoped to that fragment. React and
  Preact also preserve authored class attributes and handle conditional hooks from
  function component bodies with the new function-based TSRX model.

## 0.1.17

### Patch Changes

- [#1177](https://github.com/Ripple-TS/ripple/pull/1177)
  [`054bd1e`](https://github.com/Ripple-TS/ripple/commit/054bd1e75347e395f6c096f8e293d1baf8e03549)
  Thanks [@trueadm](https://github.com/trueadm)! - Parse tags and bare fragments
  as native TSRX by default, remove `component` keyword parsing, and
  compile/format/lint function components that return native TSRX across the
  React, Preact, Solid, Vue, and Ripple targets. Ripple component compilation now
  only renders TSRX reachable from returned values and supports string and `null`
  component returns.

  Ripple now also preserves directly called PascalCase helpers as ordinary
  functions while still compiling renderable component functions used as
  components or render entries.

  The old explicit TSRX wrapper tag is no longer special; TSRX elements and
  fragments are the default expression syntax, and the tag name is treated like
  any ordinary element name.

  Ripple now exports a typed `Fragment` helper from its public runtimes and
  supports `innerHTML` on both host elements and `Fragment`. Ripple also treats
  `innerHTML` from element spreads as rendered content instead of serializing it
  as an `innerhtml` attribute.

  The `{html ...}` template directive has been removed. Use each target's native
  raw HTML prop instead, such as `innerHTML` for Ripple/Solid/Vue or
  `dangerouslySetInnerHTML` for React/Preact.

  The `{text ...}` template directive has also been removed. Text values now use
  ordinary `{expr}` containers, with explicit coercion written as JavaScript
  (`String(value)`, `value + ''`, or a typed string value). Ripple optimizes
  clearly string-shaped expressions and typed string props into text-node updates
  without requiring a TSRX-specific directive.

## 0.1.16

### Patch Changes

- [#1175](https://github.com/Ripple-TS/ripple/pull/1175)
  [`d045396`](https://github.com/Ripple-TS/ripple/commit/d0453962cfe1df7a98a0981b0bf3e5729195a9ae)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Align prop getter generation
  for JSX-style TSRX expression fragments with native TSRX component templates.
  Reject native dynamic marker syntax on TSX attribute names and inside TSX
  fragments.

## 0.1.15

### Patch Changes

- [#1173](https://github.com/Ripple-TS/ripple/pull/1173)
  [`ea717f2`](https://github.com/Ripple-TS/ripple/commit/ea717f2ac20901aca59946c1cea8066c28a4220c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Preserve comments inside
  destructured typed parameters and type literals during formatting.

- [#1172](https://github.com/Ripple-TS/ripple/pull/1172)
  [`d083ab8`](https://github.com/Ripple-TS/ripple/commit/d083ab8e802259fa6d8b7bf9bb64d4be899848c4)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Add verification-only Volar
  mappings for whole arrow functions.

## 0.1.14

### Patch Changes

- [#1166](https://github.com/Ripple-TS/ripple/pull/1166)
  [`1dc0331`](https://github.com/Ripple-TS/ripple/commit/1dc0331f7b7296545ee459dc31a92057871cbb0d)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Replace all [0] and [1]
  compiled output with `.value` and direct `lazy` Throw runtime errors for direct
  `[0]` and `[1]` access on tracked and derived values. Fix type removal for
  non-tsx paths Remove the public `get` and `set` exports in favor of `.value`
  access. Ignore lazy writes past the tracked tuple length instead of creating
  numeric properties.

- [#1169](https://github.com/Ripple-TS/ripple/pull/1169)
  [`bf1cb96`](https://github.com/Ripple-TS/ripple/commit/bf1cb96f2ea9b325e30f5a051c451f92659d20f9)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Type host `ref={...}`
  attributes, named ref props, and generated ref keys so inline callbacks
  `{ref ...}` receive element-specific JSX types.

  Exclude `returnType` from the compiler types that use typeAnnotation instead due
  to the way `@sveltejs/acorn-typescript` parses them.

## 0.1.13

### Patch Changes

- [#1162](https://github.com/Ripple-TS/ripple/pull/1162)
  [`95c2976`](https://github.com/Ripple-TS/ripple/commit/95c2976b9ec2c20c4160ad13b636c1ed03e863ef)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Allow native TSRX shorthand
  attributes inside `<tsrx>` blocks nested under TSX.

## 0.1.12

### Patch Changes

- [#1156](https://github.com/Ripple-TS/ripple/pull/1156)
  [`2acbbea`](https://github.com/Ripple-TS/ripple/commit/2acbbea9253ac8f516fe0d3a7a38331490e6fd8b)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Transform nested `<tsrx>`
  templates inside TSX expressions instead of preserving invalid `<tsrx>` JSX tags
  in framework output.

- [#1153](https://github.com/Ripple-TS/ripple/pull/1153)
  [`9df9fe3`](https://github.com/Ripple-TS/ripple/commit/9df9fe3a2d26978e69172db84994ac496761cd04)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Parse nested `<tsrx>` islands
  inside `<tsx>` expression containers as native TSRX so setup declarations and
  references keep Volar mappings, and hydrate deeply nested `<tsx>`/`<tsrx>`
  expression values without skipping server markers.

## 0.1.11

### Patch Changes

- [#1145](https://github.com/Ripple-TS/ripple/pull/1145)
  [`0de733f`](https://github.com/Ripple-TS/ripple/commit/0de733f05800df5d3854eb69e012e9aeaf098f8a)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Add Vue Vapor support for
  TSRX `try/pending` by lowering pending blocks to Vue Suspense slots.

## 0.1.10

### Patch Changes

- [#1141](https://github.com/Ripple-TS/ripple/pull/1141)
  [`8c064c8`](https://github.com/Ripple-TS/ripple/commit/8c064c888b60e4fcf88f6828e51792b3bba5797a)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Improve JSX event handler
  typings to infer specific DOM event types. Improve all JSX types for much
  improved typescript support. Mark self-closing JSX tokens as completion-capable
  so empty attribute positions can surface editor completions. Fix no intellisense
  on dom attributes when <style> blocks were present Share scoped CSS selector
  metadata across TSRX targets so class-name definitions work outside Ripple too.
  CMD+click now jumps to class definitions for all tsrx platforms.

## 0.1.9

### Patch Changes

- [#1135](https://github.com/Ripple-TS/ripple/pull/1135)
  [`b1d6de0`](https://github.com/Ripple-TS/ripple/commit/b1d6de05912aca4cf40af68f291851eda706140c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Support sole-child
  `{html ...}` raw HTML lowering for React, Preact, Solid and Vue targets, while
  keeping Ripple's existing child raw HTML behavior unchanged.

## 0.1.8

### Patch Changes

- [`b54fdfc`](https://github.com/Ripple-TS/ripple/commit/b54fdfc3ebfea29ac613307b76732c5bf5f49ab5)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Parse semicolonless `<tsrx>`
  returns inside component callback props.

- [`165703c`](https://github.com/Ripple-TS/ripple/commit/165703c588b52f3dc0d26c06187f21700d448693)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Use esrap 2.2.8 instead of
  carrying a local 2.2.7 patch.

## 0.1.7

### Patch Changes

- [#1126](https://github.com/Ripple-TS/ripple/pull/1126)
  [`2b1f746`](https://github.com/Ripple-TS/ripple/commit/2b1f7469ab31713140a5baf912a19fa8eedb9234)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Keep runtime helper imports
  on namespaced runtime subpaths so production app bundles do not pull in
  compiler-only modules.

- [#1123](https://github.com/Ripple-TS/ripple/pull/1123)
  [`e4a04dd`](https://github.com/Ripple-TS/ripple/commit/e4a04ddb4bbc8e21a9c7c2c65b179d764b72e4fb)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Nested lazy destructuring
  support for all tsrx targets. Ripple already fully supported it.

## 0.1.6

### Patch Changes

- [`a59ccb8`](https://github.com/Ripple-TS/ripple/commit/a59ccb83b91257bf34fca2ba1415e77d1f815a7b)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Republish version with the
  new publish.yaml workflow

## 0.1.5

### Patch Changes

- [#1110](https://github.com/Ripple-TS/ripple/pull/1110)
  [`de27e18`](https://github.com/Ripple-TS/ripple/commit/de27e182d002ea736aee992acca4cbf9873a307d)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Drop the
  continuation/tail-helper lift for hook-bearing `if`, `switch`, `try`, and
  `for-of` blocks in React and Preact output. The pattern existed to forward
  post-hook mutations through to statements after the control-flow construct, but
  the hook-callback-outer-mutation and hook-result-outer-assignment validations
  make those mutations unreachable. The hook-bearing branch is still wrapped in
  its own `StatementBodyHook` helper to satisfy Rules of Hooks; trailing
  statements now stay in the parent component instead of being lifted into a tail
  helper. For-of helpers no longer thread an `_tsrx_isLast_*` prop or emit an
  empty-source fallback. Output is smaller and easier to read with no behavior
  change for valid programs.

- [`59e1e32`](https://github.com/Ripple-TS/ripple/commit/59e1e328607598fe342abbba35f76e5fadb9ca5c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix parsing for
  statement-bodied `<tsrx>` templates used directly as self-closing JSX component
  attribute values.

- [#1116](https://github.com/Ripple-TS/ripple/pull/1116)
  [`1256569`](https://github.com/Ripple-TS/ripple/commit/12565695efaa3a4ad429245807721ea671c2ecb5)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Compile `for ... of` in React
  and Preact components through a new `map_iterable` runtime helper instead of an
  inline `Array.isArray(src) ? src : Array.from(src)` normalization followed by
  `.map(...)`. Both the non-hook and hook-bearing lowerings now emit a single
  `map_iterable(source, (item, i) => ...)` call that accepts any `Iterable` —
  `Set`, `Map`, generators, and other iterators — without copying arrays. The
  helper is imported from a new target-namespaced subpath: `@tsrx/react/runtime`
  for React output and `@tsrx/preact/runtime` for Preact output, both of which
  re-export from `@tsrx/core/runtime`, so end-user projects only need the target
  package installed. Loop-scoped TS types in editor-tooling (non-module-scoped
  helper) output reference the new `IterationValue<T>` helper so destructured
  `Map` entries and other non-array sources type-check correctly.

- [#1116](https://github.com/Ripple-TS/ripple/pull/1116)
  [`1256569`](https://github.com/Ripple-TS/ripple/commit/12565695efaa3a4ad429245807721ea671c2ecb5)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Allow native TSRX template
  expression containers to recover from a trailing semicolon before the closing
  brace while reporting an editor diagnostic.

- [#1112](https://github.com/Ripple-TS/ripple/pull/1112)
  [`18b4aef`](https://github.com/Ripple-TS/ripple/commit/18b4aefa8127e56a9f1b3058da2d4d2172551579)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Support JavaScript `switch`
  fall-through semantics in component templates across the React, Preact, Solid,
  and Vue targets. When a `case` body has no `break` (or terminal `return`), each
  entry case now renders its own body plus every downstream body it would have
  fallen into — matching JS spec and the existing Ripple runtime behavior.

  All four targets reuse the same `create_hook_safe_helper` lift that hook-bearing
  case bodies already go through, orchestrated by a shared `plan_switch_lift`
  planner exported from `@tsrx/core`. Any case body that appears in more than one
  arm after fall-through analysis is hoisted into its own `StatementBodyHook`
  helper component, and each upstream arm chains into the next helper at the end
  of its body. Each case body therefore appears exactly once in the generated
  module regardless of how many arms reach it, keeping bundle size linear in case
  count and source mappings 1:1 for editor IntelliSense. Cases that terminate with
  `break` (or aren't reached via fall-through) stay inline as before.
  - **React, Preact, Vue** keep the JS `switch` and emit case arms that
    `return <Helper/>` for lifted bodies; inline arms append `<NextHelper/>` as
    the chain entry point.
  - **Solid** lowers each entry case to a `<Match>` whose body is the lifted
    helper element, or for inline arms a fragment of the inline JSX plus a chain
    `<NextHelper/>`.

  Vue's and Solid's client transforms now hoist all `StatementBodyHook` helpers —
  not just the fall-through ones — to module scope (Vue wraps each in
  `defineVaporComponent`). Every control flow that already went through the lift
  on React (hook-bearing `if`, `switch`, `try`, and `for-of` bodies) now produces
  a single top-level helper instead of a per-render lazy initializer.
  `compile_to_volar_mappings` opts back out via
  `moduleScopedHookComponents: false` so Volar's virtual TSX keeps helpers local —
  closure-captured bindings stay resolvable against the component body for type
  checking.

  Create map helper functions for for-of loops to be used in the future transforms

## 0.1.4

### Patch Changes

- [#1104](https://github.com/Ripple-TS/ripple/pull/1104)
  [`3e84758`](https://github.com/Ripple-TS/ripple/commit/3e847588027d6254c3999a87c717e9d58fb55a26)
  Thanks [@trueadm](https://github.com/trueadm)! - Tighten hook outer-binding
  validator around `for…of`:
  - A non-declaration target (`for (x of items)`) was being treated as a local
    declaration, hiding later hook-result assignments to the same outer binding.
  - `let`/`const` declared by a for-of (`for (const x of items)`) was likewise
    being added to the _enclosing_ block's shadowed set, even though the binding
    is scoped to the loop in JavaScript. This let after-loop assignments to a
    same-named outer binding (e.g.,
    `for (const x of items) { … } [x] = useState(0)`) escape detection.
    Loop-declared names are now scoped to the body sub-tree only.
  - The for-of's own iteration assignment was not inspected at all, so iterating a
    hook-derived value into an outer binding (e.g., `for (x of useState(0))` or
    `for ([a, b] of [useState(0)])`) silently lost the rebind in the emitted code.

  All three shapes now report the same diagnostic as a direct hook-result
  assignment to an outer binding.

- [#1104](https://github.com/Ripple-TS/ripple/pull/1104)
  [`3e84758`](https://github.com/Ripple-TS/ripple/commit/3e847588027d6254c3999a87c717e9d58fb55a26)
  Thanks [@trueadm](https://github.com/trueadm)! - Constrain React and Preact hook
  isolation so hook results cannot cross generated hook component boundaries,
  reject hook callbacks that mutate parent-scope bindings across those boundaries,
  and keep hook-bearing `<tsrx>` expressions in regular functions behind stable
  helper components.

- [#1105](https://github.com/Ripple-TS/ripple/pull/1105)
  [`509170b`](https://github.com/Ripple-TS/ripple/commit/509170ba3cecc611ba1798575c70555070665736)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix parsing native TSRX
  statements before later JavaScript statements inside JSX attribute callbacks.

## 0.1.3

### Patch Changes

- [#1103](https://github.com/Ripple-TS/ripple/pull/1103)
  [`5a59d73`](https://github.com/Ripple-TS/ripple/commit/5a59d73daf60b2652c86ffad2a4eaf3d801e40d7)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Parse statement-position
  `<tsrx>` templates inside nested functions in JSX attribute objects.

- [#1099](https://github.com/Ripple-TS/ripple/pull/1099)
  [`4f360f0`](https://github.com/Ripple-TS/ripple/commit/4f360f008edf61492cf85afa646c797c80a73f22)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Keep explicit return values
  in expression-position `<tsrx>` templates out of render control-flow lowering.

- [#1102](https://github.com/Ripple-TS/ripple/pull/1102)
  [`c042672`](https://github.com/Ripple-TS/ripple/commit/c04267255d35945753ca8090006622c96fa0a14f)
  Thanks [@trueadm](https://github.com/trueadm)! - Allow empty `pending {}` blocks
  in component try statements to render a null fallback.

- [#1098](https://github.com/Ripple-TS/ripple/pull/1098)
  [`a9d640f`](https://github.com/Ripple-TS/ripple/commit/a9d640f0728996b3f21b452ffe6040e54d82609c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Keep special fragment return
  values inside component-local functions attached to their return statements.

- [#1103](https://github.com/Ripple-TS/ripple/pull/1103)
  [`5a59d73`](https://github.com/Ripple-TS/ripple/commit/5a59d73daf60b2652c86ffad2a4eaf3d801e40d7)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Parser fix for fragment
  expression values inside JSX attribute objects/arrays. Previously the leaked
  `tc_expr, b_stat` token contexts after a fragment caused the next entry's `<` to
  be tokenized as a TS relational operator instead of `jsxTagStart`. Affected
  shapes:
  - `params={{ list: [<>A</>, <>B</>] }}` (multi-fragment array as object
    property)
  - `params={{ a: <>X</>, b: ... }}` (fragment as object property followed by
    another property)
  - `params={{ list: [<><span>A</span></>, <><span>B</span></>] }}` (same shapes
    with fragments containing child elements)

- [#1101](https://github.com/Ripple-TS/ripple/pull/1101)
  [`2ae792c`](https://github.com/Ripple-TS/ripple/commit/2ae792cdca7d466e552a330ea965cefec2b1f5a5)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Preserve JSX parser state for
  semicolon-free native TSRX returns inside callback props.

- [#1095](https://github.com/Ripple-TS/ripple/pull/1095)
  [`96360f3`](https://github.com/Ripple-TS/ripple/commit/96360f36306180e67ce69e464dd545773e57e8b1)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Parser fix for <tsrx> -
  cleans up the pending token context for }, ), ], plus the callback-return case:
  parenthesized: content={(<tsrx>...</tsrx>)} passed as a call arg:
  content={wrap(<tsrx>...</tsrx>)} used as an object property:
  content={{ child: <tsrx>...</tsrx> }}

## 0.1.2

### Patch Changes

- [#1092](https://github.com/Ripple-TS/ripple/pull/1092)
  [`2010290`](https://github.com/Ripple-TS/ripple/commit/20102904d68951b47dce3958f88ddd1fc150e7a1)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix parsing inline `<tsrx>`
  template fragments inside JSX attribute expression values.

## 0.1.1

### Patch Changes

- [`0fdf340`](https://github.com/Ripple-TS/ripple/commit/0fdf3408417a7565a00304b766e958b438b3c834)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Keep sibling children in
  `<tsrx>`, `<tsx>`, and shorthand `<>` fragments on separate formatted lines and
  avoid stale JSX tokenizer state at EOF after compact `<tsrx>` expressions.

## 0.1.0

### Minor Changes

- [#1088](https://github.com/Ripple-TS/ripple/pull/1088)
  [`2a85e9b`](https://github.com/Ripple-TS/ripple/commit/2a85e9bb73f4d82f2bd2273c33735b4dc7b82d5f)
  Thanks [@trueadm](https://github.com/trueadm)! - Add `<tsrx>...</tsrx>`
  expression fragments for inline native TSRX template values.

## 0.0.28

### Patch Changes

- [#1071](https://github.com/Ripple-TS/ripple/pull/1071)
  [`b54a72f`](https://github.com/Ripple-TS/ripple/commit/b54a72f721adb5f08a5bf3e3d006780b7e1eb471)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Add named ref props with
  `prop_name={ref expr}` syntax and expose `isRefProp()` for runtime detection of
  named ref prop values.

- [#1071](https://github.com/Ripple-TS/ripple/pull/1071)
  [`b54a72f`](https://github.com/Ripple-TS/ripple/commit/b54a72f721adb5f08a5bf3e3d006780b7e1eb471)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Import ref helpers only when
  their generated calls are emitted.

- [#1071](https://github.com/Ripple-TS/ripple/pull/1071)
  [`b54a72f`](https://github.com/Ripple-TS/ripple/commit/b54a72f721adb5f08a5bf3e3d006780b7e1eb471)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Declare normalized host
  spread refs emitted from TSX expression blocks.

## 0.0.27

### Patch Changes

- [#1064](https://github.com/Ripple-TS/ripple/pull/1064)
  [`eae7b40`](https://github.com/Ripple-TS/ripple/commit/eae7b4047f4d8cc7a0278fb48ffe630d73a592c6)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Reject component declarations
  with more than one parameter. Previously, JSX targets passed extra parameters
  straight through into the generated function and ripple silently dropped them.
  Multi-parameter components now error in regular compile and are surfaced as
  collected diagnostics in the Volar editor pipeline.

- [#1061](https://github.com/Ripple-TS/ripple/pull/1061)
  [`29ac6d7`](https://github.com/Ripple-TS/ripple/commit/29ac6d757b376e4102c4c8c8d3d47f7ae3afdd00)
  Thanks [@trueadm](https://github.com/trueadm)! - Fix lone expression children
  inside fragment shorthand so they render from component, branch, and loop
  bodies.

- [#1057](https://github.com/Ripple-TS/ripple/pull/1057)
  [`b34b95a`](https://github.com/Ripple-TS/ripple/commit/b34b95a808ec801109d1818f4d24ae0bbc00f66b)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Enforces a stricter rule for
  components declared inside classes: they must be arrow-function class properties
  (including static), and class component foo() {} method-style declarations are
  no longer supported.

  Removes component method declarations support in favor of using as properties.

- [#1054](https://github.com/Ripple-TS/ripple/pull/1054)
  [`cf60dba`](https://github.com/Ripple-TS/ripple/commit/cf60dbaf9c6be84d6e95f9c5d66b64d8927494c9)
  Thanks [@trueadm](https://github.com/trueadm)! - Emit React hook-isolation
  branch helpers as module-scope components without synthetic `any` prop
  annotations, while preserving lexical helper prop types for editor tooling.

- [#1066](https://github.com/Ripple-TS/ripple/pull/1066)
  [`4cd0986`](https://github.com/Ripple-TS/ripple/commit/4cd0986201e960cd8544d0f789d17a217e93f954)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Introduces a typeOnly flag to
  transformers to compile for either production or editor support.

  Lazy transformations for typeOnly are not skipped, only the & is removed to make
  it look like a regular destructure.

- [#1063](https://github.com/Ripple-TS/ripple/pull/1063)
  [`a960343`](https://github.com/Ripple-TS/ripple/commit/a960343169aee906162211c502b6cc6b74e2a124)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Standardizes compile api
  across all packages, including forcing types to adhere to the standard. Adds
  more debug compile options to the playgrounds.

## 0.0.26

### Patch Changes

- [#1055](https://github.com/Ripple-TS/ripple/pull/1055)
  [`8125c73`](https://github.com/Ripple-TS/ripple/commit/8125c73b37e7b201dbb0a078e3583c022ceb7687)
  Thanks [@trueadm](https://github.com/trueadm)! - Capture repeated static JSX
  before multiple React and Preact early-return guards to avoid duplicated output.

## 0.0.25

### Patch Changes

- [#1047](https://github.com/Ripple-TS/ripple/pull/1047)
  [`d1acf12`](https://github.com/Ripple-TS/ripple/commit/d1acf129cdd0bf2ee596dbab26ec4df829a33880)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Support arrow syntax for
  anonymous component expressions and preserve anonymous component
  function-vs-arrow source form across TSRX and Ripple targets.

- [#1047](https://github.com/Ripple-TS/ripple/pull/1047)
  [`d1acf12`](https://github.com/Ripple-TS/ripple/commit/d1acf129cdd0bf2ee596dbab26ec4df829a33880)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Removes duplicate utils,
  moves most utils to @tsrx/core, include their tests.

  Fixes some types

- [#1050](https://github.com/Ripple-TS/ripple/pull/1050)
  [`3928ac8`](https://github.com/Ripple-TS/ripple/commit/3928ac8816399f9eccfd40081d480042a9d74030)
  Thanks [@trueadm](https://github.com/trueadm)! - Parse direct double-quoted text
  in bare if/else branches and backtick-delimited fragment text as renderable
  template text.

## 0.0.24

### Patch Changes

- [#1042](https://github.com/Ripple-TS/ripple/pull/1042)
  [`f5a3c1b`](https://github.com/Ripple-TS/ripple/commit/f5a3c1b9e915c250c8cd1a7dcf4e80c44abe720f)
  Thanks [@trueadm](https://github.com/trueadm)! - Align component loop
  control-flow validation across TSRX targets and allow `continue` to skip
  `for...of` iterations.

- [#1042](https://github.com/Ripple-TS/ripple/pull/1042)
  [`f5a3c1b`](https://github.com/Ripple-TS/ripple/commit/f5a3c1b9e915c250c8cd1a7dcf4e80c44abe720f)
  Thanks [@trueadm](https://github.com/trueadm)! - Fix parsing for text-only
  `<>...</>` fragment initializers before TSRX expression children.

## 0.0.23

### Patch Changes

- [#1040](https://github.com/Ripple-TS/ripple/pull/1040)
  [`3b2eae2`](https://github.com/Ripple-TS/ripple/commit/3b2eae24dc955325a0379c4773631796865e0f38)
  Thanks [@trueadm](https://github.com/trueadm)! - Parse indented direct
  double-quoted TSRX text children as text nodes.

- [#1035](https://github.com/Ripple-TS/ripple/pull/1035)
  [`5c6ee71`](https://github.com/Ripple-TS/ripple/commit/5c6ee71bfd4f5dc443c43eb34e631bb032606faf)
  Thanks [@trueadm](https://github.com/trueadm)! - Replace the removed
  `#style.class` syntax with the `{style "class"}` attribute value directive.

- [#1036](https://github.com/Ripple-TS/ripple/pull/1036)
  [`83b19fd`](https://github.com/Ripple-TS/ripple/commit/83b19fd67aa27eb10e93205dd88c61b13ffbc523)
  Thanks [@trueadm](https://github.com/trueadm)! - Replace Ripple `#server` blocks
  with proposal-aligned `module server` declarations and imports from `server`.
  Preserve Volar mappings for submodule import identifiers after Ripple lowers
  server imports.

## 0.0.22

### Patch Changes

- [#1031](https://github.com/Ripple-TS/ripple/pull/1031)
  [`b4cc83f`](https://github.com/Ripple-TS/ripple/commit/b4cc83f07d8777d5882d1e853493941a3f6224ae)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Preserve generic type
  arguments on JSX component tags (e.g. `<RenderProp<User>>`). They were being
  silently dropped during prettier formatting, during the tsrx → JSX compile
  output for React/Preact/Solid/Vue, and in Ripple's `to_ts` virtual-code output
  used by the language server for typechecking.

## 0.0.21

### Patch Changes

- [#1025](https://github.com/Ripple-TS/ripple/pull/1025)
  [`76fd362`](https://github.com/Ripple-TS/ripple/commit/76fd3622f3e6432787fadb1a96337541424b25aa)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fixes a bug where for all
  control statements: for, if, switch, try/pending/catch where using hooks inside
  to change values, like useState, would not be reflected in the subsequent code.
  The fix involved creating continuation hooks and calling them at the end of the
  control flow block - it's an oversimplification.

  Fixes the for loop by hoisting the generated statement body hooks and types to
  the outside of the loop.

  Refactors a bunch, but not all, manually created AST nodes into using ast
  builder functions.

## 0.0.20

### Patch Changes

- [#1014](https://github.com/Ripple-TS/ripple/pull/1014)
  [`31193f2`](https://github.com/Ripple-TS/ripple/commit/31193f23aa6b6b5b79cd858f57e8aca69cd44b6d)
  Thanks [@trueadm](https://github.com/trueadm)! - Add a `collect` compile option
  for collecting diagnostics and comments without enabling loose markup recovery.

- [#1014](https://github.com/Ripple-TS/ripple/pull/1014)
  [`31193f2`](https://github.com/Ripple-TS/ripple/commit/31193f23aa6b6b5b79cd858f57e8aca69cd44b6d)
  Thanks [@trueadm](https://github.com/trueadm)! - Add diagnostic codes to
  selected compiler errors and expose them through MCP compile and analyze
  results.

## 0.0.19

### Patch Changes

- [#1009](https://github.com/Ripple-TS/ripple/pull/1009)
  [`7832be8`](https://github.com/Ripple-TS/ripple/commit/7832be8d1d2937e7f1005ab79e964329d42e0108)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Stop emitting a duplicate
  source mapping for the synthesized attribute name when shorthand JSX attributes
  (`<X {count} />`) are expanded to longhand (`<X count={count} />`). The
  generated `count=` does not exist in the source, so it should not carry a source
  mapping; previously editors showed duplicate hover/intellisense popups on the
  same `{count}` span.

- [#1009](https://github.com/Ripple-TS/ripple/pull/1009)
  [`7832be8`](https://github.com/Ripple-TS/ripple/commit/7832be8d1d2937e7f1005ab79e964329d42e0108)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Collect transform-time errors
  instead of throwing in loose mode for the JSX targets (React, Preact, Solid,
  Vue). Recoverable validation failures (component `await` without `"use server"`,
  `<tsx:kind>` mismatches, multiple `ref={...}` attributes, malformed `try`
  blocks, fragment-as-element, `for await...of`) now push onto `result.errors` so
  the typescript-plugin and other editor tooling can surface them as diagnostics
  on top of a still-valid virtual TSX, mirroring how `@tsrx/ripple` already
  behaves.

- [#1009](https://github.com/Ripple-TS/ripple/pull/1009)
  [`7832be8`](https://github.com/Ripple-TS/ripple/commit/7832be8d1d2937e7f1005ab79e964329d42e0108)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Add type declarations for the
  `./merge-refs` and `./error-boundary` subpath exports of `@tsrx/react`,
  `@tsrx/preact`, and `@tsrx/vue`, and for `@tsrx/core/runtime/merge-refs`.
  Previously these subpaths only declared a `default` export, so under
  `node16`/`nodenext`/`bundler` resolution TypeScript could not pick up types for
  `import { mergeRefs } from '@tsrx/react/merge-refs'` or the `TsrxErrorBoundary`
  re-exports.

## 0.0.18

### Patch Changes

- [#1007](https://github.com/Ripple-TS/ripple/pull/1007)
  [`088299c`](https://github.com/Ripple-TS/ripple/commit/088299ce94a6022c017ce2e56c7e1b59bd5973f7)
  Thanks [@trueadm](https://github.com/trueadm)! - Keep double-quoted JavaScript
  strings inside TSRX expression containers using normal JavaScript string
  semantics while preserving direct double-quoted text child parsing.

- [#994](https://github.com/Ripple-TS/ripple/pull/994)
  [`bce43be`](https://github.com/Ripple-TS/ripple/commit/bce43be304812ca04dd8d196e2439f28ea392237)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Compile-time merge for
  multiple ref expressions, plus a diagnostic for duplicate `ref={...}`
  attributes.

  **New rule**: an element may have at most one TSX-style `ref={...}` attribute.
  Multiple `ref={...}` on the same element is now a compile error — they would
  otherwise produce duplicate JSX props (last-wins at runtime, can't be typed
  cleanly). The error suggests the supported alternative.

  **Multiple `{ref expr}` keyword-form refs are still supported and merge into one
  ref**:
  - `@tsrx/react`, `@tsrx/preact`, and `@tsrx/vue` emit
    `ref={mergeRefs(a, b, ...)}`, importing the shared `mergeRefs` helper from
    `@tsrx/react/merge-refs`, `@tsrx/preact/merge-refs`, and
    `@tsrx/vue/merge-refs` respectively. The helper supports function refs,
    React-style `{ current }` ref objects, and Vue-style `{ value }` ref objects
    (e.g. from `ref()` / `useTemplateRef()`), and composes React 19 cleanup return
    values.
  - `@tsrx/solid` emits `ref={[a, b, ...]}`, which Solid's runtime iterates
    natively.

  A single `ref={...}` may be combined with any number of `{ref expr}` on the same
  element — they all merge together. Single-ref elements (either syntax) emit
  unchanged with no helper import.

  `@tsrx/vue` previously merged multiple `{ref expr}` into an inline arrow
  callback that only worked for function refs. Vue now uses the shared `mergeRefs`
  helper, which fixes Vue ref-object handling (`ref()` / `useTemplateRef()`) and
  the previously-broken combo case (`<el ref={a} {ref b} />`).

## 0.0.17

### Patch Changes

- [#1002](https://github.com/Ripple-TS/ripple/pull/1002)
  [`c631ab0`](https://github.com/Ripple-TS/ripple/commit/c631ab0076b7e2cb30f4998101b54c3a86e78c61)
  Thanks [@trueadm](https://github.com/trueadm)! - Align direct double-quoted TSRX
  text children with quoted JSX attribute text by decoding character references
  and treating backslashes as literal text. Preserve the direct quoted form in the
  Prettier plugin and highlight it as JSX text in the TextMate grammar.

## 0.0.16

### Patch Changes

- [#949](https://github.com/Ripple-TS/ripple/pull/949)
  [`f660969`](https://github.com/Ripple-TS/ripple/commit/f66096972bc8d2f03061e6018d03e40207761aaa)
  Thanks [@trueadm](https://github.com/trueadm)! - Fix Vue early-return lowering
  so continuation-local refs stay stable across parent updates.

  Also make `if (cond) return;` early returns in Vue components reactive after
  mount. Previously the early return was emitted as a setup-time `if` block, which
  only evaluated `cond` once when `setup()` ran and never again — so flipping the
  condition after mount didn't toggle the continuation.

  The lowering now picks one of two paths based on the continuation:
  - **Pure JSX continuation** — inlined as a render-time ternary
    (`cond ? null : <continuation/>`). Cheapest path, no extra component.
  - **Continuation with setup-time statements** (`provide`, `watch`,
    `watchEffect`, declarations, plain function calls, etc.) — moved into a
    `StatementBodyHook` helper component whose setup runs only when the helper
    mounts. This keeps those statements scoped to the continuation's lifecycle so
    e.g. `provide` is only visible to descendants while the continuation is
    active.

  React, Preact, and Solid lowering is unchanged: their bodies re-run on every
  render, so the existing setup-time `if` already behaves reactively.

## 0.0.15

### Patch Changes

- [#987](https://github.com/Ripple-TS/ripple/pull/987)
  [`0ad85f1`](https://github.com/Ripple-TS/ripple/commit/0ad85f1107ce9bddb72cee44b908a34c5264c0b5)
  Thanks [@trueadm](https://github.com/trueadm)! - Allow direct double-quoted
  static text children in TSRX templates.

- [`7684132`](https://github.com/Ripple-TS/ripple/commit/7684132ed71db6c550ecbe1c623975ddbed96be5)
  Thanks [@aleclarson](https://github.com/aleclarson)! - Fix Volar source mappings
  for switch statements and sparse generic spans.

## 0.0.14

### Patch Changes

- [#985](https://github.com/Ripple-TS/ripple/pull/985)
  [`cf4f06e`](https://github.com/Ripple-TS/ripple/commit/cf4f06e8bcbb41f863d047dfaa6d9d17ed212163)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Allow empty `<tsx></tsx>` and
  `<></>` fragments. The parser previously failed with "Unterminated regular
  expression" because `exprAllowed` leaked out of the template-body loop and
  caused the closing tag's `/` to be tokenized as a regex literal.

- [#982](https://github.com/Ripple-TS/ripple/pull/982)
  [`fcd25aa`](https://github.com/Ripple-TS/ripple/commit/fcd25aa549db0d56ccbd596b657b856a5061e20f)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Reject return statements with
  values in component bodies for React, Preact, and Solid TSRX targets.

- [#971](https://github.com/Ripple-TS/ripple/pull/971)
  [`30126c7`](https://github.com/Ripple-TS/ripple/commit/30126c753c3a08809bacd07c8cf2eca84e8f8cbb)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Extract early-return
  continuations into typed cached helpers and type generated hook-helper props
  from branch-local aliases.

- [#986](https://github.com/Ripple-TS/ripple/pull/986)
  [`b8cd7c4`](https://github.com/Ripple-TS/ripple/commit/b8cd7c4195505976995033a8e369502996f345ad)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Improve lazy destructuring
  editor support for TSX targets, including typed virtual params, hover display
  rewrites, and loose-mode diagnostics for duplicate lazy parameter names.

- [#986](https://github.com/Ripple-TS/ripple/pull/986)
  [`b8cd7c4`](https://github.com/Ripple-TS/ripple/commit/b8cd7c4195505976995033a8e369502996f345ad)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Improve editor support for
  lazy object params by emitting object-shaped virtual TSX annotations for untyped
  params and preserving source mappings for lazy property reads.

- [#983](https://github.com/Ripple-TS/ripple/pull/983)
  [`3ddb1a9`](https://github.com/Ripple-TS/ripple/commit/3ddb1a92ffeb48a7d47c445b929b982a2b96e123)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Parse JavaScript statement
  blocks normally inside functions declared within component bodies.

- [#984](https://github.com/Ripple-TS/ripple/pull/984)
  [`fee8620`](https://github.com/Ripple-TS/ripple/commit/fee8620fa4e82a7c7e4adb3e434e9db552a3e157)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Preserve component type
  parameters when lowering generic TSRX components to generated functions.

- [#976](https://github.com/Ripple-TS/ripple/pull/976)
  [`2fcacb4`](https://github.com/Ripple-TS/ripple/commit/2fcacb471d7780074f92b20c9b394f7650a941bb)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Preserve optional markers on
  tuple members and TypeScript function parameters in generated TSX output.

## 0.0.13

### Patch Changes

- [`a9f706d`](https://github.com/Ripple-TS/ripple/commit/a9f706d6626dc1a9e8505d9ea8f16989b2b024b3)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix Volar source mappings for
  extracted JSX hook helpers so component-scope declarations keep their inferred
  editor types.

- [#961](https://github.com/Ripple-TS/ripple/pull/961)
  [`3e07109`](https://github.com/Ripple-TS/ripple/commit/3e071098508449158fa11f2ae48c912d4d673b68)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix ArrayPattern source map
  visitor, various type fixes for tests: ripple, vite-plugin-react,
  vite-plugin-solid

- [#963](https://github.com/Ripple-TS/ripple/pull/963)
  [`112cfd9`](https://github.com/Ripple-TS/ripple/commit/112cfd9fbfd4412efea543abc55deceb186cf351)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Preserve JSX spread
  attributes inside explicit `<tsx>` blocks.

## 0.0.12

### Patch Changes

- [#945](https://github.com/Ripple-TS/ripple/pull/945)
  [`ea56fa0`](https://github.com/Ripple-TS/ripple/commit/ea56fa021798afe8621699d11b7e1d9e675cbfb4)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fixes ForOfStatement source
  maps

## 0.0.11

### Patch Changes

- [#938](https://github.com/Ripple-TS/ripple/pull/938)
  [`7529e1f`](https://github.com/Ripple-TS/ripple/commit/7529e1fe3f0870319bd3399501fd2eb43c516065)
  Thanks [@trueadm](https://github.com/trueadm)! - Fix source-map and Volar
  mapping coverage for one-line early-return `if` statements in shared JSX
  transforms, including plain functions and class-like method bodies.

## 0.0.10

### Patch Changes

- [`7f59ed8`](https://github.com/Ripple-TS/ripple/commit/7f59ed80d7b44c847fb9eb8bf00d4fe9835c3136)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Replace `node:crypto` usage
  in the compiler with a pure-JS implementation so Ripple can be compiled inside
  browser workers (e.g. the Monaco-based playground) where `crypto.createHash` is
  not available.

  The hashing utility is split into two functions:
  - `simple_hash` — fast non-cryptographic djb2 (base36). Used for CSS class-name
    prefixes and runtime `{html}` hydration markers where the input is user
    content and the output multiplies across the shipped bundle.
  - `strong_hash` — preimage-resistant SHA-256 prefix (pure-JS via
    `@noble/hashes`). Used everywhere a hash is derived from a server-only
    filesystem path (`#server` RPC ids, `track`/`trackAsync` ids, head-element
    hydration markers) so the hash can't be inverted to reveal the original path.

  The runtime `ripple` package no longer ships its own `hashing.js` — it
  re-exports `simple_hash`/`strong_hash` from `@tsrx/core`, and the compiler emits
  `_$_.simple_hash` (previously `_$_.hash`) for dynamic `{html}` hydration
  markers.

## 0.0.9

### Patch Changes

- [#931](https://github.com/Ripple-TS/ripple/pull/931)
  [`4543794`](https://github.com/Ripple-TS/ripple/commit/45437944a99decfb4bc56f7171772614a7f5691a)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Extract JSX-emitting targets
  into a shared `createJsxTransform` factory in `@tsrx/core`; React, Preact, and
  Solid now plug in via a `JsxPlatform` descriptor so source-mapping fixes
  propagate to all three targets.
  - `@tsrx/core` adds the `createJsxTransform` factory, `JsxPlatform` /
    `JsxPlatformHooks` / `JsxTransformResult` types, and a shared test harness at
    `@tsrx/core/test-harness/source-mappings`. The source-map segments walker now
    handles `TSTypePredicate` and uses strict mapping lookups throughout.
  - `compile_to_volar_mappings` no longer crashes on common AST shapes across all
    three targets: `NewExpression`, `ReturnStatement`, `ForStatement` /
    `ForInStatement`, `TemplateLiteral`, `TaggedTemplateExpression`,
    `AwaitExpression`, computed `MemberExpression`, empty / non-empty
    `ObjectExpression`, class methods (including async, get / set, static) and
    object method shorthand, TS generics, type predicates (`x is T` and
    `asserts x is T`), as-expressions, union / array type annotations,
    self-closing JSX, element attribute spread, and `JSXExpressionContainer`
    inside `<tsx>` blocks.
  - `<tsx>` / `<>` single-child unwrapping is now JSX-context-aware:
    `return <tsx>{'x'}</tsx>` compiles to `return 'x';` rather than invalid
    `return {'x'};`, while `<b><>{111}</></b>` still preserves the inner `{111}`
    container.
  - Class methods no longer crash source-map collection (every function-like node
    gets `metadata` defaulted).

- [#931](https://github.com/Ripple-TS/ripple/pull/931)
  [`4543794`](https://github.com/Ripple-TS/ripple/commit/45437944a99decfb4bc56f7171772614a7f5691a)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Fix scoped CSS application
  for elements rendered inside `<tsx>...</tsx>` and bare `<>...</>` fragment
  shorthand so they receive the same hash-based classes as regular template
  elements.

## 0.0.8

### Patch Changes

- [#923](https://github.com/Ripple-TS/ripple/pull/923)
  [`4292598`](https://github.com/Ripple-TS/ripple/commit/42925982e88f48f0af6cc74deeaa3c17bc6657cf)
  Thanks [@RazinShafayet2007](https://github.com/RazinShafayet2007)! - fix:
  preserve Volar mappings for explicit call type arguments

- [#919](https://github.com/Ripple-TS/ripple/pull/919)
  [`e4b5555`](https://github.com/Ripple-TS/ripple/commit/e4b5555fb5b1651a2bf1bf232565c7e0e40213b8)
  Thanks [@trueadm](https://github.com/trueadm)! - Allow bare `<>...</>` fragments
  everywhere TSRX accepts `<tsx>...</tsx>`, including template bodies and
  expression position. The shorthand now compiles across Ripple, React, Preact,
  and Solid targets, while the explicit `<tsx>...</tsx>` form remains supported.

## 0.0.7

### Patch Changes

- [#899](https://github.com/Ripple-TS/ripple/pull/899)
  [`fab49f7`](https://github.com/Ripple-TS/ripple/commit/fab49f7da8ec13c981f1c7b3102703d0c349fc1e)
  Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Lift the JSX
  hoist-safety predicates (`isStaticLiteral`, `isHoistSafeExpression`,
  `isHoistSafeJsxChild`, `isHoistSafeJsxAttribute`, `isHoistSafeJsxNode`) into
  `@tsrx/core`. `@tsrx/react` and `@tsrx/preact` now share a single
  implementation, so future targets (and bug fixes) no longer need to duplicate
  the logic.

## 0.0.6

### Patch Changes

- [#906](https://github.com/Ripple-TS/ripple/pull/906)
  [`e9da9cb`](https://github.com/Ripple-TS/ripple/commit/e9da9cbdd42c28f129ee643366c06f8779b8f931)
  Thanks [@trueadm](https://github.com/trueadm)! - Fix parser handling of
  line-start `<` comparisons inside template statement element children so they
  are not misparsed as JSX tags.

## 0.0.5

### Patch Changes

- [#893](https://github.com/Ripple-TS/ripple/pull/893)
  [`d027c6c`](https://github.com/Ripple-TS/ripple/commit/d027c6c84fd3ba7c577c52b9fdade77e7ff886e0)
  Thanks [@trueadm](https://github.com/trueadm)! - Fix parser crash when a JS
  statement inside an element template body has no trailing whitespace before the
  closing tag (e.g. `<ul>var a = "123"</ul>`). The tokenizer previously misread
  `</` as a less-than operator followed by a regexp.

## 0.0.4

### Patch Changes

- [`7f98c10`](https://github.com/Ripple-TS/ripple/commit/7f98c1039f52a56135672b0f9b476af280c81f03)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Test CI release

## 0.0.3

### Patch Changes

- [`030ff45`](https://github.com/Ripple-TS/ripple/commit/030ff45bc3020cd1b6e1a914fc58af7c8a0e5af1)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Test auto publishing on CI

## 0.0.2

### Patch Changes

- [#866](https://github.com/Ripple-TS/ripple/pull/866)
  [`228f1bb`](https://github.com/Ripple-TS/ripple/commit/228f1bb36cd3e8506c422ed0997164bf5a0b5fe2)
  Thanks [@trueadm](https://github.com/trueadm)! - Extract compiler into
  `@tsrx/core` and `@tsrx/ripple` packages
  - `@tsrx/core`: Core compiler infrastructure — parser factory, scope management,
    utilities, constants, and type definitions
  - `@tsrx/ripple`: Ripple-specific compiler — RipplePlugin, analyze,
    client/server transforms
  - Remove compiler source code from `ripple` package (consumers should use
    `@tsrx/ripple`)
  - Migrate eslint-plugin type imports to `@tsrx/core/types/*`
  - Remove unused compiler dependencies from `ripple` package
