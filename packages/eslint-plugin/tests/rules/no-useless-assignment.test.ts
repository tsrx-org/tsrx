import { describe, expect, it } from 'vitest';
import { Linter, RuleTester } from 'eslint';
import rule from '../../src/rules/no-useless-assignment.js';
import { get_core_rule } from '../../src/utils/core-rule.js';
import * as parser from '@tsrx/eslint-parser';

const ruleTester = new RuleTester({ languageOptions: { parser } });

const component = (setup: string, template: string) => `export function A({ n, log }) @{
${setup
	.split('\n')
	.map((line) => `\t${line}`)
	.join('\n')}
	<div>
${template
	.split('\n')
	.map((line) => `\t\t${line}`)
	.join('\n')}
	</div>
}`;

ruleTester.run('no-useless-assignment', rule, {
	valid: [
		// #1289: `@pending` shows while the body suspends, before the body's
		// assignment may have run.
		component(
			`let label = 'loading';`,
			`@try { label = 'done'; <p>{label}</p> } @pending { <p>{label}</p> } @catch (e) { <p>err</p> }`,
		),
		// `@catch` renders when the body throws, which can be before its assignment.
		component(`let x = 0;`, `@try { x = 1; <p>{x}</p> } @catch (e) { <i>{x}</i> }`),
		component(
			`let x = 0;`,
			`@try { <b /> } @pending { x = 1; <s>{x}</s> } @catch (e) { <i>{x}</i> }`,
		),
		// The code after the `@try` runs before the blocks.
		component(`let x = 0;`, `@try { x = 1; <p>{x}</p> } @catch (e) { <i /> }\n{x}`),
		// The code after the `@try` runs without either block.
		component(`let x = 0;`, `@try { x = 1; <p>{x}</p> } @catch (e) { x = 2; <i>{x}</i> }\n{x}`),
		// Known gap: the added starts mix the two orders. The code after the
		// second `@try` skips its body but follows the first one's, so the
		// rule doesn't report `'a'`, which no target reads.
		component(
			`let status = 'none';\nlog(status);`,
			`@try { status = 'a'; <b /> } @catch (e) { <i /> }
@try { status = 'b'; <b /> } @catch (e) { <i /> }
<p>{status}</p>`,
		),
		// The body and the `@catch` are alternatives.
		component(`let x = 0;\nlog(x);`, `@try { x = 1; <p /> } @catch (e) { x = 2; <i /> }\n{x}`),
		// The `@catch` can render without `@pending`, and the code after the
		// `@try` runs without the `@catch`.
		component(
			`let x = 0;\nlog(x);`,
			`@try { x = 1; <b /> } @pending { x = 2; <s /> } @catch (e) { <i>{x}</i> }`,
		),
		component(
			`let x = 0;\nlog(x);`,
			`@try { <b /> } @pending { x = 1; <s /> } @catch (e) { x = 2; <i /> }\n{x}`,
		),
		// A `@try` in a block of another.
		component(
			`let x = 0;`,
			`@try {
	x = 1;
	<div>@try { x = 2; <p>{x}</p> } @catch (e) { <i>{x}</i> }</div>
} @catch (e) { <i>{x}</i> }`,
		),
		// A `finally` block entered one way only has one path, so the blocks are
		// alternatives there too.
		`export function F(log) {
	let x = 0;
	try {
	} finally {
		const view = @{
			<div>@try { x = 1; <b>{x}</b> } @catch (e) { <i>{x}</i> }</div>
		};
		log(view);
	}
}`,
		// A function the traversal visits after code that follows it: a `@for`'s
		// index and key come before its iterable.
		`export function A() @{
	<ul>
		@for (const item of [(() => @{
			let x = 0;
			<div>
				@try { x = 1; <b>{x}</b> } @catch (e) { <i>{x}</i> }
			</div>
		})()]; index i; key i) { <li>{item}</li> }
	</ul>
}`,
		`export function A({ fail }) @{
	<ul>
		@for (const item of [@{
			let x = 0;
			<div>
				@try { fail(); x = 1; <b>{x}</b> } @catch (e) { <i>{x}</i> }
			</div>
		}]; index i; key i) { <li>{item}</li> }
	</ul>
}`,
		// A function in a `@for`'s key has a code path of its own.
		`export function A({ items, fail, log }) @{
	<ul>
		@for (const item of items; key (() => @{
			let x = 0;
			@try { fail(); x = 1; log(x); } @catch (e) { log(x); }
		})()) { <li>{item.id}</li> }
	</ul>
}`,
		`export function A({ fail }) @{
	<ul>
		@for (const item of [@{
			let x = 0;
			<div>@try { fail(); x = 1; <b>{x}</b> } @catch (e) { <i>{x}</i> }</div>
		}]; key ((k) => k)(0)) { <li>{item}</li> }
	</ul>
}`,
		`export function A({ fail, pick }) @{
	<ul>
		@for (const item of [@{
			let x = 0;
			<div>@try { fail(); x = 1; <b>{x}</b> } @catch (e) { <i>{x}</i> }</div>
		}]; key pick(<i />)) { <li>{item}</li> }
	</ul>
}`,
		// A dynamic tag reads its expression.
		component(
			`let Tag = 'b';\nlog(Tag);`,
			`@try { Tag = 'i'; <b /> } @catch (e) { Tag = 'p'; <i /> }\n<{Tag} />`,
		),
		// A `@for`'s key, visited before its iterable, doesn't hide the
		// iterable's read.
		`export function A({ n, log }) @{
	let x = 0;
	log(x);
	<ul>
		@try { x = 1; <b /> } @catch (e) { x = 2; <i /> }
		@for (const item of [x]; key item) { <li>{item}</li> }
	</ul>
}`,
		// The last `@switch` arm and `@empty` are cut when nothing that code path
		// analysis runs before them assigns.
		`export function A({ n }) @{
	let x = 0;
	<div>
		@switch (n) {
			@case 1: {
				<b />
			}
			@default: {
				@try { x = 1; <p>{x}</p> } @catch (e) { <i>{x}</i> }
			}
		}
	</div>
}`,
		`export function A({ items }) @{
	let x = 0;
	<div>
		@for (const i of items) {
			<b>{i}</b>
		} @empty {
			@try { x = 1; <p>{x}</p> } @catch (e) { <i>{x}</i> }
		}
	</div>
}`,
		// Known gap: nothing renders a `@try` in an operand of `,` that isn't the
		// last, so React, Preact and Hono never run its blocks, and Solid and Vue
		// run the body, which assigns first. The core rule reports `'init'` (2:6),
		// which no target reads, and the rule drops it.
		`export function A({ Boom }) @{
	let x = 'init';
	<div>
		{(@{
			@try { x = 'body'; <Boom /> } @catch (e) { <i>{x}</i> }
		}, null)}
	</div>
}`,
		// An escaped name is still a read.
		component(`let x = 0;`, `@try { log(n); x = 1; <>{x}</> } @catch (e) { <>{\\u0078}</> }`),
		// Code without `@try` is left to the core rule.
		`function f() { let x = 0; x += 1; return x; }`,
	],
	invalid: [
		// A destructuring default runs after the value it defaults, though code path
		// analysis runs it before.
		{
			code: `export function A(log) {
	let x = 0;
	log(x);
	const [view = @{
		@try { x = 1; <b /> } @catch (e) { x = 2; <i /> }
	}] = (log(x), [undefined]);
	return view;
}`,
			errors: [{ messageId: 'unnecessaryAssignment', line: 5, column: 10 }],
		},
		// Only one `@switch` arm renders, though code path analysis runs them one
		// after another, and a case's test runs before `@default`.
		{
			code: `export function A(log) @{
	let x = 0;
	log(x);
	<div>
		@switch (1) {
			@default: { @try { x = 1; <b /> } @catch (e) { x = 2; <i /> } }
			@case x: { <i /> }
		}
	</div>
}`,
			errors: [{ messageId: 'unnecessaryAssignment', line: 6, column: 23 }],
		},
		{
			code: `export function A(log) @{
	let x = 0;
	log(x);
	<div>
		@switch (0) {
			@case 0: { @try { x = 1; <b /> } @catch (e) { x = 2; <i /> } }
			@case 1: { <i>{x}</i> }
		}
	</div>
}`,
			errors: [{ messageId: 'unnecessaryAssignment', line: 6, column: 22 }],
		},
		// `@empty` renders only when the body doesn't.
		{
			code: `export function A(log) @{
	let x = 0;
	log(x);
	<div>
		@for (const item of [1]) {
			@try { x = 1; <b /> } @catch (e) { x = 2; <i /> }
		} @empty { <i>{x}</i> }
	</div>
}`,
			errors: [{ messageId: 'unnecessaryAssignment', line: 6, column: 11 }],
		},
		// A loop's update isn't a place the rule cuts.
		{
			code: `export function A(log) {
	let x = 0;
	log(x);
	const views = [];
	for (let i = 0; i < 1; i++, views.push(@{
		@try { x = 1; <b /> } @catch (e) { x = 2; <i /> }
	})) {
		log(x);
	}
	return views;
}`,
			errors: [{ messageId: 'unnecessaryAssignment', line: 6, column: 10 }],
		},
		// A `@try` in an attribute's value isn't cut: every target runs it after
		// the element's children, and a component runs it whenever it reads the
		// prop.
		{
			code: `export function A({ n, log, Card }) @{
	let x = 0;
	<Card header={<div>@try { x = 1; <b>{x}</b> } @catch (e) { <i>{x}</i> }</div>} />
}`,
			errors: [{ messageId: 'unnecessaryAssignment', line: 2, column: 6 }],
		},
		// Code path analysis runs an earlier `@switch` arm before the last one, and
		// the loop before `@empty`, but only one of them renders.
		{
			code: `export function A({ n, log }) @{
	let x = 0;
	log(x);
	<div>
		@switch (n) {
			@case 1: {
				x = 1;
				<b />
			}
			@default: {
				@try { x = 2; <p /> } @catch (e) { <i>{x}</i> }
			}
		}
	</div>
}`,
			errors: [{ messageId: 'unnecessaryAssignment', line: 7, column: 5 }],
		},
		{
			code: `export function A({ items }) @{
	let x = 0;
	<div>
		@for (const i of items) {
			x = i;
			<b />
		} @empty {
			@try { x = 2; <p /> } @catch (e) { <i>{x}</i> }
		}
	</div>
}`,
			errors: [
				{ messageId: 'unnecessaryAssignment', line: 2, column: 6 },
				{ messageId: 'unnecessaryAssignment', line: 5, column: 4 },
			],
		},
		// A `var` head assigns the function's variable, which the core rule
		// doesn't see.
		{
			code: `export function A(log) {
	var x = 0;
	log(x);
	for (var x of [
		@{
			<div>@try { x = 1; <b /> } @catch (e) { x = 2; <i /> }</div>
		},
	])
		log(x);
}`,
			errors: [{ messageId: 'unnecessaryAssignment', line: 6, column: 16 }],
		},
		// Known gap: the added starts mix the two orders with one `@try` too. The
		// core rule also reports `'init'` (2:6), which no target reads: React,
		// Preact and Hono render the `@catch` after the `@if`, and Solid and Vue
		// run the body first. The rule drops it, since the `@catch` can start from
		// the start of the `@try`.
		{
			code: `export function A({ c, Boom }) @{
	let x = 'init';
	<div>
		@try { x = 'body'; <Boom /> } @catch (e) { <i>{x}</i> }
		@if (c) { x = 'after-a'; <b /> } @else { x = 'after-b'; <b /> }
	</div>
}`,
			errors: [
				{ messageId: 'unnecessaryAssignment', line: 5, column: 13 },
				{ messageId: 'unnecessaryAssignment', line: 5, column: 44 },
			],
		},
		// A computed key in a destructuring target runs after the value, though
		// code path analysis runs it before.
		{
			code: `export function A(log) {
	let x = 0;
	log(x);
	const { [x = 3]: view } = {
		3: @{
			@try { x = 1; <b /> } @catch (e) { x = 2; <i /> }
		},
	};
	log(x);
	return view;
}`,
			errors: [
				{ messageId: 'unnecessaryAssignment', line: 4, column: 11 },
				{ messageId: 'unnecessaryAssignment', line: 6, column: 11 },
			],
		},
		{
			code: `export function A(log) {
	let x = 0;
	let view;
	log(x);
	({ [x = 3]: view } = {
		3: @{
			@try { x = 1; <b /> } @catch (e) { x = 2; <i /> }
		},
	});
	log(x);
	return view;
}`,
			errors: [
				{ messageId: 'unnecessaryAssignment', line: 5, column: 6 },
				{ messageId: 'unnecessaryAssignment', line: 7, column: 11 },
			],
		},
		// A class's static block runs with it.
		{
			code: `export function A(log) {
	let x = 0;
	log(x);
	const {
		[(class {
			static {
				x = 3;
			}
		},
		'view')]: view,
	} = {
		view: @{
			@try { x = 1; <b /> } @catch (e) { x = 2; <i /> }
		},
	};
	log(x);
	return view;
}`,
			errors: [{ messageId: 'unnecessaryAssignment', line: 13, column: 11 }],
		},
		// The core rule doesn't see a `for…of` loop assign its target.
		{
			code: `export function A(log) {
	let x: unknown = 0;
	log(x);
	for (x of [
		@{
			@try { x = 1; <b /> } @catch (e) { x = 2; <i /> }
		},
	]) {
		log(x);
	}
}`,
			errors: [{ messageId: 'unnecessaryAssignment', line: 6, column: 11 }],
		},
		// A `@for`'s key runs after the iterable.
		{
			code: `export function A(log) @{
	let x = 0;
	log(x);
	<div>
		@for (const item of [@{
			@try { x = 1; <b /> } @catch (e) { x = 2; <i /> }
		}]; index i; key (i, x = 3)) { <p>{x}</p> }
	</div>
}`,
			errors: [
				{ messageId: 'unnecessaryAssignment', line: 6, column: 11 },
				{ messageId: 'unnecessaryAssignment', line: 7, column: 24 },
			],
		},
		// Code path analysis runs a `@for`'s key before the loop, so the code
		// after a `@try` there includes the iterable, which runs first.
		{
			code: `export function A() @{
	let x = 0;
	<ul>
		@for (const item of [x]; key (@{
			@try { x = 1; <b /> } @catch (e) { x = 2; <i /> }
		})) { <li>{item}</li> }
	</ul>
}`,
			errors: [{ messageId: 'unnecessaryAssignment', line: 5, column: 11 }],
		},
		{
			code: `export function A({ items, fail, log }) @{
	<ul>
		@for (const item of items; key (@{
			let x = 0;
			@try { fail(); x = 1; log(x); } @catch (e) { log(x); }
		}, item.id)) { <li>{item.id}</li> }
	</ul>
}`,
			errors: [{ messageId: 'unnecessaryAssignment', line: 4, column: 8 }],
		},
		// A block that runs again after a later one, as the body does after
		// `@pending` or after `reset()`, isn't modelled: the core rule's answer
		// holds.
		{
			code: component(`let x = 0;\nlog(x);`, `@try { <b>{x}</b> } @pending { x = 1; <s /> }`),
			errors: [{ messageId: 'unnecessaryAssignment', line: 5 }],
		},
		{
			code: component(`let x = 0;\nlog(x);`, `@try { <p>{x}</p> } @catch (e) { x = 1; <i /> }`),
			errors: [{ messageId: 'unnecessaryAssignment', line: 5 }],
		},
		// A read earlier in the same block doesn't use the value.
		{
			code: component(
				`let x = 0;`,
				`@try {
	log(x);
	x = 1;
	<b />
} @catch (e) { <i /> }`,
			),
			errors: [{ messageId: 'unnecessaryAssignment', line: 6 }],
		},
		// Cutting the code paths at the `@try` doesn't change the core rule's
		// other answers. Here it reports `x` and `view`, because it reads the
		// label after the labelled block.
		{
			code: `export function F(log) {
	let x = 0;
	L: {
		log(x);
		const view = @{
			<div>@try { <b /> } @catch (e) { <i>{String(e)}</i> }</div>
		};
		log(view);
	}
}`,
			errors: [
				{ messageId: 'unnecessaryAssignment', line: 2, column: 6 },
				{ messageId: 'unnecessaryAssignment', line: 5, column: 9 },
			],
		},
		{
			code: `export function F(log) {
	let x = 0;
	L: {
		log(x);
		const view = @{
			@try { x = 1; <b /> } @catch (e) { x = 2; <i /> }
		};
	}
	x = 3;
	log(x);
}`,
			errors: [
				{ messageId: 'unnecessaryAssignment', line: 6, column: 11 },
				{ messageId: 'unnecessaryAssignment', line: 6, column: 39 },
			],
		},
		// A `@try` in a dynamic tag's expression isn't cut. (The compiler rejects
		// this tag, TSRX2014, but the ESLint parser takes it.)
		{
			code: `export function A(pick) @{
	let x = 0;
	<div>
		@try { x = 1; <b /> } @catch (e) {
			<{pick(@{
				<div>@try { x = 2; <b>{x}</b> } @catch (inner) { <i /> }</div>
			})} />
		}
	</div>
}`,
			errors: [
				{ messageId: 'unnecessaryAssignment', line: 2, column: 6 },
				{ messageId: 'unnecessaryAssignment', line: 4, column: 10 },
			],
		},
		// In a `finally` block, code path analysis keeps the path of a `return`
		// apart from the normal one.
		{
			code: `export function A(work) {
	let x = 0;
	try {
		work();
	} catch (e) {
		x = 1;
		return;
	} finally {
		const view = @{
			<div>@try { <b /> } @catch (e) { <i /> }</div>
		};
		work(view);
	}
	work(x);
}`,
			errors: [{ messageId: 'unnecessaryAssignment', line: 6 }],
		},
		// Overwritten before the `@try`.
		{
			code: component(`let x = 0;\nx = 1;`, `@try { <p>{x}</p> } @catch (e) { <i /> }`),
			errors: [{ messageId: 'unnecessaryAssignment', line: 2 }],
		},
		// Never read after the assignment, in any block or after the `@try`.
		{
			code: component(`let x = 0;\nlog(x);`, `@try { x = 1; <p /> } @catch (e) { <i /> }`),
			errors: [{ messageId: 'unnecessaryAssignment', line: 5 }],
		},
		{
			code: component(`let x = 0;\nlog(x);`, `@try { <p /> } @catch (e) { x = 2; <i /> }`),
			errors: [{ messageId: 'unnecessaryAssignment', line: 5 }],
		},
		// Overwritten in the same block.
		{
			code: component(
				`let x = 0;\nlog(x);`,
				`@try { x = 1; x = 2; <p>{x}</p> } @catch (e) { <i /> }`,
			),
			errors: [{ messageId: 'unnecessaryAssignment', line: 5, column: 10 }],
		},
		// A body that awaits runs in the component, in order, so the core
		// rule's answer holds.
		{
			code: component(
				`let x = 0;`,
				`@try { await log(n); x = 1; <p>{x}</p> } @catch (e) { <i>{x}</i> }`,
			).replace('export function', 'export async function'),
			errors: [{ messageId: 'unnecessaryAssignment', line: 2 }],
		},
		// Known gap: after a body that throws, code path analysis holds the
		// `@catch` unreachable, so its read doesn't count.
		{
			code: component(`let x = 0;`, `@try { throw new Error('one'); } @catch (e) { <i>{x}</i> }`),
			errors: [{ messageId: 'unnecessaryAssignment', line: 2 }],
		},
		// The core rule's reports in plain code are unchanged, in a file with
		// `@try` and without.
		{
			code: `function f() { let x = 0; x = 1; return x; }`,
			errors: [{ messageId: 'unnecessaryAssignment', line: 1, column: 20 }],
		},
		{
			code: `function f() { let x = 0; x = 1; return x; }
export function A() @{
	<div>@try { <b /> } @catch (e) { <i /> }</div>
}`,
			errors: [{ messageId: 'unnecessaryAssignment', line: 1, column: 20 }],
		},
	],
});

