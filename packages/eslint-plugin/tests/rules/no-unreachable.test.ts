import { RuleTester } from 'eslint';
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
