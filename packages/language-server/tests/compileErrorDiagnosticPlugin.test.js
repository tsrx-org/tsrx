/** @import {Diagnostic, LanguageServiceEnvironment} from '@volar/language-service' */
/** @import {TextDocument} from 'vscode-languageserver-textdocument' */

import { TS_ERRORS } from '@tsrx/core';
import { DIAGNOSTIC_SOURCE } from '@tsrx/core/diagnostics';
import { describe, expect, it } from 'vitest';
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

	it('reports CSS_GLOBAL_PLACEMENT on the style block that holds the :global', async () => {
		// The type-only output has no tokens inside a CSS body, so the transform
		// anchors the block's diagnostic on the `<style>` element (the mapped
		// stand-in), not on the selector.
		const { document, diagnostics } = await diagnostics_for(
			`export function App() @{
	<>
		<style>
			.a :global(.b) .c { color: red; }
		</style>
		<div>{'x'}</div>
	</>
}`,
		);

		expect(diagnostics).toHaveLength(1);
		const [diagnostic] = diagnostics;
		expect(diagnostic.code).toBe('TSRX3011');
		expect(document.getText(diagnostic.range)).toBe(
			'<style>\n\t\t\t.a :global(.b) .c { color: red; }\n\t\t</style>',
		);
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

// The editor's compile is loose: it recovers unclosed and mismatched markup,
// so the rest of the file keeps working, and reports it as a collecting
// compile does (#978).
describe('compile error diagnostic plugin — unclosed and mismatched tags', () => {
	// The editor's code gets the missing closing tag, with no mapping, so
	// TypeScript adds no TS17008 or TS1005 to the parser's error. An unclosed
	// tag is reported at the token that ends its template, which has no
	// mapping: the editor shows it on the nearest code before it, the open
	// tag, not at the start of the file.
	it.each([
		['UnclosedTag', 'export function C() @{\n\t<div>\n}\n', 'TSRX1001', '<div>'],
		['MismatchedTag', 'export function C() @{\n\t<div><span></div>\n}\n', 'TSRX1002', '</div>'],
		['UnclosedReturnedTag', 'export function C() {\n\treturn <div>;\n}\n', 'TSRX1001', '<div>'],
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
				.filter((ts_code) => ts_code === 17008 || ts_code === 1005 || ts_code === 17002),
		).toEqual([]);
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
	])('reports the undefined unclosed tag of %s once, at its name', async (name, source, tag) => {
		const { document, diagnostics } = await editor_diagnostics_for(`Undefined${name}`, source);

		expect(reported(document, diagnostics, 'TS2304')).toEqual([
			{ source: 'ts', text: tag, offset: source.indexOf(tag) },
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
