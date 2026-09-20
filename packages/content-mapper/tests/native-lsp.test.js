/**
 * Editor-feature coverage against the native TypeScript 7 language server
 * (`tsc --lsp --stdio` with `runExternalCode`), the server the VS Code
 * TypeScript 7 extension and other LSP clients run. Everything here is what
 * an editor sees for `.tsrx` files through `@tsrx/content-mapper`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
	consumer_fixture_files,
	create_native_workspace,
	mapper_server_path,
} from './fixture-utils.js';
import { parse_jsonc } from '@tsrx/typescript-plugin/src/jsonc.js';
import { NativeLspClient, position_of, range_text } from './lsp-client.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const LIB_TS = 'export function helperA() {}\nexport function helperB() {}\n';
const EXTEND_TSRX =
	"import { helperA } from './lib';\n\nexport function Extend() @{\n\thelperA();\n\thelperB\n\t<div />\n}\n";
const FRESH_TSRX = 'export function Fresh() @{\n\tconst n = 1;\n\thelperB\n\t<div>{n}</div>\n}\n';
const OTHER_TSRX = 'export function Other(props: { n: number }) @{\n\t<span>{props.n}</span>\n}\n';
const USE_TS = "import { Other } from './Other.tsrx';\nexport const x = Other({ n: 'no' });\n";

/**
 * The consumer fixture as an LSP workspace: the language server discovers
 * `tsconfig.json`, so the mapper is declared in the root config, plus a
 * second configured project under `sub/`.
 */
function workspace_files() {
	const files = consumer_fixture_files();
	const tsconfig = /** @type {Record<string, unknown>} */ (
		parse_jsonc(files['tsconfig.json']).value
	);
	tsconfig.contentMappers = [{ package: '@tsrx/content-mapper', extensions: ['.tsrx'] }];
	tsconfig.include = ['*.ts', '*.tsrx'];
	files['tsconfig.json'] = JSON.stringify(tsconfig, null, '\t');
	delete files['tsconfig.native.json'];
	files['lib.ts'] = LIB_TS;
	files['Extend.tsrx'] = EXTEND_TSRX;
	files['Fresh.tsrx'] = FRESH_TSRX;
	files['sub/tsconfig.json'] = JSON.stringify(
		{ ...tsconfig, include: ['*.ts', '*.tsrx'] },
		null,
		'\t',
	);
	files['sub/Other.tsrx'] = OTHER_TSRX;
	files['sub/use.ts'] = USE_TS;
	return files;
}

/**
 * @param {NativeLspClient} client
 * @param {Record<string, string>} files
 * @param {string} file
 * @param {string} needle
 * @param {number} [skip]
 */
function at(client, files, file, needle, skip = 0) {
	return {
		textDocument: { uri: client.uri(file) },
		position: position_of(files[file], needle, skip),
	};
}

