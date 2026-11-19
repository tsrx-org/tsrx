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
		// Code without `@try` is left to the core rule.
		`function f() { let x = 0; x += 1; return x; }`,
	],
	invalid: [
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
		// The parser's name for a dynamic tag spans the whole tag expression.
		// (The compiler rejects this tag, TSRX2014, but the ESLint parser takes it.)
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
				['JSXTryExpression', 'JSXTryExpression:exit', 'BlockStatement', 'CatchClause'].includes(
					key,
				),
			),
		).toEqual([]);
	});
});
