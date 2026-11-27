/** @import {Diagnostic, LanguageServiceEnvironment} from '@volar/language-service' */
/** @import {TextDocument} from 'vscode-languageserver-textdocument' */

import { TS_ERRORS, TSRX_ERRORS } from '@tsrx/core';
import { DIAGNOSTIC_SOURCE } from '@tsrx/core/diagnostics';
import { describe, expect, it } from 'vitest';
import { TextDocument as TextDocumentStub } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from '@volar/language-server';
import { createCompileErrorDiagnosticPlugin } from '../src/compileErrorDiagnosticPlugin.js';
import { createTypeScriptDiagnosticFilterPlugin } from '../src/typescriptDiagnosticPlugin.js';
import { create_service_harness, create_typescript_harness } from './setup.js';

/** @param {string} source */
async function diagnostics_for(source) {
	const { document, service, uri } = create_service_harness(
		source,
		[createCompileErrorDiagnosticPlugin()],
		'react/App.tsrx',
	);
	const diagnostics = await service.getDiagnostics(uri);
	return { document, diagnostics };
}

describe('compile error diagnostic plugin — scoped style diagnostics', () => {
	it('reports STYLE_APPLY_TARGET at the apply target identifier', async () => {
		const { document, diagnostics } = await diagnostics_for(
			`export function App() @{
	<>
		<style apply={missing} />
		<div>{'x'}</div>
	</>
}`,
		);

		expect(diagnostics).toHaveLength(1);
		const [diagnostic] = diagnostics;
		expect(diagnostic.code).toBe('TSRX3002');
		expect(diagnostic.source).toBe('TSRX');
		expect(diagnostic.message).toContain("'missing' is not a style block");
		expect(document.getText(diagnostic.range)).toBe('missing');
	});

	it('reports STYLE_APPLY_BEFORE_DECLARATION at the apply target identifier', async () => {
		const { document, diagnostics } = await diagnostics_for(
			`export function App() @{
	<>
		<style apply={later} />
		<div>{'x'}</div>
	</>
}
const later = <style>.a { color: red; }</style>;`,
		);

		expect(diagnostics).toHaveLength(1);
		const [diagnostic] = diagnostics;
		expect(diagnostic.code).toBe('TSRX3003');
		expect(diagnostic.message).toContain("'later' is applied before its declaration");
		expect(document.getText(diagnostic.range)).toBe('later');
	});

	it('reports STYLE_APPLY_TARGET on a member target', async () => {
		const { document, diagnostics } = await diagnostics_for(
			`const themes = { dark: <style>.a { color: red; }</style> };
export function App() @{
	<>
		<style apply={themes.light} />
		<div>{'x'}</div>
	</>
}`,
		);

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].code).toBe('TSRX3002');
		expect(document.getText(diagnostics[0].range)).toBe('themes.light');
	});

	it('reports each CSS_GLOBAL_PLACEMENT on the :global it is about', async () => {
		// The type-only output has no tokens inside a CSS body, so the diagnostic
		// shows in the body's embedded CSS, which maps it whole.
		const { document, diagnostics } = await diagnostics_for(
			`export function App() @{
	<>
		<style>
			.a :global(.b) .c { color: red; }
			:is(:global .d) { color: blue; }
		</style>
		<div>{'x'}</div>
	</>
}
const theme = <style>.e :global(.f) .g { color: red; } @import 'x.css';</style>;`,
		);

		expect(
			[...diagnostics]
				.sort((a, b) => document.offsetAt(a.range.start) - document.offsetAt(b.range.start))
				.map((diagnostic) => [diagnostic.code, document.getText(diagnostic.range)]),
		).toEqual([
			['TSRX3011', ':global(.b)'],
			['TSRX3011', ':global'],
			['TSRX3011', ':global(.f)'],
			['TSRX3012', "@import 'x.css';"],
		]);
	});

	it('keeps an error on the TSRX document when its <style> body shares an id', async () => {
		// Volar keeps one embedded code of an id and gives every document of that
		// id that code, so the body whose id another body shares has no document
		// of its own: its error stays on the TSRX document, and no other body's
		// document takes it.
		const source = 'x'.repeat(120);
		/**
		 * @param {string} id
		 * @param {number} start
		 */
		const css = (id, start) => ({
			id,
			languageId: 'css',
			mappings: [{ sourceOffsets: [start], generatedOffsets: [0], lengths: [20], data: {} }],
			embeddedCodes: [],
		});
		const shared_a = css('style-shared', 10);
		const shared_b = css('style-shared', 50);
		const own = css('style-own', 90);
		/** @param {number} pos */
		const usage_error = (pos) => ({
			pos,
			end: pos + 5,
			message: 'm',
			code: 'TSRX3011',
			type: 'usage',
		});
		const root = {
			id: 'root',
			languageId: 'tsrx',
			embeddedCodes: [shared_a, shared_b, own],
			fatalErrors: [],
			usageErrors: [usage_error(55), usage_error(95)],
			mappings: [],
			originalCode: source,
			findMappingBySourceRange: () => null,
			findGeneratedRangeBySourceRange: () => null,
		};
		const codes = new Map([
			['root', root],
			['style-shared', shared_b],
			['style-own', own],
		]);
		const context = /** @type {any} */ ({
			decodeEmbeddedDocumentUri: (/** @type {{ path: string }} */ uri) => [uri, uri.path.slice(1)],
			language: {
				scripts: { get: () => ({ generated: { root, embeddedCodes: codes } }) },
				maps: { get: () => undefined },
			},
		});
		const plugin = createCompileErrorDiagnosticPlugin().create(context);
		/** @param {string} id */
		const shown = async (id) =>
			(
				await plugin.provideDiagnostics?.(
					TextDocumentStub.create(`file:///${id}`, 'css', 0, source),
					/** @type {any} */ ({ isCancellationRequested: false }),
				)
			)?.map((diagnostic) => [diagnostic.range.start.character, diagnostic.range.end.character]);

		expect(await shown('style-shared')).toEqual([]);
		expect(await shown('style-own')).toEqual([[5, 10]]);
		// The shared body's error, at the start of the file for want of a mapping.
		expect(await shown('root')).toEqual([[0, 1]]);
	});

	it('reports nothing for a valid apply', async () => {
		const { diagnostics } = await diagnostics_for(
			`const theme = <style>.a { color: red; }</style>;
export function App() @{
	<>
		<style apply={theme} />
		<div>{'x'}</div>
	</>
}`,
		);

		expect(diagnostics).toEqual([]);
	});

	it('surfaces a collected warning-severity diagnostic as a warning, not silence or an error', async () => {
		const source = `const theme = <style>.a { color: red; }</style>;
export function App() @{
	<>
		<style apply={theme} />
		<div class={theme.a}>{'x'}</div>
	</>
}`;
		const { document, service, uri, language } = create_service_harness(
			source,
			[createCompileErrorDiagnosticPlugin()],
			'react/App.tsrx',
		);

		// A consumer compiler (octane) pushes warning-severity diagnostics into the
		// collected `errors` channel; the plugin must surface them as warnings.
		const root = language.scripts.get(uri)?.generated?.root;
		expect(root?.usageErrors).toEqual([]);
		const theme_start = source.indexOf('theme');
		root.usageErrors.push({
			message: "'.a' is never referenced",
			code: 'octane-style-unused-selector',
			severity: 'warning',
			pos: theme_start,
			end: theme_start + 'theme'.length,
			type: 'usage',
		});

		const diagnostics = await service.getDiagnostics(uri);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Warning);
		expect(diagnostics[0].code).toBe('octane-style-unused-selector');
		expect(document.getText(diagnostics[0].range)).toBe('theme');
	});

	// The editor's compile reports a CSS syntax error (#1306). Its code has no
	// `<style>` body, so the error shows in the body's embedded CSS, where the
	// parser stopped.
	it.each([
		[
			'on a line of its own',
			'export function App() @{\n\t<div>\n\t\t<style>\n\t\t\t.a { color: red; }\n\t\t\t}\n\t\t</style>\n\t\t<p>x</p>\n\t</div>\n}\n',
			'}\n\t\t</style>',
			'}',
		],
		[
			'on the line of the opening tag',
			'export const a = <style>.a { color: red; } }</style>;\n',
			'}</style>',
			'}',
		],
	])('reports a CSS syntax error %s', async (_label, source, near, text) => {
		const { document, diagnostics } = await diagnostics_for(source);

		expect(
			diagnostics.map((diagnostic) => ({
				code: diagnostic.code,
				message: diagnostic.message,
				text: document.getText(diagnostic.range),
				offset: document.offsetAt(diagnostic.range.start),
			})),
		).toEqual([
			{
				code: 'TSRX3013',
				message: 'Expected identifier',
				text,
				offset: source.indexOf(near) + near.indexOf(text),
			},
		]);
	});
});