// The TSRX parser with a traversal that visits a switch case's test after its
// consequent and a label after its statement, so these tests pin how the rule
// handles identifiers out of source order whatever order the parser uses.
const reordered_parser = {
	...parser,
	parseForESLint(code: string, options?: Linter.ParserOptions) {
		const result = parser.parseForESLint(code, options);
		return {
			...result,
			visitorKeys: {
				...result.visitorKeys,
				SwitchCase: ['consequent', 'test'],
				LabeledStatement: ['body', 'label'],
			},
		};
	},
};

new RuleTester({ languageOptions: { parser: reordered_parser } }).run(
	'no-useless-assignment with identifiers out of order',
	rule,
	{
		valid: [
			// The function in the test is visited after the consequent, and its
			// code path starts over.
			`export function F(k, log) {
	switch (k) {
		case (() => @{
			let x = 0;
			<div>@try { log(k); x = 1; <b>{x}</b> } @catch (e) { <i>{x}</i> }</div>
		})():
			log(k);
	}
}`,
		],
		invalid: [
			// After a function with no identifiers, the label still comes before
			// the last identifier the code path saw, so it can't stretch the piece
			// after the `@try` over the `@try`.
			{
				code: `export function F(log) {
	let x = 0;
	L: {
		log(x);
		const view = @{
			@try { x = 1; <b /> } @catch (e) { x = 2; <i /> }
		};
		(() => 0)();
	}
	x = 3;
	log(x);
}`,
				errors: [
					{ messageId: 'unnecessaryAssignment', line: 6, column: 11 },
					{ messageId: 'unnecessaryAssignment', line: 6, column: 39 },
				],
			},
		],
	},
);

