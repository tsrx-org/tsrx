import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileMap, createLanguage } from '@volar/language-core';
import { decorateLanguageServiceHost } from '@volar/typescript/lib/node/decorateLanguageServiceHost.js';
import { getServiceScript } from '@volar/typescript/lib/node/utils.js';
import * as ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { getTsrxLanguagePlugin } from '../src/language.js';
import { with_jsx_closing_tags } from '../src/plugin-jsx-closing-tag.js';

const react_package = fs.realpathSync(
	fileURLToPath(new URL('../node_modules/@tsrx/react', import.meta.url)),
);

/** @type {string[]} */
const workspaces = [];
afterEach(() => {
	for (const workspace of workspaces.splice(0)) {
		fs.rmSync(workspace, { recursive: true, force: true });
	}
});

/**
 * A project with the real React compiler, the Volar language the tsserver
 * plugin builds for it, and a TypeScript language service whose host Volar
 * decorates the way it decorates tsserver's, so the service reads the
 * generated code behind the blanked-out source.
 * @param {string} source
 */
function create_service(source) {
	const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-closing-tag-'));
	workspaces.push(workspace);
	fs.mkdirSync(path.join(workspace, 'node_modules', '@tsrx'), { recursive: true });
	fs.symlinkSync(react_package, path.join(workspace, 'node_modules', '@tsrx', 'react'), 'junction');
	const config_path = path.join(workspace, 'tsconfig.json');
	fs.writeFileSync(
		config_path,
		JSON.stringify({ compilerOptions: { jsx: 'preserve' }, tsrx: { compiler: '@tsrx/react' } }),
	);
	const file_name = path.join(workspace, 'App.tsrx').replace(/\\/g, '/');
	fs.writeFileSync(file_name, source);

	/** @param {string} name */
	const read_snapshot = (name) =>
		fs.existsSync(name) ? ts.ScriptSnapshot.fromString(fs.readFileSync(name, 'utf8')) : undefined;
	/** @type {import('@volar/language-core').LanguagePlugin<string>} */
	const language_plugin = getTsrxLanguagePlugin({
		ts,
		configFileName: config_path,
		configHost: ts.sys,
	});
	/** @type {import('@volar/language-core').Language<string>} */
	const language = createLanguage(
		[language_plugin],
		new FileMap(ts.sys.useCaseSensitiveFileNames),
		(name) => {
			const snapshot = read_snapshot(name);
			if (snapshot) {
				language.scripts.set(name, snapshot);
			} else {
				language.scripts.delete(name);
			}
		},
	);

	/** @type {import('typescript').LanguageServiceHost} */
	const host = {
		getScriptFileNames: () => [file_name],
		getScriptVersion: () => '1',
		getScriptSnapshot: read_snapshot,
		getScriptKind: () => ts.ScriptKind.Unknown,
		getCurrentDirectory: () => workspace,
		getCompilationSettings: () => ({ jsx: ts.JsxEmit.Preserve, noLib: true, types: [] }),
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
		fileExists: ts.sys.fileExists,
		readFile: ts.sys.readFile,
	};
	decorateLanguageServiceHost(ts, language, host);
	const service = with_jsx_closing_tags(ts.createLanguageService(host), () => language);
	const [service_script] = getServiceScript(language, file_name);
	const generated = service_script?.code.snapshot.getText(
		0,
		service_script.code.snapshot.getLength(),
	);
	return { service, file_name, generated };
}

describe('tsserver plugin: closing JSX tags in .tsrx files', () => {
	const source = `export function App() @{
	<button>{'Count'}<b></button>
}
`;

	it('answers `</b>` right after a typed `<b>`, from the parsed source', () => {
		const { service, file_name, generated } = create_service(source);
		// The type-only output closes the recovered tag (#978), so TypeScript sees
		// no unclosed tag there, and the parsed source decides.
		expect(generated).toContain('<b></b></button>');
		const after_typed_tag = source.indexOf('<b>') + '<b>'.length;
		expect(service.getJsxClosingTagAtPosition(file_name, after_typed_tag)).toEqual({
			newText: '</b>',
		});
	});

	it('answers nothing after a tag that is already closed', () => {
		const { service, file_name } = create_service(source);
		const after_button = source.indexOf('<button>') + '<button>'.length;
		expect(service.getJsxClosingTagAtPosition(file_name, after_button)).toBeUndefined();
	});
});
