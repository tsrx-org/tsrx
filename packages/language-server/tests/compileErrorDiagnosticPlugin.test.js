/** @import {Diagnostic, LanguageServiceEnvironment} from '@volar/language-service' */
/** @import {TextDocument} from 'vscode-languageserver-textdocument' */

import { TS_ERRORS } from '@tsrx/core';
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
