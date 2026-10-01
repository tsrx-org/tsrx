import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compile_to_volar_mappings } from '../src/index.js';

/**
 * Runs the TypeScript checker over the type-only (editor) output against the
 * real `vue`, `vue-jsx-vapor`, and `@tsrx/vue` declarations, with the strict
 * settings a Vue TSRX project uses. A generated element whose type is not a
 * valid `vue-jsx-vapor` JSX element would otherwise only show up as an editor
 * diagnostic with no source position.
 */

/** @type {ts.CompilerOptions} */
const OPTIONS = {
	strict: true,
	target: ts.ScriptTarget.ESNext,
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	jsx: ts.JsxEmit.Preserve,
	jsxImportSource: 'vue-jsx-vapor',
	lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
	types: [],
	skipLibCheck: true,
	noEmit: true,
};

// A directory that does not exist on disk but sits under `packages/tsrx-vue`,
// so `vue`, `vue-jsx-vapor`, and `@tsrx/vue/*` resolve from this package.
const VIRTUAL_ROOT = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'__type-only-probe__',
);

/**
 * @param {string} source
 * @returns {string[]}
 */
function type_only_diagnostics(source) {
	const file_name = path.join(VIRTUAL_ROOT, 'App.tsx');
	const { code, errors } = compile_to_volar_mappings(source, 'App.tsrx');
	expect(errors).toEqual([]);

	const host = ts.createCompilerHost(OPTIONS);
	const read_file = host.readFile.bind(host);
	const file_exists = host.fileExists.bind(host);
	const get_source_file = host.getSourceFile.bind(host);
	host.readFile = (name) => (name === file_name ? code : read_file(name));
	host.fileExists = (name) => name === file_name || file_exists(name);
	host.getSourceFile = (name, language_version, on_error, should_create_new) =>
		name === file_name
			? ts.createSourceFile(name, code, language_version, true)
			: get_source_file(name, language_version, on_error, should_create_new);

	const program = ts.createProgram([file_name], OPTIONS, host);
	return ts
		.getPreEmitDiagnostics(program)
		.filter((diagnostic) => diagnostic.file?.fileName === file_name)
		.map(
			(diagnostic) =>
				`TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
		);
}

const CHILD = `function Child(props: { label: string }) @{
	<p>{props.label}</p>
}
`;

describe('@tsrx/vue type-only output type-checks', () => {
	it.each([
		[
			'@try / @catch',
			`export function App() @{
				@try {
					<span>{'Loaded'}</span>
				} @catch (error) {
					<span>{'Failed'}</span>
				}
			}`,
		],
		[
			'@try / @catch with error, reset, and an outer binding',
			`${CHILD}
			export function App() @{
				const suffix = '!';
				@try {
					<Child label="hi" />
				} @catch (err, reset) {
					<button onClick={reset}>{(err as Error).message}{suffix}</button>
				}
			}`,
		],
		[
			'@try / @pending / @catch',
			`export function App() @{
				@try {
					<span>{'Loaded'}</span>
				} @pending {
					<span>{'Loading'}</span>
				} @catch (error) {
					<span>{'Failed'}</span>
				}
			}`,
		],
		[
			'@try / @pending / @catch with error, reset, and an outer binding',
			`${CHILD}
			export function App() @{
				const suffix = '!';
				@try {
					<Child label="hi" />
				} @pending {
					<p>{'loading'}</p>
				} @catch (err, reset) {
					<button onClick={reset}>{(err as Error).message}{suffix}</button>
				}
			}`,
		],
	])('%s', (_name, source) => {
		expect(type_only_diagnostics(source)).toEqual([]);
	});
});
