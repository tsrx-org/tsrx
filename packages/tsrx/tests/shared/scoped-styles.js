/**
 * Shared cases for sibling-scoped `<style>` blocks, `$class`, and `apply`
 * (RFC tsrx-org/RFCs#1). Every target that lowers through `createJsxTransform`
 * runs them; test names that pin a baseline defect reference the RFC problem
 * they fix.
 *
 * @import { CompileHarness } from '../../types/index'
 */

import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '../../src/diagnostics.js';

/**
 * @param {string} haystack
 * @param {string} needle
 * @returns {number}
 */
function count_substring(haystack, needle) {
	return haystack.split(needle).length - 1;
}

/**
 * The hashes in `cssHash`, in emission order.
 *
 * @param {string | null} css_hash
 * @returns {string[]}
 */
function hashes_of(css_hash) {
	return css_hash ? css_hash.split(' ') : [];
}

/**
 * The scope hash a class selector was scoped with, read back from the CSS.
 *
 * @param {string} css
 * @param {string} class_name
 * @returns {string}
 */
function hash_for_selector(css, class_name) {
	const match = css.match(new RegExp(`\\.${class_name}\\.(tsrx-[0-9a-f]+)`));
	if (!match) throw new Error(`no scoped selector for .${class_name} in:\n${css}`);
	return match[1];
}

/**
 * The class attribute value the output gives an element authored with the
 * marker class `name` (first in its authored list).
 *
 * @param {string} code
 * @param {string} name
 * @returns {string}
 */
function class_of(code, name) {
	const match = code.match(new RegExp(`class(?:Name)?="(${name}[^"]*)"`));
	if (!match) throw new Error(`no literal class attribute starting with ${name} in:\n${code}`);
	return match[1];
}

/**
 * Deterministic generator for the ordering property test: a small LCG so a
 * failing tree can be reproduced from its seed.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function create_random(seed) {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

/**
 * @typedef {{
 *   id: number,
 *   kind: 'block' | 'element',
 *   blocks: number,
 *   children: Array<ScopeNode | number>,
 * }} ScopeNode
 *   `children` holds nested scopes and element ids in source order; blocks
 *   are placed by `render_scope`. A `block` scope renders as a nested
 *   `@{ <>…</> }`; an `element` scope renders as the children list of a
 *   container `<div>`, which carries only the enclosing chain and never its
 *   own scope's hash.
 */

/**
 * @param {() => number} random
 * @param {number} depth
 * @param {{ next_scope: number, next_element: number }} counters
 * @returns {ScopeNode}
 */
function generate_scope(random, depth, counters) {
	const id = counters.next_scope++;
	const kind = depth > 0 && random() < 0.5 ? 'element' : 'block';
	const blocks = Math.floor(random() * 4); // 0..3 blocks
	/** @type {Array<ScopeNode | number>} */
	const children = [];
	const child_count = 1 + Math.floor(random() * 3);
	for (let i = 0; i < child_count; i += 1) {
		if (depth < 4 && random() < 0.45) {
			children.push(generate_scope(random, depth + 1, counters));
		} else {
			children.push(counters.next_element++);
		}
	}
	// A scope with blocks needs an element of its own so its selector is not
	// pruned (pruning is covered separately); nested scopes' elements do not
	// carry the parent's marker class.
	if (blocks > 0 && !children.some((child) => typeof child === 'number')) {
		children.push(counters.next_element++);
	}
	return { id, kind, blocks, children };
}

/**
 * Render a scope tree as a component body. Blocks are spread through the
 * child list (before, between, and after nested scopes) so a scope's first
 * block may sit after a nested scope in source.
 *
 * @param {ScopeNode} scope
 * @param {() => number} random
 * @param {string} class_attr
 * @returns {string}
 */
function render_scope(scope, random, class_attr) {
	/** @type {string[]} */
	const parts = [];
	const block = `<style>.s${scope.id} { color: red; }</style>`;
	let remaining = scope.blocks;
	for (const child of scope.children) {
		if (remaining > 0 && random() < 0.5) {
			parts.push(block);
			remaining -= 1;
		}
		if (typeof child === 'number') {
			parts.push(`<div ${class_attr}="s${scope.id} e${child}">{'${child}'}</div>`);
		} else if (child.kind === 'element') {
			parts.push(
				`<div ${class_attr}="c${child.id}">${render_scope(child, random, class_attr)}</div>`,
			);
		} else {
			parts.push(`@{ <>${render_scope(child, random, class_attr)}</> }`);
		}
	}
	while (remaining > 0) {
		parts.push(block);
		remaining -= 1;
	}
	return parts.join('\n');
}

/**
 * @param {ScopeNode} scope
 * @param {string[]} chain hashes of the enclosing scopes with blocks
 * @param {Map<number, string>} hashes scope id → hash
 * @param {Array<{ id: number, chain: string[] }>} elements
 * @param {number[]} order
 * @param {Array<{ id: number, chain: string[] }>} containers element-kind scopes
 */
function expected_tree(scope, chain, hashes, elements, order, containers) {
	const own_chain =
		scope.blocks > 0 ? [...chain, /** @type {string} */ (hashes.get(scope.id))] : chain;
	if (scope.blocks > 0) {
		for (let i = 0; i < scope.blocks; i += 1) order.push(scope.id);
	}
	for (const child of scope.children) {
		if (typeof child === 'number') {
			elements.push({ id: child, chain: own_chain });
		} else {
			// A container element is an item of this scope's list, not of the
			// list it contains: it carries this scope's chain only.
			if (child.kind === 'element') containers.push({ id: child.id, chain: own_chain });
			expected_tree(child, own_chain, hashes, elements, order, containers);
		}
	}
}

