import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_TYPESCRIPT_BACKEND,
	read_typescript_backend_flag,
	resolve_typescript_backend,
} from '../src/backend.js';
import { createDefinitionPlugin } from '../src/definitionPlugin.js';
import { createDocumentHighlightPlugin } from '../src/documentHighlightPlugin.js';
import { createHoverPlugin } from '../src/hoverPlugin.js';
import { createServicePlugins } from '../src/servicePlugins.js';
import { create_service_harness } from './setup.js';

describe('TypeScript backend selection', () => {
	it('defaults to the classic backend', () => {
		expect(DEFAULT_TYPESCRIPT_BACKEND).toBe('classic');
		expect(resolve_typescript_backend()).toEqual({ backend: 'classic', source: 'default' });
		expect(resolve_typescript_backend({ argv: ['--stdio'], initializationOptions: {} })).toEqual({
			backend: 'classic',
			source: 'default',
		});
	});

	it('reads the --typescript-backend flag in both spellings', () => {
		expect(read_typescript_backend_flag(['--stdio', '--typescript-backend=native'])).toBe('native');
		expect(read_typescript_backend_flag(['--typescript-backend', 'classic', '--stdio'])).toBe(
			'classic',
		);
		expect(read_typescript_backend_flag(['--stdio'])).toBeUndefined();
		expect(resolve_typescript_backend({ argv: ['--typescript-backend=native'] })).toEqual({
			backend: 'native',
			source: 'flag',
		});
	});

	it('reads the typescriptBackend initialization option', () => {
		expect(
			resolve_typescript_backend({ initializationOptions: { typescriptBackend: 'native' } }),
		).toEqual({ backend: 'native', source: 'initializationOptions' });
	});

	it('lets the flag win over the initialization option', () => {
		expect(
			resolve_typescript_backend({
				argv: ['--typescript-backend=classic'],
				initializationOptions: { typescriptBackend: 'native' },
			}),
		).toEqual({ backend: 'classic', source: 'flag' });
	});

	it('falls back to classic and reports an invalid value', () => {
		expect(resolve_typescript_backend({ argv: ['--typescript-backend=tsgo'] })).toEqual({
			backend: 'classic',
			source: 'default',
			invalid: 'tsgo',
		});
		expect(
			resolve_typescript_backend({ initializationOptions: { typescriptBackend: true } }),
		).toEqual({ backend: 'classic', source: 'default', invalid: 'true' });
	});
});

describe('service plugins per backend', () => {
	const names = (/** @type {'classic' | 'native'} */ backend) =>
		createServicePlugins(backend, ts).map((plugin) => plugin.name);

	it('hosts the TypeScript services and their wrappers on the classic backend', () => {
		const classic = names('classic');
		expect(classic).toContain('typescript-semantic');
		expect(classic).toContain('typescript-syntactic');
		expect(classic).toContain('tsrx-typescript-diagnostic-filter');
		expect(classic).toContain('tsrx-diagnostics');
		// Wrappers must come after the services they intercept.
		expect(classic.indexOf('tsrx-hover')).toBeGreaterThan(classic.indexOf('typescript-semantic'));
		expect(classic.indexOf('tsrx-document-highlight')).toBeGreaterThan(
			classic.indexOf('typescript-semantic'),
		);
		expect(classic.indexOf('tsrx-typescript-diagnostic-filter')).toBeGreaterThan(
			classic.indexOf('typescript-semantic'),
		);
	});

	it('leaves every TypeScript feature to TypeScript 7 on the native backend', () => {
		const native = names('native');
		expect(native.filter((name) => name.startsWith('typescript'))).toEqual([]);
		expect(native).not.toContain('tsrx-typescript-diagnostic-filter');
		// The mapper reports TSRX compile errors as `tsrx` diagnostics through TypeScript.
		expect(native).not.toContain('tsrx-diagnostics');
		expect(native).toEqual(
			expect.arrayContaining([
				'tsrx-auto-insert',
				'tsrx-completion-enhancer',
				'tsrx-definition',
				'tsrx-document-symbol',
				'css',
				'tsrx-hover',
				'tsrx-document-highlight',
			]),
		);
	});

	it('keeps whole-document formatting with Prettier on both backends', () => {
		for (const backend of /** @type {const} */ (['classic', 'native'])) {
			for (const plugin of createServicePlugins(backend, ts)) {
				expect(plugin.capabilities?.documentFormattingProvider, plugin.name).toBeUndefined();
				expect(plugin.capabilities?.documentRangeFormattingProvider, plugin.name).toBeUndefined();
			}
		}
	});
});

// A sibling-scoped block styles the `<p>` beside it, so `card` in `class="card"` carries the
// CSS-class hover and definition metadata that the TSRX server serves on both backends.
const SOURCE = `export function App() @{
	<div>
		<style>
			.card { color: red; }
		</style>
		<p class="card">{'hi'}</p>
	</div>
}`;

/**
 * @param {string} needle
 * @param {number} [skip]
 */
function position_in(needle, skip = 0) {
	const index = SOURCE.indexOf(needle);
	expect(index).toBeGreaterThanOrEqual(0);
	const lines = SOURCE.slice(0, index + skip).split('\n');
	return { line: lines.length - 1, character: lines[lines.length - 1].length + 1 };
}

describe('native backend: features the TSRX server owns without TypeScript services', () => {
	const native_plugins = () => [
		createHoverPlugin({ typescriptBackend: 'native' }),
		createDefinitionPlugin(),
		createDocumentHighlightPlugin({ typescriptBackend: 'native' }),
	];

	it('serves the CSS-class hover on a class attribute', async () => {
		const { service, uri } = create_service_harness(SOURCE, native_plugins(), 'react/App.tsrx');
		const hover = await service.getHover(uri, position_in('class="card"', 'class="'.length));
		expect(hover?.contents).toMatchObject({ kind: 'markdown' });
		expect(/** @type {{ value: string }} */ (hover?.contents).value).toContain(
			'```css\n.card\n```',
		);
		expect(/** @type {{ value: string }} */ (hover?.contents).value).toContain(
			'CSS class selector',
		);
	});

	it('stays silent where TypeScript 7 owns the hover', async () => {
		const { service, uri } = create_service_harness(SOURCE, native_plugins(), 'react/App.tsrx');
		expect(
			await service.getHover(uri, position_in('function App', 'function '.length)),
		).toBeFalsy();
	});

	it('jumps from a class attribute into the <style> block', async () => {
		const { document, service, uri } = create_service_harness(
			SOURCE,
			native_plugins(),
			'react/App.tsrx',
		);
		const definition = await service.getDefinition(
			uri,
			position_in('class="card"', 'class="'.length),
		);
		expect(definition).toHaveLength(1);
		const [link] = /** @type {import('@volar/language-server').LocationLink[]} */ (definition);
		expect(link.targetUri).toBe(uri.toString());
		expect(document.getText(link.targetRange)).toBe('.card');
		expect(document.getText(/** @type {any} */ (link.originSelectionRange))).toBe('card');
	});

	it('returns no highlights for spans without keyword metadata', async () => {
		const { service, uri } = create_service_harness(SOURCE, native_plugins(), 'react/App.tsrx');
		const highlights = await service.getDocumentHighlights(
			uri,
			position_in('function App', 'function '.length),
		);
		expect(highlights ?? []).toEqual([]);
	});
});