describe('no-useless-assignment after a @try', () => {
	const code = `export function App() @{
	let label = 'loading';
	<div>
		@try { @{ label = 'done'; } <p>{label}</p> } @pending { <p>{label}</p> } @catch (e) { <p>err</p> }
	</div>
}`;
	const reported = (rule_id: string) =>
		new Linter()
			.verify(
				code,
				{
					files: ['**/*.tsrx'],
					languageOptions: { parser },
					plugins: { tsrx: { rules: { 'no-useless-assignment': rule } } },
					rules: { [rule_id]: 'error' },
				},
				'A.tsrx',
			)
			.map((message) => `${message.line}:${message.column}`);

	it("is reported by the core rule (#1289's second case)", () => {
		expect(reported('no-useless-assignment')).toEqual(['2:6']);
	});

	it('is not reported by tsrx/no-useless-assignment', () => {
		expect(reported('tsrx/no-useless-assignment')).toEqual([]);
	});
});

describe('the core no-useless-assignment rule', () => {
	it('listens to no key tsrx/no-useless-assignment handles itself', () => {
		// The wrapper handles these keys without passing them on, and passes every
		// other key to the three copies as it is: a code path event there would
		// carry a real segment instead of a piece.
		const keys = Object.keys(
			get_core_rule('no-useless-assignment').create({ sourceCode: {} } as never),
		);
		expect(keys).toEqual(
			expect.arrayContaining([
				'onCodePathStart',
				'onCodePathEnd',
				'onCodePathSegmentStart',
				'onCodePathSegmentEnd',
			]),
		);
		expect(
			keys.filter(
				(key) =>
					key.startsWith('on') &&
					![
						'onCodePathStart',
						'onCodePathEnd',
						'onCodePathSegmentStart',
						'onCodePathSegmentEnd',
					].includes(key),
			),
		).toEqual([]);
		expect(
			keys.filter((key) =>
				[
					'JSXTryExpression',
					'JSXTryExpression:exit',
					'BlockStatement',
					'CatchClause',
					'JSXForExpression',
					'ForStatement',
					'ForInStatement',
					'ForOfStatement',
				].includes(key),
			),
		).toEqual([]);
	});
});