describe('native language server on a configured project', () => {
	const files = workspace_files();
	/** @type {ReturnType<typeof create_native_workspace>} */
	let workspace;
	/** @type {NativeLspClient} */
	let client;

	beforeAll(async () => {
		workspace = create_native_workspace(files);
		client = new NativeLspClient(workspace.dir);
		await client.initialize({ runExternalCode: true });
		// A `.ts` file loads the configured project; its `contentMappers` entry makes the
		// server register the `.tsrx` document filters with the client.
		client.open('main.ts', files['main.ts']);
		await client.wait_for_registration('content-mapper-did-open');
		for (const file of ['Panel.tsrx', 'Button.tsrx', 'Extend.tsrx', 'Fresh.tsrx']) {
			client.open(file, files[file]);
		}
	});

	afterAll(async () => {
		await client?.shutdown();
		workspace?.cleanup();
	});

	it('registers .tsrx documents and the language features TypeScript owns', () => {
		const did_open = client.registrations.find((r) => r.id === 'content-mapper-did-open');
		expect(did_open?.registerOptions.documentSelector).toEqual([{ pattern: '**/*.tsrx' }]);
		const ids = client.registrations.map((r) => r.id);
		for (const feature of [
			'diagnostic',
			'hover',
			'definition',
			'references',
			'document-highlight',
			'completion',
			'rename',
			'code-action',
		]) {
			expect(ids).toContain(`content-mapper-${feature}`);
		}
	});

	it('reports the cross-file prop-type error at the authored span and nothing else', async () => {
		const main = await client.diagnostics('main.ts');
		expect(main.map((d) => [d.code, range_text(files['main.ts'], d.range)])).toEqual([
			[2322, 'count'],
		]);
		// The `<script>` body is a supplemental `.mts` output: its unused const is a hint.
		const panel = await client.diagnostics('Panel.tsrx');
		expect(
			panel.map((d) => [d.code, d.severity, range_text(files['Panel.tsrx'], d.range)]),
		).toEqual([[6133, 4, 'analyticsEnabled']]);
		expect(await client.diagnostics('Button.tsrx')).toEqual([]);
	});

	it('hovers an identifier in a template expression and stays silent on synthesized code', async () => {
		const hover = await client.request(
			'textDocument/hover',
			at(client, files, 'Panel.tsrx', '{label}', 1),
		);
		expect(hover.contents.value).toContain('const label: string');
		expect(range_text(files['Panel.tsrx'], hover.range)).toBe('label');
		// `@{` has no counterpart in the generated TSX.
		expect(
			await client.request('textDocument/hover', at(client, files, 'Fresh.tsrx', '@{')),
		).toBeNull();
	});

	it('resolves a component tag to its declaration in another .tsrx file', async () => {
		const definition = await client.request(
			'textDocument/definition',
			at(client, files, 'Panel.tsrx', '<Button', 1),
		);
		expect(definition).toHaveLength(1);
		expect(definition[0].uri).toBe(client.uri('Button.tsrx'));
		expect(range_text(files['Button.tsrx'], definition[0].range)).toBe('Button');
	});

	it('finds references across .tsrx and .ts files', async () => {
		const references = await client.request('textDocument/references', {
			...at(client, files, 'Panel.tsrx', '{ title, count }', 2),
			context: { includeDeclaration: true },
		});
		const by_file = /** @type {Record<string, string[]>} */ ({});
		for (const reference of references) {
			const file = path.basename(reference.uri);
			(by_file[file] ??= []).push(range_text(files[file], reference.range));
		}
		expect(by_file).toEqual({
			'Panel.tsrx': ['title', 'title', 'title', 'title'],
			'main.ts': ['title', 'title'],
		});
	});

	it('highlights identifier occurrences and nothing on synthesized spans', async () => {
		const highlights = await client.request(
			'textDocument/documentHighlight',
			at(client, files, 'Panel.tsrx', '{ title, count }', 2),
		);
		expect(
			highlights.map((/** @type {{ range: any }} */ h) => range_text(files['Panel.tsrx'], h.range)),
		).toEqual(['title', 'title', 'title', 'title']);
		// An empty result is what lets VS Code fall through to the TSRX server's
		// keyword-highlight provider (it takes the first non-empty provider result).
		expect(
			await client.request('textDocument/documentHighlight', at(client, files, 'Fresh.tsrx', '@{')),
		).toEqual([]);
	});

	it('renames through Verbatim spans, including a destructuring shorthand', async () => {
		const prepare = await client.request(
			'textDocument/prepareRename',
			at(client, files, 'Button.tsrx', '{label}', 1),
		);
		expect(prepare.placeholder).toBe('label');
		const edit = await client.request('textDocument/rename', {
			...at(client, files, 'Button.tsrx', '{label}', 1),
			newName: 'text',
		});
		const changes = edit.changes[client.uri('Button.tsrx')];
		expect(
			changes.map((/** @type {{ range: any, newText: string }} */ change) => [
				range_text(files['Button.tsrx'], change.range),
				change.newText,
			]),
		).toEqual([
			['label', 'label: text'],
			['label', 'text'],
		]);
	});

	it('does not rename on an Atom span (microsoft/TypeScript#63879)', async () => {
		// `/>` becomes `/>;` in the generated code, so the span is an Atom and the
		// baseline has no whole-symbol projection for it.
		expect(
			await client.request('textDocument/rename', {
				...at(client, files, 'Panel.tsrx', '/>', 1),
				newName: 'x',
			}),
		).toBeNull();
	});

	it('auto-imports by extending an existing import statement', async () => {
		const completion = await client.request('textDocument/completion', {
			...at(client, files, 'Extend.tsrx', 'helperB', 'helperB'.length),
			context: { triggerKind: 1 },
		});
		const item = completion.items.find(
			(/** @type {{ label: string, labelDetails?: { description?: string } }} */ entry) =>
				entry.label === 'helperB' && entry.labelDetails?.description === './lib',
		);
		expect(item, 'auto-import candidate').toBeDefined();
		// The server resolves auto-import edits eagerly for content-mapped files.
		expect(item.detail).toBe('Update import from "./lib"');
		expect(item.additionalTextEdits).toEqual([
			{
				range: { start: { line: 0, character: 16 }, end: { line: 0, character: 16 } },
				newText: ', helperB',
			},
		]);
		const resolved = await client.request('completionItem/resolve', item);
		expect(resolved.additionalTextEdits).toEqual(item.additionalTextEdits);
	});

	it('offers no auto-import when a new import statement would be needed (microsoft/TypeScript#64119)', async () => {
		// The generated file starts with hoisted static JSX, so the insertion point of a new
		// import lies in synthesized code and the server drops the candidate rather than
		// inserting at a bogus location. Tracked upstream; a plain `.ts` file gets the edit.
		const completion = await client.request('textDocument/completion', {
			...at(client, files, 'Fresh.tsrx', 'helperB', 'helperB'.length),
			context: { triggerKind: 1 },
		});
		expect(
			completion.items.filter(
				(/** @type {{ label: string }} */ entry) => entry.label === 'helperB',
			),
		).toEqual([]);
	});

	it('organizes imports (TypeScript 7 drops the edit unless the newline after the last import maps)', async () => {
		const source = [
			"import Panel from './Panel.tsrx';",
			"import Button from './Button.tsrx';",
			'',
			'export default function Unsorted() @{',
			'\t<Button label="x" />',
			'}',
			'',
		].join('\n');
		client.open('Unsorted.tsrx', source);
		await client.diagnostics('Unsorted.tsrx').catch(() => undefined);
		const uri = client.uri('Unsorted.tsrx');
		const [action] = await client.request('textDocument/codeAction', {
			textDocument: { uri },
			range: { start: { line: 0, character: 0 }, end: { line: 6, character: 0 } },
			context: { diagnostics: [], only: ['source.organizeImports'] },
		});
		expect(action?.kind).toBe('source.organizeImports.ts');
		const resolved = action.edit ? action : await client.request('codeAction/resolve', action);
		// The unused `Panel` import is removed: one edit replacing the first line with the
		// remaining import, one deleting the second line.
		expect(resolved.edit?.changes?.[uri]).toEqual([
			{
				range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } },
				newText: "import Button from './Button.tsrx';\n",
			},
			{
				range: { start: { line: 1, character: 0 }, end: { line: 2, character: 0 } },
				newText: '',
			},
		]);
		client.close('Unsorted.tsrx');
	});

	it('reports a compile error at the authored construct and keeps importers resolving', async () => {
		const broken = files['Button.tsrx'].replace('<button type="button"', '<button type="button"><');
		client.change('Button.tsrx', broken);
		const diagnostics = await client.diagnostics('Button.tsrx');
		expect(diagnostics.map((d) => [d.source, d.code, range_text(broken, d.range)])).toEqual([
			['tsrx', 1000, '>'],
		]);
		expect(diagnostics[0].message).toContain('Unexpected token');
		// The export stub keeps `main.ts` at its one real error while Button.tsrx is broken.
		expect((await client.diagnostics('main.ts')).map((d) => d.code)).toEqual([2322]);
		client.change('Button.tsrx', files['Button.tsrx']);
		expect(await client.diagnostics('Button.tsrx')).toEqual([]);
	});

	it('serves a second configured project in the same session', async () => {
		client.open('sub/use.ts', files['sub/use.ts']);
		client.open('sub/Other.tsrx', files['sub/Other.tsrx']);
		expect(
			(await client.diagnostics('sub/use.ts')).map((d) => [
				d.code,
				range_text(files['sub/use.ts'], d.range),
			]),
		).toEqual([[2322, 'n']]);
		const hover = await client.request(
			'textDocument/hover',
			at(client, files, 'sub/Other.tsrx', 'props.n}', 'props.'.length),
		);
		expect(hover.contents.value).toContain('(property) n: number');
		const projects = await Promise.all(
			['Panel.tsrx', 'sub/Other.tsrx'].map((file) =>
				client.request('custom/projectInfo', { textDocument: { uri: client.uri(file) } }),
			),
		);
		expect(projects.map((p) => path.relative(workspace.dir, p.configFilePath))).toEqual([
			'tsconfig.json',
			path.join('sub', 'tsconfig.json'),
		]);
		// Hover in the first project still works.
		const panel_hover = await client.request(
			'textDocument/hover',
			at(client, files, 'Panel.tsrx', '{label}', 1),
		);
		expect(panel_hover.contents.value).toContain('const label: string');
	});

	it('works again after a server restart', async () => {
		await client.shutdown();
		client = new NativeLspClient(workspace.dir);
		await client.initialize({ runExternalCode: true });
		client.open('main.ts', files['main.ts']);
		await client.wait_for_registration('content-mapper-did-open');
		client.open('Panel.tsrx', files['Panel.tsrx']);
		const hover = await client.request(
			'textDocument/hover',
			at(client, files, 'Panel.tsrx', '{label}', 1),
		);
		expect(hover.contents.value).toContain('const label: string');
	});
});

