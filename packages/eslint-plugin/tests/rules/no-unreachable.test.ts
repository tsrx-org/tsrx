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
const async_component = (body: string) =>
	component(body).replace('export function', 'export async function');

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
		// `@pending` and `@catch` are reached whenever the `@try` is, and so is the
		// code after the `@try`: the blocks run in callbacks of its boundaries,
		// and the component goes on past it.
		component(`@try { throw new Error('one'); } @pending { <s /> } @catch (error) { <i /> }
@if (n) { <u /> }`),
		component(`@try { throw new Error('one'); } @catch (error) { <i /> }
@if (n) { <u /> }`),
		component(`@try { throw new Error('one'); } @pending { <s /> }
@if (n) { <u /> }`),
		component(`@try { <b /> } @pending { throw new Error('two'); } @catch (error) { <i /> }
@if (n) { <u /> }`),
		component(`@try { throw new Error('one'); } @pending { throw new Error('two'); } @catch (error) { <i /> }
@if (n) { <u /> }`),
		component(`@try { <b /> } @catch (error) { throw error; }
@if (n) { <u /> }`),
		// No block of the `@try` reaches its end, and the code after it still
		// runs: a `@try` in an element runs only when that element renders.
		component(`@try { throw new Error('one'); } @pending { throw new Error('two'); } @catch (error) { throw error; }
@if (n) { <u /> }`),
		`export function A({ log }) @{
	const view = <div>@try { throw new Error('one'); } @catch (error) { throw error; }</div>;
	log(view);
	<i />
}`,
		`export function A({ show, log }) @{
	const fallback_view = <div>@try { throw new Error('one'); } @catch (error) { throw error; }</div>;
	const message = 'hello';
	log(message);
	<p>{show ? fallback_view : message}</p>
}`,
		component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@default: {
		<div>
			@try { throw new Error('two'); } @catch (error) { throw error; }
			@if (n) { <u /> }
		</div>
	}
}`),
		// An `await` in a function doesn't keep the body in the component.
		component(`@try {
	const load = async () => {
		await log(n);
	};
	throw new Error(String(load));
} @catch (error) { <i /> }
@if (n) { <u /> }`),
		// A body that awaits runs in the component, and here reaches its end.
		async_component(`@try {
	const value = await log(n);
	<b>{value}</b>
} @pending { throw new Error('two'); } @catch (error) { <i /> }
@if (n) { <u /> }`),
		// Setup code in a `@catch`.
		component(`@try {
	log(n);
	throw new Error('one');
} @catch (error) {
	const message = String(error);
	<i>{message}</i>
}
@if (n) { <u /> }`),
		// A `@try` in a revived `@catch`, and one in a revived arm.
		component(`@try { throw new Error('one'); } @catch (error) {
	<div>
		@try { throw error; } @catch (inner) { <i /> }
		@if (n) { <u /> }
	</div>
}`),
		component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@default: {
		<div>
			@try { throw new Error('two'); } @pending { <s /> } @catch (error) { throw error; }
			@if (n) { <u /> }
		</div>
	}
}`),
		// A `try` entered in reachable code, whose block goes on in a revived path.
		`export function A({ log }) @{
	try {
		const view = <div>@try { <b /> } @catch (error) { while (true) {} }</div>;
		throw new Error(String(view));
	} catch (error) {
		log(error);
	}
	<i />
}`,
		`export function A({ log }) @{
	try {
		const view = <div>@try { <b /> } @catch (error) { while (true) {} }</div>;
		throw new Error(String(view));
	} finally {
		log('finally');
	}
	<i />
}`,
	],
	invalid: [
		// A body that awaits runs in the component, where a throw leaves it, so
		// the rest is reached only when the body reaches its end. An `await` in a
		// nested `@try`'s body keeps the outer body there too.
		{
			code: async_component(`@try {
	await log(n);
	throw new Error('one');
} @pending { <s /> } @catch (error) { <i /> }
@if (n) { <u /> }`),
			errors: [
				{ messageId: 'unreachableCode', line: 6 },
				{ messageId: 'unreachableCode', line: 6 },
				{ messageId: 'unreachableCode', line: 7 },
			],
		},
		{
			code: async_component(`@try {
	throw new Error('one');
	<div>
		@try { await log(n); } @catch (inner) { <i /> }
	</div>
} @catch (error) { <i /> }
@if (n) { <u /> }`),
			errors: [
				{ messageId: 'unreachableCode', line: 6 },
				{ messageId: 'unreachableCode', line: 6 },
				{ messageId: 'unreachableCode', line: 8 },
				{ messageId: 'unreachableCode', line: 9 },
			],
		},
		// The other forms the compiler keeps in the component: `yield`, `for
		// await` and `await using`.
		...[
			['function*', 'yield n;'],
			['async function', 'for await (const item of items) log(item);'],
			['async function', 'await using resource = log(n);'],
		].map(([kind, line]) => ({
			code: component(`@try {
	${line}
	throw new Error('one');
} @catch (error) { <i /> }
@if (n) { <u /> }`).replace('export function', `export ${kind}`),
			errors: [
				{ messageId: 'unreachableCode' as const, line: 6 },
				{ messageId: 'unreachableCode' as const, line: 7 },
			],
		})),
		// A `@pending` that awaits runs in the component too, before the body.
		{
			code: async_component(`@try { <b /> } @pending {
	await log(n);
	throw new Error('two');
} @catch (error) { <i /> }
@if (n) { <u /> }`),
			errors: [
				{ messageId: 'unreachableCode', line: 6 },
				{ messageId: 'unreachableCode', line: 7 },
			],
		},
		{
			code: async_component(`@try {
	await log(n);
	throw new Error('one');
} @pending {
	await log(n);
	<s />
} @catch (error) { <i /> }
@if (n) { <u /> }`),
			errors: [
				{ messageId: 'unreachableCode', line: 9 },
				{ messageId: 'unreachableCode', line: 10 },
			],
		},
		// In a revived path, a `catch` takes a throw from its `try` block, and the
		// `try` statements around it don't get it.
		{
			code: component(`@try { throw new Error('one'); } @catch (error) {
	try {
		try {
			throw error;
		} catch {
			for (;;) {}
		}
	} catch {
		log(n);
	}
	log(error);
	<b />
}`),
			errors: [{ messageId: 'unreachableCode', line: 10 }],
		},
		// A path revived in a loop entered in reachable code doesn't reach past
		// the loop when it is endless.
		{
			code: `export function A({ log }) @{
	for (;;) {
		const view = <div>@try { throw new Error('one'); } @catch (error) { <b /> }</div>;
		log(view);
	}
	log('dead');
	<i />
}`,
			errors: [{ messageId: 'unreachableCode', line: 6 }],
		},
		{
			code: `export function A({ n, log }) @{
	for (;;) {
		const view = <div>@switch (n) { @case 1: { throw new Error('one'); } @default: { <b /> } }</div>;
		log(view);
	}
	log('dead');
	<i />
}`,
			errors: [{ messageId: 'unreachableCode', line: 6 }],
		},
		// Code after an exit inside a block of the `@try`.
		{
			code: component(`@try {
	throw new Error('one');
	const late = 1;
	<p>{late}</p>
} @pending {
	throw new Error('two');
	const later = 2;
	<p>{later}</p>
} @catch (error) {
	throw error;
	const last = 3;
	<p>{last}</p>
}`),
			errors: [
				{ messageId: 'unreachableCode', line: 5 },
				{ messageId: 'unreachableCode', line: 9 },
				{ messageId: 'unreachableCode', line: 13 },
			],
		},
		// A `@try` that isn't reached.
		{
			code: `export function A({ n }) @{
	throw new Error('first');
	<div>
		@try { <b /> } @pending { <s /> } @catch (error) { <i /> }
		@if (n) { <u /> }
	</div>
}`,
			errors: [
				{ messageId: 'unreachableCode', line: 4, column: 8 },
				{ messageId: 'unreachableCode', line: 4, column: 27 },
				{ messageId: 'unreachableCode', line: 4, column: 52 },
				{ messageId: 'unreachableCode', line: 5 },
			],
		},
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
		// Code path analysis leads no call in a `catch` block to the `finally`
		// block. Outside a revived path the core rule's answer holds, also in a
		// `try` this rule follows.
		{
			code: `function f(a, b, c) { try { a; while (true) {} } catch (e) { b(); while (true) {} } finally { c(); } }`,
			errors: [{ messageId: 'unreachableCode', line: 1, column: 93 }],
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

// Code path analysis runs the blocks of a `@try` one after another, so after a
// body that throws, the core rule reports the `@pending`, the `@catch` and the
// code after the `@try` (a known limitation the `@tsrx/eslint-parser` README
// lists). `tsrx/no-unreachable` reports none of them, in a revived arm or not.
describe('no-unreachable after a @try whose body throws', () => {
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
	const in_arm = component(`@switch (n) {
	@case 1: { throw new Error('one'); }
	@default: {
		<div>
${shape
	.split('\n')
	.map((line) => `\t\t\t${line}`)
	.join('\n')}
		</div>
	}
}`);

	it('is reported by the core rule', () => {
		expect(reported(component(shape), 'no-unreachable')).toEqual([
			'{ <s /> }',
			'{ <i /> }',
			'if (n) { <u /> }',
		]);
	});

	it('is not reported by tsrx/no-unreachable, in a revived arm or not', () => {
		expect(reported(component(shape), 'tsrx/no-unreachable')).toEqual([]);
		expect(reported(in_arm, 'tsrx/no-unreachable')).toEqual([]);
	});
});
