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
import { TS_ERRORS, TSRX_ERRORS } from '@tsrx/core/diagnostics';
import {
	consumer_fixture_files,
	create_native_workspace,
	mapper_server_path,
	repo_root,
	typescript_mapper_code,
} from './fixture-utils.js';
import { parse_jsonc } from '@tsrx/typescript-plugin/src/jsonc.js';
import { NativeLspClient, position_of, range_text } from './lsp-client.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const LIB_TS = `export function helperA() {}
export function helperB() {}
`;
const EXTEND_TSRX = `import { helperA } from './lib';

export function Extend() @{
	helperA();
	helperB
	<div />
}
`;
const FRESH_TSRX = `export function Fresh() @{
	const n = 1;
	helperB
	<div>{n}</div>
}
`;
/** The output is static, so the generated file starts with it, hoisted. */
const FRESH_STATIC_TSRX = `export function FreshStatic() @{
	const n = 1;
	helperB;
	<div />
}
`;
const MEMO_TSRX = `import { useState } from 'react';

export function Memo() @{
	const [n] = useState(0);
	const m = useMem
	<p>{n}{m}</p>
}
`;
const OTHER_TSRX = `export function Other(props: { n: number }) @{
	<span>{props.n}</span>
}
`;
const USE_TS = `import { Other } from './Other.tsrx';
export const x = Other({ n: 'no' });
`;
const MIXED_TS = `export interface Model {
	id: string;
}
export interface Other {
	name: string;
}
export function helperA() {}
export function helperB() {}
export function helperC() {}
export function helperD() {}
export default function def() {}
`;
const NEW_LINE_TSRX = `import { helperC } from './mixed';

export function NewLine() @{
	<p>{helperC()}{helperB()}</p>
}
`;
const WITH_COMPONENT_TSRX = `import Button from './Button.tsrx';

export function WithComponent() @{
	<p>{helperB()}<Button label="x" /></p>
}
`;
const STATEMENT_TSRX = `import { helperA } from './lib';