/**
 * @param {CompileHarness} harness
 */
export function runSharedScopedStyleTests({
	compile,
	name,
	classAttrName,
	generatedClassAttrName = classAttrName,
}) {
	const attr = generatedClassAttrName;

	describe(`[${name}] style scopes`, () => {
		it('rfc1-multiple-blocks: two blocks in one scope share the hash and emit in source order', () => {
			const { code, css, cssHash } = compile(
				`export function App() @{
					<>
						<div ${attr}="a">{'a'}</div>
						<style>.a { color: red; }</style>
						<p ${attr}="b">{'b'}</p>
						<style>.b { margin: 0; }</style>
					</>
				}`,
				'App.tsrx',
			);

			expect(hashes_of(cssHash)).toHaveLength(1);
			const hash = hashes_of(cssHash)[0];
			expect(class_of(code, 'a')).toBe(`a ${hash}`);
			expect(class_of(code, 'b')).toBe(`b ${hash}`);
			expect(css.indexOf(`.a.${hash}`)).toBeLessThan(css.indexOf(`.b.${hash}`));
			expect(css).not.toContain('(unused)');
		});

		it('rfc1-nested-scope: a nested @{} gets its own hash and emits after its parent even when written first', () => {
			const { code, css, cssHash } = compile(
				`export function App() @{
					<>
						<section ${attr}="outer">
							@{
								<>
									<style>.inner { color: blue; }</style>
									<p ${attr}="inner">{'inner'}</p>
								</>
							}
						</section>
						<style>.outer { color: red; }</style>
					</>
				}`,
				'App.tsrx',
			);

			const outer = hash_for_selector(css, 'outer');
			const inner = hash_for_selector(css, 'inner');
			expect(outer).not.toBe(inner);
			expect(hashes_of(cssHash)).toEqual([outer, inner]);
			expect(css.indexOf('.outer.')).toBeLessThan(css.indexOf('.inner.'));
			expect(class_of(code, 'outer')).toBe(`outer ${outer}`);
			expect(class_of(code, 'inner')).toBe(`inner ${outer} ${inner}`);
		});

		it('lowers three nested scope levels with accumulated hashes, outer first', () => {
			const { code, css } = compile(
				`export function App() @{
					<>
						<style>.l1 { color: red; }</style>
						<div ${attr}="l1">
							@{
								<>
									<style>.l2 { color: red; }</style>
									<div ${attr}="l2">
										@{
											<>
												<style>.l3 { color: red; }</style>
												<div ${attr}="l3">{'deep'}</div>
											</>
										}
									</div>
								</>
							}
						</div>
					</>
				}`,
				'App.tsrx',
			);

			const l1 = hash_for_selector(css, 'l1');
			const l2 = hash_for_selector(css, 'l2');
			const l3 = hash_for_selector(css, 'l3');
			expect(class_of(code, 'l1')).toBe(`l1 ${l1}`);
			expect(class_of(code, 'l2')).toBe(`l2 ${l1} ${l2}`);
			expect(class_of(code, 'l3')).toBe(`l3 ${l1} ${l2} ${l3}`);
			expect(code).not.toContain('`${`');
		});

		it('rfc1-control-flow: fragments in directive bodies are scopes whose CSS ships unconditionally', () => {
			const { code, css, cssHash } = compile(
				`export function App({ ready, items, kind }: { ready: boolean, items: string[], kind: number }) @{
					<>
						<style>.root { color: red; }</style>
						<div ${attr}="root">{'root'}</div>
						@if (ready) {
							<>
								<style>.yes { color: green; }</style>
								<p ${attr}="yes">{'yes'}</p>
							</>
						} @else {
							<>
								<style>.no { color: gray; }</style>
								<p ${attr}="no">{'no'}</p>
							</>
						}
						@for (const item of items) {
							<>
								<style>.item { color: blue; }</style>
								<li ${attr}="item">{item}</li>
							</>
						}
						@switch (kind) {
							@case 1: {
								<>
									<style>.one { color: black; }</style>
									<b ${attr}="one">{'one'}</b>
								</>
							}
							@default: {
								<i ${attr}="other">{'other'}</i>
							}
						}
						@try {
							<>
								<style>.ok { color: teal; }</style>
								<em ${attr}="ok">{'ok'}</em>
							</>
						} @catch (error) {
							<s ${attr}="err">{'err'}</s>
						}
					</>
				}`,
				'App.tsrx',
			);

			const root = hash_for_selector(css, 'root');
			const yes = hash_for_selector(css, 'yes');
			const no = hash_for_selector(css, 'no');
			const item = hash_for_selector(css, 'item');
			const one = hash_for_selector(css, 'one');
			const ok = hash_for_selector(css, 'ok');
			expect(hashes_of(cssHash)).toEqual([root, yes, no, item, one, ok]);
			expect(class_of(code, 'root')).toBe(`root ${root}`);
			expect(class_of(code, 'yes')).toBe(`yes ${root} ${yes}`);
			expect(class_of(code, 'no')).toBe(`no ${root} ${no}`);
			expect(class_of(code, 'item')).toBe(`item ${root} ${item}`);
			expect(class_of(code, 'one')).toBe(`one ${root} ${one}`);
			// A branch without a block of its own carries only the outer hash.
			expect(class_of(code, 'other')).toBe(`other ${root}`);
			expect(class_of(code, 'ok')).toBe(`ok ${root} ${ok}`);
			expect(class_of(code, 'err')).toBe(`err ${root}`);
			expect(css).not.toContain('(unused)');
		});

		it('emits sibling scopes in source order', () => {
			const { css, cssHash } = compile(
				`export function App() @{
					<>
						@{ <><style>.first { color: red; }</style><div ${attr}="first">{'1'}</div></> }
						@{ <><style>.second { color: red; }</style><div ${attr}="second">{'2'}</div></> }
						@{ <><style>.third { color: red; }</style><div ${attr}="third">{'3'}</div></> }
					</>
				}`,
				'App.tsrx',
			);

			expect(hashes_of(cssHash)).toEqual([
				hash_for_selector(css, 'first'),
				hash_for_selector(css, 'second'),
				hash_for_selector(css, 'third'),
			]);
		});

		it('rfc1-problem4-element-rooted-assigned-template-keeps-css', () => {
			// The block sits in the div's children list: it styles the children,
			// never the div that contains it (A1 Rule A).
			const { code, css, cssHash } = compile(
				`export function App() @{
					const card = <div ${attr}="card"><style>.text { color: red; } .card { padding: 0; }</style><p ${attr}="text">{'hi'}</p></div>;
					<>
						{card}
						<p ${attr}="outside">{'outside'}</p>
					</>
				}`,
				'App.tsrx',
			);

			const hash = hash_for_selector(css, 'text');
			expect(hashes_of(cssHash)).toEqual([hash]);
			expect(css).toContain('color: red;');
			expect(css).toContain('/* (unused) .card { padding: 0; }*/');
			expect(code).not.toContain('<style');
			expect(class_of(code, 'card')).toBe('card');
			expect(class_of(code, 'text')).toBe(`text ${hash}`);
			expect(class_of(code, 'outside')).toBe('outside');
		});

		it('a1-sibling-scope: a block styles the items beside it and below, never its container', () => {
			const { code, css, cssHash } = compile(
				`export function Status({ ready }: { ready: boolean }) @{
					<>
						<style>.status { padding: 0.5rem; }</style>
						<section ${attr}="status">
							<style>.title { font-weight: bold; } .status { margin: 0; }</style>
							<h2 ${attr}="title">{'Status'}</h2>
							@if (ready) {
								<>
									<style>.ok { color: green; }</style>
									<p ${attr}="ok">{'Ready'}</p>
								</>
							} @else {
								<>
									<style>.wait { color: gray; }</style>
									<p ${attr}="wait">{'Waiting'}</p>
								</>
							}
						</section>
					</>
				}`,
				'App.tsrx',
			);

			const a = hash_for_selector(css, 'status');
			const b = hash_for_selector(css, 'title');
			const c = hash_for_selector(css, 'ok');
			const d = hash_for_selector(css, 'wait');
			expect(new Set([a, b, c, d]).size).toBe(4);
			expect(hashes_of(cssHash)).toEqual([a, b, c, d]);
			expect(class_of(code, 'status')).toBe(`status ${a}`);
			expect(class_of(code, 'title')).toBe(`title ${a} ${b}`);
			expect(class_of(code, 'ok')).toBe(`ok ${a} ${b} ${c}`);
			expect(class_of(code, 'wait')).toBe(`wait ${a} ${b} ${d}`);
			// <section> is not an item of its own children list.
			expect(css).toContain('/* (unused) .status { margin: 0; }*/');
			expect(css.indexOf(`.status.${a}`)).toBeLessThan(css.indexOf(`.title.${b}`));
			expect(css.indexOf(`.title.${b}`)).toBeLessThan(css.indexOf(`.ok.${c}`));
			expect(css.indexOf(`.ok.${c}`)).toBeLessThan(css.indexOf(`.wait.${d}`));
		});

		it('a1-two-lists: a fragment nested in a fragment is a scope of its own', () => {
			const { code, css, cssHash } = compile(
				`export function App() @{
					<>
						<style>.a { color: red; }</style>
						<>
							<style>.b { color: blue; }</style>
							<div ${attr}="a b">{'x'}</div>
						</>
						<p ${attr}="outer">{'y'}</p>
					</>
				}`,
				'App.tsrx',
			);

			const a = hash_for_selector(css, 'a');
			const b = hash_for_selector(css, 'b');
			expect(a).not.toBe(b);
			expect(hashes_of(cssHash)).toEqual([a, b]);
			expect(class_of(code, 'a')).toBe(`a b ${a} ${b}`);
			expect(class_of(code, 'outer')).toBe(`outer ${a}`);
		});

		it('a1-needs-fragment: a lone block as the output of a @{} body is a coded error', () => {
			const source = `export function App() @{ <style>.a { color: red; }</style> }`;

			expect(compile(source, 'App.tsrx', { collect: true }).errors.map((e) => e.code)).toEqual([
				DIAGNOSTIC_CODES.STYLE_STANDALONE_NEEDS_FRAGMENT,
			]);
			expect(() => compile(source, 'App.tsrx')).toThrow(
				expect.objectContaining({ code: DIAGNOSTIC_CODES.STYLE_STANDALONE_NEEDS_FRAGMENT }),
			);
		});

		it('a1-per-list-sharing: blocks share a hash per list, not per element subtree', () => {
			const { code, css, cssHash } = compile(
				`export function App() @{
					<>
						<style>.outer { color: red; }</style>
						<section ${attr}="outer">
							<style>.one { color: blue; }</style>
							<style>.two { color: green; }</style>
							<p ${attr}="one two">{'x'}</p>
						</section>
					</>
				}`,
				'App.tsrx',
			);

			const outer = hash_for_selector(css, 'outer');
			const inner = hash_for_selector(css, 'one');
			expect(hash_for_selector(css, 'two')).toBe(inner);
			expect(inner).not.toBe(outer);
			expect(hashes_of(cssHash)).toEqual([outer, inner]);
			expect(class_of(code, 'outer')).toBe(`outer ${outer}`);
			expect(class_of(code, 'one')).toBe(`one two ${outer} ${inner}`);
		});

		it('a1-apply-in-children: apply on a children-list block reaches the siblings, not the container', () => {
			const { code, css } = compile(
				`const theme = <style>.t { color: red; }</style>;
				export function App() @{
					<section ${attr}="host">
						<style apply={theme} />
						<p ${attr}="inner">{'x'}</p>
					</section>
				}`,
				'App.tsrx',
			);

			const theme = hash_for_selector(css, 't');
			expect(class_of(code, 'host')).toBe('host');
			expect(class_of(code, 'inner')).toBe(`inner ${theme}`);
		});

		it('c1-expression-child: <style>{css}</style> is an ordinary element with no CSS, hash, or stamp', () => {
			for (const source of [
				`export function App({ css }: { css: string }) { return <section><style>{css}</style><div ${attr}="d" /></section>; }`,
				`export function App({ css }: { css: string }) @{
					<section>
						<style>{css}</style>
						<style>.d { color: red; }</style>
						<div ${attr}="d">{'d'}</div>
					</section>
				}`,
			]) {
				const { code, css, cssHash } = compile(source, 'App.tsrx');
				expect(code).toContain('<style>{css}</style>');
				expect(code).not.toMatch(/<style [^>]*class/);
				if (source.includes('.d {')) {
					const hash = hash_for_selector(css, 'd');
					expect(hashes_of(cssHash)).toEqual([hash]);
					expect(class_of(code, 'd')).toBe(`d ${hash}`);
				} else {
					expect(css).toBe('');
					expect(cssHash).toBeNull();
					expect(class_of(code, 'd')).toBe('d');
				}
			}
		});

		it('prunes an inner-scope selector that only matches outer elements', () => {
			const { css } = compile(
				`export function App() @{
					<>
						<div ${attr}="outer">
							@{
								<>
									<style>
										.inner { color: blue; }
										.outer { color: red; }
									</style>
									<p ${attr}="inner">{'inner'}</p>
								</>
							}
						</div>
					</>
				}`,
				'App.tsrx',
			);

			expect(css).toContain('/* (unused) .outer { color: red; }*/');
			expect(css).toMatch(/\.inner\.tsrx-[0-9a-f]+ \{ color: blue; \}/);
		});

		it('stops stamping and pruning at a function boundary', () => {
			const { code, css } = compile(
				`export function App({ items }: { items: string[] }) @{
					<>
						<style>
							.own { color: red; }
							.callback { color: blue; }
						</style>
						<ul ${attr}="own">{items.map((item) => <li ${attr}="callback">{item}</li>)}</ul>
					</>
				}`,
				'App.tsrx',
			);

			const hash = hash_for_selector(css, 'own');
			expect(class_of(code, 'own')).toBe(`own ${hash}`);
			expect(class_of(code, 'callback')).toBe('callback');
			expect(css).toContain('/* (unused) .callback { color: blue; }*/');
		});

		it('adds the generated class attribute with the platform name and keeps authored ones', () => {
			const { code, cssHash } = compile(
				`export function App() @{
					<>
						<style>span { color: red; }</style>
						<span>{'plain'}</span>
						<b class="bold">{'b'}</b>
						<i className="italic">{'i'}</i>
					</>
				}`,
				'App.tsrx',
			);

			const hash = hashes_of(cssHash)[0];
			expect(code).toContain(`<span ${attr}="${hash}">`);
			expect(code).toContain(`class="bold ${hash}"`);
			expect(code).toContain(`className="italic ${hash}"`);
		});

		it('drops a scope whose only block matches nothing without emitting a style element', () => {
			const { code, css } = compile(
				`export function App() @{
					<><style>.nothing { color: red; }</style></>
				}`,
				'App.tsrx',
			);

			expect(code).not.toContain('<style');
			expect(css).toContain('/* (unused) .nothing { color: red; }*/');
		});

		it('rfc1-dedupes cssHash to one entry per scope', () => {
			const { cssHash } = compile(
				`export function App() @{
					<>
						<style>.a { color: red; }</style>
						<style>.a { margin: 0; }</style>
						<style>.a { padding: 0; }</style>
						<div ${attr}="a">{'a'}</div>
					</>
				}`,
				'App.tsrx',
			);

			expect(hashes_of(cssHash)).toHaveLength(1);
		});
	});

	describe(`[${name}] style themes and apply`, () => {
		it('exposes $class first on every assigned block', () => {
			const { code, cssHash } = compile(
				`export function App() @{
					const styles = <style>
						.card { margin: 5px; }
						.title { color: red; }
					</style>;
					<div ${classAttrName}={styles.card} />
				}`,
				'App.tsrx',
			);

			const hash = hashes_of(cssHash)[0];
			expect(code).toContain(`'$class': '${hash}'`);
			expect(code).toContain(`'card': '${hash} card'`);
			expect(code.indexOf("'$class'")).toBeLessThan(code.indexOf("'card'"));
			expect(code).toContain(`'title': '${hash} title'`);
		});

		it('composes $class from applied same-module themes, own hash last', () => {
			const { code, css } = compile(
				`const base = <style>.x { color: red; }</style>;
				const accent = <style apply={base}>.y { color: blue; }</style>;
				export const theme = <style apply={accent}>.z { color: green; }</style>;`,
				'App.tsrx',
			);

			const base = hash_for_selector(css, 'x');
			const accent = hash_for_selector(css, 'y');
			const theme = hash_for_selector(css, 'z');
			expect(code).toContain(`'$class': '${base}'`);
			expect(code).toContain(`'$class': '${base} ${accent}'`);
			expect(code).toContain(`'$class': '${base} ${accent} ${theme}'`);
			// Own class entries carry only the own hash.
			expect(code).toContain(`'z': '${theme} z'`);
		});

		it('keeps imported themes as runtime $class references', () => {
			const { code, css } = compile(
				`import { base } from './base.tsrx';
				import * as themes from './themes.tsrx';
				export const theme = <style apply={[base, themes.dark]}>.y { color: blue; }</style>;`,
				'App.tsrx',
			);

			const own = hash_for_selector(css, 'y');
			expect(code).toContain(`'$class': base.$class + ' ' + themes.dark.$class + ' ${own}'`);
		});

		it('folds static and runtime apply entries into one expression', () => {
			const { code, css } = compile(
				`import { remote } from './remote.tsrx';
				const local = <style>.l { color: red; }</style>;
				export const theme = <style apply={[local, remote]}>.t { color: blue; }</style>;`,
				'App.tsrx',
			);

			const local = hash_for_selector(css, 'l');
			const own = hash_for_selector(css, 't');
			expect(code).toContain(`'$class': '${local} ' + remote.$class + ' ${own}'`);
		});

		it('gives a body-less apply block a $class only', () => {
			const { code, css, cssHash } = compile(
				`import { a, b } from './themes.tsrx';
				export const bundle = <style apply={[a, b]} />;`,
				'App.tsrx',
			);

			expect(code).toContain("export const bundle = { '$class': a.$class + ' ' + b.$class };");
			expect(css).toBe('');
			expect(cssHash).toBeNull();
		});

		it('rfc1-apply-self-closed: stamps the theme on every element of the scope without an own hash', () => {
			const { code, css, cssHash } = compile(
				`export const theme = <style>div { color: black; }</style>;
				export function App() @{
					<>
						<style apply={theme} />
						<div ${attr}="a">{'a'}</div>
						<p ${attr}="b"><span ${attr}="c">{'c'}</span></p>
					</>
				}`,
				'App.tsrx',
			);

			const theme_hash = hashes_of(cssHash)[0];
			expect(hashes_of(cssHash)).toEqual([theme_hash]);
			expect(css).toContain(`div.${theme_hash} { color: black; }`);
			expect(class_of(code, 'a')).toBe(`a ${theme_hash}`);
			expect(class_of(code, 'b')).toBe(`b ${theme_hash}`);
			expect(class_of(code, 'c')).toBe(`c ${theme_hash}`);
			expect(code).not.toContain('<style');
		});

		it('rfc1-opening-example: theme, scope, and nested scope produce the RFC class table and CSS order', () => {
			const { code, css, cssHash } = compile(
				`export const theme = <style>
					div { color: black; }
					.dark { color: white; }
				</style>;

				export function Panel() @{
					<>
						<style apply={theme} />
						<span ${classAttrName}={theme.dark}>{'x'}</span>
						<div ${attr}="outer">
							@{
								<>
									<style>div { font-weight: bold; }</style>
									<div ${attr}="inner">{'y'}</div>
								</>
							}
						</div>
						<style>div { color: purple; }</style>
					</>
				}`,
				'App.tsrx',
			);

			const [theme_hash, scope_a, scope_b] = hashes_of(cssHash);
			expect(scope_b).toBeDefined();
			// CSS order: theme → scope A → nested scope B.
			expect(css.indexOf(`.dark.${theme_hash}`)).toBeLessThan(css.indexOf('color: purple'));
			expect(css.indexOf('color: purple')).toBeLessThan(css.indexOf('font-weight: bold'));
			// Class table: own classes, scope hashes outer→inner, then the theme.
			expect(code).toContain(`${classAttrName}={\`\${theme.dark} ${scope_a} ${theme_hash}\`}`);
			expect(class_of(code, 'outer')).toBe(`outer ${scope_a} ${theme_hash}`);
			expect(class_of(code, 'inner')).toBe(`inner ${scope_a} ${scope_b} ${theme_hash}`);
		});

		it('shares the scope hash between an apply block with a body and its siblings', () => {
			const { code, css, cssHash } = compile(
				`const theme = <style>.t { color: red; }</style>;
				export function App() @{
					<>
						<style apply={theme}>.a { color: blue; }</style>
						<style>.b { color: green; }</style>
						<div ${attr}="a">{'a'}</div>
						<div ${attr}="b">{'b'}</div>
					</>
				}`,
				'App.tsrx',
			);

			const theme_hash = hash_for_selector(css, 't');
			const scope = hash_for_selector(css, 'a');
			expect(hash_for_selector(css, 'b')).toBe(scope);
			expect(hashes_of(cssHash)).toEqual([theme_hash, scope]);
			expect(class_of(code, 'a')).toBe(`a ${scope} ${theme_hash}`);
			expect(class_of(code, 'b')).toBe(`b ${scope} ${theme_hash}`);
		});

		it('combines two apply blocks in one scope in source order', () => {
			const { code, css } = compile(
				`const one = <style>.one { color: red; }</style>;
				const two = <style>.two { color: blue; }</style>;
				export function App() @{
					<>
						<style apply={one} />
						<style apply={two} />
						<div ${attr}="a">{'a'}</div>
					</>
				}`,
				'App.tsrx',
			);

			expect(class_of(code, 'a')).toBe(
				`a ${hash_for_selector(css, 'one')} ${hash_for_selector(css, 'two')}`,
			);
		});

		it('stamps imported themes as runtime reads after every scope hash', () => {
			const { code, css } = compile(
				`import { theme } from './theme.tsrx';
				export function App({ active }: { active: boolean }) @{
					<>
						<style apply={theme} />
						<style>.a { color: red; }</style>
						<div ${attr}="a">{'a'}</div>
						<p ${classAttrName}={active ? 'on' : 'off'}>
							@{
								<>
									<style>.n { color: blue; }</style>
									<b ${attr}="n">{'n'}</b>
								</>
							}
						</p>
					</>
				}`,
				'App.tsrx',
			);

			const scope = hash_for_selector(css, 'a');
			const nested = hash_for_selector(css, 'n');
			expect(code).toContain(`\`a ${scope} \${theme.$class}\``);
			expect(code).toContain(`\`\${active ? 'on' : 'off'} ${scope} \${theme.$class}\``);
			expect(code).toContain(`\`n ${scope} ${nested} \${theme.$class}\``);
			expect(code).not.toContain('`${`');
		});

		it('rfc1-exported-theme: an exported block keeps element and descendant selectors', () => {
			const { code, css, cssHash } = compile(
				`export const theme = <style>
					div { color: red; }
					.card .title { font-weight: bold; }
					.card { padding: 0; }
				</style>;`,
				'App.tsrx',
			);

			const hash = hashes_of(cssHash)[0];
			expect(css).not.toContain('(unused)');
			expect(css).toContain(`div.${hash} { color: red; }`);
			expect(css).toContain(`.card.${hash} .title:where(.${hash}) { font-weight: bold; }`);
			expect(code).toContain(`'$class': '${hash}'`);
			expect(code).toContain(`'card': '${hash} card'`);
		});

		it('keeps every selector of an applied local block', () => {
			const { css } = compile(
				`const theme = <style>
					div { color: red; }
					.x { color: blue; }
				</style>;
				export function App() @{ <><style apply={theme} /><div>{'a'}</div></> }`,
				'App.tsrx',
			);

			expect(css).not.toContain('(unused)');
		});

		it('still prunes an unexported, unapplied assigned block', () => {
			const { css } = compile(
				`export function App() @{
					const styles = <style>
						div { color: red; }
						.card { color: green; }
					</style>;
					<div ${classAttrName}={styles.card} />
				}`,
				'App.tsrx',
			);

			expect(css).toContain('/* (unused) div { color: red; }*/');
		});

		it('resolves apply through lexical scope to a block declared in the component body', () => {
			const { code, css } = compile(
				`export function App() @{
					const local = <style>.l { color: red; }</style>;
					<>
						<style apply={local} />
						<div ${attr}="a">{'a'}</div>
					</>
				}`,
				'App.tsrx',
			);

			expect(class_of(code, 'a')).toBe(`a ${hash_for_selector(css, 'l')}`);
		});

		it('emits a theme declared in the component body before the scope that applies it', () => {
			const { css, cssHash } = compile(
				`export function App() @{
					const local = <style>.l { color: red; }</style>;
					<>
						<style apply={local}>.a { color: blue; }</style>
						<div ${attr}="a">{'a'}</div>
					</>
				}`,
				'App.tsrx',
			);

			expect(hashes_of(cssHash)).toEqual([
				hash_for_selector(css, 'l'),
				hash_for_selector(css, 'a'),
			]);
		});

		it('scopes an assigned @{} block: a theme in its setup applies to its fragment', () => {
			const { code, css, cssHash } = compile(
				`const something = @{
					const theme = <style>.dark { color: white; }</style>;
					<>
						<style apply={theme}>.card { color: red; }</style>
						<div ${attr}="card">{'x'}</div>
					</>
				};
				export function App() @{
					<section>{something}</section>
				}`,
				'App.tsrx',
			);

			const theme = hash_for_selector(css, 'dark');
			const scope = hash_for_selector(css, 'card');
			expect(hashes_of(cssHash)).toEqual([theme, scope]);
			expect(code).toContain(`'$class': '${theme}'`);
			expect(class_of(code, 'card')).toBe(`card ${scope} ${theme}`);
			expect(code).not.toContain('<style');
		});

		it('scopes an assigned @{} block inside a component with a self-closed apply', () => {
			const { code, css, cssHash } = compile(
				`export function App() @{
					const panel = @{
						const local = <style>.l { color: blue; }</style>;
						<>
							<style apply={local} />
							<p ${attr}="p">{'p'}</p>
						</>
					};
					<>
						<style>.outer { color: red; }</style>
						<section ${attr}="outer">{panel}</section>
					</>
				}`,
				'App.tsrx',
			);

			const local = hash_for_selector(css, 'l');
			const outer = hash_for_selector(css, 'outer');
			// The assigned block is setup code of the component scope: its own
			// sheet emits at its declaration, before the component's scope group.
			expect(hashes_of(cssHash)).toEqual([local, outer]);
			expect(class_of(code, 'p')).toBe(`p ${local}`);
			expect(class_of(code, 'outer')).toBe(`outer ${outer}`);
		});

		it('rfc1-class-opt-in: reading theme.$class keeps every selector and applies only to opting elements', () => {
			const { code, css, cssHash } = compile(
				`function Card({ parentClass }: { parentClass: string }) @{
					<>
						<style>.local { padding: 0; }</style>
						<article ${classAttrName}={parentClass}>
							<h2 ${classAttrName}={parentClass}>{'title'}</h2>
						</article>
					</>
				}
				export function App() @{
					const theme = <style>
						div { color: blue; }
						.card { color: red; }
					</style>;
					<>
						<Card parentClass={theme.$class} />
						<div ${classAttrName}={theme.$class}>{'opted in'}</div>
						<div ${classAttrName}={theme.card}>{'card'}</div>
						<p>{'untouched'}</p>
					</>
				}`,
				'App.tsrx',
			);

			const local = hash_for_selector(css, 'local');
			const theme = hashes_of(cssHash).find((hash) => hash !== local);
			// Reading $class makes the local block a theme: no selector is pruned.
			expect(css).not.toContain('(unused)');
			expect(css).toContain(`div.${theme} { color: blue; }`);
			expect(code).toContain(`'$class': '${theme}'`);
			// Only the elements that read $class carry the theme hash; the
			// untouched sibling and the class-map entry stay as authored.
			expect(code).toContain(`${classAttrName}={theme.$class}`);
			expect(code).toContain(`${classAttrName}={theme.card}`);
			expect(code).toMatch(/<p>\{'untouched'\}<\/p>/);
			// The child stamps the passed class ahead of its own scope hash.
			expect(code).toContain(`<article ${classAttrName}={\`\${parentClass} ${local}\`}>`);
			expect(code).toContain(`<h2 ${classAttrName}={\`\${parentClass} ${local}\`}>`);
		});

		it('keeps class-map pruning when only class entries of a local block are read', () => {
			const { css } = compile(
				`export function App() @{
					const styles = <style>
						div { color: blue; }
						.card { color: red; }
					</style>;
					<div ${classAttrName}={styles.card}>{'card'}</div>
				}`,
				'App.tsrx',
			);

			expect(css).toContain('/* (unused) div { color: blue; }*/');
		});

		it('includes $class in the class map handed to a style ref', () => {
			const { code, cssHash } = compile(
				`export function App() @{
					let classes;
					<>
						<div ${attr}="a">{'a'}</div>
						<style ref={classes}>.a { color: red; }</style>
					</>
				}`,
				'App.tsrx',
			);

			const hash = hashes_of(cssHash)[0];
			expect(code).toContain(`'$class': '${hash}'`);
			expect(code).toContain(`'a': '${hash} a'`);
		});
	});

	describe(`[${name}] :global selectors`, () => {
		it('global-forms: :global leaves the wrapped part unscoped and scopes the rest of the selector', () => {
			const { code, css, cssHash } = compile(
				`export function App() @{
					<>
						<style>
							:global(.toast) { position: fixed; }
							.card :global(.note) { color: gray; }
							:global(.theme-dark) .card { background: black; }
							:global([data-theme='dark']) .card { color: white; }
							.card:global(.is-open) { border-color: blue; }
							.card :global(.a) :global(.b) { margin: 0; }
							.card .title { font-weight: bold; }
							:global { .banner { top: 0; } body { margin: 0; } }
							.card { :global { .tag { color: blue; } .pill { color: green; } } }
							.card { :global(.chip) { color: teal; } }
							.card { .title { color: black; } }
						</style>
						<div ${attr}="card"><h2 ${attr}="title">{'t'}</h2></div>
					</>
				}`,
				'App.tsrx',
			);

			const [hash] = hashes_of(cssHash);
			expect(class_of(code, 'card')).toBe(`card ${hash}`);
			const plain_css = css.replace(/\/\*[^]*?\*\//g, '').replace(/\s+/g, ' ');
			// Bare: a page-wide rule with no hash at all.
			expect(css).toContain('.toast { position: fixed; }');
			expect(css).not.toContain(`.toast.${hash}`);
			// Prefixed: the scoped compound keeps its hash, the global part gets none.
			expect(css).toContain(`.card.${hash} .note { color: gray; }`);
			// Leading: only the author's own element is scoped.
			expect(css).toContain(`.theme-dark .card.${hash} { background: black; }`);
			expect(css).toContain(`[data-theme='dark'] .card.${hash} { color: white; }`);
			// Compound: the hash goes between the scoped class and the global one.
			expect(css).toContain(`.card.${hash}.is-open { border-color: blue; }`);
			// Several trailing :global parts chain.
			expect(css).toContain(`.card.${hash} .a .b { margin: 0; }`);
			// Specificity baseline: only the first compound carries the hash class;
			// later compounds get :where(.<hash>), which adds none.
			expect(css).toContain(`.card.${hash} .title:where(.${hash}) { font-weight: bold; }`);
			// Block form: the wrapper is left behind as a comment and everything
			// inside it is unscoped.
			expect(css).toMatch(/\/\*\s*:global \{\s*\*\//);
			expect(plain_css).toContain('.banner { top: 0; }');
			expect(plain_css).toContain('body { margin: 0; }');
			expect(css).not.toContain(`.banner.${hash}`);
			// Nested under a scoped rule, both forms reach only below .card.
			expect(plain_css).toContain(
				`.card.${hash} { .tag { color: blue; } .pill { color: green; } }`,
			);
			expect(plain_css).toContain(`.card.${hash} { .chip { color: teal; } }`);
			// Plain nesting scopes both parts.
			expect(plain_css).toContain(`.card.${hash} { .title.${hash} { color: black; } }`);
			expect(css).not.toContain('(unused)');
		});

		it('global-theme: a theme keeps bare and prefixed :global rules with its own hash', () => {
			const { css, cssHash } = compile(
				`export const theme = <style>
					:global(body) { margin: 0; }
					.card :global(.note) { color: gray; }
					.card { color: blue; }
				</style>;`,
				'theme.tsrx',
			);

			const [hash] = hashes_of(cssHash);
			expect(css).toContain('body { margin: 0; }');
			expect(css).toContain(`.card.${hash} .note { color: gray; }`);
			expect(css).toContain(`.card.${hash} { color: blue; }`);
			expect(css).not.toContain('(unused)');
		});
	});

	describe(`[${name}] style diagnostic codes`, () => {
		/**
		 * @param {string} source
		 * @returns {Array<string | undefined>}
		 */
		const codes = (source) =>
			compile(source, 'App.tsrx', { collect: true }).errors.map((error) => error.code);

		it('reports an unresolved apply target and still compiles', () => {
			const result = compile(
				`export function App() @{ <><style apply={missing} /><div>{'a'}</div></> }`,
				'App.tsrx',
				{ collect: true },
			);

			expect(result.errors.map((error) => error.code)).toEqual([
				DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
			]);
			expect(result.code).toContain('<div');
		});

		it('reports apply before declaration at the identifier', () => {
			const result = compile(
				`export function App() @{ <><style apply={theme} /><div>{'a'}</div></> }
				const theme = <style>div { color: red; }</style>;`,
				'App.tsrx',
				{ collect: true },
			);

			expect(result.errors).toHaveLength(1);
			expect(result.errors[0].code).toBe(DIAGNOSTIC_CODES.STYLE_APPLY_BEFORE_DECLARATION);
			expect(result.errors[0].loc?.start).toEqual({ line: 1, column: 41 });
		});

		it('reports a standalone block at module scope', () => {
			expect(codes(`<style>div { color: red; }</style>;`)).toEqual([
				DIAGNOSTIC_CODES.STYLE_STANDALONE_AT_MODULE_SCOPE,
			]);
		});

		it('b1-outside-template: reports a bodied standalone block outside every @{} and control-flow body', () => {
			const source = `export function App() { return <section ${attr}="s"><style>.s { color: red; }</style><div ${attr}="s" /></section>; }`;

			expect(codes(source)).toEqual([DIAGNOSTIC_CODES.STYLE_STANDALONE_OUTSIDE_TEMPLATE]);
			expect(() => compile(source, 'App.tsrx')).toThrow(
				expect.objectContaining({ code: DIAGNOSTIC_CODES.STYLE_STANDALONE_OUTSIDE_TEMPLATE }),
			);
			// The same block inside a control-flow body is TSRX template syntax.
			expect(
				codes(
					`export function App({ x }: { x: boolean }) { return <section>@if (x) { <><style>.s { color: red; }</style><div ${attr}="s" /></> }</section>; }`,
				),
			).toEqual([]);
		});

		it('reports unknown style attributes', () => {
			expect(
				codes(`export function App() @{ <><style media="print">div {}</style><div /></> }`),
			).toEqual([DIAGNOSTIC_CODES.STYLE_UNKNOWN_ATTRIBUTE]);
		});

		it('reports :global placement with a code instead of a bare throw', () => {
			const source = `export function App() @{
				<>
					<style>.a :global(.b) .c { color: red; }</style>
					<div ${attr}="a">{'a'}</div>
				</>
			}`;

			expect(codes(source)).toEqual([DIAGNOSTIC_CODES.CSS_GLOBAL_PLACEMENT]);
			expect(() => compile(source, 'App.tsrx')).toThrow(
				expect.objectContaining({ code: DIAGNOSTIC_CODES.CSS_GLOBAL_PLACEMENT }),
			);
		});

		it('throws the coded diagnostic outside collect mode', () => {
			expect(() =>
				compile(
					`export function App() @{ <><style apply={missing} /><div>{'a'}</div></> }`,
					'App.tsrx',
				),
			).toThrow(expect.objectContaining({ code: DIAGNOSTIC_CODES.STYLE_APPLY_TARGET }));
		});
	});

	describe(`[${name}] style scope ordering invariant`, () => {
		it.each(Array.from({ length: 24 }, (_, index) => [index + 1]))(
			'emits contiguous pre-ordered scope groups and exact hash chains (seed %i)',
			(seed) => {
				const random = create_random(seed * 7919);
				const counters = { next_scope: 0, next_element: 0 };
				const tree = generate_scope(random, 0, counters);
				const source = `export function App() @{\n<>\n${render_scope(tree, random, attr)}\n</>\n}`;

				const { code, css, cssHash } = compile(source, 'App.tsrx');

				/** @type {Map<number, string>} */
				const hashes = new Map();
				for (const match of css.matchAll(/\.s(\d+)\.(tsrx-[0-9a-f]+)/g)) {
					const id = Number(match[1]);
					if (hashes.has(id)) expect(hashes.get(id)).toBe(match[2]);
					else hashes.set(id, match[2]);
				}

				/** @type {Array<{ id: number, chain: string[] }>} */
				const elements = [];
				/** @type {number[]} */
				const order = [];
				/** @type {Array<{ id: number, chain: string[] }>} */
				const containers = [];
				expected_tree(tree, [], hashes, elements, order, containers);

				// Sheet order: pre-order over scopes, each scope's blocks contiguous.
				const emitted = [...css.matchAll(/\.s(\d+)\.tsrx-/g)].map((match) => Number(match[1]));
				expect(emitted).toEqual(order);
				expect(hashes_of(cssHash)).toEqual([...new Set(order)].map((id) => hashes.get(id)));

				// Every element carries exactly its scope chain, outer first.
				for (const { id, chain } of elements) {
					const scope_id = /** @type {RegExpMatchArray} */ (
						source.match(new RegExp(`${attr}="s(\\d+) e${id}"`))
					)[1];
					expect(class_of(code, `s${scope_id} e${id}`)).toBe(
						[`s${scope_id} e${id}`, ...chain].join(' '),
					);
				}
				// A container element never carries the hash of the scope it holds.
				for (const { id, chain } of containers) {
					expect(class_of(code, `c${id}`)).toBe([`c${id}`, ...chain].join(' '));
				}
				expect(count_substring(code, '<style')).toBe(0);
			},
		);
	});
}
