# @tsrx/core

## 0.5.0

### Minor Changes

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
  `<\/script`. A body of only whitespace outputs an empty script, as the formatter
  prints it.

  The formatter formats a script body from `content`, and the TypeScript plugin's
  fallback for a file that doesn't compile ends a body where the parser does.

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

### Patch Changes

- [#530](https://github.com/tsrx-org/tsrx/pull/530)
  [`1b3bbe5`](https://github.com/tsrx-org/tsrx/commit/1b3bbe5722dec196f54632e768a920904581568a)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Comments keep the places
  Prettier gives them in five more spots:

  - A block comment with code on both sides of it on one line follows Prettier's
    tie-break: it leads the node after it when only whitespace or `(` sits between
    them, and trails the node before it otherwise. A comment between a tag and its
    template leads the template, which prints a space before it
    (`` tag /* c */ `x` ``), one after the comma of a sequence stays there
    (`(a, /* c */ b)`), one before a type annotation's colon stays before it
    (`x /* c */ : T` on a class property or rest element), and one between a
    default import and the `{` of the named ones trails the default import
    (`import d /* c */, { a }`).
  - An own-line comment in a default value (`a = (\n  // c\n  1\n)`) moves before
    the parameter or property, and one at the end of the line after the `=` trails
    the name before it. It used to stay after the `=`, with the value on the next
    line. In a parameter property, it moves before the modifier.
  - A comment after an arrow function's element body, in the parentheses around
    it, stays inside them instead of moving after the statement.
  - A comment between a parameter list's `)` and the return type stays there in
    function types and TypeScript signatures, and one at the end of that line in a
    function trails the last parameter. A comment in empty parameter parentheses
    stays in them when a return type follows, and in function types and
    signatures.
  - A comment after the type a mapped type's key ranges over is no longer deleted,
    a comment right after the `[` stays after it, one at the end of the line after
    the `]` moves before it, and one on its own line before the `]` stays there
    instead of moving after the `:`.

  A comment before the `=` of a shorthand property's default value
  (`{ a /* c */ = 1 }`) is no longer deleted.

- [#633](https://github.com/tsrx-org/tsrx/pull/633)
  [`20b17fd`](https://github.com/tsrx-org/tsrx/commit/20b17fd8b8a255e1b32eef17183f710b5b04d4af)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The parser attaches three
  kinds of comments where Prettier does, so the formatter no longer moves or
  deletes them:

  - The function of a generic method, getter, or setter in an object literal
    (`{ m<T>() {} }`) now starts at its type parameters, as in typescript-estree,
    instead of at its `(`. A comment in the type parameters (`m</* c */ T>() {}`)
    stays there instead of moving after the name, or being deleted when it is a
    line comment on its own line.
  - A comment on its own line before the `;` that ends a file with no line break
    after it (`const x = 1` / `// c` / `;`) now trails the statement, as it does
    when a line break follows, instead of being deleted.
  - A comment in a spread attribute's braces before its argument
    (`{.../* note */ b}`) now leads the argument, and prints before the `...`,
    instead of moving after the attribute or to the next attribute. A
    `prettier-ignore` there no longer prints twice.

  The formatter also prints the comments that lead an object method's function,
  like the one in `"m" /* c */ () {}`, right after the key, like Prettier, instead
  of deleting them. A comment before the type parameters (`m /* c */ <T>() {}`)
  now leads the function too and prints the same way.

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
    compiled output and in the formatter. Text in an element in a spread
    attribute's argument, or in an unbraced attribute value in a container, has
    its character references decoded in `value`, and printing `value` compiled
    `&[#123](https://github.com/tsrx-org/tsrx/issues/123);x&[#125](https://github.com/tsrx-org/tsrx/issues/125);`
    to the expression `{x}` and `&amp;lt;` to `&lt;`, which render something else.
    The formatter printed those texts decoded too.
  - The `raw` of template text leaves out the comments between children, as its
    `value` does.

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

  The formatter prints the import attributes of an import type, like Prettier: the
  module specifier and the attributes lay out like call arguments, without a
  trailing comma.

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

  The formatter prints a line comment glued to a closing tag glued to it
  (`<b>t</b>// c`), as it does after a self-closing tag, and formats a
  non-breaking space that starts a line the same way on the next pass.

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

  `@tsrx/prettier-plugin` prints the `intrinsic` keyword, which it printed as an
  unknown node.

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

  The formatter keeps the parentheses around a `@{ … }` value or a directive that
  is called, indexed, or used as a tag, as it does for an element.

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

  The formatter formats these, and prints `import()` without the trailing comma,
  like Prettier.

- [#687](https://github.com/tsrx-org/tsrx/pull/687)
  [`1dd7288`](https://github.com/tsrx-org/tsrx/commit/1dd728863fa9f945c972e94b85925e62854ede52)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Comments after an `=` or a
  key, and in the parentheses of an import, go where Prettier puts them:

  - A comment at the end of the line of a type alias's `=`, or before an object,
    array, template, or type literal value of a declaration or assignment, moves
    below the `=` with the value. A line comment before the `=` does the same.
    Before any other value, a line comment after the `=` stays at the end of that
    line, or moves to the end of the statement when the value fits on the line
    (`const a = b || c; // note`).
  - A comment at the end of a line inside an object property moves before the key.
    After a class field's `=`, a block comment there moves before the `=`, and a
    line comment follows the rule for declarations above.
  - A comment between an import attribute's key and its value moves below the `:`
    with the value when it's on its own line, and before the `:` or to the end of
    the line otherwise.
  - The parentheses of an import type or an `import … = require(…)` break around a
    comment like call arguments, instead of keeping the comment after the `(`.
  - A union or intersection of one type (`| A`, `& A`) prints as that type, so a
    comment after its `|` or `&` moves below the `=` with the value, and the
    parentheses around it are dropped.
  - A line comment after a callee or its type arguments stays there instead of
    moving after the arguments, and one at the end of the line after a `;` of a
    `for` header stays after the `;`.

- [#768](https://github.com/tsrx-org/tsrx/pull/768)
  [`a5beb97`](https://github.com/tsrx-org/tsrx/commit/a5beb9773e9169d546a1a10623806ea2ec811404)
  Thanks [@leonidaz](https://github.com/leonidaz)! - A comment after the
  parenthesized body of an arrow function that prints in parentheses of its own
  goes in one pass where Prettier's next passes leave it:

  - After an element body of an arrow function called right away or used as a tag,
    `((a) => (<div /> /* c */))(1);`, the parentheses around the arrow function
    break around the comment when the call fits on its line with the element, as
    they do after other bodies. When it doesn't, the element breaks and keeps the
    comment in its parentheses, as before. The comment moved out of the element on
    the next format.
  - After the last body of a chain of arrow functions called right away, which
    prints below its `=>`, the comment leads the first argument on a line of its
    own. With no argument, it stays after the body. It moved to a line of its own
    after the chain on the next format, over-indenting the body, and into the
    arguments on the one after.
  - After the body of an arrow function that is a `new` callee, a member object,
    or in parentheses before a `!`, `as`, `satisfies`, an operator, or a `?`, a
    block comment prints after the arrow function's parentheses, and leads the
    first argument of a `new`. It moved there on the next formats.
  - A comment after the parenthesized body of an arrow function called right away
    that `prettier-ignore` keeps as written stays in its kept source. It printed
    again after it on each format.

- [#585](https://github.com/tsrx-org/tsrx/pull/585)
  [`944a943`](https://github.com/tsrx-org/tsrx/commit/944a943394c9fea12ea72a4e871726c172613136)
  Thanks [@leonidaz](https://github.com/leonidaz)! - A comment after the value
  inside a JSDoc cast's parentheses stays inside them, like Prettier's `babel`
  output, instead of moving after them and, after an element, moving again on the
  next format. An element kept by `prettier-ignore` inside a JSDoc cast stays
  after the `=`. Parentheses printed around a value that starts with a JSDoc-cast
  operand go around the cast too (`(/** @type {T} */ (a) ?? b)`), so the cast
  keeps casting that operand instead of the whole value, which Prettier's output
  does.

  The parser gives a comment inside a JSDoc cast's parentheses to the cast value,
  not to the statement's `;` or the class body after them, and a JSDoc cast after
  a comma to the element it casts when its parentheses break, instead of the
  element before the comma, which dropped the cast.

- [#524](https://github.com/tsrx-org/tsrx/pull/524)
  [`9338fdd`](https://github.com/tsrx-org/tsrx/commit/9338fdd35760c4743cf1a79373c8dd2e27849e3b)
  Thanks [@leonidaz](https://github.com/leonidaz)! - A `return`, `throw`, or
  `yield` argument that starts with a block comment spanning lines keeps its
  parentheses, like Prettier, instead of ending at the comment and returning
  `undefined`. A function called right away or used as a template tag prints its
  comments inside its parentheses, and a parenthesized superclass prints its
  comments outside the parentheses the class adds, like Prettier. A superclass in
  a JSDoc cast no longer gets a second pair of parentheses, and a comment after
  the superclass no longer moves into the class body on the next format. An
  element in a JSDoc cast prints in parentheses of its own inside the cast's when
  it breaks or has a comment that breaks the line, like Prettier's `babel` output.

  The parser gives a comment before the `)` of a function called right away or
  used as a tag to the function, like Prettier, so it prints inside those
  parentheses instead of moving into the call's arguments.

- [#629](https://github.com/tsrx-org/tsrx/pull/629)
  [`2933f42`](https://github.com/tsrx-org/tsrx/commit/2933f427c289a958d108208262716d828d7dbd67)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Comments keep their places in
  one pass in three more spots:

  - A comment after a sequence or assignment in parentheses, as an arrow
    function's body, a declarator's value, a `return` argument, or an assignment's
    right side, stays inside the parentheses
    (`const f = () => (a = b /* note */);`), like Prettier. After the
    parenthesized expression of an expression statement, the argument of a
    `throw`, the declaration of an `export default`, or an assignment on another
    assignment's right side, it moves after the `;` at once, where Prettier moves
    it on its next pass, and so does a line comment after a declarator's or
    assignment's parenthesized sequence.
  - A comment at the end of the line of a type parameter's `=` stays after the
    `=`, with the default on the next line, indented, like Prettier. One on a line
    of its own before or after the `=` moves after the constraint at once, as
    Prettier's next pass does.
  - A block comment on a line of its own before a type after a keyword or colon
    (`keyof`, `typeof`, `infer`, `is`, `as`, `satisfies`, `:`, `=>`, `extends`,
    `in`, a conditional type's `?` or `:`, an indexed access type's `[`) stays
    before the type, on the keyword's line, where Prettier's next pass puts it
    (`type X = keyof /* c */ T;`).

  The blank line after a statement also stays when a comment written before its
  `;`, on an earlier line, moves after it.

- [#518](https://github.com/tsrx-org/tsrx/pull/518)
  [`d02b7e6`](https://github.com/tsrx-org/tsrx/commit/d02b7e6119462890b27f4506d9c5d8eb5258e650)
  Thanks [@leonidaz](https://github.com/leonidaz)! - A comment on its own line
  after the expression in a template literal's `${…}` is no longer deleted. The
  parser gave it to the template's next text, which prints as written, and it now
  trails the expression, like Prettier, so the formatter keeps it in the `${…}`
  (also in CSS, GraphQL, HTML, and Markdown templates). In a template literal
  type, a comment on its own line before the next type leads that type, as in
  Prettier.

  The formatter honors two more `prettier-ignore` comments, like Prettier:

  - `{/* prettier-ignore */}` keeps the element or fragment after it as written,
    in JSX and in templates, when only whitespace with a line break separates
    them.
  - A `// prettier-ignore` after the last node of a `@{ … }` code block keeps that
    node as written, as it does after the last statement of a block. The rest of
    the code block still formats.

  A `<script>` body now formats by the script's `type` or `lang`, like Prettier's
  HTML printer, instead of always as TypeScript, which added a `;` to JSON bodies
  such as `[1,2]` and made them invalid. JSON, `importmap`, `ld+json`, and
  `speculationrules` bodies format as JSON, `text/markdown` and `text/html` bodies
  as Markdown and HTML, and a body with no type, an empty type, `module`, or
  another JavaScript type, or with `lang="ts"`, formats as TypeScript. A body of
  any other type (such as `text/template` or `text/typescript`), or of a script
  with `src`, stays as written.

- [#576](https://github.com/tsrx-org/tsrx/pull/576)
  [`a7327be`](https://github.com/tsrx-org/tsrx/commit/a7327be124f3a5f8870acd28b46b67aac9d9691d)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Comments in JSX attributes
  and next to template text now stay where they were written:

  - A comment between an attribute's `=` and its value is no longer deleted. A
    block comment prints before the value (`attr=/* c */ "foo"`), and a line
    comment after a string or element value, like a trailing comment of the
    attribute, or inside the braces of a `{…}` value.
  - A comment after an attribute's name (`attr /* c */="x"`) is no longer deleted.
  - A comment on its own line after a spread's argument, before its `}`, stays
    inside the braces. Before another attribute it was deleted, and otherwise it
    moved after the `}`. A spread attribute's braces break with the opening tag,
    like Prettier's.
  - A word of text that starts with `//` no longer wraps to the start of a line,
    where it would read as a comment and the rest of the line would be lost.
  - A block comment right after a `{" "}` child keeps the spacing it was written
    with, so the output no longer needs a second format.

  The parser now gives a comment after a spread's argument to the argument, like
  Prettier, instead of the next attribute or the closing tag.

- [#549](https://github.com/tsrx-org/tsrx/pull/549)
  [`d1f89bd`](https://github.com/tsrx-org/tsrx/commit/d1f89bdd27e60ed41b103e546b7b8c280f24fff8)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Comments in the tags and
  children of an element now stay where they were written. A comment right after
  an opening tag (`<div>/* c */x</div>`), inside a closing tag (`</div /* c */>`,
  `</ /* c */ div>`, `</ /* c */>`), or in a shorthand attribute (`{/* c */ key}`)
  is no longer deleted, and a comment between words of text no longer moves to the
  closing tag. A comment in text keeps the text's meaning: the formatter no longer
  adds or drops a space next to it, and a line comment after a child no longer
  ends up after the next word, where it would read as text.

  The parser now gives a comment in text to the text (`innerComments`), even on
  the line of the child or opening tag before it, but a `prettier-ignore` after
  the text's last word still leads the next child. A comment between a closing
  fragment's `</` and `>` dangles on the closing fragment.

- [#595](https://github.com/tsrx-org/tsrx/pull/595)
  [`e82305f`](https://github.com/tsrx-org/tsrx/commit/e82305f84078a5f21f902a30b5cd65e8cb7f633f)
  Thanks [@leonidaz](https://github.com/leonidaz)! - A line comment alone in the
  braces of a JSX child or attribute value prints on a line of its own with the
  `}` on the next line, like Prettier, instead of taking the `}` into the comment,
  which didn't parse. Several comments alone in braces print on consecutive lines.

  A comment after the expression of a `{…}` stays inside its braces, like
  Prettier, instead of moving after them, or, before another attribute, being
  deleted. The parser gives it to the expression as a trailing comment.

  A comment in the braces of a dynamic tag (`<{Comp /* c */}>`) prints once, in
  the tag it was written in, instead of again in the closing tag, and a comment in
  the closing tag's braces is no longer dropped. One on its own line stays in the
  braces instead of moving into the element's children.

- [#686](https://github.com/tsrx-org/tsrx/pull/686)
  [`94b9f91`](https://github.com/tsrx-org/tsrx/commit/94b9f91a6279cd3ff03f9c9bf54fe39cf64835e0)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Comments between the children
  of an element keep their places in one pass:

  - In an element inside a `{…}` container or an attribute value, a comment before
    the first child, or after a `{…}` child, leads the child after it, as in a
    template. It went to the element's body, which the formatter printed before
    the closing tag (`{x && <div>{y} /* c */ <i /></div>}` formatted with the
    comment after `<i />` on the next pass).
  - Text after a child that breaks over several lines starts a line of its own
    (`</span>{" "}` then `3`) when a comment on a line of its own comes before the
    child, like Prettier with a `{/* c */}` child. It stayed on the child's last
    line (`</span> 3`), and a block comment on the opening tag's line gave one
    layout and then the other.
  - In an element inside a `{…}` container, a block comment after a `{" "}` that a
    tag or the closing tag follows prints against the `{" "}`, where the next pass
    puts it.

- [#568](https://github.com/tsrx-org/tsrx/pull/568)
  [`883a8b6`](https://github.com/tsrx-org/tsrx/commit/883a8b622c5e830433244155e13029038fae26a7)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Class member and parameter
  decorators, and the comments after them, format like Prettier.

  - A line comment, or a comment on its own line, between a class member's
    decorators and its modifiers (`static`, `accessor`, `readonly`, `get`, …)
    stays after the decorators. It used to move after the modifiers, where it
    broke the line after `static`, which the parser then read as a field of its
    own. The same holds for a parameter property's decorators and its `private`,
    `readonly`, or other modifiers.
  - A comment after a parameter's decorator, or inside the decorator's arguments,
    stays there instead of moving before the decorator.
  - A parameter's decorators keep a line break written after them, and the
    parameter moves to the next line when the decorators don't fit on its line.
    They used to stay on the parameter's line.
  - `prettier-ignore` before a decorated parameter keeps its decorators. They used
    to be deleted.

- [#571](https://github.com/tsrx-org/tsrx/pull/571)
  [`935dfe4`](https://github.com/tsrx-org/tsrx/commit/935dfe4242a07abf54d994afe3e87b9582c3ac2a)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Format parameters and type
  parameters like Prettier: a lone parameter typed as an intersection or a generic
  type with an object type argument (such as `props: Props<{ … }>`) no longer hugs
  the parentheses, and the parameter list breaks instead. A comment between a type
  parameter's name and its `extends`, `=`, or mapped type `in`, or between a
  `const`, `in`, or `out` modifier and the name, stays there. A comment after the
  parenthesized expression body of an arrow function moves after the statement's
  `;` in one pass.

- [#688](https://github.com/tsrx-org/tsrx/pull/688)
  [`927aa91`](https://github.com/tsrx-org/tsrx/commit/927aa91ae42f06dca2a1a8809bc4149600eb60c9)
  Thanks [@leonidaz](https://github.com/leonidaz)! - An element that is an
  expression statement keeps its parentheses, and comments in the parentheses of a
  statement's value keep their places in one pass:

  - `(<div />);` keeps its parentheses and its `;`, which it used to lose, so that
    the next format read a template element and an empty statement. In a template
    body (a `@{ … }` code block or a template control-flow branch), an element
    that starts a longer expression statement, like `(<div />) + 1;`, keeps them
    too. A multi-line element breaks them around it, and a comment after the
    element in them moves after the `;`, like Prettier's.
  - A comment in the parentheses around the last operand of a statement's binary
    or logical value (`const x = a || (b /* c */);`) moves after the `;` at once,
    where Prettier moves it on its next pass. After a `return` or `throw`
    argument, it prints inside the parentheses the argument breaks in, and after
    the `;` when it fits. The same goes for a comment at the end of a statement
    without a `;`.
  - A comment before the `)` of the parentheses around an operand's last operand
    moves after them at once, and a line comment there no longer breaks the
    operator before them (`30 * (month - 1 // c⏎) + day`).
  - A line comment after block comments at the end of a declarator's or
    assignment's parenthesized sequence moves after the `;` alone, and the block
    comments stay in the parentheses.
  - A comment after the parenthesized body of an arrow function called right away
    prints inside the parentheses around the arrow function at once.

- [#690](https://github.com/tsrx-org/tsrx/pull/690)
  [`3a33f71`](https://github.com/tsrx-org/tsrx/commit/3a33f7154fb8995e5cd5dc60847c8b07ce98eee9)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Comments keep their places in
  five more spots:

  - A comment next to the parameter name of a type predicate (`asserts /* c */ x`,
    `x /* c */ is T`) is no longer deleted.
  - A union prints its trailing comments inside its indentation, like Prettier, so
    a line comment after a type parameter's union constraint moves the union to
    the line after `extends`.
  - A block comment on a line of its own before the expression after `new`,
    `await`, `yield*`, a spread's or rest element's `...`, or a conditional's `?`
    or `:` stays on that line before the expression, where Prettier's next pass
    puts it (`const x = new /* c */ Foo();`). A spread in an object still breaks
    the object, which Prettier keeps expanded.
  - A comment after a `continue`, `break`, `debugger`, or `return` with nothing
    after its keyword, before a `;` on the next line, moves after the `;` like
    Prettier instead of leading the next statement.
  - A comment after a line comment goes on a line of its own, like Prettier, even
    when it shared a line with a statement's `;` (`foo() // a` / `; // b`),
    instead of joining the line comment, and a block comment after a comment that
    prints at the end of the line keeps its order.

- [#759](https://github.com/tsrx-org/tsrx/pull/759)
  [`b51a77e`](https://github.com/tsrx-org/tsrx/commit/b51a77e08ebf686ca23eddcee6ae2ac26128e58a)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Comments in the parentheses
  at the end of a statement's value now reach the place Prettier's later passes
  give them in one format:

  - A comment after a conditional's alternate, in the parentheses around it, moves
    after the `;` (`const x = a ? b : (c /* c */);` prints
    `const x = a ? b : c; /* c */`), as it does after the last operand of a binary
    or logical value. After an arrow function's conditional body, block comments
    stay in the parentheses the body prints in, unless a line comment, or one on a
    line of its own, breaks the body.
  - A comment on a line of its own before the `)` moves after the `;`, on a line
    of its own, and no longer breaks the value (`const x = a || (b\n/* c */);`
    prints `const x = a || b;\n/* c */`). After a `return` or `throw` argument, it
    stays in the argument's parentheses.
  - A line comment before the `)` of a declarator's value that another declarator
    follows moves after the `,` and no longer breaks the value
    (`const x = (a, b // d\n), y = 1;` prints `const x = (a, b), // d`).

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