export function Statement() @{
	helperA();
	const value = helperB;
	<p>{value}</p>
}
`;
const NO_IMPORTS_TSRX = `export function NoImports() @{
	<p>{helperB()}</p>
}
`;
const FLAGGED_NO_IMPORTS_TSRX = `export function FlaggedNoImports() @{
	<p>{helperB()}{String(import.meta.env.platform.web)}</p>
}
`;
/** Imports with several names and type names, some of them unused. */
const MIXED_IMPORTS = `import { type Model, helperA } from './mixed';
import { helperA as first, type Model as M, helperB } from './mixed';
import { helperA as a1, helperB as b1, helperC } from './mixed';
import { type Model as M2, type Other } from './mixed';
import type { Model as M3, Other as O3 } from './mixed';
import def, { helperD } from './mixed';
`;

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
	files['mixed.ts'] = MIXED_TS;
	files['NewLine.tsrx'] = NEW_LINE_TSRX;
	files['NoImports.tsrx'] = NO_IMPORTS_TSRX;
	files['FlaggedNoImports.tsrx'] = FLAGGED_NO_IMPORTS_TSRX;
	files['WithComponent.tsrx'] = WITH_COMPONENT_TSRX;
	files['Statement.tsrx'] = STATEMENT_TSRX;
	files['Extend.tsrx'] = EXTEND_TSRX;
	files['Fresh.tsrx'] = FRESH_TSRX;
	files['FreshStatic.tsrx'] = FRESH_STATIC_TSRX;
	files['Memo.tsrx'] = MEMO_TSRX;
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

	it('offers signature help in a template without interpolations', async () => {
		const source =
			'declare function tag(parts: TemplateStringsArray): string;\n' +
			'export const a = tag`hello world`;\n';
		client.open('PlainTemplate.tsrx', source);
		try {
			const help = await client.request('textDocument/signatureHelp', {
				textDocument: { uri: client.uri('PlainTemplate.tsrx') },
				position: position_of(source, 'world', 1),
			});
			expect(help).toMatchObject({
				signatures: [{ label: 'tag(parts: TemplateStringsArray): string' }],
				activeSignature: 0,
				activeParameter: 0,
			});
		} finally {
			client.close('PlainTemplate.tsrx');
		}
	});

	it('offers literal completions in a template without interpolations', async () => {
		const source =
			'declare function greet(value: "hello world" | "hello there"): void;\n' +
			'greet(`hello `);\n';
		client.open('TemplateCompletion.tsrx', source);
		try {
			const completion = await client.request('textDocument/completion', {
				textDocument: { uri: client.uri('TemplateCompletion.tsrx') },
				position: position_of(source, '`hello ', '`hello '.length),
				context: { triggerKind: 1 },
			});
			expect(completion?.items.map((/** @type {{ label: string }} */ item) => item.label)).toEqual(
				expect.arrayContaining(['hello world', 'hello there']),
			);
			expect(
				(await client.diagnostics('TemplateCompletion.tsrx')).map((diagnostic) => [
					diagnostic.code,
					range_text(source, diagnostic.range),
				]),
			).toEqual([[2345, '`hello `']]);
		} finally {
			client.close('TemplateCompletion.tsrx');
		}
	});

	it('offers signature help in template text after a reformatted interpolation', async () => {
		const source =
			'declare function tag(parts: TemplateStringsArray, value: number): string;\n' +
			'export const result = tag`before ${1+2} after`;\n';
		client.open('Signature.tsrx', source);
		try {
			const help = await client.request('textDocument/signatureHelp', {
				textDocument: { uri: client.uri('Signature.tsrx') },
				position: position_of(source, 'after', 1),
			});
			expect(help).toMatchObject({
				signatures: [
					{
						label: 'tag(parts: TemplateStringsArray, value: number): string',
						parameters: [{ label: 'parts: TemplateStringsArray' }, { label: 'value: number' }],
					},
				],
				activeSignature: 0,
				activeParameter: 0,
			});
		} finally {
			client.close('Signature.tsrx');
		}
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
		client.open('FreshStatic.tsrx', files['FreshStatic.tsrx']);
		await client.diagnostics('FreshStatic.tsrx').catch(() => undefined);
		const completion = await client.request('textDocument/completion', {
			...at(client, files, 'FreshStatic.tsrx', 'helperB', 'helperB'.length),
			context: { triggerKind: 1 },
		});
		expect(
			completion.items.filter(
				(/** @type {{ label: string }} */ entry) => entry.label === 'helperB',
			),
		).toEqual([]);
		client.close('FreshStatic.tsrx');
	});

	it.each([
		[
			'on a new line',
			'Fresh.tsrx',
			'helperB',
			'./lib',
			{
				range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
				newText: 'import { helperB } from "./lib";\n\n',
			},
		],
		[
			'into an import of a package',
			'Memo.tsrx',
			'useMemo',
			'react',
			{
				range: { start: { line: 0, character: 9 }, end: { line: 0, character: 9 } },
				newText: 'useMemo, ',
			},
		],
	])(
		'auto-imports %s at the end of a name that ends a statement without ; (#1064)',
		async (_name, file, label, module, edit) => {
			// The generated statement ends without `;` too, so the end of the name is
			// inside text that is the same in both files.
			client.open(file, files[file]);
			await client.diagnostics(file).catch(() => undefined);
			const needle = label === 'useMemo' ? 'useMem' : label;
			const completion = await client.request('textDocument/completion', {
				...at(client, files, file, needle, needle.length),
				context: { triggerKind: 1 },
			});
			const item = completion.items.find(
				(/** @type {{ label: string, labelDetails?: { description?: string } }} */ entry) =>
					entry.label === label && entry.labelDetails?.description === module,
			);
			expect(item, 'auto-import candidate').toBeDefined();
			const resolved = await client.request('completionItem/resolve', item);
			expect(resolved.additionalTextEdits ?? item.additionalTextEdits).toEqual([edit]);
		},
	);

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

	/**
	 * `text` after applying LSP text `edits`.
	 * @param {string} text
	 * @param {{ range: { start: { line: number, character: number }, end: { line: number, character: number } }, newText: string }[]} edits
	 */
	function apply_edits(text, edits) {
		const lines = text.split('\n');
		/** @param {{ line: number, character: number }} position */
		const offset = ({ line, character }) =>
			lines.slice(0, line).reduce((sum, previous) => sum + previous.length + 1, 0) + character;
		let result = text;
		for (const edit of edits.toSorted((a, b) => offset(b.range.start) - offset(a.range.start))) {
			result =
				result.slice(0, offset(edit.range.start)) +
				edit.newText +
				result.slice(offset(edit.range.end));
		}
		return result;
	}

	/**
	 * The edits of the first source action of `kind` for `file`, opened with `source`.
	 * @param {string} file
	 * @param {string} source
	 * @param {string} kind
	 */
	async function source_action_edits(file, source, kind) {
		client.open(file, source);
		await client.diagnostics(file).catch(() => undefined);
		const uri = client.uri(file);
		const [action] = await client.request('textDocument/codeAction', {
			textDocument: { uri },
			range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
			context: { diagnostics: [], only: [kind] },
		});
		const resolved = action.edit ? action : await client.request('codeAction/resolve', action);
		client.close(file);
		return resolved.edit?.changes?.[uri] ?? [];
	}

	const NO_SEMICOLONS = "import Panel from './Panel.tsrx'\nimport Button from './Button.tsrx'";
	const SEVERAL_LINES = `import {
	helperA,
	helperB,
} from './lib';
import Panel from './Panel.tsrx';
import Button from './Button.tsrx';`;
	it.each([
		['source.organizeImports', 'without semicolons (#1023)', NO_SEMICOLONS],
		['source.sortImports', 'without semicolons (#1023)', NO_SEMICOLONS],
		['source.removeUnusedImports', 'without semicolons (#1023)', NO_SEMICOLONS],
		['source.organizeImports', 'over several lines (#1033)', SEVERAL_LINES],
		['source.sortImports', 'over several lines (#1033)', SEVERAL_LINES],
		[
			'source.sortImports',
			'with re-exports (#1029)',
			"import Button from './Button.tsrx';\nexport * from './lib';\nexport { default as Panel } from './Panel.tsrx';\nexport { helperB } from './lib';",
		],
		[
			'source.removeUnusedImports',
			'without spaces (#1033)',
			"import {helperA, helperB} from './lib';\nimport Button from './Button.tsrx';",
		],
		[
			'source.removeUnusedImports',
			'with a trailing comma (#1033)',
			"import { helperA, helperB, } from './lib';\nimport Button from './Button.tsrx';",
		],
	])('applies %s to imports %s as in a .ts file', async (kind, _layout, imports) => {
		// The editor output writes the imports as written, so TypeScript 7 finds the
		// text of its edits in both files.
		const tsrx = `${imports}\n\nexport default function Imports() @{\n\thelperA()\n\t<Button label="x" />\n}\n`;
		const ts = `${imports}\n\nexport default function Imports() {\n\thelperA()\n\treturn Button\n}\n`;
		const in_ts = apply_edits(ts, await source_action_edits('Imports.ts', ts, kind));
		const in_tsrx = apply_edits(tsrx, await source_action_edits('Imports.tsrx', tsrx, kind));
		expect(in_ts).not.toBe(ts);
		/** @param {string} text */
		const imports_of = (text) => text.slice(0, text.indexOf('export default'));
		expect(imports_of(in_tsrx)).toBe(imports_of(in_ts));
	});

	it.each([
		['source.sortImports', ' // keep this'],
		['source.removeUnusedImports', ' // keep this'],
		['source.organizeImports', ' // keep this'],
		['source.sortImports', ' /* keep this */  '],
		['source.removeUnusedImports', ' /* keep this */  '],
		['source.sortImports', '  '],
		['source.removeUnusedImports', '  '],
	])('applies %s when %j follows an import (#1024)', async (kind, rest) => {
		// The generated code keeps the rest of the line after an import, so TypeScript
		// moves or removes a comment with its import, and the whole line is the same
		// text in both files. As in a `.ts` file, a moved import loses the spaces at
		// the end of its line.
		const imports =
			kind === 'source.sortImports'
				? [
						"import Button from './Button.tsrx';",
						`import Panel from './Panel.tsrx';${rest.trimEnd()}`,
					]
				: ["import Button from './Button.tsrx';"];
		const component = [
			'',
			'export default function Commented() @{',
			'\t<Button label="x" />',
			'}',
			'',
		];
		const source = [
			`import Panel from './Panel.tsrx';${rest}`,
			"import Button from './Button.tsrx';",
			...component,
		].join('\n');
		const edits = await source_action_edits('Commented.tsrx', source, kind);
		expect(apply_edits(source, edits)).toBe([...imports, ...component].join('\n'));
	});

	it('reports unused imports on the unused names', async () => {
		const source = [
			"import { helperA } from './lib';",
			"import { helperB } from './lib'",
			'import {',
			'\thelperA as first,',
			'\thelperB as second,',
			"} from './lib';",
			"import Panel from './Panel.tsrx';",
			"import * as all from './lib';",
			'',
			'export function Unused() @{',
			'\t<p />',
			'}',
			'',
		].join('\n');
		client.open('Unused.tsrx', source);
		const diagnostics = await client.diagnostics('Unused.tsrx');
		expect(diagnostics.map((d) => [d.code, range_text(source, d.range)])).toEqual([
			[6133, 'helperA'],
			[6133, 'helperB'],
			[6192, "import {\n\thelperA as first,\n\thelperB as second,\n} from './lib';"],
			[6133, 'Panel'],
			[6133, 'all'],
		]);
		client.close('Unused.tsrx');
	});

	it('reports an unused destructuring in a @{ body on the pattern (#1062)', async () => {
		const source = [
			'export function UnusedPattern() @{',
			'\tconst [a, b] = [1, 2];',
			'\tconst { c, d } = { c: 1, d: 2 };',
			'\t<p />',
			'}',
			'',
		].join('\n');
		client.open('UnusedPattern.tsrx', source);
		const diagnostics = await client.diagnostics('UnusedPattern.tsrx');
		expect(diagnostics.map((d) => [d.code, range_text(source, d.range)])).toEqual([
			[6198, '[a, b]'],
			[6198, '{ c, d }'],
		]);
		client.close('UnusedPattern.tsrx');
	});

	it('hovers the names in a braceless if or else body', async () => {
		const source = [
			'export function Braceless(c: number, b: number) {',
			'\tif (c) c = b',
			'\tif (c) b; else c = b',
			'\treturn c',
			'}',
			'',
		].join('\n');
		client.open('Braceless.tsrx', source);
		await client.diagnostics('Braceless.tsrx').catch(() => undefined);
		/** @type {Array<[string | null, string | undefined]>} */
		const hovers = [];
		for (const [needle, skip] of /** @type {const} */ ([
			['c = b', 0],
			['c = b', 4],
			['b; else', 0],
			['c = b\n\treturn', 0],
			['c = b\n\treturn', 4],
		])) {
			const hover = await client.request('textDocument/hover', {
				textDocument: { uri: client.uri('Braceless.tsrx') },
				position: position_of(source, needle, skip),
			});
			hovers.push([hover && range_text(source, hover.range), hover?.contents.value.split('\n')[1]]);
		}
		expect(hovers).toEqual([
			['c', '(parameter) c: number'],
			['b', '(parameter) b: number'],
			['b', '(parameter) b: number'],
			['c', '(parameter) c: number'],
			['b', '(parameter) b: number'],
		]);
		client.close('Braceless.tsrx');
	});

	it('offers the /** */ template after /** above a function (#1066)', async () => {
		const source = [
			'/** */',
			'export function Documented({ a }: { a: number }) @{',
			'\t/** */',
			'\tfunction inner(x: number) {',
			'\t\treturn x;',
			'\t}',
			'\t<p>{inner(a)}</p>',
			'}',
			'',
		].join('\n');
		client.open('Documented.tsrx', source);
		await client.diagnostics('Documented.tsrx').catch(() => undefined);
		/** @type {Array<[number, string]>} */
		const templates = [];
		for (const occurrence of [1, 2]) {
			const completion = await client.request('textDocument/completion', {
				textDocument: { uri: client.uri('Documented.tsrx') },
				position: position_of(source, '/**', 3, occurrence),
			});
			const item = (completion?.items ?? completion ?? []).find(
				(/** @type {{ label: string }} */ entry) => entry.label === '/** */',
			);
			expect(item, `template ${occurrence}`).toBeDefined();
			templates.push([occurrence, range_text(source, item.textEdit.range)]);
			expect(item.textEdit.newText).toContain(occurrence === 1 ? '@param param0' : '@param x');
		}
		expect(templates).toEqual([
			[1, '/** */'],
			[2, '/** */'],
		]);
		client.close('Documented.tsrx');
	});

	it('reports unused imports with several names and type names as in a .ts file', async () => {
		const tsrx = `${MIXED_IMPORTS}