describe('compile error diagnostic plugin — a statement-only code block', () => {
	it("shows TSRX2035 as a warning on the '@{…}', next to TypeScript's errors in it", async () => {
		const { document, diagnostics } = await editor_diagnostics_for(
			'CodeBlockExpression',
			`export function App({ user }: { user: { name: string } }) @{
	<p>@{user.nmae}</p>
}`,
		);

		const shown = diagnostics
			// The harness has no JSX types (TS7026).
			.filter((diagnostic) => diagnostic.code !== 7026)
			.map((diagnostic) => ({
				source: diagnostic.source,
				code: diagnostic.code,
				severity: diagnostic.severity,
				message: diagnostic.source === 'TSRX' ? diagnostic.message : undefined,
				// The editor spans the tokens the virtual code maps, so not `@{`
				// and `}`. The virtual code puts `user.nmae` on a line of its own
				// and maps it from its own text, not the line break before it
				// (#1321).
				text: document.getText(diagnostic.range),
			}));
		expect(shown).toEqual([
			{
				source: 'ts',
				code: 2339,
				severity: DiagnosticSeverity.Error,
				message: undefined,
				text: 'nmae',
			},
			{
				source: 'TSRX',
				code: TSRX_ERRORS.CODE_BLOCK_EXPRESSION_CHILD.code,
				severity: DiagnosticSeverity.Warning,
				message: TSRX_ERRORS.CODE_BLOCK_EXPRESSION_CHILD.message,
				text: 'user.nmae',
			},
		]);
	});
});

describe('TypeScript diagnostics on a statement right after a `{` (#1321)', () => {
	const type = '{ user: { a?: { b: string } } }';
	it.each([
		['FunctionBody', `export function f({ user }: ${type}) {user.a.b;\n}\n`],
		['IfBlock', `export function f({ user }: ${type}) {\n\tif (user) {user.a.b;}\n}\n`],
		['CodeBlock', `export function App({ user }: ${type}) @{\n\t<p>@{user.a.b}</p>\n}\n`],
	])('shows TS18048 on the expression it is about in %s', async (name, source) => {
		const { document, diagnostics } = await editor_diagnostics_for(
			`StatementAfterBrace${name}`,
			source,
		);
		expect(reported(document, diagnostics, 'TS18048')).toEqual([
			{ source: 'ts', text: 'user.a', offset: source.indexOf('user.a.b') },
		]);
	});
});

describe('compile error diagnostic plugin — a missing closing brace', () => {
	it("reports '}' expected at the end of the document, with an empty range", async () => {
		const source = `export function App() @{
	@if (ok) {
		<b />
`;
		const { document, diagnostics } = await diagnostics_for(source);

		expect(diagnostics).toHaveLength(1);
		const [diagnostic] = diagnostics;
		expect(diagnostic.code).toBe('tsrx-compile-error');
		expect(diagnostic.message).toBe(`${TS_ERRORS.TOKEN_EXPECTED('}').message} (4:0)`);
		const end = document.positionAt(source.length);
		expect(diagnostic.range).toEqual({ start: end, end });
	});

	it("reports '}' expected at the token found after a container's expression", async () => {
		const { document, diagnostics } = await diagnostics_for(
			`export function App() @{
	<b>{text name}</b>
}
`,
		);

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].message).toBe(`${TS_ERRORS.TOKEN_EXPECTED('}').message} (2:10)`);
		expect(document.getText(diagnostics[0].range)).toBe('name');
	});
});

/**
 * The diagnostics the editor gets from both TSRX and TypeScript.
 * @param {string} name The file's name, one per source (see `create_typescript_harness`)
 * @param {string} source
 * @param {Partial<LanguageServiceEnvironment>} [env]
 */
async function editor_diagnostics_for(name, source, env) {
	const { document, service, uri } = create_typescript_harness(
		source,
		[createCompileErrorDiagnosticPlugin(), createTypeScriptDiagnosticFilterPlugin()],
		`react/${name}.tsrx`,
		env,
	);
	const diagnostics = await service.getDiagnostics(uri);
	return { document, diagnostics };
}

/**
 * The source, text, and offset of each diagnostic with `code`, in source order.
 * @param {TextDocument} document
 * @param {Diagnostic[]} diagnostics
 * @param {string} code A code as TSRX writes it, such as `TS1186`
 */
function reported(document, diagnostics, code) {
	return diagnostics
		.filter((diagnostic) =>
			diagnostic.source === 'ts' ? `TS${diagnostic.code}` === code : diagnostic.code === code,
		)
		.map((diagnostic) => ({
			source: diagnostic.source,
			text: document.getText(diagnostic.range),
			offset: document.offsetAt(diagnostic.range.start),
		}))
		.sort((a, b) => a.offset - b.offset);
}

