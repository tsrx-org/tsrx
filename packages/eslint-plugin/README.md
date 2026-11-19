# @tsrx/eslint-plugin

[![npm version](https://img.shields.io/npm/v/%40tsrx%2Feslint-plugin?logo=npm)](https://www.npmjs.com/package/@tsrx/eslint-plugin)
[![npm downloads](https://img.shields.io/npm/dm/%40tsrx%2Feslint-plugin?logo=npm&label=downloads)](https://www.npmjs.com/package/@tsrx/eslint-plugin)

ESLint rules and flat configurations for target-neutral TSRX syntax.

## Installation

```bash
pnpm add --save-dev eslint @eslint/js @tsrx/eslint-parser @tsrx/eslint-plugin
```

## Usage

```js
// eslint.config.js
import js from '@eslint/js';
import tsrx from '@tsrx/eslint-plugin';

export default [
  js.configs.recommended,
  ...tsrx.configs.recommended,
  ...tsrx.configs.js,
];
```

List `tsrx.configs.js` after any configuration that turns on core `no-unused-vars`
or `no-unreachable`, such as `js.configs.recommended`. See
[With `js.configs.recommended`](#with-jsconfigsrecommended).

The recommended configuration:

- uses `@tsrx/eslint-parser` for `.tsrx` files when installed;
- uses `@typescript-eslint/parser` for `.ts` and `.tsx` files when installed;
- registers the plugin under the `tsrx` rule namespace;
- ignores declaration files, dependencies, and common build output folders.

Use the strict configuration to enable the same syntax rules at error severity:

```js
import tsrx from '@tsrx/eslint-plugin';

export default [...tsrx.configs.strict];
```

### With eslint-plugin-react

`react/jsx-curly-brace-presence` unwraps strings that TSRX text reads as syntax,
so its `--fix` can break a `.tsrx` file. The `react` configuration turns it off
for `.tsrx` files and turns on `tsrx/jsx-curly-brace-presence`, which keeps those
braces. List it after eslint-plugin-react's configurations, or a later one turns
the react rule back on:

```js
// eslint.config.js
import react from 'eslint-plugin-react';
import tsrx from '@tsrx/eslint-plugin';

export default [
  react.configs.flat.recommended,
  ...tsrx.configs.recommended,
  ...tsrx.configs.react,
];
```

`react.configs.flat.recommended` doesn't turn on `react/jsx-curly-brace-presence`,
so with it, `tsrx.configs.react` adds `tsrx/jsx-curly-brace-presence` as a new
rule at `error` rather than swapping one in. Leave `tsrx.configs.react` out if you
don't want the rule. To pass options, set them on `tsrx/jsx-curly-brace-presence`,
after `tsrx.configs.react`.

## Rules

- `tsrx/control-flow-jsx` requires template output in returned `@for` blocks.
- `tsrx/require-statement-container-body` detects component bodies that need the
  `@{ ... }` statement-container marker.
- `tsrx/valid-for-of-key` validates identifiers used in TSRX loop keys.
- `tsrx/jsx-curly-brace-presence` is `react/jsx-curly-brace-presence`, with the
  same options and messages, for TSRX text. It doesn't unwrap a child that TSRX
  would read differently: a directive such as `{'@for (item of items)'}`, a
  comment such as `{'// note'}`, text that would join a comment or a directive
  clause beside it, or the first child of a `<style>`. To tell, it parses the
  element around a child whose text could be TSRX syntax, before and after the
  unwrap, with the file's parser. Inside an expression container it parses the
  top-level statement, for at most 50 children per file, and keeps the braces past
  that. Each fix spans the text beside the child, so fixes that would touch the
  same text go in separate passes of one `--fix` run. See
  [With eslint-plugin-react](#with-eslint-plugin-react).
- `tsrx/no-return-in-component` is a deprecated no-op retained for compatibility.
- `tsrx/no-unused-vars` is ESLint's `no-unused-vars`, except that its suggestion
  for an unused `@for` index removes the whole `; index i` clause. The core rule's
  suggestion deletes only the name and leaves `index )`, which doesn't parse.
- `tsrx/no-await-in-loop` is ESLint's `no-await-in-loop`, and also reports an
  `await` in a `@for` key, which runs once per item, as the body does.
- `tsrx/no-unreachable` is ESLint's `no-unreachable`, with the arms of a `@switch`
  as alternatives, and the blocks of a `@try` run apart from the code around it.
  After an arm that throws, it doesn't report the other arms, or the code after
  the `@switch` when another arm reaches its end or there is no `@default` arm.
  After a `@try` block that throws, it doesn't report `@pending`, the `@catch` or
  the code after the `@try`: the compiled output runs the body, `@pending` and
  `@catch` in callbacks of the `@try`'s boundaries, and the component goes on past
  the `@try`. A body or `@pending` that awaits or yields runs in the component
  instead, `@pending` first, where a throw leaves it: when such a block doesn't
  reach its end, the rule reports the `@catch` and the code after the `@try`, as
  the core rule does. On Hono, a `@pending` that neither awaits nor yields runs in
  the component too, so when it throws it ends the component there, but the rule
  doesn't know the target and doesn't report the code after that `@try`. It still
  reports unreachable code inside an arm or a block of a `@try`: there it follows
  `throw`, `return`, `break`, `continue`, `try` and endless loops itself, since
  code path analysis has already given up on that code. It can miss unreachable
  code there when a `break`, `continue`, `return` or `throw` passes through a
  `finally` block, and it reports nothing there that the core rule doesn't report
  on the same code in a plain function. The
  [`@tsrx/eslint-parser` README](https://github.com/tsrx-org/tsrx/tree/main/packages/eslint-parser#known-limitations)
  explains what the core rule reports instead.
- `tsrx/no-useless-assignment` is ESLint's `no-useless-assignment`, with the
  blocks of a `@try` as alternatives. The core rule runs them one after another,
  so it reports a value set before a `@try` and assigned in the body though
  `@pending` or the `@catch` reads it, and a value the body assigns and the
  `@catch` assigns again, which the code after the `@try` reads when the `@catch`
  doesn't render. The compiled output runs the blocks in callbacks of the `@try`'s
  boundaries, and the `@catch` or `@pending` can render without the blocks before
  them. The rule also runs the core rule on code paths cut at the blocks'
  boundaries, once as they are and once with each block, and the code after the
  `@try`, also starting from the start of the `@try` or from the end of any block
  before it. It drops a report of the core rule only when the cut code paths give
  it and the ones with the added starts don't, so it reports nothing the core rule
  doesn't, and in a file without `@try` it is the core rule.

  It can still drop a report that holds:

  - The added starts mix two orders: the code after a `@try` can run before its
    blocks, as on React, Preact and Hono, or after them, in source order. Across
    sibling `@try`s, that can drop a report that holds on every target. With
    `@try { status = 'a'; <b /> } @catch (e) { <i /> }`, then the same with
    `status = 'b'`, then `<p>{status}</p>`, the value `'a'` is never read, and the
    rule doesn't report it.
  - On Hono, a `@pending` that neither awaits nor yields runs in the component,
    before the body and the code after the `@try`. The rule doesn't know the
    target, so it can drop the report of a value such a `@pending` overwrites.
  - Like the core rule, it counts a read in a branch that can never run, such as
    `@if (false) { … }`, and a `typeof x` in a type, and doesn't see a write in a
    function the code calls. So such a read after a `@try`, or one after a call
    that overwrites the value, can drop the report of a value the `@catch`
    overwrites.

  It keeps the core rule's reports, adding no starts, for a `@try`:

  - whose body or `@pending` awaits or yields, since those blocks run in the
    component, in order;
  - where code path analysis follows more than one path at once, as in a `finally`
    block that a `throw` or a `return` can enter;
  - in a `@switch` arm before the last, since code path analysis runs the arms one
    after another but only one renders, or in the body of a `@for` with `@empty`,
    which renders only when the body doesn't;
  - anywhere but statements, template children, the blocks of `@if`, `@for` and
    `@try`, and the parts of an expression the rule lists as running in order
    (call arguments, array elements, property values, the branches of `?:`, `&&`
    and `??`, and a few more). That leaves out attribute values, which Solid sets
    in effects, after the children; a `@for`'s index and key and a destructuring
    default, which code path analysis runs out of order; and others, such as the
    operand of `!`;
  - whose code path has a part that code path analysis runs before the `@try`'s
    part though it really runs after it, and that part assigns something, as a
    computed key `[x = 3]` in a destructuring target or `key (i, x = 3)` on a
    `@for` does.

  It also still reports a value read only in a block that code path analysis holds
  unreachable, such as a `@catch` after a body that throws, or only in a block
  that runs again after a later one, as the body does after `@pending` or after
  `reset()`. When a block always ends in a `throw`, what follows it is unreachable
  for code path analysis, and the rule adds no starts for that `@try`.

### With `js.configs.recommended`

`js.configs.recommended` turns on `no-unused-vars` and `no-unreachable`, and on
ESLint 10 also `no-useless-assignment`. The `js` configuration turns those off for
`.tsrx` files and turns on `tsrx/no-unused-vars` and `tsrx/no-unreachable` at
`error`, and on ESLint 10 `tsrx/no-useless-assignment`. Every other report and
suggestion is the core rule's, except what `tsrx/no-useless-assignment` drops
after a `@try`, and except in the code `tsrx/no-unreachable` revives, where it
follows exits itself: after a `@switch` arm that throws, the other arms and the
code after the `@switch`, and after a `@try` block that throws, the `@try`'s other
blocks and the code after it. A configuration can't read the severity or options
another one gives the core rule, so:

- list `tsrx.configs.js` after `js.configs.recommended`, and after any other
  configuration that turns these core rules on. Listed before them, it leaves both
  versions on for `.tsrx` files, and each problem is reported twice;
- on its own, without `js.configs.recommended`, it turns the TSRX rules on;
- give `tsrx/no-unused-vars` the options you give `no-unused-vars`, and set a
  `tsrx/` rule to `warn` or `off` to change its severity;
- name the TSRX rule in `eslint-disable` comments in `.tsrx` files:
  `// eslint-disable-next-line tsrx/no-unused-vars`.

`js.configs.recommended` leaves `no-await-in-loop` off, so no configuration turns
on `tsrx/no-await-in-loop`. If you turn on `no-await-in-loop`, use
`tsrx/no-await-in-loop` for `.tsrx` files instead:

```js
import js from '@eslint/js';
import tsrx from '@tsrx/eslint-plugin';

export default [
  js.configs.recommended,
  ...tsrx.configs.recommended,
  ...tsrx.configs.js,
  { rules: { 'no-await-in-loop': 'error' } },
  {
    files: ['**/*.tsrx'],
    rules: {
      'tsrx/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-await-in-loop': 'off',
      'tsrx/no-await-in-loop': 'error',
    },
  },
];
```

On ESLint 9, `js.configs.recommended` leaves `no-useless-assignment` off, so the
`js` configuration doesn't turn on `tsrx/no-useless-assignment` there. If you turn
on `no-useless-assignment`, use `tsrx/no-useless-assignment` for `.tsrx` files
instead:

```js
export default [
  js.configs.recommended,
  ...tsrx.configs.recommended,
  ...tsrx.configs.js,
  { rules: { 'no-useless-assignment': 'error' } },
  {
    files: ['**/*.tsrx'],
    rules: {
      'no-useless-assignment': 'off',
      'tsrx/no-useless-assignment': 'error',
    },
  },
];
```

Target runtime rules do not belong in the shared recommended configuration. For
example, Ripple-specific `track()` placement and DOM event guidance should be
provided by Ripple-owned tooling rather than applied to every TSRX target.

See the [TSRX documentation](https://tsrx.dev/) and
[`@tsrx/eslint-parser`](https://github.com/tsrx-org/tsrx/tree/main/packages/eslint-parser).