describe('trust gate: runExternalCode', () => {
	const files = workspace_files();
	/** @type {ReturnType<typeof create_native_workspace>} */
	let workspace;
	/** @type {string} */
	let marker;

	beforeAll(() => {
		// A spy entry that records being spawned before delegating to the real mapper.
		files['spy.mjs'] = [
			"import fs from 'node:fs';",
			"fs.writeFileSync(new URL('./mapper-spawned', import.meta.url), '');",
			`await import(${JSON.stringify(pathToFileURL(mapper_server_path).href)});`,
			'',
		].join('\n');
		workspace = create_native_workspace(files, {
			exec: [process.execPath, path.join('<dir>', 'spy.mjs')],
		});
		marker = path.join(workspace.dir, 'mapper-spawned');
		// The manifest is written before the directory is known, so patch the exec path.
		const manifest = path.join(
			workspace.dir,
			'node_modules',
			'@tsrx',
			'content-mapper',
			'package.json',
		);
		fs.writeFileSync(
			manifest,
			fs.readFileSync(manifest, 'utf8').replace('<dir>', workspace.dir.replace(/\\/g, '\\\\')),
		);
	});

	afterAll(() => workspace?.cleanup());

	it('never spawns the mapper and leaves .tsrx unmapped without runExternalCode', async () => {
		const client = new NativeLspClient(workspace.dir);
		try {
			await client.initialize({ runExternalCode: false });
			client.open('main.ts', files['main.ts']);
			const diagnostics = await client.diagnostics('main.ts');
			expect(diagnostics.map((d) => [d.code, range_text(files['main.ts'], d.range)])).toEqual([
				[2307, "'./Button.tsrx'"],
				[2307, "'./Panel.tsrx'"],
			]);
			expect(client.registrations.map((r) => r.id)).not.toContain('content-mapper-did-open');
			client.open('Panel.tsrx', files['Panel.tsrx']);
			expect(
				await client.request('textDocument/hover', at(client, files, 'Panel.tsrx', '{label}', 1)),
			).toBeNull();
			expect(fs.existsSync(marker)).toBe(false);
		} finally {
			await client.shutdown();
		}
	});

	it('spawns the mapper with runExternalCode', async () => {
		const client = new NativeLspClient(workspace.dir);
		try {
			await client.initialize({ runExternalCode: true });
			client.open('main.ts', files['main.ts']);
			await client.wait_for_registration('content-mapper-did-open');
			expect((await client.diagnostics('main.ts')).map((d) => d.code)).toEqual([2322]);
			expect(fs.existsSync(marker)).toBe(true);
		} finally {
			await client.shutdown();
		}
	});
});

