import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createLanguage } from '@volar/language-core';
import { createLanguageService, createUriMap } from '@volar/language-service';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { beforeEach } from 'vitest';
import { getTsrxLanguagePlugin, _reset_for_test } from '@tsrx/typescript-plugin/src/language.js';
import { createDocumentSymbolPlugin } from '../src/documentSymbolPlugin.js';
import { createCompletionPlugin } from '../src/completionPlugin.js';
import { createTypeScriptServices } from '../src/typescriptService.js';

// `@volar/typescript` is a dependency of `@volar/language-server`, not of this package, so reach
// it through the language server's own resolution (pnpm keeps it out of our node_modules).
const require = createRequire(import.meta.url);
/** @type {typeof import('@volar/typescript')} */
const volar_typescript = createRequire(require.resolve('@volar/language-server'))(
	'@volar/typescript',
);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root_dir = path.resolve(dirname, '../../..');
const fixture_dir = path.join(root_dir, 'packages', 'language-server', 'tests', 'fixtures');

beforeEach(() => {
	_reset_for_test();
});

/**
 * @param {string} source
 * @returns {import('@volar/language-core').IScriptSnapshot}
 */
function create_snapshot(source) {
	return ts.ScriptSnapshot.fromString(source);
}

/**
 * Build a Volar language service wired with the given service plugins, so tests can drive a
 * feature end-to-end (including Volar's source<->generated mapping). Fixture names may carry a
 * subdirectory: `react/App.tsrx` resolves to the workspace `@tsrx/react` compiler through
 * `tests/fixtures/react/tsconfig.json`, while a bare `App.tsrx` falls back to the installed
 * `@tsrx/ripple` package.
 * @param {string} source
 * @param {import('@volar/language-service').LanguageServicePlugin[]} plugins
 * @param {string} [fixture_name]
 */
export function create_service_harness(source, plugins, fixture_name = 'App.tsrx') {
	const uri = URI.file(path.join(fixture_dir, fixture_name));
	const scripts = createUriMap();
	const language = createLanguage([getTsrxLanguagePlugin()], scripts, () => {});
	const source_snapshot = create_snapshot(source);
	language.scripts.set(uri, source_snapshot, 'tsrx');

	const service = createLanguageService(
		language,
		plugins,
		{
			workspaceFolders: [URI.file(root_dir)],
			console,
		},
		{},
	);
	const document = TextDocument.create(uri.toString(), 'tsrx', 0, source);

	return { document, service, uri };
}

/**
 * @param {string} source
 * @param {string} [fixture_name]
 */
export function create_symbol_harness(source, fixture_name = 'App.tsrx') {
	return create_service_harness(source, [createDocumentSymbolPlugin()], fixture_name);
}

/**
 * Build a Volar language service wired with the completion plugin, so tests can drive
 * completions end-to-end (including Volar's source<->generated mapping).
 * @param {string} source
 * @param {string} [fixture_name]
 */
export function create_completion_harness(source, fixture_name = 'App.tsrx') {
	return create_service_harness(source, [createCompletionPlugin()], fixture_name);
}

/**
 * Build a Volar language service backed by a real TypeScript language service, so tests can drive
 * TypeScript-dependent features (hover, definition) end-to-end through the generated TSX and
 * its mappings. Volar's `typescript-semantic`/`typescript-syntactic` plugins are wired first
 * (our hover/definition plugins look them up by name), followed by `plugins`.
 * @param {string} source
 * @param {import('@volar/language-service').LanguageServicePlugin[]} plugins
 * @param {string} [fixture_name]
 */