describe('compile error diagnostic plugin — mistakes TypeScript reports too', () => {
	it("leaves a rest element's default to TypeScript", async () => {
		const { document, diagnostics } = await editor_diagnostics_for(
			'RestElementDefault',
			`const b = [1];
const [...a = [1]] = b;
export {};`,
		);

		expect(reported(document, diagnostics, 'TS1186')).toEqual([
			{ source: 'ts', text: '=', offset: 27 },
		]);
	});

	it('leaves a redeclared let to TypeScript, which reports each declaration', async () => {
		const { document, diagnostics } = await editor_diagnostics_for(
			'RedeclaredLet',
			`let abc = 1;
let abc = 2;
export {};`,
		);

		expect(reported(document, diagnostics, 'TS2451')).toEqual([
			{ source: 'ts', text: 'abc', offset: 4 },
			{ source: 'ts', text: 'abc', offset: 17 },
		]);
	});

	it("leaves a `return` in a class `static` block to TypeScript, and keeps the file's other diagnostics", async () => {
		// The parser used to stop at it (TS1108), so the editor lost the file.
		const source = `export class A {
	static {
		return;
	}
}
export const n: number = 'x';
`;
		const { document, diagnostics } = await editor_diagnostics_for('StaticBlockReturn', source);

		expect(reported(document, diagnostics, 'TS18041')).toEqual([
			{ source: 'ts', text: 'return', offset: source.indexOf('return') },
		]);
		expect(reported(document, diagnostics, 'TS2322')).toEqual([
			{ source: 'ts', text: 'n', offset: source.indexOf('n:') },
		]);
	});

	it('leaves a redeclaration in a template body to TypeScript', async () => {
		const { document, diagnostics } = await editor_diagnostics_for(
			'TemplateRedeclaration',
			`export function App() @{
	const a = 1;
	const a = 2;
	<div>{a}</div>
}`,
		);

		expect(reported(document, diagnostics, 'TS2451')).toEqual([
			{ source: 'ts', text: 'a', offset: 32 },
			{ source: 'ts', text: 'a', offset: 46 },
		]);
	});

	it('matches by code and place, not by message', async () => {
		// TSRX says "Argument name clash", TypeScript "Duplicate identifier 'a'".
		const { document, diagnostics } = await editor_diagnostics_for(
			'ParameterClash',
			`function f(a, a) {
	return a;
}
export {};`,
		);

		expect(reported(document, diagnostics, 'TS2300')).toEqual([
			{ source: 'ts', text: 'a', offset: 11 },
			{ source: 'ts', text: 'a', offset: 14 },
		]);
	});

	it('leaves a namespace or module outside a module body to TypeScript (TS1235, TS1234)', async () => {
		const source = `export function f() {
	namespace N {}
	{
		export namespace M {}
	}
	abstract namespace L {}
	return N;
}
export const g = (x = () => {
	namespace K {}
}) => x;
export const h = (x = () => {
	export namespace J {}
}) => x;
export function App() @{
	@try {
		declare module 'm' {}
		<b />
	} @catch (e) {
		declare global {}
		<i />
	}
}`;
		const { document, diagnostics } = await editor_diagnostics_for('NestedNamespace', source);

		// After `abstract`, which the editor's code leaves out, at `namespace`.
		expect(reported(document, diagnostics, 'TS1235')).toEqual([
			{ source: 'ts', text: 'namespace', offset: source.indexOf('namespace N') },
			{ source: 'ts', text: 'export', offset: source.indexOf('export namespace') },
			{ source: 'ts', text: 'namespace', offset: source.indexOf('namespace L') },
			{ source: 'ts', text: 'namespace', offset: source.indexOf('namespace K') },
			{ source: 'ts', text: 'export', offset: source.indexOf('export namespace J') },
		]);
		expect(reported(document, diagnostics, 'TS1234')).toEqual([
			{ source: 'ts', text: 'declare', offset: source.indexOf('declare module') },
			{ source: 'ts', text: 'declare', offset: source.indexOf('declare global') },
		]);
	});

	it("shows a class member's modifier errors once, where TypeScript reports them (#235)", async () => {
		const source = `export abstract class A {
	abstract async m(): Promise<void>;
	async abstract n(): Promise<void>;
	private abstract o(): void;
	accessor static x = 1;
	static public y = 1;
	async static p() {}
}`;
		const { document, diagnostics } = await editor_diagnostics_for('ModifierErrors', source);

		expect(reported(document, diagnostics, 'TS1243')).toEqual([
			{ source: 'ts', text: 'async', offset: source.indexOf('async m') },
			{ source: 'ts', text: 'async', offset: source.indexOf('async abstract') },
			{ source: 'ts', text: 'abstract', offset: source.indexOf('abstract o') },
		]);
		expect(reported(document, diagnostics, 'TS1029')).toEqual([
			{ source: 'ts', text: 'static', offset: source.indexOf('static x') },
			{ source: 'ts', text: 'public', offset: source.indexOf('public y') },
			{ source: 'ts', text: 'static', offset: source.indexOf('static p()') },
		]);
	});

	it('leaves an empty attribute value to TypeScript (#1311)', async () => {
		const { document, diagnostics } = await editor_diagnostics_for(
			'EmptyAttributeValue',
			`export function App() @{
	<div title={} />
}`,
		);

		expect(reported(document, diagnostics, 'TS17000')).toEqual([
			{ source: 'ts', text: '{}', offset: 37 },
		]);
	});

	it('keeps a mistake that the virtual code leaves out', async () => {
		const { document, diagnostics } = await editor_diagnostics_for(
			'DroppedDecorator',
			`@dec function f() {}
export {};`,
		);

		expect(reported(document, diagnostics, 'TS1206')).toEqual([
			{ source: 'TSRX', text: '@', offset: 0 },
		]);
	});

	it("reports a plain try's pending block at `pending`, and checks its code (#1303)", async () => {
		const source = `export function f() {
	try {
		a();
	} pending {
		b(1);
	}
}
declare function a(): void;
declare function b(): void;`;
		const { document, diagnostics } = await editor_diagnostics_for('PlainTryPending', source);

		expect(reported(document, diagnostics, 'TS1472')).toEqual([
			{ source: 'TSRX', text: 'pending', offset: source.indexOf('pending') },
		]);
		// TypeScript checks the block's code: `b` takes no argument.
		expect(reported(document, diagnostics, 'TS2554')).toEqual([
			{ source: 'ts', text: '1', offset: source.indexOf('1)') },
		]);
		expect(diagnostics.filter((diagnostic) => diagnostic.code === 'tsrx-compile-error')).toEqual(
			[],
		);
	});

	it('keeps the mistakes while TypeScript validation is off', async () => {
		const { document, diagnostics } = await editor_diagnostics_for(
			'ValidationOff',
			`const b = [1];
const [...a = [1]] = b;
export {};`,
			{
				async getConfiguration(section) {
					return /** @type {any} */ (section === 'tsrx.validate.enable' ? false : undefined);
				},
			},
		);

		expect(reported(document, diagnostics, 'TS1186')).toEqual([
			{ source: 'TSRX', text: '=', offset: 27 },
		]);
	});

	// The parser records a `break` or `continue` with no target over its keyword,
	// and the editor's code gives it a loop of its own, so TypeScript doesn't
	// report it again beside it, with the same code or, where the template runs
	// in a function, as TS1107.
	it.each([
		[
			'CaseContinue',
			'export function App() @{\n\t<div>@switch (1) { @case 1: { continue; } @default: { <i /> } }</div>\n}\n',
			'continue',
			'TS1107',
		],
		[
			'CaseNestedContinue',
			'export function App({ x }: { x: boolean }) @{\n\t<div>@switch (1) { @case 1: { if (x) continue; <b /> } @default: { <i /> } }</div>\n}\n',
			'continue',
			'TS1107',
		],
		[
			'IfBreak',
			'export function App({ x }: { x: boolean }) @{\n\t<div>@if (x) { break; }</div>\n}\n',
			'break',
			'TS1107',
		],
		['FunctionContinue', 'function f() {\n\tcontinue;\n}\nexport {};\n', 'continue', 'TS1107'],
		[
			'ModuleIfBreak',
			'declare const s: number;\nexport const v = <div>@if (s) { break; }</div>;\n',
			'break',
			'TS1105',
		],
		[
			'LabelNotLoop',
			'export function App() {\n\tL: {\n\t\treturn <div>@if (true) { continue L; }</div>;\n\t}\n}\n',
			'continue',
			'TS1115',
		],
	])(
		'shows the jump with no target in %s once, also with validation off',
		async (name, source, keyword, code) => {
			const offset = source.indexOf(keyword);
			const jumps = (/** @type {TextDocument} */ document, /** @type {Diagnostic[]} */ list) =>
				['TS1104', 'TS1105', 'TS1107', 'TS1115', 'TS1116'].flatMap((jump_code) =>
					reported(document, list, jump_code).map((found) => ({ code: jump_code, ...found })),
				);
			const on = await editor_diagnostics_for(name, source);
			expect(jumps(on.document, on.diagnostics)).toEqual([
				{ code, source: 'TSRX', text: keyword, offset },
			]);

			const off = await editor_diagnostics_for(`${name}Off`, source, {
				async getConfiguration(section) {
					return /** @type {any} */ (section === 'tsrx.validate.enable' ? false : undefined);
				},
			});
			expect(jumps(off.document, off.diagnostics)).toEqual([
				{ code, source: 'TSRX', text: keyword, offset },
			]);
		},
	);

	// A jump a template check reports gets a loop of its own in the editor's
	// code where the template runs in a function, so TypeScript adds no TS1107
	// beside it, and its keyword keeps the error on it, also on its own line.
	it.each([
		[
			'ForBreak',
			'export function App({ x }: { x: boolean }) @{\n\t<ul>@for (const y of [1]) { if (x) break; <li /> }</ul>\n}\n',
			'TSRX2006',
			'break;',
		],
		[
			'ForContinueOwnLine',
			'export function App({ items }: { items: number[] }) @{\n\t<ul>\n\t\t@for (const z of items) {\n\t\t\tif (z) {\n\t\t\t\tcontinue;\n\t\t\t}\n\t\t\t<li />\n\t\t}\n\t</ul>\n}\n',
			'TSRX2007',
			'continue;',
		],
		[
			'IfBreakInLoop',
			'export function App({ x }: { x: boolean }) {\n\tfor (;;) {\n\t\treturn <div>@if (x) { break; }</div>;\n\t}\n}\n',
			'TSRX2003',
			'break;',
		],
		[
			'CaseNestedBreak',
			'export function App({ x, y }: { x: number; y: boolean }) @{\n\t<div>@switch (x) { @case 1: { if (y) break; <b /> } @default: { <i /> } }</div>\n}\n',
			'TSRX2008',
			'break;',
		],
		[
			'CaseNestedBreakOwnLine',
			'export function App({ x, y }: { x: number; y: boolean }) @{\n\t<div>\n\t\t@switch (x) {\n\t\t\t@case 1: {\n\t\t\t\tif (y) {\n\t\t\t\t\tbreak;\n\t\t\t\t}\n\t\t\t\t<b />\n\t\t\t}\n\t\t}\n\t</div>\n}\n',
			'TSRX2008',
			'break;',
		],
		[
			'IfBreakInLoopOwnLine',
			'export function App({ x }: { x: boolean }) {\n\tfor (;;) {\n\t\treturn (\n\t\t\t<div>\n\t\t\t\t@if (x) {\n\t\t\t\t\tbreak;\n\t\t\t\t}\n\t\t\t</div>\n\t\t);\n\t}\n}\n',
			'TSRX2003',
			'break;',
		],
	])(
		'shows the template error for %s alone, on the jump',
		async (name, source, code, statement) => {
			const { document, diagnostics } = await editor_diagnostics_for(name, source);
			expect(reported(document, diagnostics, 'TS1107')).toEqual([]);
			expect(reported(document, diagnostics, code)).toEqual([
				{ source: 'TSRX', text: statement, offset: source.indexOf(statement) },
			]);
		},
	);

	it('keeps the mistakes without the TypeScript service', async () => {
		const { document, diagnostics } = await diagnostics_for(
			`const b = [1];
const [...a = [1]] = b;
export {};`,
		);

		expect(reported(document, diagnostics, 'TS1186')).toEqual([
			{ source: 'TSRX', text: '=', offset: 27 },
		]);
	});
});

