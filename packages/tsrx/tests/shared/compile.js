import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '../../src/diagnostics.js';
import { runSharedScopedStyleTests } from './scoped-styles.js';
import { runSharedScopedStyleConformanceTests } from './scoped-styles-conformance.js';

/** @import { CompileDiagnosticsHarness, CompileHarness } from '../../types/index' */

/**
 * @param {string} haystack
 * @param {string} needle
 * @returns {number}
 */
function count_substring(haystack, needle) {
	return haystack.split(needle).length - 1;
}

/**
 * @param {{ errors: Array<{ code?: string }> }} result
 * @returns {Array<string | undefined>}
 */
function diagnostic_codes(result) {
	return result.errors.map((error) => error.code);
}

/**
 * Parse generated target output as TSX and return syntax diagnostics. Target
 * compilers intentionally leave TypeScript and JSX for downstream tooling, so
 * this checks the same grammar boundary their virtual modules must satisfy.
 *
 * @param {string} code
 * @returns {readonly ts.Diagnostic[]}
 */
function virtual_parse_diagnostics(code) {
	const source_file = ts.createSourceFile(
		'virtual.tsx',
		code,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	return /** @type {ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }} */ (source_file)
		.parseDiagnostics;
}

/** @param {string} code @returns {readonly ts.Diagnostic[]} */
function virtual_semantic_diagnostics(code) {
	const file_name = '/virtual-platform.tsx';
	const options = {
		target: ts.ScriptTarget.ESNext,
		module: ts.ModuleKind.ESNext,
		noEmit: true,
		noLib: true,
	};
	const source_file = ts.createSourceFile(
		file_name,
		code,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const base_host = ts.createCompilerHost(options);
	const host = {
		...base_host,
		fileExists: (/** @type {string} */ name) => name === file_name,
		readFile: (/** @type {string} */ name) => (name === file_name ? code : undefined),
		getSourceFile: (/** @type {string} */ name) => (name === file_name ? source_file : undefined),
		getCurrentDirectory: () => '/',
	};
	const program = ts.createProgram([file_name], options, host);
	return program.getSemanticDiagnostics(source_file);
}

const TSRX_TEMPLATE_RETURN_ERROR =
	'Return statements are not allowed inside TSRX templates. Move the return before the TSRX return value, or use conditional rendering instead.';

/**
 * Shared compile/editor diagnostics. These do not assert source-map structure;
 * they only verify that editor-facing compile entry points collect diagnostics.
 *
 * @param {CompileDiagnosticsHarness} harness
 */
export function runSharedCompileDiagnosticsTests({ compile_to_volar_mappings, name }) {
	describe(`[${name}] platform flag virtual types`, () => {
		it('types every retained flag with the selected boolean literal', () => {
			const result = compile_to_volar_mappings(
				`export const web: false = import.meta.env.platform.web;
				export const ios: true = import.meta.env.platform.ios;
				export const android: false = import.meta.env.platform.android;`,
				'App.tsrx',
				{ platform: 'ios' },
			);

			expect(result.errors).toEqual([]);
			expect(virtual_parse_diagnostics(result.code)).toEqual([]);
			expect(virtual_semantic_diagnostics(result.code)).toEqual([]);
		});
	});

	describe(`[${name}] type-only style stand-ins`, () => {
		it('keeps consecutive <style> siblings parseable as TSX', () => {
			// Each stand-in is its own `void` expression statement; two adjacent
			// JSX expression statements would otherwise parse as one (TS2657).
			const { code, errors } = compile_to_volar_mappings(
				`function App() @{
					<style apply={theme} />
					<style>.a { color: red; }</style>
					<style>.b { color: blue; }</style>
					<div class="a b" />
				}
				const theme = <style>.t {}</style>;`,
				'App.tsrx',
				{ loose: true },
			);

			expect(errors.filter((error) => error.type === 'fatal')).toEqual([]);
			expect(virtual_parse_diagnostics(code)).toEqual([]);
			expect(code).toContain('void <style data-tsrx-apply={theme.$class} />');
			expect(code).toContain('void <style></style>');
		});

		it('recovers an unclosed <style> in loose type-only compile without losing mappings', function () {
			// While typing `<style>` there is no `</style>` yet. The raw-text path
			// used to feed the rest of the file to the CSS parser, which threw
			// `Expected identifier` and collapsed every token mapping to a
			// whole-file 1:1 fallback. An unclosed `<span>` already recovered.
			const source = `export function App() @{
	<>
		<style>
		<div />
	</>
}`;
			const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });

			expect(
				result.errors.filter(function (error) {
					return error.type === 'fatal';
				}),
			).toEqual([]);
			expect(
				result.errors
					.map(function (error) {
						return error.message;
					})
					.join('\n'),
			).not.toContain('Expected identifier');
			expect(result.mappings.length).toBeGreaterThan(1);

			const whole_file = result.mappings.find(function (mapping) {
				return mapping.sourceOffsets[0] === 0 && mapping.lengths[0] === source.length;
			});
			expect(whole_file).toBeUndefined();

			/** @param {string} token */
			function is_mapped(token) {
				const offset = source.indexOf(token);
				return result.mappings.some(function (mapping) {
					const start = mapping.sourceOffsets[0];
					return offset >= start && offset < start + mapping.lengths[0];
				});
			}

			expect(is_mapped('App')).toBe(true);
			expect(is_mapped('div')).toBe(true);
			expect(result.code).toContain('<style></style>');
			expect(virtual_parse_diagnostics(result.code)).toEqual([]);
		});

		it('keeps partial CSS after an unclosed <style> out of the template in loose type-only compile', function () {
			// Without auto-insert the CSS gets typed before the closing tag exists.
			// The body up to the next tag start is the style's CSS, so it never
			// tokenizes as JSX, and the sibling after it keeps its mapping.
			const source = `export function App() @{
	<>
		<style>
			.foo { color: red; }
			.bar {
		<div />
	</>
}`;
			const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });

			expect(
				result.errors.filter(function (error) {
					return error.type === 'fatal';
				}),
			).toEqual([]);

			/** @param {string} token */
			function is_mapped(token) {
				const offset = source.indexOf(token);
				return result.mappings.some(function (mapping) {
					const start = mapping.sourceOffsets[0];
					return offset >= start && offset < start + mapping.lengths[0];
				});
			}

			expect(is_mapped('App')).toBe(true);
			expect(is_mapped('div')).toBe(true);
			expect(result.code).not.toContain('.foo');
			expect(result.code).toContain('<style></style>');
			expect(virtual_parse_diagnostics(result.code)).toEqual([]);
		});
	});

	describe(`[${name}] compile diagnostics`, () => {
		it('keeps nested loop-target defaults in type-only output', () => {
			const result = compile_to_volar_mappings(
				`export function read(items, fallback) {
					for (const { pair: [value] = fallback } of items) consume(value);
					for (let { pair: [other] = fallback } = items[0]; false;) consume(other);
				}`,
				'App.tsrx',
				{ loose: true },
			);

			expect(result.errors).toEqual([]);
			expect(result.code).toContain('pair: [value] = fallback');
			expect(result.code).toContain('pair: [other] = fallback');
			expect(virtual_parse_diagnostics(result.code), result.code).toEqual([]);
		});

		it('preserves deferred imports in type-only output', () => {
			const result = compile_to_volar_mappings(
				`import defer * as feature from './feature.js';
				const lazy = import.defer('./lazy.js', { with: { type: 'json' } });

				export function App() {
					return <div>{feature.value}</div>;
				}`,
				'App.tsrx',
				{ loose: true },
			);

			expect(result.errors).toEqual([]);
			expect(result.code).toContain("import defer * as feature from './feature.js';");
			expect(result.code).toContain("import.defer('./lazy.js', { with: { type: 'json' } })");
		});

		it('keeps fragment expression children inside containers in type-only output', () => {
			const result = compile_to_volar_mappings(
				`function StatusBadge() @{
					const a = 1;
					<>{<>{a} <>{<>{a}</>}</> </>}</>
				}`,
				'App.tsrx',
				{ loose: true },
			);

			expect(result.errors).toEqual([]);
			expect(count_substring(result.code, '{a}')).toBeGreaterThanOrEqual(2);
			expect(result.code).not.toContain('<>{a}a</>');
		});

		it('keeps a single text child faithful instead of promoting it to a string literal', () => {
			const result = compile_to_volar_mappings(
				`export function App() @{
					<>@</>
				}`,
				'App.tsrx',
				{ loose: true },
			);

			expect(result.errors).toEqual([]);
			// `@` is valid text content and must stay as-is, not be mangled into `{'@'}`.
			expect(result.code).toContain('<>@</>');
			expect(result.code).not.toContain("{'@'}");
		});

		it('does not promote ordinary single-text output into a string literal', () => {
			const result = compile_to_volar_mappings(
				`export function App() @{
					<>Hello</>
				}`,
				'App.tsrx',
				{ loose: true },
			);

			expect(result.errors).toEqual([]);
			expect(result.code).toContain('<>Hello</>');
			expect(result.code).not.toContain("{'Hello'}");
		});

		// A `@` on its own line inside a fragment/element is an in-progress `@if`/`@for`/…
		// directive recovered as text; it compiles fine, so no compile-error fallback covers
		// it. It must get a completion mapping so the editor offers directive completions —
		// and that mapping must be WELL-FORMED: equal source and generated lengths. A
		// mismatched-length mapping (which happened when a whitespace-padded text node was
		// trimmed but kept its wide location) makes the completion's textEdit range fail to
		// map back to source, so VS Code silently drops every item (the plugin fires but
		// nothing shows). These cases exercise the shapes that broke.
		for (const { name, source } of [
			{
				name: 'a bare `@` on its own line',
				source: 'export function App() {\n\t<>\n\t\t@\n\t</>\n}',
			},
			{
				name: 'a `@`-leading child in an element',
				source: 'export function App() {\n\t<div>@</div>\n}',
			},
			{
				name: 'a partially typed `@if`',
				source: 'export function App() {\n\t<>\n\t\t@if\n\t</>\n}',
			},
		]) {
			it(`emits a well-formed completion-only mapping for ${name}`, () => {
				const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });
				const cursor = source.indexOf('@') + 1;

				// Completion mappings covering the cursor right after the `@`.
				const covering = result.mappings.filter(
					(m) =>
						m.data?.completion &&
						cursor >= m.sourceOffsets[0] &&
						cursor <= m.sourceOffsets[0] + m.lengths[0],
				);

				// A completion must be offered at the `@`…
				expect(covering.length).toBeGreaterThan(0);
				for (const m of covering) {
					// …with equal source/generated lengths so the textEdit round-trips (the bug
					// produced a 9-char source -> 1-char generated mapping here)…
					expect(m.lengths[0]).toBe(m.generatedLengths[0]);
					// …and completion only — the `@` text must not be type-checked.
					expect(m.data?.verification).toBeFalsy();
				}
			});
		}

		it('does not map ordinary template text (no stray completions in plain text)', () => {
			const source = 'export function App() {\n\t<div>hello world</div>\n}';
			const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });
			const cursor = source.indexOf('hello') + 1;

			const mapping = result.mappings.find((m) => {
				const start = m.sourceOffsets[0];
				return cursor >= start && cursor < start + m.lengths[0] && m.data?.completion;
			});

			expect(mapping).toBeUndefined();
		});

		it('does not treat a mid-text `@` (e.g. an email) as a directive', () => {
			// `a@b.com` — the `@` is not the first non-whitespace char, so it stays plain text
			// and must not get a completion mapping (no spurious directive completions).
			const source = 'export function App() {\n\t<div>a@b.com</div>\n}';
			const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });
			const at = source.indexOf('@');

			const mapping = result.mappings.find(
				(m) =>
					m.data?.completion && at >= m.sourceOffsets[0] && at < m.sourceOffsets[0] + m.lengths[0],
			);

			expect(mapping).toBeUndefined();
		});

		it('keeps callback returns around JSX values clean in type-only output', () => {
			const result = compile_to_volar_mappings(
				`function Test() @{
					<Page
						params={{
							menuAlt: (isAdmin) => {
								if (isAdmin) {
									return [<>Delete</>, <>Edit</>];
								}
							},
							bySwitch: (role) => {
								switch (role) {
									case 'admin':
										return [<>Edit</>];
									default:
										return [<>View</>];
								}
							},
						}}
					/>
				}`,
				'App.tsrx',
				{ loose: true },
			);

			expect(result.errors).toEqual([]);
			expect(result.code).toContain('return [<>Delete</>, <>Edit</>];');
			expect(result.code).toContain('return [<>View</>];');
			expect(result.code).toContain('bySwitch: (role) => {');
		});

		it('allows return statements in localized setup before a template fence', () => {
			const result = compile_to_volar_mappings(
				`function Test() @{
					if (ready) {
						return;
					}

					<div>{'ready'}</div>
				}`,
				'App.tsrx',
			);

			expect(result.errors).toEqual([]);
		});

		it('allows return statements in arrow function statement-container bodies', () => {
			const result = compile_to_volar_mappings(
				`const Test = () => @{
					if (ready) {
						return <div>{'early'}</div>;
					}

					<div>{'ready'}</div>
				}`,
				'App.tsrx',
			);

			expect(result.errors).toEqual([]);
		});

		it('rejects return statements in expression-position statement containers', () => {
			for (const source of [
				`function Test() {
					return @{
						if (ready) {
							return <div>{'early'}</div>;
						}

						<div>{'ready'}</div>
					};
				}`,
				`function Test() @{
					const content = @{
						if (ready) {
							return <div>{'early'}</div>;
						}

						<div>{'ready'}</div>
					};

					<section>{content}</section>
				}`,
				`function Test() @{
					<section>@{
						if (ready) {
							return <div>{'early'}</div>;
						}

						<div>{'ready'}</div>
					}</section>
				}`,
			]) {
				const result = compile_to_volar_mappings(source, 'App.tsrx');

				expect(result.errors.map((error) => error.message)).toContain(TSRX_TEMPLATE_RETURN_ERROR);
			}
		});

		it('rejects return statements inside @try/@catch/@pending blocks', () => {
			for (const source of [
				`function Test() @{
					@try {
						return <div>{'ok'}</div>;
					} @catch (e) {
						<div>{'err'}</div>
					}
				}`,
				`function Test() @{
					@try {
						<div>{'ok'}</div>
					} @catch (e) {
						return <div>{'err'}</div>;
					}
				}`,
				`function Test() @{
					@try {
						<div>{'ok'}</div>
					} @pending {
						return <div>{'loading'}</div>;
					} @catch (e) {
						<div>{'err'}</div>
					}
				}`,
				`function Test() @{
					@try {
						return;
					} @catch (e) {
						<div>{'err'}</div>
					}
				}`,
			]) {
				const result = compile_to_volar_mappings(source, 'App.tsrx');

				expect(result.errors.map((error) => error.message)).toContain(TSRX_TEMPLATE_RETURN_ERROR);
			}
		});

		it('allows @try/@catch/@pending blocks without return statements', () => {
			const result = compile_to_volar_mappings(
				`function Test() @{
					@try {
						<div>{'ok'}</div>
					} @pending {
						<div>{'loading'}</div>
					} @catch (e) {
						<div>{'err'}</div>
					}
				}`,
				'App.tsrx',
			);

			expect(result.errors).toEqual([]);
		});

		it('allows return statements inside nested ordinary functions in statement containers', () => {
			const result = compile_to_volar_mappings(
				`function Test() @{
					<section>@{
						function render() {
							return <div>{'nested'}</div>;
						}

						<div>{render()}</div>
					}</section>
				}`,
				'App.tsrx',
			);

			expect(result.errors).toEqual([]);
		});

		it('parses JSX callback returns in JSX props without semicolons', () => {
			const result = compile_to_volar_mappings(
				`class Foo {
					bar() {
						return <List
							render={(item) => {
								return <>
									<span>{item.name}</span>
								</>
							}}
						/>
					}
				}`,
				'App.tsrx',
			);

			expect(result.errors).toEqual([]);
			expect(result.code).toContain('item.name');
		});

		it('reports semicolon-terminated template expression containers', () => {
			const result = compile_to_volar_mappings(
				`function App() @{
					<div>{
						renderThing();
					}</div>
				}`,
				'App.tsrx',
			);

			expect(diagnostic_codes(result)).toContain(
				DIAGNOSTIC_CODES.TEMPLATE_EXPRESSION_TRAILING_SEMICOLON,
			);
			const diagnostic = result.errors.find(
				(error) => error.code === DIAGNOSTIC_CODES.TEMPLATE_EXPRESSION_TRAILING_SEMICOLON,
			);
			expect(diagnostic?.loc?.start).toEqual({ line: 3, column: 19 });
			expect(diagnostic?.loc?.end).toEqual({ line: 3, column: 20 });
			expect(result.code).toContain('renderThing()');
		});

		it('allows html identifiers as ordinary attribute values', () => {
			const result = compile_to_volar_mappings(
				`function Child(_: { body: string }) { return null; }
				function App() @{
					const html = '<strong>safe</strong>';

					<Child body={html} />
				}`,
				'App.tsrx',
			);

			expect(result.errors).toEqual([]);
			expect(result.code).toContain('body={html}');
		});
	});
}

