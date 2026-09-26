import { describe, expect, it } from 'vitest';
import { DiagnosticSeverity } from '@volar/language-server';
import { createCompileErrorDiagnosticPlugin } from '../src/compileErrorDiagnosticPlugin.js';
import { create_service_harness } from './setup.js';

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
		expect(diagnostic.code).toBe('tsrx-style-apply-target');
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
		expect(diagnostic.code).toBe('tsrx-style-apply-before-declaration');
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
		expect(diagnostics[0].code).toBe('tsrx-style-apply-target');
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
		expect(diagnostic.code).toBe('tsrx-css-global-placement');
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
		expect(diagnostic.message).toBe("'}' expected. (4:0)");
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
		expect(diagnostics[0].message).toBe("'}' expected. (2:10)");
		expect(document.getText(diagnostics[0].range)).toBe('name');
	});
});