export function Mixed(props: { value: M | O3 }) @{
	<p>{String([first, b1, def])}{String(props.value)}</p>
}
`;
		const ts = `${MIXED_IMPORTS}
export const used = [first, b1, def];
export type Value = M | O3;
`;
		/**
		 * @param {string} file
		 * @param {string} text
		 */
		const unused = async (file, text) => {
			client.open(file, text);
			const diagnostics = await client.diagnostics(file);
			client.close(file);
			return diagnostics.map((d) => [d.code, range_text(text, d.range)]);
		};
		const in_ts = await unused('MixedImports.ts', ts);
		expect(await unused('Mixed.tsrx', tsrx)).toEqual(in_ts);
		expect(in_ts).toEqual([
			[6192, "import { type Model, helperA } from './mixed';"],
			[6133, 'helperB'],
			[6133, 'a1'],
			[6133, 'helperC'],
			[6192, "import { type Model as M2, type Other } from './mixed';"],
			[6196, 'M3'],
			[6133, 'helperD'],
		]);
	});

	it('removes the unused names of imports with several names and type names', async () => {
		const source = `${MIXED_IMPORTS}
export function Mixed(props: { value: M | O3 }) @{
	<p>{String([first, b1, def])}{String(props.value)}</p>
}
`;
		const edits = await source_action_edits('Mixed.tsrx', source, 'source.removeUnusedImports');
		const result = apply_edits(source, edits);
		expect(result.slice(0, result.indexOf('export function'))).toBe(
			`import { helperA as first, type Model as M } from './mixed';