// The editor shows a compile error only where the mappings that report it map
// its range back to the source. One whose range lands on other mappings gets
// the nearest code that does.
describe('compile error diagnostic plugin — an error on code with no mapping that reports it', () => {
	const off = /** @type {Partial<LanguageServiceEnvironment>} */ ({
		async getConfiguration(/** @type {string} */ section) {
			return /** @type {any} */ (section === 'tsrx.validate.enable' ? false : undefined);
		},
	});

	// The editor's code leaves out a `break` right in an `@switch` case, and the
	// directive's own mapping over it doesn't report diagnostics, so its TSRX2008
	// goes on the code before it, the case's test, as Solid's code always had it.
	it.each(['react', 'preact', 'solid', 'vue', 'hono', 'hono-dom'])(
		"shows a direct case `break`'s TSRX2008 on the case's test on %s, with validation on and off",
		async (target) => {
			const source =
				'export function App({ x }: { x: number }) @{\n\t<div>\n\t\t@switch (x) {\n\t\t\t@case 1: {\n\t\t\t\tbreak;\n\t\t\t\t<b />\n\t\t\t}\n\t\t}\n\t</div>\n}\n';
			const expected = [{ source: 'TSRX', text: '1', offset: source.indexOf('1: {') }];
			for (const [name, env] of /** @type {const} */ ([
				['DirectCaseBreak', undefined],
				['DirectCaseBreakOff', off],
			])) {
				const { document, service, uri } = create_typescript_harness(
					source,
					[createCompileErrorDiagnosticPlugin(), createTypeScriptDiagnosticFilterPlugin()],
					`${target}/${name}.tsrx`,
					env,
				);
				const diagnostics = await service.getDiagnostics(uri);
				expect(reported(document, diagnostics, 'TSRX2008')).toEqual(expected);
			}
		},
	);

	it.each(['react', 'preact', 'solid', 'vue', 'hono', 'hono-dom'])(
		"shows each direct case `break`'s TSRX2008 on the code before it on %s",
		async (target) => {
			const source = `export function App({ x }: { x: number }) @{
	@switch (x) {
		@case 1: {
			const q = 1;
			break;
			<b>{q}</b>
		}
		@case 2: {
			break;
			<i />
		}
	}
}
`;
			const { document, service, uri } = create_service_harness(
				source,
				[createCompileErrorDiagnosticPlugin()],
				`${target}/DirectCaseBreaks.tsrx`,
			);
			const diagnostics = await service.getDiagnostics(uri);
			expect(reported(document, diagnostics, 'TSRX2008')).toEqual([
				{ source: 'TSRX', text: ';', offset: source.indexOf('1;') + 1 },
				{ source: 'TSRX', text: '2', offset: source.indexOf('2: {') },
			]);
		},
	);

	// An `@switch` used as a statement where no template is, whose own mapping
	// spans the error's range exactly, shows it on its code, as `@if` does.
	it('shows TSRX2010 on an @switch statement outside a template', async () => {
		const source =
			'export function Test(ok: boolean, value: number) {\n\t@if (ok) { <div /> } @else { <span /> };\n\t@switch (value) { @case 1: { <div /> } @default: { <span /> } };\n}\n';
		const { document, diagnostics } = await diagnostics_for(source);
		expect(reported(document, diagnostics, 'TSRX2010')).toEqual([
			{
				source: 'TSRX',
				text: 'ok) { <div /> } @else { <span />',
				offset: source.indexOf('ok) {'),
			},
			{
				source: 'TSRX',
				text: 'value) { @case 1: { <div /> } @default: { <span />',
				offset: source.indexOf('value) {'),
			},
		]);
	});

	/**
	 * A mapping of one source range.
	 * @param {number} source_offset
	 * @param {number} generated_offset
	 * @param {number} length
	 * @param {import('@volar/language-service').CodeInformation['verification']} verification
	 */
	function mapping(source_offset, generated_offset, length, verification) {
		return {
			sourceOffsets: [source_offset],
			generatedOffsets: [generated_offset],
			lengths: [length],
			generatedLengths: [length],
			data: { verification, customData: {} },
		};
	}

	/**
	 * The TSRX2008 diagnostics for one over `[pos, end)` when the virtual code
	 * has only `mappings`, as a compiler may make them, and, if given, the
	 * `generated` code.
	 * @param {string} name
	 * @param {ReturnType<typeof mapping>[]} mappings
	 * @param {number} pos
	 * @param {number} end
	 * @param {string} [generated]
	 * @param {string} [source]
	 */
	async function diagnostics_with_mappings(
		name,
		mappings,
		pos,
		end,
		generated,
		source = 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n',
	) {
		const { document, service, uri, language } = create_service_harness(
			source,
			[createCompileErrorDiagnosticPlugin()],
			`react/${name}.tsrx`,
		);
		const virtual_code = /** @type {any} */ (language.scripts.get(uri)?.generated?.root);
		virtual_code.mappings = mappings;
		if (generated !== undefined) {
			virtual_code.snapshot = {
				getText: (/** @type {number} */ start, /** @type {number} */ end) =>
					generated.substring(start, end),
				getLength: () => generated.length,
				getChangeRange: () => undefined,
			};
		}
		virtual_code.usageErrors = [
			Object.assign(new Error('Invalid jump'), { code: 'TSRX2008', type: 'usage', pos, end }),
		];
		const diagnostics = await service.getDiagnostics(uri);
		return reported(document, diagnostics, 'TSRX2008');
	}

	// A token whose `verification` object rejects the error is no place for it,
	// though it reports other diagnostics, while the error's ends map back.
	it("maps an error through the mappings that report it, not a token whose 'shouldReport' rejects it", async () => {
		expect(
			await diagnostics_with_mappings(
				'RejectingToken',
				[
					mapping(0, 0, 30, false),
					mapping(7, 7, 0, true),
					mapping(18, 18, 0, true),
					mapping(13, 40, 1, { shouldReport: (source) => source !== DIAGNOSTIC_SOURCE }),
				],
				7,
				18,
			),
		).toEqual([{ source: 'TSRX', text: 'const a = 1', offset: 7 }]);
	});

	it("shows an error with no mapping on the nearest code that reports it, not code whose 'shouldReport' rejects it", async () => {
		expect(
			await diagnostics_with_mappings(
				'RejectingNearest',
				[
					mapping(0, 0, 6, true),
					mapping(7, 7, 5, { shouldReport: (source) => source !== DIAGNOSTIC_SOURCE }),
				],
				14,
				16,
			),
		).toEqual([{ source: 'TSRX', text: 'export', offset: 0 }]);
	});

	// Where the editor would drop the error's own range, the nearest code that
	// reports it is the place for it, not code whose `verification` object
	// rejects it, though the editor shows that through another mapping.
	it("shows a dropped error on the nearest code that reports it, past code whose 'shouldReport' rejects it", async () => {
		expect(
			await diagnostics_with_mappings(
				'RejectingNearestDropped',
				[
					mapping(14, 50, 2, false),
					mapping(0, 0, 6, true),
					mapping(7, 40, 5, { shouldReport: () => false }),
					mapping(27, 40, 5, true),
				],
				14,
				16,
				'x'.repeat(80),
			),
		).toEqual([{ source: 'TSRX', text: 'export', offset: 0 }]);
	});

	// The nearest code before reported any diagnostic. When the editor shows the
	// error through another mapping of the same generated code, it stays there.
	it("keeps an error with no mapping where the editor shows it through code whose 'shouldReport' rejects it", async () => {
		expect(
			await diagnostics_with_mappings(
				'RejectingNearestShown',
				[
					mapping(0, 0, 6, true),
					mapping(7, 40, 5, { shouldReport: () => false }),
					mapping(27, 40, 5, true),
				],
				14,
				16,
				'x'.repeat(80),
			),
		).toEqual([{ source: 'TSRX', text: 'const', offset: 27 }]);
	});

	// An error whose ends both map to one generated character maps back to an
	// empty range, which is no code to show it on.
	it('shows an error whose ends map to one point on the nearest code instead', async () => {
		expect(
			await diagnostics_with_mappings(
				'EmptyEnds',
				[
					mapping(27, 50, 5, false),
					mapping(20, 20, 6, true),
					mapping(27, 40, 0, true),
					mapping(32, 40, 0, true),
				],
				27,
				32,
				'x'.repeat(80),
			),
		).toEqual([{ source: 'TSRX', text: 'export', offset: 20 }]);
	});

	// A source range over only a `\r` is empty in the editor, as a position
	// between it and its `\n` is one before it.
	it('shows an error whose ends map to a lone CR on the nearest code instead', async () => {
		expect(
			await diagnostics_with_mappings(
				'LoneCarriageReturn',
				[
					mapping(30, 50, 3, false),
					mapping(3, 10, 1, true),
					mapping(30, 10, 0, true),
					mapping(33, 11, 0, true),
					mapping(0, 20, 3, true),
				],
				30,
				33,
				'x'.repeat(80),
				`abc${String.fromCharCode(13, 10)}${'x'.repeat(115)}`,
			),
		).toEqual([{ source: 'TSRX', text: 'abc', offset: 0 }]);
	});

	// The editor maps the range as positions, and one inside a CRLF line break
	// moves to before it: an error whose range the editor shows that way stays.
	it('keeps an error on the range the editor shows it on, across a CRLF line break', async () => {
		expect(
			await diagnostics_with_mappings(
				'CrlfEnd',
				[mapping(10, 1, 2, true), mapping(17, 20, 1, true), mapping(30, 1, 3, false)],
				30,
				33,
				`abc${String.fromCharCode(13, 10)}${'z'.repeat(115)}`,
			),
		).toEqual([{ source: 'TSRX', text: 'st', offset: 10 }]);
	});

	// Each place the error's ends map to through the mappings that report it
	// is tried, not only the first.
	it('maps an error through the ends that show it on code, past ones that map to one point', async () => {
		expect(
			await diagnostics_with_mappings(
				'LaterEnds',
				[
					mapping(27, 50, 5, false),
					mapping(20, 20, 6, true),
					mapping(27, 40, 0, true),
					mapping(32, 40, 0, true),
					mapping(27, 60, 0, true),
					mapping(32, 65, 0, true),
				],
				27,
				32,
				'x'.repeat(100),
			),
		).toEqual([{ source: 'TSRX', text: 'const', offset: 27 }]);
	});

	// The nearest code is only a place for the error where the editor shows it
	// there: otherwise the next nearest is.
	it.each([
		[
			// A token whose generated code starts inside a CRLF line break.
			'NearestInLineBreak',
			[mapping(30, 50, 3, false), mapping(20, 4, 1, true), mapping(0, 20, 6, true)],
			`abc${String.fromCharCode(13, 10)}${'x'.repeat(75)}`,
			undefined,
			{ source: 'TSRX', text: 'export', offset: 0 },
		],
		[
			// A token whose generated code another mapping maps to a lone CR first.
			'NearestOnLoneCarriageReturn',
			[
				mapping(30, 50, 3, false),
				mapping(3, 10, 1, true),
				mapping(20, 10, 1, true),
				mapping(0, 20, 3, true),
			],
			'x'.repeat(80),
			`abc${String.fromCharCode(13, 10)}${'x'.repeat(115)}`,
			{ source: 'TSRX', text: 'abc', offset: 0 },
		],
		[
			// A token in a mapping of several ranges whose generated code touches
			// the next one's.
			'NearestInMultiRangeMapping',
			[
				mapping(30, 50, 3, false),
				{
					sourceOffsets: [20, 0, 40],
					generatedOffsets: [10, 11, 12],
					lengths: [2, 1, 1],
					generatedLengths: [2, 1, 1],
					data: { verification: true, customData: {} },
				},
				mapping(7, 20, 5, true),
			],
			'x'.repeat(100),
			undefined,
			{ source: 'TSRX', text: 'const', offset: 7 },
		],
	])(
		'skips a nearest token the editor shows nowhere or on no code: %s',
		async (name, mappings, generated, source, expected) => {
			expect(await diagnostics_with_mappings(name, mappings, 30, 33, generated, source)).toEqual([
				expected,
			]);
		},
	);

	// TypeScript's diagnostic and the error, shown on one place through
	// different offsets around a CRLF line break, are one diagnostic.
	it('leaves an error to TypeScript where both show it on one place across a CRLF line break', async () => {
		const source = `abc${String.fromCharCode(13, 10)}${'x'.repeat(115)}`;
		const generated = `let abc=1;\nlet abc=2;\nabc;\n//${'x'.repeat(80)}`;
		/** @type {import('@volar/language-service').LanguageServicePlugin} */
		const typescript = {
			name: 'typescript-semantic',
			capabilities: {
				diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
			},
			create: () => ({
				provideDiagnostics: (document) => [
					{
						range: { start: document.positionAt(4), end: document.positionAt(7) },
						message: "Cannot redeclare block-scoped variable 'abc'.",
						source: 'ts',
						code: 2451,
					},
				],
			}),
		};
		for (const [name, plugins, expected] of /** @type {const} */ ([
			['CrlfDedupe', [typescript], 'ts'],
			['CrlfDedupeAlone', [], 'TSRX'],
		])) {
			const { document, service, uri, language } = create_service_harness(
				source,
				[...plugins, createCompileErrorDiagnosticPlugin()],
				`react/${name}.tsrx`,
			);
			const virtual_code = /** @type {any} */ (language.scripts.get(uri)?.generated?.root);
			virtual_code.mappings = [
				mapping(30, 50, 3, false),
				mapping(30, 22, 0, true),
				mapping(33, 24, 0, true),
				mapping(4, 22, 2, true),
				mapping(3, 4, 3, true),
			];
			virtual_code.snapshot = {
				getText: (/** @type {number} */ start, /** @type {number} */ end) =>
					generated.substring(start, end),
				getLength: () => generated.length,
				getChangeRange: () => undefined,
			};
			virtual_code.usageErrors = [
				Object.assign(new Error("Cannot redeclare block-scoped variable 'abc'."), {
					code: 'TS2451',
					type: 'usage',
					pos: 30,
					end: 33,
				}),
			];
			const diagnostics = await service.getDiagnostics(uri);
			expect(reported(document, diagnostics, 'TS2451')).toEqual([
				{ source: expected, text: `${String.fromCharCode(13, 10)}x`, offset: 3 },
			]);
		}
	});
});