describe('inferred projects through custom/setContentMapperContributions', () => {
	// The inferred-project contribution of the protocol (what the TypeScript 7 VS
	// Code extension's `registerContentMappers` API turns into on the wire): no
	// tsconfig anywhere, the mapper comes from the contribution. The TSRX VS Code
	// extension does not use that API; this pins the server side of the protocol.
	const all = workspace_files();
	const files = {
		'Panel.tsrx': all['Panel.tsrx'],
		'Button.tsrx': all['Button.tsrx'],
		'Fresh.tsrx': all['Fresh.tsrx'],
	};
	/** @type {ReturnType<typeof create_native_workspace>} */
	let workspace;
	/** @type {NativeLspClient} */
	let client;

	beforeAll(async () => {
		workspace = create_native_workspace(files);
		client = new NativeLspClient(workspace.dir);
		await client.initialize({ runExternalCode: true });
	});

	afterAll(async () => {
		await client?.shutdown();
		workspace?.cleanup();
	});

	it('maps .tsrx files after the contribution is set, and drops them when it is cleared', async () => {
		await client.request('custom/setContentMapperContributions', {
			contributions: [
				{
					contributorId: 'TSRX.tsrx-vscode-plugin',
					extensions: ['.tsrx'],
					inferredProjectContribution: {
						options: {},
						manifest: {
							name: '@tsrx/content-mapper',
							version: '0.0.0-test',
							exec: [process.execPath, mapper_server_path],
							cwd: workspace.dir,
							dynamicConfig: true,
						},
					},
				},
			],
			openDocuments: [],
		});
		await client.wait_for_registration('content-mapper-did-open');

		client.open('Panel.tsrx', files['Panel.tsrx']);
		client.open('Fresh.tsrx', files['Fresh.tsrx']);
		const hover = await client.request(
			'textDocument/hover',
			at(client, files, 'Fresh.tsrx', '{n}', 1),
		);
		expect(hover.contents.value).toContain('const n: 1');
		const definition = await client.request(
			'textDocument/definition',
			at(client, files, 'Panel.tsrx', '<Button', 1),
		);
		expect(definition[0].uri).toBe(client.uri('Button.tsrx'));
		expect((await client.diagnostics('Panel.tsrx')).map((d) => [d.source, d.code])).toEqual([
			['ts', 6133],
		]);
		expect(
			await client.request('custom/projectInfo', {
				textDocument: { uri: client.uri('Panel.tsrx') },
			}),
		).toEqual({ configFilePath: '' });

		await client.request('custom/setContentMapperContributions', {
			contributions: [],
			openDocuments: [],
		});
		await vi.waitFor(() => {
			expect(client.registrations.map((r) => r.id)).not.toContain('content-mapper-did-open');
		});
	});
});