import { helperB as b1 } from './mixed';
import type { Other as O3 } from './mixed';
import def from './mixed';

`,
		);
	});

	it.each([
		['source.removeUnusedImports', "import Button from './Button.tsrx';\n"],
		['source.organizeImports', "import Button from './Button.tsrx';\n"],
		[
			'source.sortImports',
			"import Button from './Button.tsrx';\nimport Panel from './Panel.tsrx';\n",
		],
	])('applies %s in a module that keeps a platform flag', async (kind, imports) => {
		// The shared platform globals are referenced by a directive, not imported, so
		// the module's last import stays its own and its edits still map. A module
		// with an import or export also gets no generated `export {};`, which
		// Organize and Sort Imports would rewrite in generated code (#1207).
		const source = [
			"import Panel from './Panel.tsrx';",
			"import Button from './Button.tsrx';",
			'',
			'export default function Flagged() @{',
			'\t<Button label={String(import.meta.env.platform.web)} />',
			'}',
			'',
		].join('\n');
		const edits = await source_action_edits('Flagged.tsrx', source, kind);
		expect(apply_edits(source, edits)).toBe(imports + source.slice(source.indexOf('\nexport')));
	});

	it.each([
		[
			'on a new line, sorted before the other import',
			'NewLine.tsrx',
			{
				range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
				newText: "import { helperB } from './lib';\n",
			},
		],
		[
			'into a file without imports whose generated code starts like the source',
			'NoImports.tsrx',
			{
				range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
				newText: 'import { helperB } from "./lib";\n\n',
			},
		],
		[
			// The `<` of the tag maps with other features than `helperB`, which ended the span
			// of `helperB` at the cursor, and TypeScript 7 offered no auto-import there.
			'on a new line when the template uses a component tag (#1028)',
			'WithComponent.tsrx',
			{
				range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
				newText: "import { helperB } from './lib';\n",
			},
		],
		[
			// The generated code adds a blank line after the `;`, which ended the span of
			// `helperB` at the cursor before the next span (#1064).
			'into an existing import from a statement in a template body',
			'Statement.tsrx',
			{
				range: { start: { line: 0, character: 16 }, end: { line: 0, character: 16 } },
				newText: ', helperB',
			},
		],
		[
			'into a file without imports that keeps a platform flag',
			'FlaggedNoImports.tsrx',
			{
				range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
				newText: 'import { helperB } from "./lib";\n\n',
			},
		],
	])('auto-imports %s', async (_name, file, edit) => {
		// The file is on disk, so it belongs to the project that holds `lib.ts`.
		client.open(file, files[file]);
		await client.diagnostics(file).catch(() => undefined);
		const completion = await client.request('textDocument/completion', {
			...at(client, files, file, 'helperB', 'helperB'.length),
			context: { triggerKind: 1 },
		});
		const item = completion.items.find(
			(/** @type {{ label: string, labelDetails?: { description?: string } }} */ entry) =>
				entry.label === 'helperB' && entry.labelDetails?.description === './lib',
		);
		expect(item, 'auto-import candidate').toBeDefined();
		const resolved = await client.request('completionItem/resolve', item);
		expect(resolved.additionalTextEdits ?? item.additionalTextEdits).toEqual([edit]);
		client.close(file);
	});

	it('reports a compile error at the authored construct and keeps importers resolving', async () => {
		const broken = files['Button.tsrx'].replace('<button type="button"', '<button type="button" +');
		client.change('Button.tsrx', broken);
		const diagnostics = await client.diagnostics('Button.tsrx');
		expect(diagnostics.map((d) => [d.source, d.code, range_text(broken, d.range)])).toEqual([
			['TSRX', typescript_mapper_code(TS_ERRORS.UNEXPECTED_TOKEN.code), '+'],
		]);
		expect(diagnostics[0].message).toBe(
			`${TS_ERRORS.UNEXPECTED_TOKEN.message} (9:23) [${TS_ERRORS.UNEXPECTED_TOKEN.code}]`,
		);
		// The export stub keeps `main.ts` at its one real error while Button.tsrx is broken.
		expect((await client.diagnostics('main.ts')).map((d) => d.code)).toEqual([2322]);
		client.change('Button.tsrx', files['Button.tsrx']);
		expect(await client.diagnostics('Button.tsrx')).toEqual([]);
	});

	it('reports a mistake with a TypeScript code once, over TypeScript’s own, and a TSRX one by its number', async () => {
		const rest_default = `${files['Button.tsrx']}const [...rest = [1]] = [1];\nexport { rest };\n`;
		client.change('Button.tsrx', rest_default);
		// TypeScript reports it from the generated code too; the mapper's directive
		// hides that copy.
		expect(
			(await client.diagnostics('Button.tsrx')).map((d) => [
				d.source,
				d.code,
				range_text(rest_default, d.range),
			]),
		).toEqual([['TSRX', typescript_mapper_code(TS_ERRORS.REST_ELEMENT_INITIALIZER.code), '=']]);

		const semicolon = files['Button.tsrx'].replace('{label}', '{label;}');
		client.change('Button.tsrx', semicolon);
		const { code } = TSRX_ERRORS.TEMPLATE_EXPRESSION_TRAILING_SEMICOLON;
		expect(
			(await client.diagnostics('Button.tsrx')).map((d) => [
				d.source,
				d.code,
				range_text(semicolon, d.range),
			]),
		).toEqual([['TSRX', Number(code.slice('TSRX'.length)), ';']]);

		client.change('Button.tsrx', files['Button.tsrx']);
		expect(await client.diagnostics('Button.tsrx')).toEqual([]);
	});

	// Each tag left open shows on itself. The closing tags that recovery adds
	// have no mapping, so an error of TypeScript's on one could only show at the
	// top of the file, as TS18080. The directive has to cover them, and a tag's
	// own statement can end before them. An unclosed tag also hides TypeScript's
	// errors around it in its function until it's closed (#1288).
	it('reports each unclosed tag on itself and nothing on the closing tags added', async () => {
		const unclosed = TSRX_ERRORS.UNCLOSED_TAG.code;
		const number = Number(unclosed.slice('TSRX'.length));
		/** @param {string} body */
		const component = (body) => `export function C() @{\n\t${body}\n}\n`;
		/** @param {string} body */
		const plain = (body) => `export function C(props: { a: number }) {\n\t${body}\n}\n`;
		for (const [source, tags] of /** @type {Array<[string, string[]]>} */ ([
			[component('<main><section>'), ['main', 'section']],
			[component('<ul><li>a'), ['ul', 'li']],
			[component('<><div>'), ['<>', 'div']],
			[component('<div><span><b><i>'), ['div', 'span', 'b', 'i']],
			[component('<Missing>'), ['Missing']],
			[component('<nope.Missing>'), ['nope.Missing']],
			[component('const y = <Missing>;\n\t<div>{y}'), ['Missing', 'div']],
			[plain('return <Missing id={props.a}>;'), ['Missing']],
			[plain('const y = <Missing>;\n\treturn y;'), ['Missing']],
			[plain('const n = 1;\n\treturn <Missing>{n};'), ['Missing']],
			[plain('const n = 1;\n\treturn <div><Missing>{n};'), ['div', 'Missing']],
			[plain('const f = () => <Missing>;\n\treturn f;'), ['Missing']],
			[plain("const n: number = 'x';\n\treturn <div>{n};"), ['div']],
			['export class A {\n\ty = <Missing>;\n}\n', ['Missing']],
			['export const y = <div>\n', ['div']],
			// TypeScript reports TS2304 on these closing tags, as `T` and `Missing`
			// name no value (#1328).
			['export const f = <T>(x: T) => x;\n', ['<T>']],
			[plain('return <T>(x: T) => x;'), ['<T>']],
			['export const y = <Missing>;\n', ['Missing']],
			['export const y = <style>.a {}\n', ['<style>']],
			['export const y = <script>const a = 1;\n', ['<script>']],
			['<><div>;\n', ['<>', 'div']],
		])) {
			client.change('Button.tsrx', source);
			const diagnostics = await client.diagnostics('Button.tsrx');
			expect(
				diagnostics
					.filter((d) => d.severity === 1)
					.toSorted(
						(a, b) =>
							a.range.start.line - b.range.start.line ||
							a.range.start.character - b.range.start.character,
					)
					.map((d) => [d.source, d.code, range_text(source, d.range)]),
				source,
			).toEqual(tags.map((tag) => ['TSRX', number, tag]));
		}

		client.change('Button.tsrx', files['Button.tsrx']);
		expect(await client.diagnostics('Button.tsrx')).toEqual([]);
	});

	/** @param {string} source */
	async function type_errors_in(source) {
		client.change('Button.tsrx', source);
		const diagnostics = await client.diagnostics('Button.tsrx');
		return diagnostics
			.filter((d) => d.code === 2322)
			.map((d) => range_text(source, d.range))
			.sort();
	}

	// A `@{ … }` after an unclosed tag at module level parses as a block inside
	// the tag, so the tag's declaration stretches around that component. A
	// directive on that declaration would hide all of its errors (#1288).
	it('keeps the errors of the components after an unclosed tag', async () => {
		const template = `export function B() @{\n\tconst wrong: string = 1;\n\t<span />\n}\n`;
		const arrow = `export const C = () => @{\n\tconst also: string = 1;\n\t<b />\n};\n`;
		for (const first of [
			'export const A = () => <div>\n',
			'export const A = () => <div>;\n',
			'export const y = <div>\n',
			'export const y = <Missing>\n',
			'export const y = <a.b>\n',
			'export const A = () => <>\n',
		]) {
			expect(await type_errors_in(first + template), first).toEqual(['wrong']);
			expect(await type_errors_in(first + arrow), first).toEqual(['also']);
			expect(await type_errors_in(first + template + arrow), first).toEqual(['also', 'wrong']);
		}

		client.change('Button.tsrx', files['Button.tsrx']);
		expect(await client.diagnostics('Button.tsrx')).toEqual([]);
	});

	// A `<>` the output drops has only an anchor, on the line of its siblings.
	it('keeps the errors beside an unclosed fragment the output drops', async () => {
		const source = 'export const y = <div>{/*cc*/}<><b /><Undefined1 /><i />\n';
		client.change('Button.tsrx', source);
		const diagnostics = await client.diagnostics('Button.tsrx');
		expect(
			diagnostics.filter((d) => d.source !== 'TSRX').map((d) => range_text(source, d.range)),
		).toContain('Undefined1');

		client.change('Button.tsrx', files['Button.tsrx']);
		expect(await client.diagnostics('Button.tsrx')).toEqual([]);
	});

	// An error's anchor is its nearest token plus the columns to the error. The
	// code before a `<>` can be gone from the generated code, and a tag can be
	// long, so either could carry the anchor, and a directive, into `B` (#1288).
	it("keeps the next component's errors when an unclosed tag's anchor can't fit", async () => {
		const next = `export function B() {\n\tconst wrong: string = 1;\n\treturn wrong;\n}\n`;
		for (const gap of [38, 39, 40, 41, 42, 43, 44]) {
			const comment = `/*${'x'.repeat(gap - 4)}*/`;
			const source = `export function A({ x }: any) @{\n\t<div>{x}{${comment}}<>{x}\n}\n${next}`;
			expect(await type_errors_in(source), source).toEqual(['wrong']);
		}
		const tag = `Missing${'x'.repeat(60)}`;
		const source = `export function A() {\n\tconst f = () => { return <${tag}>; };\n\treturn f;\n}\n${next}`;
		expect(await type_errors_in(source), source).toEqual(['wrong']);

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

/**
 * Runtime and compiler packages of the target workspaces below, as in
 * `targets.test.js`.
 * @type {Record<string, Array<string | [string, string]>>}
 */
const target_dependencies = {
	solid: ['@tsrx/solid', 'solid-js', '@solidjs/web'],
	vue: ['@tsrx/vue', 'vue', ['vue-jsx-vapor', path.join(repo_root, 'packages', 'vite-plugin-vue')]],
};

/**
 * A `@for` item and index used in the body and the key, where the transform
 * maps the name twice over the same text, once for diagnostics only. Solid
 * passes the item as an accessor.
 * @param {string} target
 */
const for_source = (
	target,
) => `export function List(props: { items: { id: number; label: string }[] }) @{
	<ul>
		@for (const item of props.items; index i; key i) {
			<li>{${target === 'solid' ? 'item()' : 'item'}.label}</li>
		}
	</ul>
}
`;

/**
 * Two more names mapped twice over the same text, each in an error that
 * TypeScript reports around it: a return type (TS2355) and a dynamic tag's
 * subscript (TS7053).
 */
const NAMES_TSRX = `declare const registry: Record<'b' | 'i', 'b' | 'i'>;
declare const name: string;
export function identity<T>(x: T): T {}
export function Tag() @{
	<{registry[name]} />
}
`;

/**
 * Bare names as the test of an `@if` with an `@else if` (Solid's `<Match>`),
 * the test of an `@if` alone (`<Show>`) and a `@for` key. Solid prints each in
 * an expression container (`when={a}`, `keyed={({ id }) => id}`) whose
 * mapping covers the same text as the name's own.
 */
const SHOWN_TSRX = `declare const a: boolean;
export function Shown(props: { items: { id: number }[]; on: boolean }) @{
	const shown = props.on;
	const alone = props.items.length > 0;
	<div>
		@if (a) {
			<b />
		} @else if (shown) {
			<i />
		}
		@if (alone) {
			<u />
		}
		@for (const { id } of props.items; key id) {
			<li />
		}
	</div>
}
`;

/**
 * `@case` tests the discriminant can never equal. Solid compares a copy of the
 * discriminant with each test (`<Match when={(d) === test}>`), where TypeScript
 * reports TS2367 on the whole comparison; Vue prints a `switch`, where it
 * reports TS2678 on the test.
 */
const SWITCH_TSRX = `export function Cases(props: { n: number; s: 'a' | 'b' }) @{
	<div>
		@switch (props.n) {
			@case 'x': {
				<b />
			}
			@case 1: {
				<i />
			}
		}
		@switch (props.s) {
			@case 'c': {
				<s />
			}
		}
	</div>
}
`;

describe.each(Object.keys(target_dependencies))('native language server on %s', (target) => {
	/** @type {Record<string, string>} */
	const files = {
		'main.ts':
			"import { List } from './List.tsrx';\nimport { Tag } from './Names.tsrx';\nimport { Shown } from './Shown.tsrx';\nimport { Cases } from './Switch.tsrx';\n\nexport const list = [List, Tag, Shown, Cases];\n",
		'List.tsrx': for_source(target),
		'Names.tsrx': NAMES_TSRX,
		'Shown.tsrx': SHOWN_TSRX,
		'Switch.tsrx': SWITCH_TSRX,
	};
	/** @type {ReturnType<typeof create_native_workspace>} */
	let workspace;
	/** @type {NativeLspClient} */
	let client;

	beforeAll(async () => {
		const tsconfig = /** @type {Record<string, unknown>} */ (
			parse_jsonc(
				fs.readFileSync(
					new URL(`./fixtures/targets/${target}/tsconfig.json`, import.meta.url),
					'utf8',
				),
			).value
		);
		tsconfig.contentMappers = [{ package: '@tsrx/content-mapper', extensions: ['.tsrx'] }];
		tsconfig.include = ['*.ts', '*.tsrx'];
		files['tsconfig.json'] = JSON.stringify(tsconfig, null, '\t');
		workspace = create_native_workspace(files, { dependencies: target_dependencies[target] });
		client = new NativeLspClient(workspace.dir);
		await client.initialize({ runExternalCode: true });
		client.open('main.ts', files['main.ts']);
		await client.wait_for_registration('content-mapper-did-open');
		client.open('List.tsrx', files['List.tsrx']);
		client.open('Names.tsrx', files['Names.tsrx']);
		client.open('Shown.tsrx', files['Shown.tsrx']);
		client.open('Switch.tsrx', files['Switch.tsrx']);
	});

	afterAll(async () => {
		await client?.shutdown();
		workspace?.cleanup();
	});

	/**
	 * A range in `file` as `offset:text`.
	 * @param {string} file
	 * @param {{ start: { line: number, character: number }, end: object }} range
	 */
	function where(file, range) {
		const offset = files[file]
			.split('\n')
			.slice(0, range.start.line)
			.reduce((sum, line) => sum + line.length + 1, range.start.character);
		return `${offset}:${range_text(files[file], /** @type {any} */ (range))}`;
	}

	/** @param {string} a @param {string} b */
	const by_offset = (a, b) => a.localeCompare(b, 'en', { numeric: true });

	/**
	 * The language features at a name: the hover's range and first line, each
	 * definition, reference and rename edit as `file offset:text`, and whether
	 * completion at the name's end offers it.
	 * @param {string} file
	 * @param {string} needle
	 * @param {number} skip
	 * @param {string} name
	 */
	async function features_at(file, needle, skip, name) {
		const params = at(client, files, file, needle, skip);
		const hover = await client.request('textDocument/hover', params);
		const definition = await client.request('textDocument/definition', params);
		const references = await client.request('textDocument/references', {
			...params,
			context: { includeDeclaration: true },
		});
		const rename = await client.request('textDocument/rename', { ...params, newName: 'renamed' });
		const completion = await client.request(
			'textDocument/completion',
			at(client, files, file, needle, skip + name.length),
		);
		/** @param {{ uri: string, range: any }} location */
		const located = (location) =>
			`${path.basename(location.uri)} ${where(path.basename(location.uri), location.range)}`;
		return {
			hover: hover && `${where(file, hover.range)} ${hover.contents.value.split('\n')[1]}`,
			definition: (definition ?? []).map(located),
			references: (references ?? []).map(located).sort(by_offset),
			rename: Object.entries(rename?.changes ?? {}).flatMap(([uri, edits]) =>
				/** @type {Array<{ range: any, newText: string }>} */ (edits)
					.map((e) => `${located({ uri, range: e.range })} -> ${e.newText}`)
					.sort(by_offset),
			),
			completes: (completion?.items ?? completion ?? []).some(
				(/** @type {{ label: string }} */ item) => item.label === name,
			),
		};
	}

	it('keeps the features of a @for item and index', async () => {
		const source = files['List.tsrx'];
		expect((await client.diagnostics('List.tsrx')).filter((d) => d.severity === 1)).toEqual([]);
		const item = source.indexOf('item of');
		const index = source.indexOf('i;');
		const key = source.indexOf('i) {');
		const body = source.indexOf('item', key);
		expect(await features_at('List.tsrx', '<li>{', 5, 'item')).toEqual({
			hover: expect.stringMatching(new RegExp(`^${body}:item .*\\bitem: `)),
			definition: [`List.tsrx ${item}:item`],
			references: [`List.tsrx ${item}:item`, `List.tsrx ${body}:item`],
			rename: [`List.tsrx ${item}:item -> renamed`, `List.tsrx ${body}:item -> renamed`],
			completes: true,
		});
		expect(await features_at('List.tsrx', 'key i', 4, 'i')).toEqual({
			hover: `${key}:i (parameter) i: number`,
			definition: [`List.tsrx ${index}:i`],
			references: [`List.tsrx ${index}:i`, `List.tsrx ${key}:i`],
			rename: [`List.tsrx ${index}:i -> renamed`, `List.tsrx ${key}:i -> renamed`],
			completes: true,
		});
	});

	it('keeps the features of a return type and a subscript, and the errors around them', async () => {
		const source = NAMES_TSRX;
		expect(
			(await client.diagnostics('Names.tsrx'))
				.filter((d) => d.severity === 1)
				.map((d) => [d.code, where('Names.tsrx', d.range)]),
		).toEqual([
			[2355, `${source.indexOf('T {}')}:T`],
			[7053, `${source.indexOf('registry[')}:registry[name]`],
		]);
		const type_parameter = source.indexOf('T>');
		const parameter_type = source.indexOf('T)');
		const return_type = source.indexOf('T {}');
		expect(await features_at('Names.tsrx', 'T {}', 0, 'T')).toEqual({
			hover: `${return_type}:T (type parameter) T in identity<T>(x: T): T`,
			definition: [`Names.tsrx ${type_parameter}:T`],
			references: [
				`Names.tsrx ${type_parameter}:T`,
				`Names.tsrx ${parameter_type}:T`,
				`Names.tsrx ${return_type}:T`,
			],
			rename: [
				`Names.tsrx ${type_parameter}:T -> renamed`,
				`Names.tsrx ${parameter_type}:T -> renamed`,
				`Names.tsrx ${return_type}:T -> renamed`,
			],
			completes: true,
		});
		const declared = source.indexOf('name:');
		const subscript = source.indexOf('name]');
		expect(await features_at('Names.tsrx', 'name]', 0, 'name')).toEqual({
			hover: `${subscript}:name const name: string`,
			definition: [`Names.tsrx ${declared}:name`],
			references: [`Names.tsrx ${declared}:name`, `Names.tsrx ${subscript}:name`],
			rename: [`Names.tsrx ${declared}:name -> renamed`, `Names.tsrx ${subscript}:name -> renamed`],
			completes: true,
		});
	});

	it('keeps the features of a bare @if test, @else if test and @for key', async () => {
		const source = SHOWN_TSRX;
		expect((await client.diagnostics('Shown.tsrx')).filter((d) => d.severity === 1)).toEqual([]);
		const declared_a = source.indexOf('a:');
		const test_a = source.indexOf('a)');
		expect(await features_at('Shown.tsrx', '@if (a)', 5, 'a')).toEqual({
			hover: `${test_a}:a const a: boolean`,
			definition: [`Shown.tsrx ${declared_a}:a`],
			references: [`Shown.tsrx ${declared_a}:a`, `Shown.tsrx ${test_a}:a`],
			rename: [`Shown.tsrx ${declared_a}:a -> renamed`, `Shown.tsrx ${test_a}:a -> renamed`],
			completes: true,
		});
		const declared_shown = source.indexOf('shown =');
		const test_shown = source.indexOf('shown)');
		expect(await features_at('Shown.tsrx', '@else if (shown)', 10, 'shown')).toEqual({
			hover: `${test_shown}:shown const shown: boolean`,
			definition: [`Shown.tsrx ${declared_shown}:shown`],
			references: [`Shown.tsrx ${declared_shown}:shown`, `Shown.tsrx ${test_shown}:shown`],
			rename: [
				`Shown.tsrx ${declared_shown}:shown -> renamed`,
				`Shown.tsrx ${test_shown}:shown -> renamed`,
			],
			completes: true,
		});
		const declared_alone = source.indexOf('alone =');
		const test_alone = source.indexOf('alone)');
		expect(await features_at('Shown.tsrx', '@if (alone)', 5, 'alone')).toEqual({
			hover: `${test_alone}:alone const alone: boolean`,
			definition: [`Shown.tsrx ${declared_alone}:alone`],
			references: [`Shown.tsrx ${declared_alone}:alone`, `Shown.tsrx ${test_alone}:alone`],
			rename: [
				`Shown.tsrx ${declared_alone}:alone -> renamed`,
				`Shown.tsrx ${test_alone}:alone -> renamed`,
			],
			completes: true,
		});
		const declared_id = source.indexOf('id }');
		const key_id = source.indexOf('id)');
		expect(await features_at('Shown.tsrx', 'key id', 4, 'id')).toEqual({
			hover: `${key_id}:id (parameter) id: number`,
			definition: [`Shown.tsrx ${declared_id}:id`],
			references: [`Shown.tsrx ${declared_id}:id`, `Shown.tsrx ${key_id}:id`],
			// The binding keeps the property it destructures.
			rename: [`Shown.tsrx ${declared_id}:id -> id: renamed`, `Shown.tsrx ${key_id}:id -> renamed`],
			completes: true,
		});
	});

	it('reports an @case test the discriminant can never equal on the test', async () => {
		const diagnostics = await client.diagnostics('Switch.tsrx');
		const code = target === 'solid' ? 2367 : 2678;
		expect(diagnostics.map((d) => [d.code, where('Switch.tsrx', d.range)])).toEqual([
			[code, `${SWITCH_TSRX.indexOf("'x'")}:'x'`],
			[code, `${SWITCH_TSRX.indexOf("'c'")}:'c'`],
		]);
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

describe('configured-project discovery through contributed extensions', () => {
	it('serves already-open and later .tsrx-only projects without a bundled mapper or a .ts file', async () => {
		const config = /** @type {any} */ (parse_jsonc(workspace_files()['tsconfig.json']).value);
		config.include = ['*.tsrx'];
		delete config.compilerOptions.allowImportingTsExtensions;
		const source = `export function App() @{
	const message: string = 123;
	<div>{message}</div>
}
`;
		const workspace = create_native_workspace({
			'tsconfig.json': JSON.stringify(config),
			'App.tsrx': source,
			'sub/tsconfig.json': JSON.stringify(config),
			'sub/App.tsrx': source,
		});
		const client = new NativeLspClient(workspace.dir);
		try {
			await client.initialize({ runExternalCode: true });
			const open_documents = [];
			for (const file of ['App.tsrx', 'sub/App.tsrx']) {
				open_documents.push({ uri: client.uri(file) });
				// VS Code sends this hint for matching documents before the server knows to
				// synchronize them. The project must be discovered from the .tsrx path alone.
				await client.request('custom/setContentMapperContributions', {
					contributions: [{ contributorId: 'TSRX.tsrx-vscode-plugin', extensions: ['.tsrx'] }],
					openDocuments: open_documents,
				});
				await client.wait_for_registration('content-mapper-did-open');
				client.open(file, source);
				const hover = await client.request('textDocument/hover', {
					textDocument: { uri: client.uri(file) },
					position: position_of(source, 'message'),
				});
				expect(hover.contents.value).toContain('const message: string');
				expect((await client.diagnostics(file)).map((d) => [d.source, d.code])).toEqual([
					['ts', 2322],
				]);
				expect(
					await client.request('custom/projectInfo', {
						textDocument: { uri: client.uri(file) },
					}),
				).toEqual({
					configFilePath: path.join(workspace.dir, path.dirname(file), 'tsconfig.json'),
				});
			}
		} finally {
			await client.shutdown();
			workspace.cleanup();
		}
	});
});

describe('inferred projects through custom/setContentMapperContributions', () => {
	// The inferred-project contribution of the protocol (what the TypeScript 7 VS
	// Code extension's `registerContentMappers` API turns into on the wire): no
	// tsconfig anywhere, the mapper comes from the contribution. The TSRX VS Code
	// extension only registers extensions for discovery, without this optional
	// inferred-project contribution; this pins the server side of that protocol.
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

const HINTS_TSRX = `export function Hints(props: { items: string[] }) @{
	const total = props.items.length;
	const shown = Math.min(total, 10);
	<span>{shown}</span>
}
`;

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

	it.each([
		['props.color', 1],
		['props.color+props.size', 2],
		['props.color    +    props.size', 2],
	])('preserves native tagged-template hint behavior with %s', async (expression, count) => {
		const source =
			'export function Template(props: { color: string; size: number }) @{\n' +
			'\tconst style = String.raw`color: ${' +
			expression +
			'}; padding: ${props.size}px;`;\n' +
			'\t<span>{style}</span>\n}\n';
		client.open('Template.tsrx', source);
		// Reformatting splits the statement into distinct Verbatim runs. The
		// pinned server returns its type hint twice even without literal-token
		// mappings (microsoft/TypeScript#64050); allow the server to deduplicate them,
		// but added coverage must not add more.
		const hints = await inlay_hints('Template.tsrx', source);
		expect(hints.length).toBeGreaterThan(0);
		expect(hints.length).toBeLessThanOrEqual(count);
		for (const hint of hints) {
			expect(hint).toEqual([position_of(source, 'const style', 'const style'.length), ': string']);
		}
		client.close('Template.tsrx');
	});

	it('registers formatting for .tsrx and returns no edits, so TSRX must stay the default formatter', async () => {
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