// The editor's compile is loose: it recovers unclosed and mismatched markup,
// so the rest of the file keeps working, and reports it as a collecting
// compile does (#978).
describe('compile error diagnostic plugin — unclosed and mismatched tags', () => {
	// The editor's code gets the missing closing tag, with no mapping, so
	// TypeScript adds no TS17008 or TS1005 to the parser's error. An unclosed
	// tag is reported at its name, and a mismatched closing tag at its `<`.
	it.each([
		['UnclosedTag', 'export function C() @{\n\t<div>\n}\n', 'TSRX1001', '<div>'],
		['MismatchedTag', 'export function C() @{\n\t<div><span></div>\n}\n', 'TSRX1002', '</div>'],
		['UnclosedReturnedTag', 'export function C() {\n\treturn <div>;\n}\n', 'TSRX1001', '<div>'],
		// In braces, where a static element is hoisted out of the walk that
		// closes the tag (#1307).
		[
			'UnclosedTagInBraces',
			'export function C() {\n\treturn <div>{<b>}</div>;\n}\n',
			'TSRX1001',
			'<b>',
		],
		[
			'UnclosedTagInBracesInTemplate',
			'export function C() @{\n\t<div>{<b>}</div>\n}\n',
			'TSRX1001',
			'<b>',
		],
	])('reports %s once, near the tag', async (name, source, code, near) => {
		const { document, diagnostics } = await editor_diagnostics_for(name, source);

		const tsrx = diagnostics.filter((diagnostic) => diagnostic.source === DIAGNOSTIC_SOURCE);
		expect(tsrx.map((diagnostic) => diagnostic.code)).toEqual([code]);
		const offset = document.offsetAt(tsrx[0].range.start);
		const tag = source.indexOf(near);
		expect(offset, document.getText(tsrx[0].range)).toBeGreaterThanOrEqual(tag);
		expect(offset).toBeLessThan(tag + near.length);
		expect(
			diagnostics
				.filter((diagnostic) => diagnostic.source === 'ts')
				.map((diagnostic) => diagnostic.code)
				.filter((ts_code) => [17008, 1005, 17002, 1381].includes(Number(ts_code))),
		).toEqual([]);
	});

	// Each tag left open is reported at its own name, not all of them at the
	// end of the template, which the editor would show on the last tag (#1288).
	it.each([
		['NestedUnclosedTags', 'export function C() @{\n\t<main><section>\n}\n', ['main', 'section']],
		['NestedUnclosedList', 'export function C() @{\n\t<ul><li>a\n}\n', ['ul', 'li']],
		['UnclosedStyle', 'export const a = <style>.a {}\n', ['<style>']],
		['UnclosedScript', 'export const a = <script>const b = 1;\n', ['<script>']],
	])('reports each tag of %s at its name', async (name, source, tags) => {
		const { document, diagnostics } = await editor_diagnostics_for(name, source);

		expect(
			reported(document, diagnostics, TSRX_ERRORS.UNCLOSED_TAG.code).map(({ text, offset }) => ({
				text,
				offset,
			})),
		).toEqual(tags.map((tag) => ({ text: tag, offset: source.indexOf(tag) })));
	});

	// The editor shows a diagnostic only where the generated code maps back,
	// and a `<>` has no mapping, but the error of a `<>` left open has an
	// anchor on the `<>` the editor's code prints, so it shows there, not on its
	// first child or on the code before the template (#1288, #1322).
	it.each([
		['FragmentChild', 'export function C() @{\n\t<><div>\n}\n'],
		[
			'FragmentChildOnNextLine',
			'export function C() @{\n\tconst a = 1;\n\t<>\n\t\t<h1>{a}</h1>\n}\n',
		],
	])('reports the unclosed fragment of %s on the `<>`', async (name, source) => {
		const { document, diagnostics } = await editor_diagnostics_for(name, source);

		expect(
			reported(document, diagnostics, TSRX_ERRORS.UNCLOSED_TAG.code)
				.filter(({ text }) => text.startsWith('<'))
				.map(({ text, offset }) => ({ text, offset })),
		).toEqual([{ text: '<>', offset: source.indexOf('<>') }]);
	});

	// Outside a template too, and the `<div>` shows at its name.
	it.each([
		['UnclosedFragment', '<>'],
		['UnclosedFragmentWithComment', '</* a */>'],
	])('reports %s outside a template on the `<>`', async (name, fragment) => {
		const source = `export const a = ${fragment}<div>;\n`;
		const { document, diagnostics } = await editor_diagnostics_for(name, source);

		expect(
			reported(document, diagnostics, TSRX_ERRORS.UNCLOSED_TAG.code).map(({ text, offset }) => ({
				text,
				offset,
			})),
		).toEqual([
			{ text: fragment, offset: source.indexOf(fragment) },
			{ text: 'div', offset: source.indexOf('div') },
		]);
	});

	// Each of two in a row on its own `<>`.
	it.each([
		['StackedFragments', 'export function C() @{\n\t<><><div>\n}\n'],
		['StackedFragmentsOutsideTemplate', 'export const a = <><><div>;\n'],
	])('reports each unclosed fragment of %s on its `<>`', async (name, source) => {
		const { document, diagnostics } = await editor_diagnostics_for(name, source);
		const outer = source.indexOf('<>');

		expect(
			reported(document, diagnostics, TSRX_ERRORS.UNCLOSED_TAG.code).map(({ text, offset }) => ({
				text,
				offset,
			})),
		).toEqual([
			{ text: '<>', offset: outer },
			{ text: '<>', offset: outer + 2 },
			{ text: 'div', offset: source.indexOf('div') },
		]);
	});

	// At the first offset of a file as anywhere else.
	it('reports an unclosed fragment at the start of the file on the `<>`', async () => {
		const { document, diagnostics } = await editor_diagnostics_for(
			'FragmentAtFileStart',
			'<><div>;\n',
		);

		expect(
			reported(document, diagnostics, TSRX_ERRORS.UNCLOSED_TAG.code).map(({ text, offset }) => ({
				text,
				offset,
			})),
		).toEqual([
			{ text: '<>', offset: 0 },
			{ text: 'div', offset: 3 },
		]);
	});

	// The static `<div />` is hoisted, which leaves the `{value}` before it a
	// mapping that runs backwards. Volar would drop a diagnostic on that range,
	// but the `<>`'s error has its anchor, on the `return` the editor's code
	// prints for the template.
	it('reports an unclosed fragment before a hoisted child on the `<>`', async () => {
		const source = 'export function C({ value }: { value: string }) @{\n\t<>{value}<div />\n}\n';
		const { document, diagnostics } = await editor_diagnostics_for('FragmentHoisted', source);

		expect(reported(document, diagnostics, TSRX_ERRORS.UNCLOSED_TAG.code)).toEqual([
			{ source: DIAGNOSTIC_SOURCE, text: '<>', offset: source.indexOf('<>') },
		]);
	});

	// A tag at the first offset of a file goes through the mappings as any other.
	it.each([
		['StyleAtFileStart', '<style>.a {}\n', '<style>'],
		['ScriptAtFileStart', '<script>const b = 1;\n', '<script>'],
	])('reports %s on its opening tag', async (name, source, tag) => {
		const { document, diagnostics } = await editor_diagnostics_for(name, source);

		expect(reported(document, diagnostics, TSRX_ERRORS.UNCLOSED_TAG.code)).toEqual([
			{ source: DIAGNOSTIC_SOURCE, text: tag, offset: 0 },
		]);
	});

	// A `<>` the output drops shows at its own place, between its neighbours.
	it('reports an unclosed fragment nested in an element at its place', async () => {
		const source = 'export function C() @{\n\t<div><><span>\n}\n';
		const { document, diagnostics } = await editor_diagnostics_for('NestedFragment', source);

		expect(
			reported(document, diagnostics, TSRX_ERRORS.UNCLOSED_TAG.code).map(({ offset }) => offset),
		).toEqual([source.indexOf('div'), source.indexOf('<>'), source.indexOf('span')]);
	});

	// An empty `<>` too. It doesn't move on to the next function.
	it('reports an empty unclosed fragment on the `<>`', async () => {
		const source = 'export function A() @{\n\t<>\n}\nexport function B() @{\n\t<div />\n}\n';
		const { document, diagnostics } = await editor_diagnostics_for('EmptyFragment', source);

		expect(reported(document, diagnostics, TSRX_ERRORS.UNCLOSED_TAG.code)).toEqual([
			{ source: DIAGNOSTIC_SOURCE, text: '<>', offset: source.indexOf('<>') },
		]);
	});

	// A `<>` in braces was printed unclosed and threw a TypeError, which the
	// editor showed at the start of the file (#1304).
	it.each([
		['FragmentInBraces', 'export function C() {\n\treturn <div>{<>}</div>;\n}\n'],
		['FragmentInBracesInTemplate', 'export function C() @{\n\t<div>{<>}</div>\n}\n'],
	])('reports the unclosed fragment of %s on the `<>`', async (name, source) => {
		const { document, diagnostics } = await editor_diagnostics_for(name, source);

		expect(
			diagnostics
				.filter((diagnostic) => diagnostic.source === DIAGNOSTIC_SOURCE)
				.map((diagnostic) => [diagnostic.code, document.getText(diagnostic.range)]),
		).toEqual([[TSRX_ERRORS.UNCLOSED_TAG.code, '<>']]);
		expect(reported(document, diagnostics, TSRX_ERRORS.UNCLOSED_TAG.code)).toEqual([
			{ source: DIAGNOSTIC_SOURCE, text: '<>', offset: source.indexOf('<>') },
		]);
		// The harness has no JSX types (TS7026).
		expect(
			diagnostics
				.filter((diagnostic) => diagnostic.source === 'ts' && diagnostic.code !== 7026)
				.map((diagnostic) => diagnostic.code),
		).toEqual([]);
	});

	// The editor's code leaves a repeated modifier out, but the compile anchors
	// the error on the code it reads in its place, so the editor shows it on
	// the modifier, as TypeScript does, not on the code before it or at the
	// start of the file.
	it.each([
		[
			'RepeatedAccessibility',
			'class A {\n\tpublic public a = 1;\n}\nexport {};\n',
			'TS1028',
			'public a',
		],
		[
			'RepeatedModifier',
			'class A {\n\treadonly readonly a = 1;\n}\nexport {};\n',
			'TS1030',
			'readonly a',
		],
	])('reports %s on the repeated modifier', async (name, source, code, at) => {
		const { document, diagnostics } = await editor_diagnostics_for(name, source);

		expect(reported(document, diagnostics, code)).toEqual([
			{ source: DIAGNOSTIC_SOURCE, text: at.split(' ')[0], offset: source.indexOf(at) },
		]);
	});

	// A modifier error on a word that the editor's code leaves out or doesn't
	// map at the start of a statement or a member shows once on that word, where
	// TypeScript reports it, not on the code before it: `abstract` before a
	// namespace, `declare` before a class in a block, `accessor` before a
	// method. Where the editor's code prints the word, TypeScript's own error
	// on it shows, which the compile's leaves the place to.
	it.each([
		['AbstractNamespace', 'export {};\nabstract namespace N {}\n', 'TS1242', 'abstract'],
		['AbstractFunction', 'export {};\nabstract function f() {}\n', 'TS1242', 'abstract'],
		['DeclareClassInBlock', 'export {};\n{\n\tdeclare class C {}\n}\n', 'TS1184', 'declare'],
		[
			'DeclareFunctionInAmbient',
			'export {};\ndeclare namespace O {\n\tdeclare function f(): void;\n}\n',
			'TS1038',
			'declare function',
		],
		['AccessorMethod', 'export class A {\n\taccessor m() {}\n}\n', 'TS1275', 'accessor'],
	])('reports %s on the modifier', async (name, source, code, at) => {
		const { document, diagnostics } = await editor_diagnostics_for(name, source);

		expect(
			reported(document, diagnostics, code).map(({ text, offset }) => ({ text, offset })),
		).toEqual([{ text: at.split(' ')[0], offset: source.indexOf(at) }]);
	});

	// TypeScript also reports the decorators of a constructor on the editor's
	// code: the error shows once, on the `@`, not again, empty, after it.
	it('shows the decorators of a constructor once, on the `@`', async () => {
		const source = 'declare const dec: any;\nexport class A {\n\t@dec constructor() {}\n}\n';
		const { document, diagnostics } = await editor_diagnostics_for('DecoratedConstructor', source);

		expect(
			diagnostics
				.filter((diagnostic) => String(diagnostic.code).endsWith('1206'))
				.map((diagnostic) => ({
					text: document.getText(diagnostic.range),
					offset: document.offsetAt(diagnostic.range.start),
				})),
		).toEqual([{ text: '@', offset: source.indexOf('@') }]);
	});

	// The error's anchor covers one character of the editor's code, so
	// TypeScript's error on the code after the modifier still shows there.
	it("keeps TypeScript's error on the code after a modifier the editor's code leaves out", async () => {
		const source =
			'declare class B {\n\tg: number;\n}\nexport class A extends B {\n\tpublic accessor get g() {\n\t\treturn 1;\n\t}\n}\n';
		const { document, diagnostics } = await editor_diagnostics_for('AccessorGetter', source);

		expect(reported(document, diagnostics, 'TS1275')).toEqual([
			{ source: DIAGNOSTIC_SOURCE, text: 'accessor', offset: source.indexOf('accessor') },
		]);
		expect(reported(document, diagnostics, 'TS2611')).toEqual([
			{ source: 'ts', text: 'g', offset: source.indexOf('g()') },
		]);
	});

	// TypeScript also reports an undefined name on the closing tag the
	// editor's code adds. That tag has no mapping, and no closing tag around
	// it, whether it is printed right after it or after later children,
	// covers it, so the error isn't repeated on one of them.
	it.each([
		['Unclosed', 'export function C() @{\n\t<div><Missing>valid</div>\n}\n', 'Missing'],
		['UnclosedNested', 'export function C() @{\n\t<div><Missing><b>x</div>\n}\n', 'Missing'],
		[
			'NotLastChild',
			'export function C() @{\n\t<div><span><Missing>x</span>tail</div>\n}\n',
			'Missing',
		],
		[
			'TrailingSpace',
			'export function C() @{\n\t<div><span><Missing>x</span> </div>\n}\n',
			'Missing',
		],
		[
			'TrailingExpression',
			'export function C({ y }: { y: string }) @{\n\t<div><span><Missing>x</span>{y}</div>\n}\n',
			'Missing',
		],
		[
			'TrailingText',
			'export function C() @{\n\t<p>\n\t\t<b>\n\t\t\t<NewComp>hello\n\t\t</b>\n\t\tmore text\n\t</p>\n}\n',
			'NewComp',
		],
		[
			'DynamicParent',
			'export function C({ Tag }: { Tag: string }) @{\n\t<{Tag}><Missing>valid</{Tag}>\n}\n',
			'Missing',
		],
		[
			'DynamicParentWithText',
			'export function C({ Tag }: { Tag: string }) @{\n\t<div><{Tag}><Missing>x</{Tag}>tail</div>\n}\n',
			'Missing',
		],
		// No mapping of the expression container around it covers it (#1307).
		['InBraces', 'export function C() {\n\treturn <div>{<Missing>}</div>;\n}\n', 'Missing'],
		['InBracesInTemplate', 'export function C() @{\n\t<div>{<Missing>x}</div>\n}\n', 'Missing'],
		[
			'InAttributeValue',
			'export function C() {\n\treturn <div title={<Missing>}></div>;\n}\n',
			'Missing',
		],
		[
			'InCondition',
			'export function C(props: { x: boolean }) {\n\treturn <div>{props.x && <Missing>}</div>;\n}\n',
			'Missing',
		],
	])('reports the undefined unclosed tag of %s once, at its name', async (name, source, tag) => {
		const { document, diagnostics } = await editor_diagnostics_for(`Undefined${name}`, source);

		expect(reported(document, diagnostics, 'TS2304')).toEqual([
			{ source: 'ts', text: tag, offset: source.indexOf(tag) },
		]);
	});

	// An error over the unclosed tag in braces ends at the closing tag the
	// editor's code adds, where the braces' own `}` still maps it.
	it.each([
		['InBraces', '<div>{delete <Known>}</div>'],
		['InAttributeValue', '<div title={delete <Known>}></div>'],
	])("keeps TypeScript's error over an unclosed tag %s", async (name, markup) => {
		const source = `function Known() {\n\treturn <span />;\n}\nexport function C() {\n\treturn ${markup};\n}\n`;
		const { document, diagnostics } = await editor_diagnostics_for(`DeleteOperand${name}`, source);

		expect(reported(document, diagnostics, 'TS2703')).toEqual([
			{ source: 'ts', text: '<Known>', offset: source.indexOf('<Known>') },
		]);
	});

	it('keeps hover, completions and diagnostics elsewhere in the file', async () => {
		const source = `export function C({ items }: { items: string[] }) @{
	const count: number = 'one';
	const total = items.length;
	<main>
		<p>{total}
	</main>
}
`;
		const { document, service, uri } = create_typescript_harness(
			source,
			[createCompileErrorDiagnosticPlugin(), createTypeScriptDiagnosticFilterPlugin()],
			'react/UnclosedTagFeatures.tsrx',
		);
		const diagnostics = await service.getDiagnostics(uri);
		expect(reported(document, diagnostics, 'TS2322')).toEqual([
			{ source: 'ts', text: 'count', offset: source.indexOf('count') },
		]);
		expect(
			diagnostics
				.filter((diagnostic) => diagnostic.source === DIAGNOSTIC_SOURCE)
				.map((diagnostic) => diagnostic.code),
		).toEqual(['TSRX1002']);

		const hover = await service.getHover(uri, document.positionAt(source.indexOf('{total}') + 1));
		expect(JSON.stringify(hover?.contents)).toContain('const total: number');

		const completions = await service.getCompletionItems(
			uri,
			document.positionAt(source.indexOf('items.length') + 'items.'.length),
			{ triggerKind: 1 },
		);
		expect(completions.items.map((item) => item.label)).toContain('length');
	});
});