export function create_typescript_harness(source, plugins, fixture_name = 'react/App.tsrx') {
	const uri = URI.file(path.join(fixture_dir, fixture_name));
	const scripts = createUriMap();
	/** @type {import('@volar/language-core').Language<URI>} */
	const language = createLanguage(
		[
			getTsrxLanguagePlugin(),
			{
				getLanguageId(script_uri) {
					return volar_typescript.resolveFileLanguageId(script_uri.path);
				},
			},
		],
		scripts,
		(script_uri, include_fs_files) => {
			// Lazily load on-disk files (lib.d.ts and friends) the TS service asks for.
			if (!include_fs_files || scripts.has(script_uri)) {
				return;
			}
			const file_name = script_uri.fsPath;
			if (fs.existsSync(file_name) && fs.statSync(file_name).isFile()) {
				language.scripts.set(
					script_uri,
					create_snapshot(fs.readFileSync(file_name, 'utf8')),
					volar_typescript.resolveFileLanguageId(file_name),
				);
			}
		},
	);
	language.scripts.set(uri, create_snapshot(source), 'tsrx');

	const compilation_settings = {
		allowJs: true,
		allowNonTsExtensions: true,
		jsx: ts.JsxEmit.Preserve,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		target: ts.ScriptTarget.ESNext,
		skipLibCheck: true,
		strict: true,
	};
	const { languageServiceHost, getExtraServiceScript } = volar_typescript.createLanguageServiceHost(
		ts,
		ts.sys,
		language,
		(file_name) => URI.file(file_name),
		{
			getCurrentDirectory: () => path.dirname(uri.fsPath),
			getCompilationSettings: () => compilation_settings,
			getScriptFileNames: () => [uri.fsPath],
			getProjectVersion: () => '1',
		},
	);

	const service = createLanguageService(
		language,
		[...createTypeScriptServices(ts), ...plugins],
		{
			workspaceFolders: [URI.file(root_dir)],
			console,
		},
		{
			typescript: {
				sys: ts.sys,
				languageServiceHost,
				getExtraServiceScript,
				uriConverter: {
					asFileName: (/** @type {URI} */ file_uri) => file_uri.fsPath,
					asUri: (/** @type {string} */ file_name) => URI.file(file_name),
				},
			},
		},
	);
	const document = TextDocument.create(uri.toString(), 'tsrx', 0, source);

	return { document, service, uri };
}

/**
 * Like {@link create_completion_harness}, but exposes a `set_document` handle so a test can rewrite
 * the file between requests. Needed to emulate a VS Code completion session (typing / erasing /
 * retyping) against the real language service — the single-snapshot harness can't.
 * @param {string} initial_source
 * @param {string} [fixture_name]
 */
export function create_stateful_completion_harness(initial_source, fixture_name = 'App.tsrx') {
	const uri = URI.file(path.join(fixture_dir, fixture_name));
	const scripts = createUriMap();
	const language = createLanguage([getTsrxLanguagePlugin()], scripts, () => {});
	const set_document = (/** @type {string} */ source) => {
		language.scripts.set(uri, create_snapshot(source), 'tsrx');
	};
	set_document(initial_source);

	const service = createLanguageService(
		language,
		[createCompletionPlugin()],
		{
			workspaceFolders: [URI.file(root_dir)],
			console,
		},
		{},
	);

	return { service, uri, set_document };
}

/**
 * @param {import('@volar/language-server').DocumentSymbol[] | undefined} symbols
 * @param {string} name
 */
export function find_symbol(symbols, name) {
	for (const symbol of symbols ?? []) {
		if (symbol.name === name) {
			return symbol;
		}
		const child = find_symbol(symbol.children, name);
		if (child) {
			return child;
		}
	}
}

/**
 * @param {TextDocument} document
 * @param {import('@volar/language-server').Range} range
 */
export function get_range_text(document, range) {
	return document.getText(range);
}

/**
 * @param {import('@volar/language-server').DocumentSymbol[] | undefined} symbols
 */
export function symbol_name_kinds(symbols) {
	return symbols?.map((symbol) => [symbol.name, symbol.kind]);
}

/**
 * @param {import('@volar/language-server').DocumentSymbol[] | undefined} symbols
 * @param {string} name
 */
export function child_names(symbols, name) {
	return find_symbol(symbols, name)?.children?.map((symbol) => symbol.name);
}
