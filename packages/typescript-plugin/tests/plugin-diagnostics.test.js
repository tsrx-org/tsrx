import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import plugin from '../src/index.js';
import { without_typescript_diagnostics_on_compile_error } from '../src/plugin-diagnostics.js';
import { files_with_fatal_compile_error, has_fatal_compile_error } from '../src/language.js';
import { create_tsserver_workspace, start_tsserver } from './tsserver.js';

describe('tsserver plugin: TypeScript diagnostics on TSRX compile failure', () => {
	it('drops every TypeScript diagnostic of a file whose TSRX compilation failed', () => {
		const calls = /** @type {string[]} */ ([]);
		const service = {
			getSyntacticDiagnostics: (/** @type {string} */ f) => (calls.push(`syn:${f}`), ['syn']),
			getSemanticDiagnostics: (/** @type {string} */ f) => (calls.push(`sem:${f}`), ['sem']),
			getSuggestionDiagnostics: (/** @type {string} */ f) => (calls.push(`sug:${f}`), ['sug']),
			getQuickInfoAtPosition: () => 'info',
		};
		const wrapped = without_typescript_diagnostics_on_compile_error(service, (file) =>
			file.endsWith('Broken.tsrx'),
		);
		expect(wrapped.getSyntacticDiagnostics('/p/Broken.tsrx')).toEqual([]);
		expect(wrapped.getSemanticDiagnostics('/p/Broken.tsrx')).toEqual([]);
		expect(wrapped.getSuggestionDiagnostics('/p/Broken.tsrx')).toEqual([]);
		expect(calls).toEqual([]);
		// Healthy files and every other method pass straight through.
		expect(wrapped.getSemanticDiagnostics('/p/Panel.tsrx')).toEqual(['sem']);
		expect(wrapped.getSyntacticDiagnostics('/p/main.ts')).toEqual(['syn']);
		expect(wrapped.getQuickInfoAtPosition()).toBe('info');
		expect(calls).toEqual(['sem:/p/Panel.tsrx', 'syn:/p/main.ts']);
	});

	it('keys the compile-failure registry by normalized file name', () => {
		files_with_fatal_compile_error.add('c:/work/app/broken.tsrx');
		try {
			expect(has_fatal_compile_error('C:\\work\\App\\Broken.tsrx')).toBe(true);
			expect(has_fatal_compile_error('/work/app/broken.tsrx')).toBe(false);
		} finally {
			files_with_fatal_compile_error.delete('c:/work/app/broken.tsrx');
		}
	});

	it('exposes a tsserver plugin whose create() wraps the language service', () => {
		expect(typeof plugin).toBe('function');
	});
});

describe('tsserver plugin: TypeScript diagnostics around an unclosed tag', () => {
	/** Name, source, and the undefined tag left unclosed. */
	const CASES = [
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
	];
	const FILES = {
		'tsconfig.json': JSON.stringify({
			compilerOptions: {
				jsx: 'preserve',
				module: 'esnext',
				moduleResolution: 'bundler',
				types: [],
			},
			tsrx: { compiler: '@tsrx/react' },
			include: ['src'],
		}),
		...Object.fromEntries(CASES.map(([name, source]) => [`src/${name}.tsrx`, source])),
	};
	/** @type {string} */
	let workspace;
	/** @type {ReturnType<typeof start_tsserver>} */
	let server;

	beforeAll(async () => {
		const created = create_tsserver_workspace('tsrx-unclosed-', FILES);
		workspace = created.workspace;
		server = start_tsserver(workspace, created.probe_location);
		for (const [name, source] of CASES) {
			await server.request('open', {
				file: path.join(workspace, `src/${name}.tsrx`),
				fileContent: source,
				projectRootPath: workspace,
			});
		}
	}, 60_000);

	afterAll(() => {
		server?.stop();
		fs.rmSync(workspace, { recursive: true, force: true });
	});

	/**
	 * The tsserver `{ line, offset }` of `index` in `text`.
	 * @param {string} text
	 * @param {number} index
	 */
	function location(text, index) {
		const before = text.slice(0, index).split('\n');
		return { line: before.length, offset: before[before.length - 1].length + 1 };
	}

	// TypeScript also reports the undefined name on the closing tag the
	// editor's code adds, which has no mapping. No closing tag around it
	// covers it, so the error isn't repeated on one of them.
	it.each(CASES)(
		'reports the undefined unclosed tag of %s once, at its name',
		async (name, source, tag) => {
			const response = await server.request('semanticDiagnosticsSync', {
				file: path.join(workspace, `src/${name}.tsrx`),
			});
			expect(
				response.body
					.filter((/** @type {any} */ diagnostic) => diagnostic.code === 2304)
					.map((/** @type {any} */ diagnostic) => ({
						start: diagnostic.start,
						end: diagnostic.end,
					})),
			).toEqual([
				{
					start: location(source, source.indexOf(tag)),
					end: location(source, source.indexOf(tag) + tag.length),
				},
			]);
		},
	);
});
