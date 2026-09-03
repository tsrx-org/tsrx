import { describe, expect, it } from 'vitest';

/** @import { OptimizeHarness } from '../../types/index' */

/**
 * Shared coverage for the opt-in dead-code elimination pass.
 * Every target runs the same target-neutral pass, so the expectations here are
 * about what survives compilation rather than about generated syntax.
 *
 * @param {OptimizeHarness} harness
 */
export function runSharedOptimizeTests({ compile, compile_to_volar_mappings, name }) {
	/**
	 * @param {string} source
	 * @param {boolean} optimize
	 * @returns {string}
	 */
	function compiled(source, optimize) {
		const result = compile(source, 'App.tsrx', { optimize });
		expect(result.errors ?? []).toEqual([]);
		return result.code;
	}

	describe(`[${name}] dead-code elimination`, () => {
		it('is off unless the caller opts in', () => {
			const source = `export function App() @{
				const flag = false;
				@if (flag) {
					<div class="dead">{'dead'}</div>
				} @else {
					<div class="live">{'live'}</div>
				}
			}`;

			expect(compiled(source, false)).toContain('dead');
			expect(compiled(source, true)).not.toContain('dead');
		});

		it('folds a constant into the expressions that read it', () => {
			const code = compiled(
				`export function App() @{
					const count = 2 + 3;
					<span class="total">{count * 2}</span>
				}`,
				true,
			);

			expect(code).toContain('10');
			expect(code).not.toContain('count');
		});

		it('folds a template literal built from constants', () => {
			const code = compiled(
				`export function App() @{
					const who = 'world';
					<span class="greeting">{\`hello \${who}\`}</span>
				}`,
				true,
			);

			expect(code).toContain('hello world');
			expect(code).not.toContain('who');
		});

		it('keeps the branch a constant test selects and drops the other', () => {
			const code = compiled(
				`export function App() @{
					@if (1 > 2) {
						<div class="dead">{'dead'}</div>
					} @else {
						<div class="live">{'live'}</div>
					}
				}`,
				true,
			);

			expect(code).toContain('live');
			expect(code).not.toContain('dead');
		});

		it('drops a false branch of an @if that has no @else', () => {
			const code = compiled(
				`export function App() @{
					<ul>
						@if (false) {
							<li class="dead">{'dead'}</li>
						}
						<li class="live">{'live'}</li>
					</ul>
				}`,
				true,
			);

			expect(code).toContain('live');
			expect(code).not.toContain('dead');
		});

		it('promotes a surviving @else if into the directive position', () => {
			const code = compiled(
				`export function App({ ready }) @{
					@if (false) {
						<div class="dead">{'dead'}</div>
					} @else if (ready) {
						<div class="ready">{'ready'}</div>
					} @else {
						<div class="waiting">{'waiting'}</div>
					}
				}`,
				true,
			);

			expect(code).toContain('ready');
			expect(code).toContain('waiting');
			expect(code).not.toContain('dead');
		});

		it('keeps a directive whose test it cannot evaluate', () => {
			const code = compiled(
				`export function App({ ready }) @{
					@if (ready) {
						<div class="yes">{'yes'}</div>
					} @else {
						<div class="no">{'no'}</div>
					}
				}`,
				true,
			);

			expect(code).toContain('yes');
			expect(code).toContain('no');
		});

		it('selects the matching case of a constant @switch', () => {
			const code = compiled(
				`export function App() @{
					const mode = 'b';
					@switch (mode) {
						@case 'a': {
							<div class="alpha">{'alphacase'}</div>
						}
						@case 'b': {
							<div class="bravo">{'bravocase'}</div>
						}
						@default: {
							<div class="delta">{'deltacase'}</div>
						}
					}
				}`,
				true,
			);

			expect(code).toContain('bravocase');
			expect(code).not.toContain('alphacase');
			expect(code).not.toContain('deltacase');
		});

		it('falls back to @default when no case matches', () => {
			const code = compiled(
				`export function App() @{
					@switch (9) {
						@case 1: {
							<div class="first">{'firstcase'}</div>
						}
						@default: {
							<div class="fallback">{'fallbackcase'}</div>
						}
					}
				}`,
				true,
			);

			expect(code).toContain('fallbackcase');
			expect(code).not.toContain('firstcase');
		});

		it('removes a @for over an empty iterable', () => {
			const code = compiled(
				`export function App() @{
					<ul>
						@for (const item of []) {
							<li class="dead">{item}</li>
						}
						<li class="live">{'live'}</li>
					</ul>
				}`,
				true,
			);

			expect(code).toContain('live');
			expect(code).not.toContain('dead');
		});

		it('picks the arm of a ternary whose test is always truthy', () => {
			const code = compiled(
				`export function pick(probe, hit, miss) {
					return [probe()] ? hit() : miss();
				}`,
				true,
			);

			expect(code).toContain('probe()');
			expect(code).toContain('hit()');
			expect(code).not.toContain('miss()');
		});

		it('drops a side-effect free test instead of sequencing it', () => {
			const code = compiled(
				`export function pick(hit, miss) {
					return [] ? hit() : miss();
				}`,
				true,
			);

			expect(code).toContain('hit()');
			expect(code).not.toContain('miss()');
			expect(code).not.toContain('[]');
		});

		it('renders the @empty clause when the iterable is empty', () => {
			const code = compiled(
				`export function App() @{
					<ul>
						@for (const item of []) {
							<li class="row">{'rowbody'}</li>
						} @empty {
							<li class="none">{'emptybody'}</li>
						}
					</ul>
				}`,
				true,
			);

			expect(code).toContain('emptybody');
			expect(code).not.toContain('rowbody');
		});

		it('keeps a loop header whose binding is never read', () => {
			const code = compiled(
				`export function count(items) {
					let total = 0;
					for (const entry of items) {
						total += 1;
					}
					return total;
				}`,
				true,
			);

			expect(code).toContain('entry');
		});

		it('keeps an unused class whose evaluation has side effects', () => {
			const code = compiled(
				`export function App({ base, register }) @{
					const Unused = class extends base() {
						static field = register();
					};
					<span class="x">{'x'}</span>
				}`,
				true,
			);

			expect(code).toContain('Unused');
		});

		it('replaces a dead if in an unbraced arm with an empty statement', () => {
			const code = compiled(
				`export function run(ready) {
					if (ready) if (false) dropped();
					return ready;
				}`,
				true,
			);

			expect(code).not.toContain('dropped');
			expect(code).toContain('if (ready)');
		});

		it('replaces a dead if in a loop body with an empty statement', () => {
			const code = compiled(
				`export function run(ready) {
					while (ready) if (false) dropped();
					return ready;
				}`,
				true,
			);

			expect(code).not.toContain('dropped');
			expect(code).toContain('while (ready)');
		});

		it('removes statements that follow a return', () => {
			const code = compiled(
				`export function value() {
					return 1;
					console.log('unreachable');
				}`,
				true,
			);

			expect(code).not.toContain('unreachable');
		});

		it('removes a binding nothing reads', () => {
			const code = compiled(
				`export function App() @{
					const unused = 1 + 1;
					<span class="x">{'x'}</span>
				}`,
				true,
			);

			expect(code).not.toContain('unused');
		});

		it('keeps a binding whose initializer has side effects', () => {
			const code = compiled(
				`export function App({ track }) @{
					const unused = track();
					<span class="x">{'x'}</span>
				}`,
				true,
			);

			expect(code).toContain('track()');
		});

		it('keeps an exported constant', () => {
			const code = compiled(`export const VERSION = '1.0.0';`, true);

			expect(code).toContain('VERSION');
		});

		it('keeps a constant a type refers to', () => {
			const code = compiled(
				`const LIMIT = 10;
				type Limit = typeof LIMIT;
				export function App({ max }: { max: Limit }) @{
					<span class="max">{max}</span>
				}`,
				true,
			);

			expect(code).toContain('LIMIT');
		});

		it('keeps a branch that declares a hoisted name', () => {
			const code = compiled(
				`export function App() {
					if (false) {
						var hoisted = 1;
					}
					return typeof hoisted;
				}`,
				true,
			);

			expect(code).toContain('hoisted');
		});

		it('does not run on the editor mapping path', () => {
			const { code } = compile_to_volar_mappings(
				`export function App() @{
					@if (false) {
						<div class="dead">{'dead'}</div>
					} @else {
						<div class="live">{'live'}</div>
					}
				}`,
				'App.tsrx',
				/** @type {any} */ ({ optimize: true }),
			);

			expect(code).toContain('dead');
			expect(code).toContain('live');
		});
	});
}