/**
 * @param {CompileHarness} harness
 */
export function runSharedTsxExpressionTsrxTests({ compile, name, classAttrName }) {
	describe(`[${name}] JSX fragments inside expression values`, () => {
		it('preserves nested JSX fragments inside regular function TSX props', () => {
			const { code } = compile(
				`function App3() @{
						<PlainTextPlugin
							ErrorBoundary={LexicalErrorBoundary}
							contentEditable={<>
								<ContentEditable
									aria-placeholder={placeholder}
									class={classes.contentEditable}
									placeholder={<>
										<div class={classes.placeholder}>{placeholder}</div>
									</>}
								/>
							</>}
							placeholder={<>
								<div class={classes.placeholder}>{placeholder}</div>
							</>}
						/>
					}`,
				'App.tsrx',
			);
			expect(code).toContain('contentEditable={<>');
			expect(code).toContain('<ContentEditable');
			expect(code).toContain(` ${classAttrName}={classes.contentEditable}`);
			expect(code).toContain(`placeholder={<>`);
			expect(code).toContain(`<div ${classAttrName}={classes.placeholder}>`);
		});

		it('allows shorthand attributes in JSX fragment values', () => {
			const { code } = compile(
				`export function Test(props) @{
						<List
							items={props.items}
							renderItem={(item) =>
								<>
									<ItemView {item} onSelect={props.onSelect}>
										Selected
									</ItemView>
								</>
							}
						/>
					}`,
				'App.tsrx',
			);
			expect(code).toContain('item={item}');
			expect(code).toContain('onSelect={props.onSelect}');
			expect(code).toContain('Selected');
		});

		it('preserves JSX-style returns in regular functions declared inside TSRX bodies', () => {
			const { code } = compile(
				`function App() @{
					function renderChild() @{
							<span class="nested-return">{'ok'}</span>
						}

					<>
						{renderChild()}
					</>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('function renderChild()');
			expect(code).toContain('nested-return');
			expect(code).not.toContain('return;\n');
		});
	});

	describe(`[${name}] control flow in expression position`, () => {
		it('lowers a directive inside an element-valued attribute', () => {
			const { code } = compile(
				`function Child(props) { return null; }

					export function App() @{
						<Child prop={<h1>@if (true) { <div>1</div> } @else { <div>2</div> }</h1>} />
					}`,
				'App.tsrx',
			);
			expect(code).toContain('prop={<h1>');
			expect(code).toContain('<div>1</div>');
			expect(code).toContain('<div>2</div>');
			expect(code).not.toContain('@if');
		});

		it('lowers @switch assigned to a variable', () => {
			const { code } = compile(
				`function App({ status }: { status: string }) {
						const view = @switch (status) {
							@case 'loading': { <p>Loading...</p> }
							@default: { <p>Unknown status.</p> }
						};
						return view;
					}`,
				'App.tsrx',
			);
			expect(code).toContain('Loading...');
			expect(code).toContain('Unknown status.');
			expect(code).not.toContain('@switch');
			expect(code).not.toContain('JSXSwitchExpression');
		});

		it('lowers @switch in an expression-bodied arrow output', () => {
			const { code } = compile(
				`const StatusMessage = ({ status }: { status: string }) => @switch (status) {
						@case 'loading': { <p>Loading...</p> }
						@case 'success': { <p>Done!</p> }
						@default: { <p>Unknown status.</p> }
					};`,
				'App.tsrx',
			);
			expect(code).toContain('Loading...');
			expect(code).toContain('Done!');
			expect(code).toContain('Unknown status.');
			expect(code).toContain(`'loading'`);
			expect(code).not.toContain('@switch');
			expect(code).not.toContain('JSXSwitchExpression');
		});

		it('lowers @switch in a return statement output', () => {
			const { code } = compile(
				`function StatusMessage({ status }: { status: string }) {
						return @switch (status) {
							@case 'loading': { <p>Loading...</p> }
							@default: { <p>Unknown status.</p> }
						};
					}`,
				'App.tsrx',
			);
			expect(code).toContain('Loading...');
			expect(code).toContain('Unknown status.');
			expect(code).not.toContain('@switch');
			expect(code).not.toContain('JSXSwitchExpression');
		});

		it('lowers @if in an expression-bodied arrow output', () => {
			const { code } = compile(
				`const Banner = ({ ok }: { ok: boolean }) => @if (ok) {
						<p>All good</p>
					} @else {
						<p>Something broke</p>
					};`,
				'App.tsrx',
			);
			expect(code).toContain('All good');
			expect(code).toContain('Something broke');
			expect(code).not.toContain('@if');
			expect(code).not.toContain('JSXIfExpression');
		});

		it('lowers @for in an expression-bodied arrow output', () => {
			const { code } = compile(
				`const List = ({ items }: { items: string[] }) => @for (const item of items) {
						<li>{item}</li>
					};`,
				'App.tsrx',
			);
			expect(code).toContain('<li>');
			expect(code).not.toContain('@for');
			expect(code).not.toContain('JSXForExpression');
		});

		it('lowers @if passed as a call argument', () => {
			const { code } = compile(
				`function StatusBadge({ status }: { status: string }) {
						func(@if (status === 'active') {
							<span class="badge active">Online</span>
						} @else if (status === 'idle') {
							<span class="badge idle">Away</span>
						} @else {
							<span class="badge">Offline</span>
						});
					}`,
				'App.tsrx',
			);
			expect(code).toContain('Online');
			expect(code).toContain('Away');
			expect(code).toContain('Offline');
			expect(code).not.toContain('@if');
			expect(code).not.toContain('JSXIfExpression');
		});

		it('lowers @for passed as a call argument', () => {
			const { code } = compile(
				`function List({ items }: { items: string[] }) {
						render(@for (const item of items) {
							<li>{item}</li>
						});
					}`,
				'App.tsrx',
			);
			expect(code).toContain('<li>');
			expect(code).not.toContain('@for');
			expect(code).not.toContain('JSXForExpression');
		});

		it('lowers @switch passed as a call argument', () => {
			const { code } = compile(
				`function App({ status }: { status: string }) {
						render(@switch (status) {
							@case 'loading': { <p>Loading...</p> }
							@default: { <p>Unknown status.</p> }
						});
					}`,
				'App.tsrx',
			);
			expect(code).toContain('Loading...');
			expect(code).toContain('Unknown status.');
			expect(code).not.toContain('@switch');
			expect(code).not.toContain('JSXSwitchExpression');
		});

		it('lowers @try passed as a call argument', () => {
			const { code } = compile(
				`function App() {
						render(@try {
							<p>Loaded</p>
						} @catch (error) {
							<p>Failed</p>
						});
					}`,
				'App.tsrx',
			);
			expect(code).toContain('Loaded');
			expect(code).toContain('Failed');
			expect(code).not.toContain('@try');
			expect(code).not.toContain('@catch');
			expect(code).not.toContain('JSXTryExpression');
		});

		it('lowers a @{ … } code block passed as a call argument', () => {
			const { code } = compile(
				`function App() {
							render(@{
							const count = 2;
							<span>{count}</span>
						});
					}`,
				'App.tsrx',
			);
			expect(code).toContain('const count = 2;');
			expect(code).toContain('<span>{count}</span>');
			expect(code).not.toContain('JSXCodeBlock');
		});

		it('lowers @if as the left operand of a logical expression', () => {
			const { code } = compile(
				`function App() {
						let c = (@if (true) { <>{1}</> }) || 'default';
						return <div>{c}</div>;
					}`,
				'App.tsrx',
			);
			expect(code).toContain(`|| 'default'`);
			expect(code).not.toContain('@if');
			expect(code).not.toContain('JSXIfExpression');
		});

		it('lowers @switch as an operand of a logical expression', () => {
			const { code } = compile(
				`function App({ status }: { status: string }) {
						const view =
							fallback ||
							@switch (status) {
								@case 'loading': { <p>Loading...</p> }
								@default: { <p>Unknown status.</p> }
							};
						return <div>{view}</div>;
					}`,
				'App.tsrx',
			);
			expect(code).toContain('Loading...');
			expect(code).toContain('Unknown status.');
			expect(code).not.toContain('@switch');
			expect(code).not.toContain('JSXSwitchExpression');
		});

		it('lowers @if as a conditional (ternary) branch', () => {
			const { code } = compile(
				`function App({ ok }: { ok: boolean }) {
						const view = ok
							? @if (ok) { <p>All good</p> } @else { <p>Broke</p> }
							: <span>n/a</span>;
						return <div>{view}</div>;
					}`,
				'App.tsrx',
			);
			expect(code).toContain('All good');
			expect(code).toContain('Broke');
			expect(code).toContain('n/a');
			expect(code).not.toContain('@if');
			expect(code).not.toContain('JSXIfExpression');
		});
	});
}

/**
 * @param {Pick<CompileHarness, 'compile' | 'name'>} harness
 */
export function runSharedFragmentExpressionRenderTests({ compile, name }) {
	describe(`[${name}] fragment expression render bodies`, () => {
		it('renders a component-body fragment shorthand with a lone expression child', () => {
			const { code } = compile(
				`export default function A() @{
					<>{"Hello"}</>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('return <>{"Hello"}</>;');
		});

		it('renders lone expression fragment shorthand inside conditional render bodies', () => {
			const { code } = compile(
				`export function A() @{
					@if (show) {
						<>{"Hello"}</>
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('"Hello"');
			expect(code).not.toMatch(/^[\t ]*"Hello";?\n\s*return null;/m);
		});

		it('renders lone expression fragment shorthand inside loop render bodies', () => {
			const { code } = compile(
				`export function A() @{
					@for (const value of values) {
						<>{value}</>
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('value');
			expect(code).not.toMatch(/^[\t ]*value;?\n\s*return null;/m);
		});

		it('renders lone expression fragment shorthand inside switch case bodies', () => {
			const { code } = compile(
				`export function A() @{
					@switch (state) {
						@case "ready": {
							<>{"Ready"}</>
						}
						@default: {
							<>{"Waiting"}</>
						}
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('"Ready"');
			expect(code).toContain('"Waiting"');
			expect(code).not.toMatch(/^[\t ]*"Ready";?\n\s*break;/m);
			expect(code).not.toMatch(/^[\t ]*"Waiting";?\n\s*return null;/m);
		});
	});
}

/**
 * Shared switch coverage. JSX `@switch` cases are isolated template branches:
 * they do not fall through and they do not use `break` or `return`.
 *
 * @param {Pick<CompileHarness, 'compile' | 'name'>} harness
 */
export function runSharedSwitchFallthroughTests({ compile, name }) {
	describe(`[${name}] switch case isolation`, () => {
		it.runIf(['react', 'preact', 'vue'].includes(name))(
			'keeps each case body independent without helper chaining',
			() => {
				const { code } = compile(
					`export function StatusBadge({ status }: { status: string }) @{
						@switch (status) {
							@case "idle": {
								<span>{'Online'}</span>
							}
							@case "active": {
								<span>{'Away'}</span>
							}
							@case "offline": {
								<span>{'Offline'}</span>
							}
						}
					}`,
					'App.tsrx',
				);

				expect(count_substring(code, "'Online'")).toBe(1);
				expect(count_substring(code, "'Away'")).toBe(1);
				expect(count_substring(code, "'Offline'")).toBe(1);
				expect(code).not.toContain('StatementBodyHook');
			},
		);

		it('renders each explicit case block once', () => {
			const { code } = compile(
				`export function App({ kind }: { kind: string }) @{
					@switch (kind) {
						@case "a": {
							<span>{'A'}</span>
						}
						@case "b": {
							<span>{'B'}</span>
						}
						@default: {
							<span>{'Other'}</span>
						}
					}
				}`,
				'App.tsrx',
			);

			expect(count_substring(code, "'A'")).toBe(1);
			expect(count_substring(code, "'B'")).toBe(1);
			expect(count_substring(code, "'Other'")).toBe(1);
			if (['react', 'preact', 'vue'].includes(name)) {
				expect(code).not.toContain('StatementBodyHook');
			}
		});

		it('keeps setup locals with the same name in separate case blocks', () => {
			const { code } = compile(
				`export function App({ kind }: { kind: string }) @{
					@switch (kind) {
						@case "a": {
							const label = 'A';
							<span>{label}</span>
						}
						@case "b": {
							const label = 'B';
							<span>{label}</span>
						}
						@default: {
							const label = 'Other';
							<span>{label}</span>
						}
					}
				}`,
				'App.tsrx',
			);

			expect(count_substring(code, 'const label')).toBe(3);
			const redeclarations = virtual_semantic_diagnostics(code)
				.filter((diagnostic) => diagnostic.code === 2451)
				.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
			expect(redeclarations).toEqual([]);
		});

		it.runIf(['react', 'preact', 'vue'].includes(name))(
			'treats stacked case labels as separate isolated cases',
			() => {
				const { code } = compile(
					`export function App({ n }: { n: number }) @{
						@switch (n) {
							@case 1: {
							}
							@case 2: {
								<span>{'one or two'}</span>
							}
							@default: {
								<span>{'other'}</span>
							}
						}
					}`,
					'App.tsrx',
				);

				expect(count_substring(code, "'one or two'")).toBe(1);
				expect(count_substring(code, "'other'")).toBe(1);
				expect(code).not.toContain('StatementBodyHook');
			},
		);

		it.runIf(name === 'solid')(
			'treats stacked case labels as separate isolated <Match> arms',
			() => {
				const { code } = compile(
					`export function App({ n }: { n: number }) @{
						@switch (n) {
							@case 1: {
							}
							@case 2: {
								<span>{'one or two'}</span>
							}
							@default: {
								<span>{'other'}</span>
							}
						}
					}`,
					'App.tsrx',
				);

				expect(count_substring(code, "'one or two'")).toBe(1);
				expect(count_substring(code, "'other'")).toBe(1);
				expect(code).not.toContain('StatementBodyHook');
			},
		);

		it.runIf(['react', 'preact', 'vue'].includes(name))(
			'does not lift downstream case bodies into earlier case blocks',
			() => {
				const { code } = compile(
					`export function App({ status }: { status: string }) @{
						@switch (status) {
							@case "idle": {
								<span>{'Online'}</span>
							}
							@case "active": {
								<span>{'Away'}</span>
							}
							@case "offline": {
								<span>{'Offline'}</span>
							}
						}
					}`,
					'App.tsrx',
				);

				expect(code).toContain('switch (status)');
				expect(code).not.toContain('StatementBodyHook');
				expect(count_substring(code, "'Online'")).toBe(1);
				expect(count_substring(code, "'Away'")).toBe(1);
				expect(count_substring(code, "'Offline'")).toBe(1);
			},
		);

		it.runIf(name === 'solid')('lowers isolated cases to independent <Match> arms', () => {
			const { code } = compile(
				`export function App({ status }: { status: string }) @{
						@switch (status) {
							@case "idle": {
								<span>{'Online'}</span>
							}
							@case "active": {
								<span>{'Away'}</span>
							}
							@case "offline": {
								<span>{'Offline'}</span>
							}
						}
					}`,
				'App.tsrx',
			);

			expect(code).toContain('<Switch');
			expect(code).toMatch(/<Match when=\{status === "idle"\}>/);
			expect(code).toMatch(/<Match when=\{status === "active"\}>/);
			expect(code).toMatch(/<Match when=\{status === "offline"\}>/);
			expect(count_substring(code, "'Offline'")).toBe(1);
			expect(count_substring(code, "'Away'")).toBe(1);
			expect(count_substring(code, "'Online'")).toBe(1);
			expect(code).not.toContain('StatementBodyHook');
		});

		it.runIf(name === 'solid')('routes default cases to <Switch fallback>', () => {
			const { code } = compile(
				`export function App({ kind }: { kind: string }) @{
					@switch (kind) {
						@case "a": {
							<span>{'A'}</span>
						}
						@default: {
							<span>{'D'}</span>
						}
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('<Switch fallback=');
			expect(code).toMatch(/<Match when=\{kind === "a"\}>/);
			expect(count_substring(code, "'D'")).toBe(1);
		});
	});
}

/**
 * Shared assertions covering where each target places the lifted
 * `StatementBodyHook` helper component for hook-bearing switch cases
 * — module scope for the client transform on every target whose platform
 * sets `moduleScopedHookComponents: true` (Solid, Vue), and a local
 * `let App__StatementBodyHook<N>` cache slot + per-render `?? (= …)` lazy
 * initializer otherwise. `compile_to_volar_mappings` keeps the local-scoped
 * shape regardless of platform default so Volar's virtual TSX can still
 * resolve closure-captured bindings against the component body.
 *
 * The `StatementBodyHook` name is React-flavored historically, but on
 * Vue/Solid the lift solves different problems (avoid re-`defineVaporComponent`
 * per render, keep hooks in stable branch components, etc.) — same machinery
 * either way.
 *
 * @typedef {'module-function' | 'module-vapor-component' | 'local-cache'} SwitchHelperClientShape
 *
 * @param {{
 *   compile: CompileHarness['compile'],
 *   compile_to_volar_mappings: CompileDiagnosticsHarness['compile_to_volar_mappings'],
 *   name: string,
 *   clientHelperShape: SwitchHelperClientShape,
 * }} harness
 */
export function runSharedSwitchHelperHoistingTests({
	compile,
	compile_to_volar_mappings,
	name,
	clientHelperShape,
}) {
	describe(`[${name}] StatementBodyHook hoisting (client vs typeOnly)`, () => {
		// Two case bodies contain hooks, so two helpers should exist. The
		// non-hook case stays inline and cases remain isolated.
		const switch_source = `export function App({ status }: { status: string }) @{
				@switch (status) {
					@case "idle": {
						const idle_label = useMemo(() => 'Online', [status]);
						<span>{idle_label}</span>
					}
					@case "active": {
						const active_label = useMemo(() => 'Away', [status]);
						<span>{active_label}</span>
					}
					@case "offline": {
						<span>{'Offline'}</span>
					}
				}
			}`;
		const helper_capture_source = `export function App({ status }: { status: string }) @{
				const early = 'early';
				const property_label = 'unused';
				const member_label = 'unused';
				const attribute_label = 'unused';
				const jsx_member_label = 'unused';
				const local_shadow = 'outer';
				const unused0 = 0;
				const unused1 = 1;
				const unused2 = 2;
				const unused3 = 3;
				const unused4 = 4;
				const unused5 = 5;
				const unused6 = 6;
				const unused7 = 7;
				const late = 'late';
				@switch (status) {
					@case "active": {
						const local_shadow = 'inner';
						const record = { property_label: 1 };
						const Local = { jsx_member_label: () => <span /> };
						const label = useMemo(
							() => late + early + local_shadow + record.member_label,
							[],
						);
						<Local.jsx_member_label attribute_label={label} />
					}
					@default: {
						<span>{'idle'}</span>
					}
				}
			}`;

		/**
		 * @param {string} code
		 * @param {boolean} local_helper
		 */
		function expect_ordered_helper_capture(code, local_helper) {
			const helper_name = local_helper ? 'StatementBodyHook1' : 'App__StatementBodyHook1';
			const helper_signature = local_helper
				? new RegExp(`function ${helper_name}\\(\\s*\\{ early, late \\}:`)
				: new RegExp(`function ${helper_name}\\(\\{ early, late \\}\\)`);

			expect(code).toMatch(helper_signature);
			expect(code).toContain(`<${helper_name} early={early} late={late} />`);
		}

		it('lifts hook-bearing case bodies in the client transform', () => {
			const { code } = compile(switch_source, 'App.tsrx');

			if (clientHelperShape === 'module-function') {
				// Solid: top-level `function App__StatementBodyHook<N>()`
				// declarations, no per-render cache slots.
				const top_level_helper_count = (
					code.match(/^function App__StatementBodyHook\d+\([^)]*\)/gm) || []
				).length;
				expect(top_level_helper_count).toBe(2);
				expect(code).not.toContain('let App__StatementBodyHook');
			} else if (clientHelperShape === 'module-vapor-component') {
				// Vue: top-level `const App__StatementBodyHook<N> =
				// defineVaporComponent(function App__StatementBodyHook<N>() {...})`.
				const top_level_helper_count = (
					code.match(
						/^const App__StatementBodyHook\d+ = defineVaporComponent\(function App__StatementBodyHook\d+\([^)]*\)/gm,
					) || []
				).length;
				expect(top_level_helper_count).toBe(2);
				expect(code).not.toContain('let App__StatementBodyHook');
			} else {
				// Local cache slot + `?? (= function …)` lazy
				// initializer per hook-bearing body; no top-level declarations.
				const cache_slot_count = (code.match(/^let App__StatementBodyHook\d+;$/gm) || []).length;
				expect(cache_slot_count).toBe(2);
				expect(code).toMatch(
					/const StatementBodyHook\d+\s*=\s*App__StatementBodyHook\d+\s*\?\?\s*\(App__StatementBodyHook\d+\s*=\s*function StatementBodyHook\d+\(\)/,
				);
			}
		});

		it('keeps hook-bearing case helpers local in the typeOnly transform', () => {
			const { code } = compile_to_volar_mappings(switch_source, 'App.tsrx');

			// Volar's virtual TSX always uses the local cache-slot pattern so
			// closure-captured bindings stay in the component scope for type
			// checking. The wrapper inside the lazy initializer varies per
			// target — `defineVaporComponent(function …)` on Vue, plain
			// `function …` elsewhere — but the slot + `?? (=` shape is uniform.
			const cache_slot_count = (code.match(/^let App__StatementBodyHook\d+;$/gm) || []).length;
			expect(cache_slot_count).toBe(2);
			expect(code).toMatch(
				/const StatementBodyHook\d+\s*=\s*App__StatementBodyHook\d+\s*\?\?\s*\(App__StatementBodyHook\d+\s*=\s*/,
			);
			// No top-level helper declarations in either lifted shape.
			expect(code).not.toMatch(/^function App__StatementBodyHook\d+\(\)/m);
			expect(code).not.toMatch(/^const App__StatementBodyHook\d+ = defineVaporComponent\(/m);
		});

		it('captures only outer references in available-binding order for client helpers', () => {
			const { code } = compile(helper_capture_source, 'App.tsrx');

			expect_ordered_helper_capture(code, false);
		});

		it('captures only outer references in available-binding order for typeOnly helpers', () => {
			const { code } = compile_to_volar_mappings(helper_capture_source, 'App.tsrx');

			expect_ordered_helper_capture(code, true);
		});
	});
}

/**
 * Shared component-loop regressions. Runs as part of `runSharedCompileTests`;
 * exported separately so harnesses that only cover component-body validation
 * can run it on its own.
 *
 * @param {Pick<CompileHarness, 'compile' | 'name'>} harness
 */
export function runSharedComponentLoopControlFlowTests({ compile, name }) {
	runSharedFragmentExpressionRenderTests({ compile, name });
	runSharedSwitchFallthroughTests({ compile, name });

	describe(`[${name}] component loop control flow`, () => {
		it('renders for...of loops inside fragment outputs with JSX siblings', () => {
			const { code } = compile(
				`export function App({ items }: { items: string[] }) @{
					<>
						<h3>head</h3>
						<p>text</p>
						@for (const item of items) {
							<div>{item}</div>
						}
					</>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('<h3>head</h3>');
			expect(code).toContain('<p>text</p>');
			expect(code).toContain('<div>{item}</div>');
		});

		it('renders an empty fallback for for...of loops', () => {
			const { code } = compile(
				`export function App({ items }: { items: string[] }) @{
					@for (const item of items) {
						<div>{item}</div>
					} @empty {
						<p>{'No items'}</p>
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('<div>{item}</div>');
			expect(code).toContain('No items');
		});

		it('rejects direct loop exits inside for...of template loops', () => {
			for (const statement of ['continue', 'break', 'return null']) {
				expect(() =>
					compile(
						`export function App({ items }: { items: string[] }) @{
							@for (const item of items) {
								${statement}
								<div>{item}</div>
							}
						}`,
						'App.tsrx',
					),
				).toThrow(
					/(Continue|Break|Return) statements are not allowed inside TSRX template for\.\.\.of loops/,
				);
			}
		});

		it('rejects direct returns inside @if template blocks', () => {
			expect(() =>
				compile(
					`export function App({ ready }: { ready: boolean }) @{
						@if (ready) {
							return null
							<div>{'Ready'}</div>
						}
					}`,
					'App.tsrx',
				),
			).toThrow(/Return statements are not allowed inside TSRX template @if blocks/);
		});

		it('rejects nested exits inside @if template blocks', () => {
			for (const [statement, expected] of [
				['return null', /Return statements are not allowed inside TSRX template @if blocks/],
				['break', /Break statements are not allowed inside TSRX template @if blocks/],
				['continue', /Continue statements are not allowed inside TSRX template @if blocks/],
			]) {
				expect(() =>
					compile(
						`export function App({ ready, items }: { ready: boolean; items: string[] }) @{
							@if (ready) {
								for (const item of items) {
									${statement}
								}
								<div>{'Ready'}</div>
							}
						}`,
						'App.tsrx',
					),
				).toThrow(expected);
			}
		});

		it('allows ordinary guard returns inside statement containers', () => {
			const { code } = compile(
				`export function App({ ready }: { ready: boolean }) @{
					if (ready) {
						return <span>{'Ready'}</span>
					}
					<div>{'Fallback'}</div>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('Ready');
			expect(code).toContain('Fallback');
		});

		it.runIf(['react', 'preact'].includes(name))(
			'keeps explicit loop keys on otherwise static children',
			() => {
				const { code } = compile(
					`export function App() @{
						@for (const item of items; index i; key i) {
							<div>{'test'}</div>
						}
					}`,
					'App.tsrx',
				);

				expect(code).toContain("<div key={i}>{'test'}</div>");
				expect(code).not.toContain('__static');
			},
		);

		it.runIf(['react', 'preact'].includes(name))(
			'keeps implicit loop keys on multi-child static loop bodies',
			() => {
				const { code } = compile(
					`export function App() @{
						@for (const item of items; index i) {
							<>
								<div>{'one'}</div>
								<div>{'two'}</div>
							</>
						}
					}`,
					'App.tsrx',
				);

				const fragment_source = name === 'react' ? 'react' : 'preact';
				expect(code).toContain(`import { Fragment } from '${fragment_source}';`);
				expect(code).toContain('<Fragment key={i}>');
				expect(code).toContain('</Fragment>');
			},
		);

		it('allows ordinary function control flow inside for...of loops', () => {
			const { code } = compile(
				`export function App({ items }: { items: string[] }) @{
					@for (const item of items) {
						function label(value: string) {
							for (let i = 0; i < 1; i++) {
								while (i < 0) {
									break
								}
								if (!value) return 'missing'
							}
							return value
						}
						<div>{label(item)}</div>
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('function label');
			expect(code).toContain('label(item)');
		});
	});
}

/**
 * Shared anonymous function component regressions. These cover parser support
 * for ordinary function expressions and arrow functions that return JSX.
 *
 * @param {Pick<CompileHarness, 'compile' | 'name'>} harness
 */
export function runSharedAnonymousComponentTests({ compile, name }) {
	describe(`[${name}] anonymous function components`, () => {
		it('parses arrow function components that return JSX', () => {
			const { code } = compile(
				`const Inline = (props: { x: string }) => <div>{props.x}</div>;`,
				'App.tsrx',
			);

			expect(code).toContain('const Inline = (props: { x: string }) => <div>{props.x}</div>;');
			expect(code).not.toContain('function Inline');
		});

		it('parses function expression components that return JSX', () => {
			const { code } = compile(
				`const Inline = function (props: { x: string }) {
					return <div>{props.x}</div>;
				};`,
				'App.tsrx',
			);

			expect(code).toContain('const Inline = function (props: { x: string })');
			expect(code).toContain('<div>{props.x}</div>');
			expect(code).not.toContain('function Inline');
		});

		it('lowers function component props inside JSX attribute objects', () => {
			const { code } = compile(
				`export function App() @{
					<Page
						params={{
							menuAlt2: ({ isAdmin, children }: { isAdmin: boolean, children: (items: string[]) => JSX.Element }) => {
								const items: string[] = [];
								if (isAdmin) {
									items.push('Delete', 'Edit');
								} else {
									items.push('View');
								}
								return <>{children(items)}</>;
							},
						}}
					/>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('menuAlt2');
			expect(code).toContain('items.push');
			expect(code).toContain('return children(items);');
		});

		it('lowers expression-bodied function component props', () => {
			const { code } = compile(
				`export function App() @{
					<Child
						children={({ items }: { items: JSX.Element[] }) => <ul>
							@for (const item of items; index i) {
								<li key={i}>{item}</li>
							}
						</ul>}
					/>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('children={({ items }: { items: JSX.Element[] }) => <ul>');
			expect(code).toContain(
				name === 'solid'
					? '<For each={items}>'
					: name === 'vue'
						? '<VaporFor in={items}'
						: '__map_iterable(items, (item, i)',
			);
			expect(code).toContain(name === 'vue' ? '<li>{item.value}</li>' : '<li key={i}>{item}</li>');
		});

		it('parses semicolon-terminated template expression containers', () => {
			const { code } = compile(
				`export function App() @{
					<Child
						children={({ items }: { items: JSX.Element[] }) => {
							return <ul>
								@for (const item of items; index i) {
									<li key={i}>{item}</li>
								}
							</ul>;
						}}
					/>
				}

				function Child({ children }: { children: (props: { items: JSX.Element[] }) => JSX.Element }) @{
					{
						children({ items: [<span>Item 1</span>, <span>Item 2</span>, <span>Item 3</span>] });
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('children({');
			expect(code).toContain('Item 3');
		});
	});
}

/**
 * Shared validation that function components behave like ordinary TypeScript
 * functions. TSRX no longer has a special component parameter syntax, so the
 * compiler should not reject additional function parameters.
 *
 * @param {Pick<CompileHarness, 'compile' | 'name'> & Pick<CompileDiagnosticsHarness, 'compile_to_volar_mappings'>} harness
 */
export function runSharedComponentParamsTests({ compile, compile_to_volar_mappings, name }) {
	const removed_message = 'TSRX functions accept ordinary TypeScript parameters.';

	describe(`[${name}] function component params`, () => {
		it('accepts a single props parameter', () => {
			expect(() =>
				compile(
					`export function App(props) @{
						<div>{props.value}</div>
					}`,
					'App.tsrx',
				),
			).not.toThrow();
		});

		it('accepts multiple parameters on ordinary functions that return TSRX', () => {
			expect(() =>
				compile(
					`export function App(a, b, c) @{
						<div>{a}{b}{c}</div>
					}`,
					'App.tsrx',
				),
			).not.toThrow();
		});

		it('does not surface removed props-parameter diagnostics via Volar mappings', () => {
			const result = compile_to_volar_mappings(
				`export function App(a, b, c) @{
					<div>{a}{b}{c}</div>
				}`,
				'App.tsrx',
			);

			expect(
				result.errors.some((error) =>
					/** @type {{ message?: string }} */ (error).message?.includes(removed_message),
				),
			).toBe(false);
		});

		it('accepts multiple parameters on class field function components', () => {
			const source = `export class App {
				Inline = (a, b) => <div>{a}{b}</div>;
				static Other = (a, b) => <span>{a}{b}</span>;
			}`;

			expect(() => compile(source, 'App.tsrx')).not.toThrow();

			const result = compile_to_volar_mappings(source, 'App.tsrx');
			expect(
				result.errors.some((error) =>
					/** @type {{ message?: string }} */ (error).message?.includes(removed_message),
				),
			).toBe(false);
		});
	});
}

/**
 * Shared validation that class members returning TSRX behave like ordinary
 * TypeScript class members. Arrow properties, static arrow properties, methods,
 * and function expression properties are all valid shapes.
 *
 * @param {Pick<CompileHarness, 'compile' | 'name'> & Pick<CompileDiagnosticsHarness, 'compile_to_volar_mappings'>} harness
 */
export function runSharedClassFunctionComponentTests({ compile, compile_to_volar_mappings, name }) {
	describe(`[${name}] class function components`, () => {
		it('allows an arrow function component as a class property', () => {
			expect(() =>
				compile(
					`export class App {
						Inline = () => <div>{'hi'}</div>;
					}`,
					'App.tsrx',
				),
			).not.toThrow();
		});

		it('allows an arrow function component as a static class property', () => {
			expect(() =>
				compile(
					`export class App {
						static Inline = () => <div>{'hi'}</div>;
					}`,
					'App.tsrx',
				),
			).not.toThrow();
		});

		it('allows a class method that returns JSX', () => {
			expect(() =>
				compile(
					`export class App {
						Inline() {
							return <div>{'hi'}</div>;
						}
					}`,
					'App.tsrx',
				),
			).not.toThrow();
		});

		it('allows a function expression class property that returns JSX', () => {
			expect(() =>
				compile(
					`export class App {
						Inline = function () {
							return <div>{'hi'}</div>;
						};
					}`,
					'App.tsrx',
				),
			).not.toThrow();
		});

		it('does not flag class members returning TSRX via Volar mappings', () => {
			const result = compile_to_volar_mappings(
				`export class App {
					Inline = () => <div>{'hi'}</div>;
					static Other = () => <span>{'hello'}</span>;
					Method() {
						return <p>{'method'}</p>;
					}
				}`,
				'App.tsrx',
			);

			expect(
				result.errors.some((error) =>
					/** @type {{ message?: string }} */ (error).message?.includes(
						'arrow function class property',
					),
				),
			).toBe(false);
		});
	});
}

/**
 * Shared compile-output regressions. These assert observable properties of
 * the generated code (not source-map structure) that every JSX target should
 * satisfy across whatever `transformElement` hook the platform wires in.
 * Target-specific shapes (Vue's `defineVaporComponent` export wrapper and
 * Suspense slot fallbacks) are guarded inline with `it.runIf`.
 *
 * @param {CompileHarness} harness
 */
export function runSharedCompileTests({
	compile,
	name,
	classAttrName,
	generatedClassAttrName = classAttrName,
}) {
	const componentClassAttrName = name === 'react' ? 'className' : 'class';
	const componentClassParam =
		componentClassAttrName === 'className'
			? '{ className }: { className?: string }'
			: '{ class: className }: { class?: string }';

	runSharedPlatformTests({ compile, name });

	runSharedComponentLoopControlFlowTests({ compile, name });
	runSharedScopedStyleTests({ compile, name, classAttrName, generatedClassAttrName });
	runSharedScopedStyleConformanceTests({ compile, name, classAttrName, generatedClassAttrName });

	describe(`[${name}] deferred imports`, () => {
		it('preserves deferred imports in compiled output', () => {
			const { code } = compile(
				`import defer * as feature from './feature.js';
				const lazy = import.defer('./lazy.js', { with: { type: 'json' } });

				export function App() {
					return <div>{feature.value}</div>;
				}`,
				'App.tsrx',
			);

			expect(code).toContain("import defer * as feature from './feature.js';");
			expect(code).toContain("import.defer('./lazy.js', { with: { type: 'json' } })");
		});
	});

	describe(`[${name}] literal \`<\` in text`, () => {
		// The TSRX parser reads a `<` that cannot start a tag as literal text
		// (`<span><3</span>`), but the compiled output is re-parsed by a JSX
		// toolchain (esbuild, Babel, SWC) that forbids a bare `<` in text, so the
		// printer must emit it as `&lt;` — which decodes back to the same string.
		it('escapes a literal `<` in text as `&lt;`', () => {
			const { code } = compile(
				`export function App() { return <span><3 and a < b</span>; }`,
				'App.tsrx',
			);

			expect(code).toContain('<span>&lt;3 and a &lt; b</span>');
		});

		it('escapes `<` in a raw-text script body', () => {
			const { code } = compile(
				`export function App() { return <div><script>if (a < b) x();</script></div>; }`,
				'App.tsrx',
			);

			expect(code).toContain('<script>if (a &lt; b) x();</script>');
		});
	});

	describe(`[${name}] fragment expression children`, () => {
		// A bare expression placed directly as a JSX child reads as JSX text
		// (`<>{a}b</>` renders the letter "b"), so every expression that ends up
		// in a fragment children list must keep its `{ … }` container.

		it('keeps a sibling nested-fragment expression in a container', () => {
			const { code } = compile(
				`function App() @{
					const a = 1, b = 2;
					<>{a} <>{<>{b}</>}</></>
				}`,
				'App.tsrx',
			);

			// The inline space between the two expressions is interior, so it stays
			// bare; only fragment-edge whitespace becomes `{' '}`.
			expect(code).toContain('<>{a} {b}</>');
			expect(code).not.toContain('<>{a}b</>');
		});

		it('keeps expressions at every level of nested fragments in expression position', () => {
			const { code } = compile(
				`function StatusBadge() @{
					const a = 1;
					<>{<>{a} <>{<>{a}</>}</> </>}</>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('{a} {a}');
			expect(code).not.toContain('<>{a}a</>');
			expect(code).not.toContain('<>aa</>');
		});

		// Regression: an empty fragment as a container's expression must stay
		// `{<></>}`, not be lowered to the bare `{null}` of expression position.
		it('keeps an empty fragment inside a container as a fragment', () => {
			const { code } = compile(
				`function App() @{
					<b>{<></>}</b>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('<b>{<></>}</b>');
			expect(code).not.toContain('{null}');
		});

		it('keeps an empty fragment in expression position as a fragment', () => {
			const { code } = compile(
				`function App() @{
					let b = <></>;
					<div />
				}`,
				'App.tsrx',
			);

			expect(code).toContain('let b = <></>;');
			expect(code).not.toContain('let b = null;');
		});

		it('keeps the outer fragment of a nested empty fragment in expression position', () => {
			const { code } = compile(
				`function App() @{
					let c = <><></></>;
					<div />
				}`,
				'App.tsrx',
			);

			expect(code).toContain('let c = <><></></>;');
		});

		it('keeps an empty expression container fragment as a fragment in expression position', () => {
			const { code } = compile(
				`function App() @{
					let c = <>{}</>;
					<div />
				}`,
				'App.tsrx',
			);

			expect(code).toContain('let c = <></>;');
			expect(code).not.toMatch(/let c = ;/);
		});

		it('keeps a comment-only container fragment as a fragment in expression position', () => {
			const { code } = compile(
				`function App() @{
					let c = <>{/* note */}</>;
					<div />
				}`,
				'App.tsrx',
			);

			expect(code).toContain('let c = <></>;');
			expect(code).not.toMatch(/let c = ;/);
		});
	});

	describe(`[${name}] component export shapes`, () => {
		// Export prefix preservation should stay stable per target. Vue wraps
		// every component in `defineVaporComponent(...)`; the other targets
		// keep the authored function declaration. Any future change that
		// double-exports, strips a default, or otherwise changes the
		// declaration wrapper fails here first.

		it('keeps plain components local unless explicitly exported', () => {
			const { code } = compile(
				`function App() @{
					<div>{'Hello world'}</div>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('function App() {');
			expect(code).toContain("{'Hello world'}");
			expect(code).not.toContain('export function App');
			expect(code).not.toContain('export default function App');
		});

		it.runIf(name !== 'vue')('preserves named component exports without double-exporting', () => {
			const { code } = compile(
				`export function App() @{
					<div>{'Hello world'}</div>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('export function App()');
			expect(code).toContain("{'Hello world'}");
			expect(code).not.toContain('export export function App()');
		});

		it.runIf(name === 'vue')(
			'wraps named component exports in defineVaporComponent without double-exporting',
			() => {
				const { code } = compile(
					`export function App() @{
						<div>{'Hello world'}</div>
					}`,
					'App.tsrx',
				);

				expect(code).toContain('export const App = defineVaporComponent(function App()');
				expect(code).toContain("{'Hello world'}");
				expect(code).not.toContain('export function App');
			},
		);

		it.runIf(name !== 'vue')('preserves default component exports', () => {
			const { code } = compile(
				`export default function App() @{
					<div>{'Hello world'}</div>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('export default function App()');
			expect(code).toContain("{'Hello world'}");
		});

		it.runIf(name === 'vue')('wraps default component exports in defineVaporComponent', () => {
			const { code } = compile(
				`export default function App() @{
					<div>{'Hello world'}</div>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('export default defineVaporComponent(function App()');
			expect(code).toContain("{'Hello world'}");
		});

		it('preserves component type parameters on the emitted function', () => {
			const { code } = compile(
				`type Props<Item> = {
					items: readonly Item[];
				}

				export function MyComponent<Item>(props: Props<Item>) @{
					<div />
				}`,
				'App.tsrx',
			);

			expect(code).toContain(
				name === 'vue'
					? 'export const MyComponent = defineVaporComponent(function MyComponent<Item>(props: Props<Item>)'
					: 'export function MyComponent<Item>(props: Props<Item>)',
			);
		});

		it('preserves generic type arguments on JSX component tags', () => {
			const { code } = compile(
				`type User = { name: string };

				function RenderProp<Item>(props: { children: (item: Item) => any }) { return null; }

				export function App() @{
					<RenderProp<User>>
						{(item) => item.name}
					</RenderProp>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('<RenderProp<User>>');
		});

		it('preserves generic type arguments on self-closing JSX component tags', () => {
			const { code } = compile(
				`function Box<T>({ value }: { value: T }) @{
					<div>{String(value)}</div>
				}

				export function App() @{
					<Box<string> value="hi" />
				}`,
				'App.tsrx',
			);

			expect(code).toContain('<Box<string>');
		});
	});

	describe(`[${name}] component try pending fallbacks`, () => {
		// Vue lowers `@pending` to a Suspense slot object, the other targets to
		// a `fallback={...}` prop — an empty block must not emit a fallback slot
		// or a fallback prop respectively.
		it('allows empty pending blocks as null fallbacks', () => {
			const { code } = compile(
				`export function App() @{
					@try {
						<div>{'content'}</div>
					} @pending {}
				}`,
				'App.tsrx',
			);

			expect(code).toContain("{'content'}");
			if (name === 'vue') {
				expect(code).toContain('Suspense');
				expect(code).toContain('v-slots=');
				expect(code).toContain('default: () =>');
				expect(code).not.toContain('fallback: () =>');
				expect(code).not.toContain('fallback={');
			} else {
				expect(code).toContain('fallback={null}');
			}
		});
	});

	describe(`[${name}] TypeScript output`, () => {
		it('collects unclosed tag diagnostics without loose recovery silence', () => {
			const result = compile(
				`function App() @{
					<div>hi
				}`,
				'App.tsrx',
				{ collect: true },
			);

			expect(result.errors.map((error) => error.message)).toContain(
				"Unclosed tag '<div>'. Expected '</div>' before end of template.",
			);
			expect(diagnostic_codes(result)).toContain(DIAGNOSTIC_CODES.UNCLOSED_TAG);
		});

		it('keeps loose unclosed tag recovery silent', () => {
			const result = compile(
				`function App() @{
					<div>hi
				}`,
				'App.tsrx',
				{ loose: true },
			);

			expect(result.errors).toEqual([]);
		});

		it('accepts adjacent JSX text and expression children', () => {
			const { code } = compile(
				`export function App({ count }: { count: number }) @{
						<p>clicked {count} times</p>
					}`,
				'App.tsrx',
			);

			expect(code).toContain('clicked');
			expect(code).toContain('{count}');
			expect(code).toContain('times');
		});

		it('accepts indented JSX text children', () => {
			const { code } = compile(
				`export default function App() @{
						<div>
							Hello
						</div>
					}`,
				'App.tsrx',
			);

			expect(code).toContain('Hello');
			expect(code).not.toContain('"Hello";');
			expect(code).not.toContain('return null;');
		});

		it('accepts JSX text at the start of template bodies', () => {
			const { code } = compile(
				`export function App() @{
						<>hello</>
					}`,
				'App.tsrx',
			);

			expect(code).toContain('hello');
			expect(code).not.toContain('hello;');
			expect(code).not.toContain('return null;');
		});

		it('accepts JSX text in if-else branches', () => {
			const { code } = compile(
				`export function App() @{
						@if (false) {
							<>Hello first branch</>
					} @else {
						<>Hello React</>
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('Hello first branch');
			expect(code).toContain('Hello React');
			expect(code).not.toContain('return null;');
		});

		it('keeps plain if blocks in component bodies as setup control flow', () => {
			const { code } = compile(
				`export function App(disabled: boolean) @{
						if (disabled) {
							return <span>disabled</span>;
						}

						<span>enabled</span>
					}`,
				'App.tsrx',
			);

			expect(code).toContain('if (disabled)');
			expect(code).toContain('<span>disabled</span>');
			expect(code).toContain('enabled');
			expect(code).not.toContain('<Show');
		});

		it('keeps nested plain if blocks in @if bodies as setup control flow', () => {
			const { code } = compile(
				`function StatusBadge(status: string, more: boolean) {
						let a = @if (status === 'active') {
							if (more) {
								<b>111</b>
							} else {
								<b>222</b>
							}
						};
					}`,
				'App.tsrx',
			);

			expect(code).toContain('if (more)');
			expect(code).toContain('<b>111</b>');
			expect(code).toContain('<b>222</b>');
			expect(code).toContain('return null;');
			expect(code).not.toContain('more ?');
		});

		it('preserves entities in JSX text children for JSX runtime decoding', () => {
			const { code } = compile(
				`export function App() @{
						<p>a&amp;b&quot;c</p>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('a&amp;b&quot;c');
		});

		it('treats backslashes in JSX text children as literal text', () => {
			const { code } = compile(
				`export function App() @{
					<p>line\\nbreak</p>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('line\\nbreak');
		});

		it('keeps double-quoted strings inside expression containers as JavaScript strings', () => {
			const { code } = compile(
				`export function App() @{
					<p>{"line\\nbreak"} {"&amp;"}</p>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('"line\\nbreak"');
			expect(code).toContain('"&amp;"');
		});

		it('rejects literal newlines in double-quoted strings inside expression containers', () => {
			expect(() =>
				compile(
					`export function App() @{
						<p>{"line
break"}</p>
					}`,
					'App.tsrx',
				),
			).toThrow(/Unterminated string constant/);
		});

		it('keeps compact string comparisons in expression containers parseable', () => {
			const { code } = compile(
				`export function App({ value }: { value: string }) @{
					<p>{a<value}</p>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('{a < value}');
		});

		it('preserves regular function type parameters', () => {
			const { code } = compile(
				`type Props<Item> = {
					items: readonly Item[];
				}

				export function getItems<Item>(props: Props<Item>) {
					return props.items;
				}`,
				'App.tsrx',
			);

			expect(code).toContain('export function getItems<Item>(props: Props<Item>)');
		});

		it('preserves optional markers in tuple members and function parameters', () => {
			const { code } = compile(
				`export type OptionalTuple = [bar: string, baz?: string];
export type OptionalFn = (bar: string, baz?: string) => void;
export interface OptionalInterfaceFn {
	(bar: string, baz?: string): void;
}
export function optionalFn(bar: string, baz?: string) {
	todo(bar, baz);
}`,
				'App.tsrx',
			);

			expect(code).toContain('export type OptionalTuple = [bar: string, baz?: string];');
			expect(code).toContain('export type OptionalFn = (bar: string, baz?: string) => void;');
			expect(code).toContain('(bar: string, baz?: string): void');
			expect(code).toContain('export function optionalFn(bar: string, baz?: string)');
		});

		it('keeps JavaScript block scopes inside component-local callables', () => {
			const { code } = compile(
				`export function BlockScopeCheck() @{
					function fromDeclaration() {
						let result = 0;
						{
							const result = 41;
							return result + 1;
						}
					}

					const fromArrow = () => {
						{
							const token = 'arrow-block';
							return token.toUpperCase();
						}
					};

					class Reader {
						value() {
							{
								const amount = 7;
								return amount * 6;
							}
						}
					}

					const reader = new Reader();

					<output>{fromDeclaration()}{fromArrow()}{reader.value()}</output>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('function fromDeclaration()');
			expect(code).toContain('const result = 41');
			expect(code).toContain("const token = 'arrow-block'");
			expect(code).toContain('class Reader');
			expect(code).toContain('const amount = 7');
			expect(code).toContain('{fromDeclaration()}');
			expect(code).toContain('{fromArrow()}');
			expect(code).toContain('{reader.value()}');
		});

		it('still treats component-level braces as template expressions', () => {
			const { code } = compile(
				`export function ExpressionContainerCheck() @{
					function ignore() {
						{
							const hidden = 'not rendered';
							return hidden;
						}
					}

					const visible = 'render me';
					<>{visible}</>
				}`,
				'App.tsrx',
			);

			expect(code).toContain("const visible = 'render me'");
			expect(code).toContain('return <>{visible}</>;');
			expect(code).not.toMatch(/\{\n\s+visible;\n\s+\}/);
		});

		it('keeps generic-looking arrow expressions parseable after inner blocks in functions', () => {
			const { code } = compile(
				`export function GenericAfterBlockCheck() @{
					const make = () => {
						if (true) {
							const local = 1;
							console.log(local);
						}

						<T,>(value: T) => value;
					};

					<div>{make}</div>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('(value: T) => value');
			expect(code).toContain('{make}');
		});
	});

	describe(`[${name}] diagnostic codes`, () => {
		it('collects mismatched closing tag diagnostic codes', () => {
			expect(() =>
				compile(
					`function App() @{
						<div></span>
					}`,
					'App.tsrx',
					{ collect: true },
				),
			).toThrow(/Unexpected closing tag/);
		});
	});

	describe(`[${name}] component return validation`, () => {
		it('allows return values inside functions and classes nested in components', () => {
			expect(() =>
				compile(
					`export function App() @{
						function getLabel() {
							return 'label';
						}

						const getCount = () => {
							return 1;
						};

						class Model {
							getValue() {
								return getCount();
							}
						}

						const model = new Model();
						<div>{getLabel()}{model.getValue()}</div>
					}`,
					'App.tsrx',
				),
			).not.toThrow();
		});

		it('rejects return statements inside template @if branches', () => {
			expect(() =>
				compile(
					`export function App() @{
						<>
							@if (x) {
								return <div>hello world</div>;
							}

							<div>hello world 2</div>
						</>
					}`,
					'App.tsrx',
				),
			).toThrow(/Return statements are not allowed inside TSRX template @if blocks/);
		});
	});

	describe(`[${name}] removed style directive syntax`, () => {
		it('does not parse {style} inside element child expressions', () => {
			expect(() =>
				compile(
					`export function App() @{
						<div>{style 'root'}</div>
						<style>
							.root { color: blue; }
						</style>
					}`,
					'App.tsrx',
				),
			).toThrow();
		});

		it('does not parse {style} in attributes', () => {
			expect(() =>
				compile(
					`export function App() @{
						<div class={style 'root'}>{'hi'}</div>
						<style>
							.root { color: blue; }
						</style>
					}`,
					'App.tsrx',
				),
			).toThrow();
		});

		it('does not parse the removed #style syntax', () => {
			expect(() =>
				compile(
					`export function App() @{
						<Child cls={#style.root} />
						<style>
							.root { color: blue; }
						</style>
					}`,
					'App.tsrx',
				),
			).toThrow();
		});
	});

	describe(`[${name}] <> and fragment unwrapping`, () => {
		// Expression-position JSX fragments unwrap when they only contain a
		// single render expression and wrap when they need to preserve siblings.
		it('unwraps a JSX fragment with a single element child', () => {
			const { code } = compile(`class Foo { bar() { return <><div>hi</div></>; } }`, 'App.tsrx');
			expect(code).toContain('hi');
			expect(code).not.toContain('<tsx');
		});

		it('preserves component spread attributes inside JSX fragments', () => {
			const { code } = compile(
				`class Foo { bar() { const props = {}; return <><Bar {...props} /></>; } }`,
				'App.tsrx',
			);
			expect(code).toContain('return <><Bar {...props} /></>;');
			expect(code).not.toContain('<tsx');
		});

		it('unwraps a JSX fragment containing a single expression to the expression', () => {
			// Regression: previously `<>{'Hello'}</>` was compiled to
			// `return {'Hello'};`, which is a JS syntax error because `{`
			// opens a block/object literal. The JSXExpressionContainer must
			// be unwrapped to its inner expression in expression position.
			const { code } = compile(`class Foo { bar() { return <>{'Hello'}</>; } }`, 'App.tsrx');
			expect(code).toContain("return <>{'Hello'}</>;");
			expect(code).not.toContain("return {'Hello'}");
		});

		it('unwraps a JSX fragment containing a single identifier expression', () => {
			const { code } = compile(`class Foo { bar() { const x = 1; return <>{x}</>; } }`, 'App.tsrx');
			expect(code).toContain('return <>{x}</>;');
			expect(code).not.toContain('return {x}');
		});

		it('unwraps text-only JSX fragments to strings', () => {
			const { code } = compile(`class Foo { bar() { return <>plain text</>; } }`, 'App.tsrx');
			expect(code).toContain('plain text');
			expect(code).not.toContain('return null;');
		});

		it('keeps an empty authored fragment as render output (not null)', () => {
			const { code } = compile(`class Foo { bar() { return <></>; } }`, 'App.tsrx');
			expect(code).toContain('return <></>;');
			expect(code).not.toContain('return null;');
		});

		it('keeps a single text child faithful at runtime instead of a string-literal expression', () => {
			const { code } = compile(`export function App() {\n\t<>@</>\n}`, 'App.tsrx', { loose: true });
			// `@` is valid text; keep it as-is rather than promoting it to `{'@'}` / `{"@"}`.
			expect(code).toContain('<>@</>');
			expect(code).not.toContain("{'@'}");
			expect(code).not.toContain('{"@"}');
		});

		it('renders nothing for a whitespace-only render output at runtime', () => {
			const { code } = compile(`export function App() {\n\t<>\n\t</>\n}`, 'App.tsrx', {
				loose: true,
			});
			// A nullish/whitespace-only output should be nothing, not a stray `{''}` / `{""}`.
			expect(code).toContain('<></>');
			expect(code).not.toContain("{''}");
			expect(code).not.toContain('{""}');
		});

		it('parses text-only fragment initializers before template expression children', () => {
			const { code } = compile(
				`export function Button() @{
					const x = <>Hello world</>;
					<>{x}</>
				}`,
				'App.tsrx',
			);

			// An authored `<>…</>` is kept verbatim in value position (var-init): the text
			// stays faithful to the source rather than being promoted to a `{"Hello world"}`
			// string-literal expression.
			expect(code).toContain('const x = <>Hello world</>;');
			expect(code).toContain('return <>{x}</>;');
		});

		it('parses backtick text inside fragments as JSX text', () => {
			const { code } = compile(
				`function a() {
					return <>
						\`333\`
					</>;
				}`,
				'App.tsrx',
			);

			expect(code).toContain('`333`');
		});

		it('parses backtick text around JSX elements inside fragments', () => {
			const { code } = compile(
				`function a() {
					return <>
						\`
						<b></b>
						\`
					</>;
				}`,
				'App.tsrx',
			);

			expect(code).toContain('`');
			expect(code).toContain('<b></b>');
		});

		it('wraps multiple JSX fragment children in a fragment', () => {
			const { code } = compile(
				`class Foo { bar() { return <><div>a</div><div>b</div></>; } }`,
				'App.tsrx',
			);
			expect(code).toContain('a');
			expect(code).toContain('b');
		});

		it('unwraps a JSX fragment whose single child is already a fragment', () => {
			const { code } = compile(`class Foo { bar() { return <><>{'x'}</></>; } }`, 'App.tsrx');
			expect(code).toContain("return <>{'x'}</>;");
		});

		it('unwraps an explicit JSX fragment with a single expression', () => {
			const { code } = compile(`class Foo { bar() { return <>{'Hello'}</>; } }`, 'App.tsrx');
			expect(code).toContain("return <>{'Hello'}</>;");
		});

		it('unwraps an explicit JSX fragment with a single element', () => {
			const { code } = compile(`class Foo { bar() { return <><div>hi</div></>; } }`, 'App.tsrx');
			expect(code).toContain('hi');
		});

		// A fragment is always a truthy element, but its single child may be falsy.
		// In a render-output slot the collapse is invisible (covered above), but when
		// the fragment is COMBINED into an expression the collapse flips meaning:
		// `<>{0}</> || 'd'` renders `0`, while `0 || 'd'` renders `'d'`. Keep the
		// fragment in those positions instead of unwrapping it.
		it('keeps a fragment combined into an expression as a fragment', () => {
			const operand = compile(
				`function App() { let c = <>{0}</> || 'd'; return <div>{c}</div>; }`,
				'App.tsrx',
			);
			expect(operand.code).toContain('<>');
			expect(operand.code).toContain('</>');
			expect(operand.code).not.toMatch(/let c = 0 \|\|/);

			const ternary = compile(
				`function App({ o }: { o: boolean }) { let c = o ? <>{1}</> : <>{2}</>; return <div>{c}</div>; }`,
				'App.tsrx',
			);
			expect(ternary.code).toContain('<>');
			expect(ternary.code).not.toMatch(/\?\s*1\s*:\s*2/);
		});

		// An AUTHORED `<>…</>` is kept verbatim in a JS value position (a variable
		// initializer, an assignment) — it must not unwrap to its single child, which
		// turns the author's JSX into a plain value.
		it('keeps an authored fragment in value position', () => {
			const expr = compile(
				`function App() { const v = <>{1}</>; return <div>{v}</div>; }`,
				'App.tsrx',
			);
			expect(expr.code).toContain('<>');
			expect(expr.code).toContain('</>');
			expect(expr.code).not.toMatch(/const v = 1;/);

			const element = compile(
				`function App() { const v = <><span>x</span></>; return <div>{v}</div>; }`,
				'App.tsrx',
			);
			expect(element.code).toContain('<>');
			expect(element.code).toContain('<span>x</span>');
		});

		// The branches of an `@if` (`@for`/`@switch`) keep their authored fragments:
		// `c ? <>{a}</> : <>{b}</>`, not the unwrapped `c ? a : b`. (The compiler's
		// own wrapper around the directive still collapses it to the conditional.)
		it('keeps authored fragments in control-flow branches', () => {
			const { code } = compile(
				`function App() { const xyz = @if (cond()) { <>{[1, 2, 3]}</> } @else { <>{[3, 4, 5]}</> }; return <div>{xyz}</div>; }`,
				'App.tsrx',
			);
			expect(code).toContain('<>');
			expect(code).toContain('</>');
			expect(code).not.toMatch(/\?\s*\[1, 2, 3\]\s*:/);
			expect(code).not.toContain('@if');
		});

		// A compiler-generated wrapper (around `@switch` used as a sole value) is NOT
		// authored, so it still collapses to its rendered value rather than being kept.
		it('still collapses a generated wrapper around a directive', () => {
			const { code } = compile(
				`function App({ s }: { s: string }) { const v = @switch (s) { @case 'a': { <p>A</p> } @default: { <p>D</p> } }; return <div>{v}</div>; }`,
				'App.tsrx',
			);
			expect(code).toContain('A');
			expect(code).toContain('D');
			expect(code).not.toContain('@switch');
		});

		it('keeps an explicit JSX fragment with multiple children', () => {
			const { code } = compile(
				`class Foo { bar() { return <><div>a</div><div>b</div></>; } }`,
				'App.tsrx',
			);
			expect(code).toContain('a');
			expect(code).toContain('b');
		});

		it('keeps special fragment returns inside component-local functions', () => {
			const { code } = compile(
				`export function App() @{
							function FragmentReturn() {
								return <><div>fragment</div></>;
							}
							function TsxReturn() {
							return <><div>tsx</div></>;
						}
							function TsrxReturn() {
								return <><div>tsrx</div></>;
							}

							<div>App</div>
					}`,
				'App.tsrx',
			);

			expect(code).not.toContain('return;');
			expect(code).toMatch(/function FragmentReturn\(\) {\s+return <>{App__static\d+}<\/>;/);
			expect(code).toMatch(/function TsxReturn\(\) {\s+return <>{App__static\d+}<\/>;/);
			expect(code).toMatch(/const App__static\d+ = <div[^>]*>tsrx<\/div>;/);
			expect(code).toMatch(/function TsrxReturn\(\) {\s+return <>{App__static\d+}<\/>;/);
		});

		it('keeps special fragment returns inside component prop arrow functions', () => {
			const { code } = compile(
				`function Child(props) { return null; }

					export function App() @{
						<Child
							fragment={() => {
								return <><div>fragment</div></>;
							}}
							tsx={() => {
								return <><div>tsx</div></>;
							}}
						tsrx={() => {
							return <><div>tsrx</div></>;
						}}
					/>
				}`,
				'App.tsrx',
			);

			expect(code).not.toContain('return;');
			expect(code).toMatch(/const App__static\d+ = <div[^>]*>fragment<\/div>;/);
			expect(code).toMatch(/const App__static\d+ = <div[^>]*>tsx<\/div>;/);
			expect(code).toMatch(/const App__static\d+ = <div[^>]*>tsrx<\/div>;/);
			expect(code).toMatch(/fragment={\(\) => {\s+return <>{App__static\d+}<\/>;/);
			expect(code).toMatch(/tsx={\(\) => {\s+return <>{App__static\d+}<\/>;/);
			expect(code).toMatch(/tsrx={\(\) => {\s+return <>{App__static\d+}<\/>;/);
		});

		it('parses semicolon-less JSX returns in component prop arrow functions', () => {
			const { code } = compile(
				`function Card(props) { return null; }

				function App() @{
					<Card
						children={() => {
							return <>
								<div>Hello, World!</div>
							</>
						}}
					/>
				}`,
				'App.tsrx',
			);
			expect(code).toContain('Hello, World!');
		});

		it('keeps expression child arrays in fragment and JSX callback props', () => {
			const { code } = compile(
				`function Child(props) { return null; }

					export function App() @{
						<Child
							fragment={() => <>{[<>Delete</>, <>Edit</>]}</>}
							native={() => <>{[<>Delete</>, <>Edit</>]}</>}
						/>
					}`,
				'App.tsrx',
			);

			expect(code).toMatch(/fragment={\(\) => {\s+return <>{\[<>Delete<\/>, <>Edit<\/>\]}<\/>;/);
			expect(code).toMatch(/native={\(\) => {\s+return <>{\[<>Delete<\/>, <>Edit<\/>\]}<\/>;/);
		});
	});

	describe(`[${name}] JSX fragment values`, () => {
		it('preserves JSX template text in expression position', () => {
			const { code } = compile(`class Foo { bar() { return <><div>Hello</div></>; } }`, 'App.tsrx');

			expect(code).toContain('Hello');
		});

		it('parses compact JSX templates before a trailing newline at EOF', () => {
			const { code } = compile(
				[
					`export function App() @{`,
					`\tconst title = <><h1>Hello There</h1>{Test(1, 2)}</>;`,
					`\t<>{title}</>`,
					`}`,
					``,
					`function Test(p1, p2) {`,
					`\treturn <><div>Hello</div><div>{p1}</div><div>{p2}</div></>;`,
					`}`,
					``,
				].join('\n'),
				'App.tsrx',
			);

			expect(code).toContain('Hello');
		});

		it('preserves statements before template output', () => {
			const { code } = compile(
				`class Foo { bar() { return <>
					const label = 'Hi';
					<div>{label}</div>
				</>; } }`,
				'App.tsrx',
			);

			expect(code).toContain("const label = 'Hi';");
			expect(code).toContain('{label}');
		});

		it('supports control flow inside JSX template fragments', () => {
			const { code } = compile(
				`class Foo { bar() { return <>@if (true) { <div>yes</div> }</>; } }`,
				'App.tsrx',
			);

			expect(code).toContain('true');
			expect(code).toContain('yes');
		});

		it('preserves JSX template fragments in component JSX attribute values', () => {
			const { code } = compile(
				`function App() @{ <Card content={<><span>Title</span></>} /> }`,
				'App.tsrx',
			);

			expect(code).toContain('Title');
		});

		it('preserves statement-bodied JSX templates in self-closing component attributes', () => {
			const { code } = compile(
				`function App() @{
					<Card
						content={
							@if (foo) {
								<div>
									@if (foo) {}
								</div>
							}
						}
					/>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('foo');
			expect(code).toContain('<Card');
		});

		it('preserves JSX template fragments in JSX attribute values', () => {
			const { code } = compile(
				`class Foo { bar() { return <Card content={<><span>Title</span></>} />; } }`,
				'App.tsrx',
			);

			expect(code).toContain('Title');
		});

		it('preserves JSX template fragments in object property JSX attribute values', () => {
			const { code } = compile(
				`class Foo { bar() { return <Card content={{ child: <><span>Title</span></> }} />; } }`,
				'App.tsrx',
			);

			expect(code).toContain('Title');
		});

		it('preserves JSX template fragments returned from render callback props', () => {
			const { code } = compile(
				`class Foo { bar() { return <List render={() => { return <><span>Item</span></>; }} />; } }`,
				'App.tsrx',
			);

			expect(code).toContain('Item');
		});

		it('preserves JSX template fragments returned from callback props without semicolons', () => {
			const { code } = compile(
				`class Foo {
					bar() {
						return <List
							render={(item) => {
								return <>
									<span>{item.name}</span>
								</>
							}}
						/>
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('item.name');
		});

		it('preserves JSX template fragments in returned object props without semicolons', () => {
			const { code } = compile(
				`class Foo {
					bar() {
						return <List
							render={(item) => {
								return {
									child: <>
										<span>{item.name}</span>
									</>
								}
							}}
						/>
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('item.name');
		});

		it('preserves JSX template fragments in nested render props without trailing commas', () => {
			const cases = [
				`class Foo {
					bar() {
						return <Page
							params={{
								details: {
									render: () => <>
										<div>nested</div>
									</>
								}
							}}
						/>
					}
				}`,
				`class Foo {
					bar() {
						return <Page
							params={{
								details: {
									render: () => <>
										<div>nested trailing comma</div>
									</>,
								},
							}}
						/>
					}
				}`,
			];

			for (const source of cases) {
				const { code } = compile(source, 'App.tsrx');

				expect(code).toContain('nested');
			}
		});

		it('preserves JSX template fragments in top-level render props', () => {
			const cases = [
				[
					`class Foo {
					bar() {
						return <Page
							params={{
								render: () => <>
									<div>top</div>
								</>,
							}}
						/>
					}
				}`,
					'top',
				],
				[
					`class Foo {
					bar() {
						return <Page
							params={{
								render: (icon: () => JSX.Element) => <>
									<div>typed top</div>
								</>,
							}}
						/>
					}
				}`,
					'typed top',
				],
				[
					`class Foo {
					bar() {
						return <Page
							params={{
									render: () => {
										return [<>View</>];
									},
							}}
						/>
					}
				}`,
					'View',
				],
			];

			for (const [source, expected] of cases) {
				const { code } = compile(source, 'App.tsrx');

				expect(code).toContain(expected);
			}
		});

		it('preserves JSX parser state across comments after semicolon-free TSRX returns', () => {
			const cases = [
				`class Foo {
					bar() {
						return <List
							render={(item) => {
								return <>
									<span>{item.name}</span>
								</> /* block comment */
							}}
						/>
					}
				}`,
				`class Foo {
					bar() {
						return <List
							render={(item) => {
								return <>
									<span>{item.name}</span>
								</> // line comment
							}}
						/>
					}
				}`,
			];

			for (const source of cases) {
				const { code } = compile(source, 'App.tsrx');

				expect(code).toContain('item.name');
			}
		});

		it('preserves JSX template fragments from typed nested render props', () => {
			const cases = [
				`class Foo {
					bar() {
						return <Page
							params={{
								details: {
									render: (icon: () => JSX.Element) => <>
										<div>typed</div>
									</>,
								},
							}}
						/>
					}
				}`,
				`class Foo {
					bar() {
						return <Page
							params={{
								details: {
									render: (tag: string, className: string, icon: () => JSX.Element) => <>
										<div>typed trailing comma</div>
									</>,
								},
							}}
						/>
					}
				}`,
			];

			for (const source of cases) {
				const { code } = compile(source, 'App.tsrx');

				expect(code).toContain('typed');
			}
		});

		it('preserves JSX templates in complex nested params objects', () => {
			const { code } = compile(
				`class Foo {
					bar() {
						return <Page
								params={{
									title: 'Welcome',
									header: {
										class: 'foo',
										children: <><h1>Big things are coming!</h1></>,
									},
									content: <><p>Lorem ipsum...</p></>,
									menuItems: [
										<><span>Copy</span></>,
										<><span>Cut</span></>,
										<><span>Delete</span></>,
									],
								menuAlt: (isAdmin) => {
									if (isAdmin) {
										return [<>Delete</>, <>Edit</>];
									}
									return [<>View</>];
								},
									details: {
										label: {
											class: 'custom',
											children: [<>Shipping & returns</>],
										},
										leadingIcon: { children: <>icon</> },
									},
								details2: {
									render: (tag: string, className: string, icon: () => JSX.Element) =>
										@{ <span class={\`\${className}\${icon ? 'has-icon' : ''}\`}>
											{icon ? icon() : null}
										</span> },
								},
							}}
						/>
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('Welcome');
			expect(code).toContain('isAdmin');
			expect(code).toContain(`${classAttrName}={`);
			expect(code).toContain('has-icon');
		});

		it('parses fragment arrays as object property values inside JSX attribute objects', () => {
			const { code } = compile(
				`class Foo {
					bar() {
						return <Page
							params={{
									menuItems: [
										<><span>Copy</span></>,
										<><span>Cut</span></>,
										<><span>Delete</span></>,
									],
									details: {
										label: {
											children: [<>Shipping & returns</>],
										},
								},
							}}
						/>
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('Copy');
			expect(code).toContain('Cut');
			expect(code).toContain('Delete');
			expect(code).toContain('Shipping');
		});

		it('expression statement inside a JS function body nested in a JSX attribute', () => {
			const { code } = compile(
				`function App() @{
					<Page params={{
						f: () => @{
							<div>
								<div>x</div>
							</div>
						},
					}} />
				}`,
				'App.tsrx',
			);

			expect(code).toContain('<div');
			expect(code).toContain('x');
			expect(code).not.toContain('return null;');
		});

		it('parses statements before later JS statements in JSX attribute callbacks', () => {
			const { code } = compile(
				`function App() @{
					<Page params={{
						menuAlt: (isAdmin) => {
							const items = [];
							if (isAdmin) {
								items.push('Delete', 'Edit');
							} else {
								items.push('View');
							}
							return items;
						},
					}} />
				}`,
				'App.tsrx',
			);

			expect(code).toContain('isAdmin');
			expect(code).toContain('return items');
			expect(code).toContain('Delete');
			expect(code).toContain('View');
		});

		it('keeps regular callback returns with JSX values intact', () => {
			const { code } = compile(
				`function Test() @{
					<Page
						params={{
							menuAlt: (isAdmin) => {
								if (isAdmin) {
									return [<>Delete</>, <>Edit</>];
								}
								return [<>View</>];
							},
							direct: () => {
								return [<>View</>];
							},
							bySwitch: (role) => {
								switch (role) {
									case 'admin':
										return [<>Edit</>];
									default:
										return [<>View</>];
								}
							},
							byForOf: (items) => {
								for (const item of items) {
									if (item.active) {
										return [<>{item.label}</>];
									}
								}

								return [<>Empty</>];
							},
							byTry: (load) => {
								try {
									return [<>{load()}</>];
								} catch (error) {
									return [<>Error</>];
								}
							},
						}}
					/>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('return [<>Delete</>, <>Edit</>];');
			expect(code).toContain('return [<>View</>];');
			expect(code).toContain('bySwitch: (role) => {');
			expect(code).toContain('switch (role)');
			expect(code).toContain('byForOf: (items) => {');
			expect(code).toContain('for (const item of items)');
			expect(code).toContain('return [<>Empty</>];');
			expect(code).toContain('byTry: (load) => {');
			expect(code).toContain('return [<>Error</>];');
		});
	});

	describe(`[${name}] fenced setup statements and JSX children`, () => {
		it('keeps element setup statements before rendered children', () => {
			const { code } = compile(
				`function Card() @{
					<div class="card">@{
						var a = "one"
						a = "two"
						<>
							<b>{"hello" + a}</b>
							<b>{"hello" + a}</b>
						</>
					}</div>
				}`,
				'Card.tsrx',
			);
			const assign_two = code.indexOf('a = "two"');
			const first_child = code.indexOf('<b>{"hello" + a}</b>');
			expect(assign_two).toBeGreaterThan(-1);
			expect(first_child).toBeGreaterThan(assign_two);
			expect(code).not.toContain('_tsrx_child_');
		});

		it('keeps component setup statements before rendered children with hook calls', () => {
			const { code } = compile(
				`function Card() @{
					var a = "one"
					a = "two"
					const x = useState(0)
					<>
						<b>{"hello" + a}</b>
						<b>{"hello" + a}</b>
						<div>{x}</div>
					</>
				}`,
				'Card.tsrx',
			);
			const assign_two = code.indexOf('a = "two"');
			const first_child = code.indexOf('<b>{"hello" + a}</b>');
			expect(assign_two).toBeGreaterThan(-1);
			expect(first_child).toBeGreaterThan(assign_two);
			expect(code).not.toContain('_tsrx_child_');
		});

		it('does not capture JSX into temporaries when all statements precede JSX', () => {
			const { code } = compile(
				`function Card() @{
					<div>
						const a = "one"
						const b = "two"
						<span>{a}</span>
						<span>{b}</span>
					</div>
				}`,
				'Card.tsrx',
			);
			// No interleaving, so no capture temporaries should be introduced.
			expect(code).not.toContain('_tsrx_child_');
		});

		it('keeps component setup statements before rendered children', () => {
			const { code } = compile(
				`function Card() @{
					var a = "one"
					a = "two"
					<>
						<b>{"hello" + a}</b>
						<b>{"hello" + a}</b>
					</>
				}`,
				'Card.tsrx',
			);
			const assign_two = code.indexOf('a = "two"');
			const first_child = code.indexOf('<b>{"hello" + a}</b>');
			expect(assign_two).toBeGreaterThan(-1);
			expect(first_child).toBeGreaterThan(assign_two);
			expect(code).not.toContain('_tsrx_child_');
		});
	});

	describe(`[${name}] text children`, () => {
		it('skips the null-coerce ternary for direct JSX text children', () => {
			// `hello` is statically known to be a non-null string, so the
			// text coercion wrapper is dead weight.
			const { code } = compile(
				`export function App() @{
					<b>hello</b>
				}`,
				'App.tsrx',
			);
			expect(code).not.toContain('== null');
			expect(code).not.toContain("+ ''");
		});

		it('treats text as an ordinary identifier in expression containers', () => {
			const { code } = compile(
				`export function App() @{
					const text = 'hello';
					<b>{text}</b>
				}`,
				'App.tsrx',
			);
			expect(code).toContain('{text}');
		});

		it('rejects the removed {text expr} modifier syntax', () => {
			expect(() =>
				compile(
					`export function App() @{
						<b>{text name}</b>
					}`,
					'App.tsrx',
				),
			).toThrow();
		});

		it.runIf(['react', 'preact', 'solid'].includes(name))(
			`[${name}] hoists direct JSX text and static expression sibling combo to a static`,
			() => {
				// React/Preact/Solid hoist child-free static JSX to a module-level
				// constant so the element identity is stable across renders.
				const { code } = compile(
					`export function App() @{
						<b>hello {'hello'}</b>
					}`,
					'App.tsrx',
				);
				expect(code).toContain('const App__static1 = <b>');
				expect(code).toContain('hello');
				expect(code).toContain("{'hello'}");
				expect(code).toContain('return App__static1');
				expect(code).not.toContain('== null');
			},
		);
	});

	describe(`[${name}] native raw HTML props`, () => {
		it('uses the target framework raw HTML prop directly', () => {
			const html_attribute =
				name === 'react' || name === 'preact'
					? 'dangerouslySetInnerHTML={{ __html: markup }}'
					: 'innerHTML={markup}';
			const { code } = compile(
				`export function App({ markup }: { markup: string }) @{
						<article ${html_attribute} />
					}`,
				'App.tsrx',
			);

			expect(code).toContain(html_attribute);
		});

		it('treats html as an ordinary expression identifier', () => {
			const { code } = compile(
				`export function App() @{
						const html = '<strong>escaped</strong>';
						<article>{html}</article>
					}`,
				'App.tsrx',
			);

			expect(code).toContain('html');
			expect(code).not.toContain('{html ');
		});
	});

	describe(`[${name}] JSX fragment shorthand in element context`, () => {
		// Distinct from the `<> and fragment unwrapping` block — those
		// cases put `<>` / `<>` in an *expression* position (return value).
		// These put `<>` inside another element, as a prop value, or inside
		// a `<>` block at a JSX-child position.

		it('collapses a single-child fragment inside an element', () => {
			const { code } = compile(
				`export function App() @{
					<b><>{111}</></b>
				}`,
				'App.tsrx',
			);
			expect(code).toContain('<b>{111}</b>');
			expect(code).not.toContain('<>');
		});

		it('allows JSX fragments inside tsx blocks without throwing', () => {
			expect(() =>
				compile(
					`export function App() @{
						<><>{111}</></>
					}`,
					'App.tsrx',
				),
			).not.toThrow();
		});

		it('supports fragment shorthand passed as a component prop', () => {
			const { code } = compile(
				`function Child(props) @{
					<div>{props.content}</div>
				}

				export function App() @{
					<Child content={<><span>{'hello'}</span></>} />
				}`,
				'App.tsrx',
			);
			expect(code).toContain('<Child content={');
			expect(code).toContain("<span>{'hello'}</span>");
			expect(code).not.toContain('<tsx>');
		});
	});

	describe(`[${name}] scoped CSS`, () => {
		it('applies the scope hash to host elements and emits the hashed stylesheet', () => {
			const { code, css, cssHash } = compile(
				`export function App() @{
					<>
						<div ${generatedClassAttrName}="div">{'Hello world'}</div>

						<style>
							.div { color: red; }
						</style>
					</>
				}`,
				'App.tsrx',
			);

			expect(css).not.toBe('');
			expect(code).toContain("{'Hello world'}");
			expect(code).toContain(`${generatedClassAttrName}="div ${cssHash}"`);
			expect(css).toContain(`.div.${cssHash}`);
			expect(css).toContain('color: red;');
		});

		it('applies the scope hash inside a <> block', () => {
			const { code, css, cssHash } = compile(
				`function Card() @{
					<>
						<>
							<div ${generatedClassAttrName}="card">
								<h2>{'Scoped title'}</h2>
								<p>{'Styles here do not leak out.'}</p>
							</div>
						</>

						<div ${generatedClassAttrName}="card">
							<h2>{'Scoped title'}</h2>
							<p>{'Styles here do not leak out.'}</p>
						</div>

						<style>
							.card {
								padding: 1.5rem;
								border: 1px solid #ddd;
							}

							h2 {
								color: #333;
							}
						</style>
					</>
				}`,
				'Card.tsrx',
			);

			expect(css).not.toBe('');
			expect(count_substring(code, `${generatedClassAttrName}="card ${cssHash}"`)).toBe(2);
		});

		it('applies the scope hash inside fragment shorthand', () => {
			const { code, css, cssHash } = compile(
				`function Card() @{
					<>
						<>
							<div ${generatedClassAttrName}="card">
								<h2>{'Scoped title'}</h2>
								<p>{'Styles here do not leak out.'}</p>
							</div>
						</>

						<div ${generatedClassAttrName}="card">
							<h2>{'Scoped title'}</h2>
							<p>{'Styles here do not leak out.'}</p>
						</div>

						<style>
							.card {
								padding: 1.5rem;
								border: 1px solid #ddd;
							}

							h2 {
								color: #333;
							}
						</style>
					</>
				}`,
				'Card.tsrx',
			);

			expect(css).not.toBe('');
			expect(count_substring(code, `${generatedClassAttrName}="card ${cssHash}"`)).toBe(2);
		});

		it('does not apply scoped css hashes to composite components', () => {
			const { code, css, cssHash } = compile(
				`function Child() @{
					<div>{'Hello world'}</div>
				}

				export function App() @{
					<>
						<Child />
						<div>{'Styled content'}</div>

						<style>
							.div { color: red; }
						</style>
					</>
				}`,
				'App.tsrx',
			);

			expect(css).not.toBe('');
			expect(code).toContain(
				`<div ${generatedClassAttrName}="${cssHash}">{'Styled content'}</div>`,
			);
			expect(code).not.toMatch(/<Child\s+class(Name)?="/);
		});

		it('passes style expression classes through a composite component prop', () => {
			const { code, css, cssHash } = compile(
				`function Badge(${componentClassParam}) @{
					<>
						<span class={['badge', className ?? '']}>{'New'}</span>

						<style>
							.badge { padding: 0.25rem 0.5rem; }
						</style>
					</>
				}

					export function App() @{
						const styles = <style>
							.highlight { background: green; }
						</style>;
						<Badge ${componentClassAttrName}={styles.highlight} />
					}`,
				'App.tsrx',
			);

			expect(css).not.toBe('');
			expect(cssHash).not.toBeNull();
			const app_hash = cssHash?.split(' ').find((h) => code.includes(`${h} highlight`));
			expect(app_hash).toBeTruthy();
			expect(code).toContain(`${app_hash} highlight`);
			expect(code).toContain(`${componentClassAttrName}={styles.highlight}`);
		});

		it('passes style expression classes through a composite component prop when the element has children', () => {
			const { code, css, cssHash } = compile(
				`function Child(${componentClassParam}) @{
							<span class={className}>hello world</span>
					}

						export function App() @{
							const styles = <style>
								.container { color: red; }
							</style>;
								<Child ${componentClassAttrName}={styles.container}>hello world</Child>
						}`,
				'App.tsrx',
			);

			expect(css).not.toBe('');
			expect(cssHash).not.toBeNull();
			const app_hash = cssHash?.split(' ').find((h) => code.includes(`${h} container`));
			expect(app_hash).toBeTruthy();
			expect(code).toContain(`${app_hash} container`);
			expect(code).toContain(`${componentClassAttrName}={styles.container}`);
		});

		it('passes hyphenated style expression class names through a composite component prop', () => {
			const { code, css, cssHash } = compile(
				`export function App() @{
						const styles = <style>
							.accent-tone { color: red; }
						</style>;
						<Child cls={styles['accent-tone']} />
					}`,
				'App.tsrx',
			);

			expect(css).not.toBe('');
			expect(code).toContain('accent-tone');
		});

		it('lowers style expressions inside an expression-position code block', () => {
			const { code, css, cssHash } = compile(
				`const Test = @{
						const styles = <style>
							.card { margin: 5px; }
						</style>;
						<div class={styles.card} />
					};`,
				'App.tsrx',
			);

			expect(css).not.toBe('');
			expect(cssHash).not.toBeNull();
			const hash = cssHash?.split(' ').find((h) => code.includes(`${h} card`));
			expect(hash).toBeTruthy();
			expect(css).toContain(`.card.${hash}`);
			expect(code).toContain(`${classAttrName}={styles.card}`);
			expect(code).not.toContain('JSXStyleElement');
		});

		it('lowers a style expression that is the only content of an expression-position code block', () => {
			const { code, css } = compile(
				`const Test = @{
						const styles = <style>
							.card { margin: 5px; }
						</style>
					};`,
				'App.tsrx',
			);

			expect(css).toContain('margin: 5px;');
			expect(code).toContain('card');
		});

		it('prunes style expression selectors that the class map cannot reach', () => {
			const { css, cssHash } = compile(
				`export function App() @{
						const styles = <style>
							div { color: red; }
							.parent .card { font-weight: bold; }
							.card {
								color: green;
								&:hover { color: blue; }
							}
							:global(.badge) { padding: 0; }
							:global(body) { margin: 0; }
						</style>;
						<div class={styles.card} />
					}`,
				'App.tsrx',
			);

			expect(css).toContain('/* (unused) div { color: red; }*/');
			expect(css).toContain('/* (unused) .parent .card { font-weight: bold; }*/');
			expect(css).toContain(`.card.${cssHash}`);
			expect(css).toContain('&:hover { color: blue; }');
			expect(css).toContain('.badge { padding: 0; }');
			expect(css).not.toContain(`.badge.${cssHash}`);
			expect(css).toContain('/* (unused) :global(body) { margin: 0; }*/');
		});

		it('matches free-standing selectors for both class and className attributes', () => {
			const { css, cssHash } = compile(
				`export function App() @{
						<>
							<div class="a">{'a'}</div>
							<span className="b">{'b'}</span>

							<style>
								.a { color: red; }
								.b { color: blue; }
							</style>
						</>
					}`,
				'App.tsrx',
			);

			expect(css).toContain(`.a.${cssHash}`);
			expect(css).toContain(`.b.${cssHash}`);
			expect(css).not.toContain('(unused)');
		});

		it('prunes free-standing selectors that match no element', () => {
			const { css, cssHash } = compile(
				`export function App() @{
						<>
							<div ${generatedClassAttrName}="card">{'Foo'}</div>

							<style>
								div { color: red; }
								.card { color: green; }
								span { color: gray; }
								:global(.test) { color: black; }
							</style>
						</>
					}`,
				'App.tsrx',
			);

			expect(css).toContain(`div.${cssHash}`);
			expect(css).toContain(`.card.${cssHash}`);
			expect(css).toContain('/* (unused) span { color: gray; }*/');
			expect(css).toContain('.test { color: black; }');
		});

		it('keeps descendant selectors that match across nesting and control flow', () => {
			// Combinator selectors (`.card h2`) match through each element's
			// ancestor chain. Pruning runs before the transform walker stamps
			// paths onto template nodes, so element collection has to record the
			// chain itself — regression: every combinator selector was marked
			// unused in the shared JSX targets.
			const { css, cssHash } = compile(
				`export function App({ ready }: { ready: boolean }) @{
					<>
						<section ${generatedClassAttrName}="card">
							<h2>{'title'}</h2>

							@if (ready) {
								<ul>
									<li>{'item'}</li>
								</ul>
							}
						</section>

						<style>
							.card {
								padding: 1rem;
							}
							.card h2 {
								margin: 0;
							}
							.card ul {
								margin: 0;
							}
							.card ol {
								margin: 0;
							}
						</style>
					</>
				}`,
				'App.tsrx',
			);

			expect(css).toContain(`.card.${cssHash}`);
			expect(css).toContain(`.card.${cssHash} h2:where(.${cssHash})`);
			expect(css).toContain(`.card.${cssHash} ul:where(.${cssHash})`);
			expect(css).toContain('/* (unused) .card ol');
		});
	});

	describe.runIf(['react', 'preact'].includes(name))(
		`[${name}] conditional hooks are not extracted`,
		() => {
			it('leaves hooks inside authored template control flow', () => {
				const { code } = compile(
					`export function App({ show }: { show: boolean }) @{
							@if (show) {
								const [count] = useState(0);
								<div>{count}</div>
							}
						}`,
					'App.tsrx',
				);

				expect(code).toContain('useState(0)');
				expect(code).toContain('return show');
				expect(code).not.toContain('StatementBodyHook');
			});

			it('keeps guard returns and later hooks in the component body', () => {
				const { code } = compile(
					`import { useEffect } from '${name === 'preact' ? 'preact/hooks' : 'react'}';

						export function App({ ready }: { ready: boolean }) @{
							if (!ready) {
								return null;
							}

							useEffect(() => {});

							<div />
						}`,
					'App.tsrx',
				);

				expect(code).toContain('if (!ready) {');
				expect(code).toContain('useEffect(() => {});');
				expect(code).toContain('<div />');
				expect(code).not.toContain('StatementBodyHook');
			});
		},
	);
}

/**
 * Compile-time platform specialization shared by every built-in JSX target.
 *
 * @param {Pick<CompileHarness, 'compile' | 'name'>} harness
 */
function runSharedPlatformTests({ compile, name }) {
	describe(`[${name}] compile-time platform flags`, () => {
		it.each([
			['web', 'selected_web'],
			['ios', 'selected_ios'],
			['android', 'selected_android'],
		])('selects the %s branch before target lowering', (platform, selected) => {
			const { code } = compile(
				`if (import.meta.env.platform.web) {
					const selected_web = 'selected_web';
				} else if (import.meta.env.platform.ios) {
					const selected_ios = 'selected_ios';
				} else {
					const selected_android = 'selected_android';
				}`,
				'App.tsrx',
				{ platform: /** @type {import('../../types/index').Platform} */ (platform) },
			);

			expect(code).toContain(selected);
			for (const discarded of ['selected_web', 'selected_ios', 'selected_android']) {
				if (discarded !== selected) expect(code).not.toContain(discarded);
			}
			expect(code).not.toContain('import.meta.env.platform');
		});

		it('specializes nested guards and retains selected lexical blocks', () => {
			const { code } = compile(
				`if (import.meta.env.platform.ios) {
					const outer = 'ios_outer';
					if (import.meta.env.platform.ios) {
						const inner = outer;
						consume(inner);
					}
				} else {
					consume('not_ios');
				}`,
				'App.tsrx',
				{ platform: 'ios' },
			);

			expect(code).toContain("const outer = 'ios_outer'");
			expect(code).toContain('const inner = outer');
			expect(code).toMatch(/\{[\s\S]*const outer[\s\S]*\{[\s\S]*const inner/);
			expect(code).not.toContain('not_ios');
		});

		it('drops inactive imports and scoped CSS before dependency/style analysis', () => {
			const { code, css } = compile(
				`if (import.meta.env.platform.web) {
					import('./missing-web-only');
					function PlatformView() @{ <>
						<style>.web-only { color: red; }</style>
						<div class="web-only" />
					</> }
				} else {
					function PlatformView() @{ <>
						<style>.native-only { color: blue; }</style>
						<div class="native-only" />
					</> }
				}`,
				'App.tsrx',
				{ platform: 'android' },
			);

			expect(code).not.toContain('missing-web-only');
			expect(code).not.toContain('web-only');
			expect(code).toContain('native-only');
			expect(css).not.toContain('web-only');
			expect(css).toContain('native-only');
		});

		it('does not semantically analyze an inactive TSRX branch', () => {
			expect(() =>
				compile(
					`if (import.meta.env.platform.web) {
						function InvalidOnlyOnWeb() @{
							<style>.invalid-lone-output { color: red; }</style>
						}
					} else {
						const selected_native = true;
					}`,
					'App.tsrx',
					{ platform: 'android' },
				),
			).not.toThrow();
		});

		it('keeps @if as runtime template control flow', () => {
			const { code } = compile(
				`function App() @{
					@if (import.meta.env.platform.web) {
						<div>{'web'}</div>
					} @else {
						<div>{'native'}</div>
					}
				}`,
				'App.tsrx',
				{ platform: 'web' },
			);

			expect(code).toContain('import.meta.env.platform.web');
			expect(code).toContain('web');
			expect(code).toContain('native');
		});

		it('requires configuration when a recognized flag is used', () => {
			expect(() => compile('if (import.meta.env.platform.web) { consume(); }', 'App.tsrx')).toThrow(
				/requires a configured TSRX platform/,
			);

			const result = compile('if (import.meta.env.platform.web) { consume(); }', 'App.tsrx', {
				collect: true,
			});
			expect(diagnostic_codes(result)).toContain(DIAGNOSTIC_CODES.PLATFORM_REQUIRED);
		});

		it.each(['windows', null, true, 1, [], {}])(
			'rejects invalid platform option %j',
			(platform) => {
				expect(() =>
					compile('const value = 1;', 'App.tsrx', {
						platform: /** @type {any} */ (platform),
					}),
				).toThrow(/Invalid TSRX platform/);
			},
		);
	});
}

/**
 * `@{ … }` code blocks in template children position: each block is its own
 * lexical scope, and the lowering pays only for what the block uses —
 * template-only blocks merge statically into the parent, code-only blocks
 * become a plain `{ … }` statement block, and blocks with both setup code and
 * render output become a scoped IIFE child. Nested chains (`@{ @{ … } }`)
 * fold into a single closure with nested plain blocks, so shadowed
 * declarations stay scoped per level.
 *
 * @param {{ compile: CompileHarness['compile'], name: string }} harness
 */
export function runSharedCodeBlockChildrenTests({ compile, name }) {
	describe(`[${name}] code blocks in template children position`, () => {
		it('compiles empty nested code blocks to nothing at any depth', () => {
			for (const block of ['@{}', '@{@{}}', '@{@{@{}}}']) {
				const { code, errors } = compile(
					`function StatusBadge() @{
						<>
							<>{a}</>
							<>{b}</>
							${block}
						</>
					}`,
					'App.tsrx',
				);
				expect(errors ?? []).toEqual([]);
				expect(code).toContain('{a}');
				expect(code).toContain('{b}');
				expect(code).not.toContain('_tsrx_child_');
				expect(code).not.toContain('(() => {');
			}
		});

		it('merges a template-only block statically into its parent', () => {
			for (const block of [
				`@{<span class="x">{'x'}</span>}`,
				`@{@{@{<span class="x">{'x'}</span>}}}`,
			]) {
				const { code } = compile(
					`function App() @{
						<>
							<span class="a">{'a'}</span>
							${block}
						</>
					}`,
					'App.tsrx',
				);
				expect(code).toContain('<span class="x">');
				expect(code).not.toContain('(() => {');
				expect(code).not.toContain('_tsrx_child_');
			}
		});

		it('lowers a code-only block to a scoped statement block in source order', () => {
			const { code } = compile(
				`function App() @{
					const items: number[] = [];
					<>
						@{
							const scoped = 1;
							items.push(scoped);
						}
						<span class="len">{items.length}</span>
					</>
				}`,
				'App.tsrx',
			);
			// The statements run in source order inside a real `{ … }` block —
			// no inline IIFE needed.
			expect(code).toMatch(/\{\s*const scoped = 1;/);
			expect(code.indexOf('items.length')).toBeGreaterThan(code.indexOf('const scoped = 1;'));
			expect(code).not.toContain('(() => {');
		});

		it('lowers a block with setup code and render output to a scoped IIFE child', () => {
			const { code } = compile(
				`function App() @{
					<>
						<span class="a">{'a'}</span>
						@{
							const x = 1;
							<span class="x">{x}</span>
						}
					</>
				}`,
				'App.tsrx',
			);
			expect(code).toMatch(/\(\(\) => \{\s*const x = 1;/);
			expect(code).toContain('return <span class="x">{x}</span>');
		});

		it('gives each nested code block its own lexical scope in one closure', () => {
			const { code } = compile(
				`function App() @{
					const y = 10;
					<>
						<span class="a">{'a'}</span>
						@{
							const x = 1;
							@{
								const x = 2;
								@{
									<span class="sum">{x + y}</span>
								}
							}
						}
					</>
				}`,
				'App.tsrx',
			);
			// Shadowed declarations survive: each chain level is its own scope,
			// folded into a single closure with nested plain blocks.
			expect(code).toContain('const x = 1;');
			expect(code).toContain('const x = 2;');
			expect(code).toContain('<span class="sum">{x + y}</span>');
			expect(count_substring(code, '(() => {')).toBe(1);
		});
	});
}
