import { describe, expect, it } from 'vitest';
import { Linter, RuleTester } from 'eslint';
import rule from '../../src/rules/no-unreachable.js';
import * as parser from '@tsrx/eslint-parser';

const ruleTester = new RuleTester({ languageOptions: { parser } });

const component = (body: string) => `export function A({ n, items, log }) @{
	<div>
${body
	.split('\n')
	.map((line) => `\t\t${line}`)
	.join('\n')}
	</div>
}`;

ruleTester.run('no-unreachable', rule, {
	valid: [
		component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@case 2: { <b /> }
	@default: { <i /> }
}
@if (n) { <u /> }`),
		// With no `@default` arm, no arm may run.
		component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@case 2: { throw new Error('two'); }
}
@if (n) { <u /> }`),
		component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@default: {
		if (n > 5) throw new Error('big');
		const value = n;
		<b>{value}</b>
	}
}`),
		component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@default: {
		try {
			throw new Error('caught');
		} catch (error) {
			log(error);
		}
		const value = n;
		<b>{value}</b>
	}
}`),
		component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@default: {
		for (const item of items) {
			if (item) break;
		}
		const value = n;
		<b>{value}</b>
	}
}`),
		component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@default: {
		@switch (n > 1) {
			@case true: { throw new Error('inner'); }
			@default: { <i /> }
		}
	}
}
@if (n) { <u /> }`),
		component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@default: {
		switch (n) {
			case 2:
				log(n);
				break;
			default:
				log(0);
				break;
		}
		try {
			throw new Error('caught');
		} finally {
			log(n);
		}
	}
}`),
		component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@default: {
		for (;;) {
			if (n) break;
			throw new Error('loop');
		}
		block: {
			if (n) break block;
			throw new Error('block');
		}
		const value = n;
		<b>{value}</b>
	}
}`),
		component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@default: {
		do {
			if (n) continue;
			log(n);
		} while (n > 1);
		const value = n;
		<b>{value}</b>
	}
}`),
		// A plain `try` the core rule's code paths cover: its `catch` is
		// reachable only through the `try` block.
		`function f() { try { a(); } catch { b(); } c(); }`,
		// A `continue` leads to the test of a `do` loop, which can throw.
		component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@default: {
		try {
			for (;;) {
				do {
					continue;
				} while (log(n));
			}
		} catch (error) {
			log(error);
		}
		const value = n;
		<b>{value}</b>
	}
}`),
		// A `@try` in a revived arm, whose body completes.
		component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@default: {
		<div>
			@try { <b /> } @pending { <s /> } @catch (error) { <i /> }
			@if (n) { <u /> }
		</div>
	}
}`),
	],
	invalid: [
		{
			code: component(`@switch (n) {
	@case 1: {
		throw new Error('one');
		const late = 1;
		<p>{late}</p>
	}
	@default: { <i /> }
}`),
			errors: [{ messageId: 'unreachableCode', line: 6 }],
		},
		{
			code: component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@default: {
		throw new Error('two');
		const late = 2;
		<p>{late}</p>
	}
}`),
			errors: [{ messageId: 'unreachableCode', line: 7 }],
		},
		{
			code: component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@default: {
		for (const item of items) {
			throw new Error(item);
			log(item);
		}
		<b />
	}
}`),
			errors: [{ messageId: 'unreachableCode', line: 8 }],
		},
		// Every arm throws, and one always runs.
		{
			code: component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@default: { throw new Error('other'); }
}
@if (n) { <u /> }`),
			errors: [{ messageId: 'unreachableCode', line: 7 }],
		},
		// Code before the `@switch` throws.
		{
			code: `export function A({ n }) @{
	throw new Error('first');
	<div>
		@switch (n) {
			@case 1: { <b /> }
			@default: { <i /> }
		}
	</div>
}`,
			errors: [
				{ messageId: 'unreachableCode', line: 5 },
				{ messageId: 'unreachableCode', line: 6 },
			],
		},
		// In a revived arm, after a `try` that throws past its `finally`, a
		// `break`, a `continue` and an endless loop.
		{
			code: component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@default: {
		try {
			throw new Error('two');
		} finally {
			log(n);
		}
		const late = 2;
		<p>{late}</p>
	}
}`),
			errors: [{ messageId: 'unreachableCode', line: 11 }],
		},
		{
			code: component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@default: {
		for (const item of items) {
			if (item) {
				break;
				log(item);
			}
			continue;
			log(n);
		}
		while (true) {
			log(n);
		}
		const late = 2;
		<p>{late}</p>
	}
}`),
			errors: [
				{ messageId: 'unreachableCode', line: 9 },
				{ messageId: 'unreachableCode', line: 12 },
				{ messageId: 'unreachableCode', line: 17 },
			],
		},
		// A `return` reaches no `catch`, and declaring a variable can't throw.
		{
			code: component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@case 2: {
		try {
			return;
		} catch (error) {
			log(error);
		}
	}
	@default: {
		try {
			let local;
			for (;;) {}
		} catch (error) {
			log(error);
		}
	}
}`),
			errors: [
				{ messageId: 'unreachableCode', line: 8 },
				{ messageId: 'unreachableCode', line: 16 },
			],
		},
		// A `catch` the `try` block can't reach, as in the core rule.
		{
			code: `function f() { try { return 1; } catch { foo(); } bar(); }`,
			errors: [{ messageId: 'unreachableCode', line: 1, column: 40 }],
		},
		// The core rule's reports are unchanged.
		{
			code: `function f() { return 1; f(); }`,
			errors: [{ messageId: 'unreachableCode' }],
		},
		{
			code: component(`@if (n) {
	throw new Error('one');
	const late = 1;
	<p>{late}</p>
} @else { <i /> }`),
			errors: [{ messageId: 'unreachableCode', line: 5 }],
		},
	],
});

// Known limitation: code path analysis runs the blocks of a `@try` one after
// another, so after a body that throws, the core rule reports the `@pending`,
// the `@catch` and the code after the `@try`. In TSRX, a `@catch` renders when
// the `@try` body throws, so the reports on the `@catch` and on the code after
// the `@try` are false. The `@pending` report holds only when the body throws
// before it can suspend. (The React, Preact and Hono output differs: it runs
// `@pending`'s code before the body, and a throw in the body's own code, as
// here, ends the render without reaching the `@catch`.) In a revived arm,
// `tsrx/no-unreachable` should give the same reports, and no more.
describe('no-unreachable after a @try whose body throws (known limitation)', () => {
	const shape = `@try { throw new Error('two'); } @pending { <s /> } @catch (error) { <i /> }
@if (n) { <u /> }`;
	const reported = (code: string, rule_id: string) => {
		const lines = code.split('\n');
		const offset = (line: number, column: number) =>
			lines.slice(0, line - 1).reduce((total, text) => total + text.length + 1, 0) + column - 1;
		return new Linter()
			.verify(
				code,
				{
					files: ['**/*.tsrx'],
					languageOptions: { parser },
					plugins: { tsrx: { rules: { 'no-unreachable': rule } } },
					rules: { [rule_id]: 'error' },
				},
				'A.tsrx',
			)
			.map((message) =>
				code.slice(
					offset(message.line, message.column),
					offset(message.endLine!, message.endColumn!),
				),
			);
	};

	it("gets the core rule's reports in a revived arm, as outside one", () => {
		const outside = reported(component(shape), 'no-unreachable');
		const in_arm = reported(
			component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@default: {
		<div>
${shape
	.split('\n')
	.map((line) => `\t\t\t${line}`)
	.join('\n')}
		</div>
	}
}`),
			'tsrx/no-unreachable',
		);
		expect(outside).toEqual(['{ <s /> }', '{ <i /> }', 'if (n) { <u /> }']);
		expect(in_arm).toEqual(outside);
	});
});