const HINTS_TSRX =
	'export function Hints(props: { items: string[] }) @{\n\tconst total = props.items.length;\n\tconst shown = Math.min(total, 10);\n\t<span>{shown}</span>\n}\n';

/**
 * Poll until `probe` resolves to a value `predicate` accepts; the server
 * applies watcher notifications asynchronously.
 * @template T
 * @param {() => Promise<T>} probe
 * @param {(value: T) => boolean} predicate
 * @param {number} [timeout]
 * @returns {Promise<T>}
 */
async function until(probe, predicate, timeout = 10_000) {
	const started = Date.now();
	let value = await probe();
	while (!predicate(value)) {
		if (Date.now() - started > timeout) return value;
		await new Promise((resolve) => setTimeout(resolve, 100));
		value = await probe();
	}
	return value;
}

describe('editor preferences and file lifecycle on the native server', () => {
	const files = workspace_files();
	files['Hints.tsrx'] = HINTS_TSRX;
	/** @type {ReturnType<typeof create_native_workspace>} */
	let workspace;
	/** @type {NativeLspClient} */
	let client;

	beforeAll(async () => {
		workspace = create_native_workspace(files);
		client = new NativeLspClient(workspace.dir);
		// What VS Code sends for `js/ts.inlayHints.*` when every hint is on; the
		// server reads them through `workspace/configuration` during initialize.
		await client.initialize({
			runExternalCode: true,
			configuration: {
				'js/ts': {
					inlayHints: {
						parameterNames: { enabled: 'all' },
						parameterTypes: { enabled: true },
						variableTypes: { enabled: true },
						propertyDeclarationTypes: { enabled: true },
						functionLikeReturnTypes: { enabled: true },
						enumMemberValues: { enabled: true },
					},
				},
			},
		});
		client.open('main.ts', files['main.ts']);
		await client.wait_for_registration('content-mapper-did-open');
		for (const file of ['Panel.tsrx', 'Button.tsrx', 'Hints.tsrx']) {
			client.open(file, files[file]);
		}
	});

	afterAll(async () => {
		await client?.shutdown();
		workspace?.cleanup();
	});

	/** @param {string} file @param {string} source */
	function inlay_hints(file, source) {
		return client
			.request('textDocument/inlayHint', {
				textDocument: { uri: client.uri(file) },
				range: {
					start: { line: 0, character: 0 },
					end: { line: source.split('\n').length, character: 0 },
				},
			})
			.then((hints) =>
				hints.map((/** @type {any} */ hint) => [
					hint.position,
					typeof hint.label === 'string'
						? hint.label
						: hint.label.map((/** @type {{ value: string }} */ p) => p.value).join(''),
				]),
			);
	}

	it('serves inlay hints at authored positions once they are enabled', async () => {
		const source = files['Hints.tsrx'];
		expect(await inlay_hints('Hints.tsrx', source)).toEqual([
			[position_of(source, 'const total', 'const total'.length), ': number'],
			[position_of(source, 'const shown', 'const shown'.length), ': number'],
			[position_of(source, 'Math.min(', 'Math.min('.length), '...values:'],
		]);
		// Hints in a template expression and in a `.ts` importer of `.tsrx` modules.
		const panel = files['Panel.tsrx'];
		expect(await inlay_hints('Panel.tsrx', panel)).toEqual([
			[position_of(panel, '() => console.log', '()'.length), ': void'],
			[position_of(panel, 'console.log(', 'console.log('.length), '...data:'],
		]);
		expect(
			(await inlay_hints('main.ts', files['main.ts'])).map(
				(/** @type {[unknown, string]} */ hint) => hint[1],
			),
		).toEqual([': Element', ': Element', ': Element']);
	});

	it('registers formatting for .tsrx and returns no edits, so Prettier must stay the default formatter', async () => {
		const ids = client.registrations.map((r) => r.id);
		expect(ids).toContain('content-mapper-formatting');
		expect(ids).toContain('content-mapper-range-formatting');
		const options = { tabSize: 2, insertSpaces: false };
		expect(
			await client.request('textDocument/formatting', {
				textDocument: { uri: client.uri('Panel.tsrx') },
				options,
			}),
		).toEqual([]);
		expect(
			await client.request('textDocument/rangeFormatting', {
				textDocument: { uri: client.uri('Panel.tsrx') },
				range: { start: { line: 8, character: 0 }, end: { line: 9, character: 0 } },
				options,
			}),
		).toEqual([]);
	});

	it('reports missing modules after a .tsrx file is deleted and resolves again once it is recreated', async () => {
		/** @param {string} file @param {string} source */
		const codes = (file, source) =>
			client.diagnostics(file).then((d) => d.map((x) => [x.code, range_text(source, x.range)]));
		client.close('Button.tsrx');
		fs.rmSync(path.join(workspace.dir, 'Button.tsrx'));
		client.watched_files_changed([['Button.tsrx', 'deleted']]);
		expect(
			await until(
				() => codes('main.ts', files['main.ts']),
				(d) => d.some(([code]) => code === 2307),
			),
		).toEqual([
			[2307, "'./Button.tsrx'"],
			[2322, 'count'],
		]);
		expect(await codes('Panel.tsrx', files['Panel.tsrx'])).toEqual([
			[2307, "'./Button.tsrx'"],
			[6133, 'analyticsEnabled'],
		]);

		fs.writeFileSync(path.join(workspace.dir, 'Button.tsrx'), files['Button.tsrx']);
		client.watched_files_changed([['Button.tsrx', 'created']]);
		client.open('Button.tsrx', files['Button.tsrx']);
		expect(
			await until(
				() => codes('main.ts', files['main.ts']),
				(d) => !d.some(([code]) => code === 2307),
			),
		).toEqual([[2322, 'count']]);
		expect(await codes('Panel.tsrx', files['Panel.tsrx'])).toEqual([[6133, 'analyticsEnabled']]);
	});

	it('follows a renamed .tsrx file once its importers point at the new name', async () => {
		client.close('Button.tsrx');
		fs.renameSync(path.join(workspace.dir, 'Button.tsrx'), path.join(workspace.dir, 'Btn.tsrx'));
		client.watched_files_changed([
			['Button.tsrx', 'deleted'],
			['Btn.tsrx', 'created'],
		]);
		client.open('Btn.tsrx', files['Button.tsrx']);
		const panel = files['Panel.tsrx'].replace("'./Button.tsrx'", "'./Btn.tsrx'");
		const main = files['main.ts'].replace("'./Button.tsrx'", "'./Btn.tsrx'");
		client.change('Panel.tsrx', panel);
		client.change('main.ts', main);
		expect(
			await until(
				() =>
					client
						.diagnostics('main.ts')
						.then((d) => d.map((x) => [x.code, range_text(main, x.range)])),
				(d) => !d.some(([code]) => code === 2307),
			),
		).toEqual([[2322, 'count']]);
		expect(
			(await client.diagnostics('Panel.tsrx')).map((d) => [d.code, range_text(panel, d.range)]),
		).toEqual([[6133, 'analyticsEnabled']]);
		const definition = await client.request('textDocument/definition', {
			textDocument: { uri: client.uri('Panel.tsrx') },
			position: position_of(panel, '<Button', 1),
		});
		expect(definition.map((/** @type {{ uri: string }} */ d) => path.basename(d.uri))).toEqual([
			'Btn.tsrx',
		]);
	});
});
