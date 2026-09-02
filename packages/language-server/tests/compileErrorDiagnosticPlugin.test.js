import { describe, expect, it } from 'vitest';
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
	<style apply={missing} />
	<div>{'x'}</div>
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
	<style apply={later} />
	<div>{'x'}</div>
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
	<style apply={themes.light} />
	<div>{'x'}</div>
}`,
		);

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].code).toBe('tsrx-style-apply-target');
		expect(document.getText(diagnostics[0].range)).toBe('themes.light');
	});

	it('reports nothing for a valid apply', async () => {
		const { diagnostics } = await diagnostics_for(
			`const theme = <style>.a { color: red; }</style>;
export function App() @{
	<style apply={theme} />
	<div>{'x'}</div>
}`,
		);

		expect(diagnostics).toEqual([]);
	});
});
