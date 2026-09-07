import { describe, expect, it } from 'vitest';

/** @import { OptimizeHarness } from '../../types/index' */

/**
 * Shared coverage for the opt-in dead-code elimination pass.
 * The pass only rewrites the TSRX keyword directives, so these expectations are
 * about which branches survive compilation and about what stays untouched.
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
					<div class="dead">{'deadtext'}</div>
				} @else {
					<div class="live">{'livetext'}</div>
				}
			}`;

			expect(compiled(source, false)).toContain('deadtext');
			expect(compiled(source, true)).not.toContain('deadtext');
		});

		it('keeps the branch a constant test selects and drops the other', () => {
			const code = compiled(
				`export function App() @{
					@if (1 > 2) {
						<div class="dead">{'deadtext'}</div>
					} @else {
						<div class="live">{'livetext'}</div>
					}
				}`,
				true,
			);

			expect(code).toContain('livetext');
			expect(code).not.toContain('deadtext');
		});

		it('drops a false branch of an @if that has no @else', () => {
			const code = compiled(
				`export function App() @{
					<ul>
						@if (false) {
							<li class="dead">{'deadtext'}</li>
						}
						<li class="live">{'livetext'}</li>
					</ul>
				}`,
				true,
			);

			expect(code).toContain('livetext');
			expect(code).not.toContain('deadtext');
		});

		it('renders an empty fragment when the only output is removed', () => {
			const code = compiled(
				`export function App() @{
					@if (false) {
						<div class="dead">{'deadtext'}</div>
					}
				}`,
				true,
			);

			expect(code).not.toContain('deadtext');
		});

		it('promotes a surviving @else if into the directive position', () => {
			const code = compiled(
				`export function App({ ready }) @{
					@if (false) {
						<div class="dead">{'deadtext'}</div>
					} @else if (ready) {
						<div class="ready">{'readytext'}</div>
					} @else {
						<div class="waiting">{'waitingtext'}</div>
					}
				}`,
				true,
			);

			expect(code).toContain('readytext');
			expect(code).toContain('waitingtext');
			expect(code).not.toContain('deadtext');
		});

		it('keeps a directive whose test it cannot decide', () => {
			const code = compiled(
				`export function App({ ready }) @{
					@if (ready) {
						<div class="yes">{'yestext'}</div>
					} @else {
						<div class="no">{'notext'}</div>
					}
				}`,
				true,
			);

			expect(code).toContain('yestext');
			expect(code).toContain('notext');
		});

		it('keeps a directive whose test has side effects', () => {
			const code = compiled(
				`export function App({ probe }) @{
					@if ([probe()]) {
						<div class="yes">{'yestext'}</div>
					} @else {
						<div class="no">{'notext'}</div>
					}
				}`,
				true,
			);

			expect(code).toContain('probe()');
			expect(code).toContain('yestext');
			expect(code).toContain('notext');
		});

		it('decides a directive test from a module constant', () => {
			const code = compiled(
				`const SHOW = false;
				export function App({ label }) @{
					<div class="wrap">
						@if (SHOW) {
							<b class="dead">{'deadtext'}</b>
						}
						<i class="live">{label}</i>
					</div>
				}`,
				true,
			);

			expect(code).not.toContain('deadtext');
			expect(code).toContain('const SHOW = false');
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

		it('keeps a @switch whose discriminant it cannot read', () => {
			const code = compiled(
				`export function App({ mode }) @{
					@switch (mode) {
						@case 'a': {
							<div class="alpha">{'alphacase'}</div>
						}
						@default: {
							<div class="delta">{'deltacase'}</div>
						}
					}
				}`,
				true,
			);

			expect(code).toContain('alphacase');
			expect(code).toContain('deltacase');
		});

		it('removes a @for over an empty iterable', () => {
			const code = compiled(
				`export function App() @{
					<ul>
						@for (const item of []) {
							<li class="dead">{'rowtext'}</li>
						}
						<li class="live">{'livetext'}</li>
					</ul>
				}`,
				true,
			);

			expect(code).toContain('livetext');
			expect(code).not.toContain('rowtext');
		});

		it('renders the @empty clause when the iterable is empty', () => {
			const code = compiled(
				`export function App() @{
					<ul>
						@for (const item of []) {
							<li class="row">{'rowtext'}</li>
						} @empty {
							<li class="none">{'emptytext'}</li>
						}
					</ul>
				}`,
				true,
			);

			expect(code).toContain('emptytext');
			expect(code).not.toContain('rowtext');
		});

		it('optimizes a directive used directly as a function body', () => {
			const code = compiled(
				`export const Badge = ({ label }) => @if (false) {
					<b class="dead">{'deadtext'}</b>
				} @else {
					<i class="live">{label}</i>
				};`,
				true,
			);

			expect(code).toContain('label');
			expect(code).not.toContain('deadtext');
		});

		it('keeps a dead branch that declares a hoisted name', () => {
			const code = compiled(
				`export function App({ label }) @{
					@if (false) {
						function helper() {
							return 1;
						}
						<b class="dead">{label}</b>
					} @else {
						<i class="live">{label}</i>
					}
				}`,
				true,
			);

			expect(code).toContain('helper');
		});

		it('leaves the setup statements of a block alone', () => {
			const code = compiled(
				`export function App() @{
					const flag = false;
					const total = 2 + 3;
					const untouched = 1 + 1;
					@if (flag) {
						<div class="dead">{'deadtext'}</div>
					} @else {
						<span class="total">{total}</span>
					}
				}`,
				true,
			);

			expect(code).not.toContain('deadtext');
			expect(code).toContain('2 + 3');
			expect(code).toContain('untouched');
			expect(code).toContain('{total}');
		});

		it('leaves plain JavaScript alone', () => {
			const code = compiled(
				`export function plain() {
					const flag = false;
					const untouched = 1 + 1;
					if (flag) {
						deadcall();
					} else {
						livecall();
					}
					return 1;
					aftercall();
				}`,
				true,
			);

			expect(code).toContain('untouched');
			expect(code).toContain('deadcall');
			expect(code).toContain('aftercall');
		});

		it('leaves expressions alone', () => {
			const code = compiled(
				`export function App({ probe, hit, miss }) @{
					<span class="x">{[probe()] ? hit() : miss()}</span>
				}`,
				true,
			);

			expect(code).toContain('probe()');
			expect(code).toContain('hit()');
			expect(code).toContain('miss()');
		});

		it('does not run on the editor mapping path', () => {
			const { code } = compile_to_volar_mappings(
				`export function App() @{
					@if (false) {
						<div class="dead">{'deadtext'}</div>
					} @else {
						<div class="live">{'livetext'}</div>
					}
				}`,
				'App.tsrx',
				/** @type {any} */ ({ optimize: true }),
			);

			expect(code).toContain('deadtext');
			expect(code).toContain('livetext');
		});
	});
}
