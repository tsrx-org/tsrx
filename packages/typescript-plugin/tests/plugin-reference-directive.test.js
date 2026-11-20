import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FILE_REFERENCES_COMMAND } from '../src/plugin-file-references.js';
import { create_tsserver_workspace, start_tsserver } from './tsserver.js';

// A `/// <reference path>` in a `.tsrx` file, which TypeScript navigates from:
// its path is a file reference, has a definition, and is edited when the file
// moves. The same file as `.ts` answers each request, for comparison.
const FILES = {
	'tsconfig.json': JSON.stringify({
		compilerOptions: { jsx: 'preserve', module: 'esnext', moduleResolution: 'bundler', types: [] },
		tsrx: { compiler: '@tsrx/react' },
		include: ['src'],
	}),
	'src/Target.tsrx': `export function Target() {
	return <p>Target</p>;
}
`,
	'src/Refs.tsrx': `/// <reference path="./Target.tsrx" />
import { Target } from './Target.tsrx';

export function Refs() {
	return <Target />;
}
`,
	'src/refs.ts': `/// <reference path="./Target.tsrx" />
import { Target } from './Target.tsrx';

export const refs = Target;
`,
	'src/Missing.tsrx': `/// <reference path="./Nowhere.tsrx" />
export function Missing() {
	return <p />;
}
`,
};

describe('tsserver plugin: a `/// <reference path>` in a .tsrx file', () => {
	/** @type {string} */
	let workspace;
	/** @type {ReturnType<typeof start_tsserver>} */
	let server;

	beforeAll(async () => {
		const created = create_tsserver_workspace('tsrx-comment-navigation-', FILES);
		workspace = created.workspace;
		server = start_tsserver(workspace, created.probe_location);
		for (const file of ['src/Target.tsrx', 'src/Refs.tsrx', 'src/refs.ts', 'src/Missing.tsrx']) {
			const full = path.join(workspace, file);
			await server.request('open', {
				file: full,
				fileContent: fs.readFileSync(full, 'utf8'),
				projectRootPath: workspace,
			});
		}
	}, 60_000);

	afterAll(() => {
		server?.stop();
		fs.rmSync(workspace, { recursive: true, force: true });
	});

	/**
	 * The protocol location of the first `text` in `file`, `delta` characters in.
	 * @param {keyof typeof FILES} file
	 * @param {string} text
	 * @param {number} [delta]
	 */
	function at(file, text, delta = 0) {
		const before = FILES[file].slice(0, FILES[file].indexOf(text) + delta).split('\n');
		return {
			file: path.join(workspace, file),
			line: before.length,
			offset: /** @type {string} */ (before.at(-1)).length + 1,
		};
	}

	/**
	 * Each span as `file:line:offset` and the source text it covers, sorted.
	 * @param {Array<{ file: string, start: { line: number, offset: number }, end: { line: number, offset: number } }>} spans
	 */
	function located(spans) {
		return spans
			.map(({ file, start, end }) => {
				const name = path.relative(workspace, file).split(path.sep).join('/');
				const lines = FILES[/** @type {keyof typeof FILES} */ (name)].split('\n');
				expect(start.line).toBe(end.line);
				const text = lines[start.line - 1].slice(start.offset - 1, end.offset - 1);
				return `${name}:${start.line}:${start.offset} ${text}`;
			})
			.sort();
	}

	it('finds the file references of a `/// <reference path>` in a .tsrx file', async () => {
		for (const command of [FILE_REFERENCES_COMMAND, 'fileReferences']) {
			const response = await server.request(command, {
				file: path.join(workspace, 'src/Target.tsrx'),
			});
			expect(located(response.body.refs), command).toEqual([
				'src/Refs.tsrx:1:22 ./Target.tsrx',
				'src/Refs.tsrx:2:25 ./Target.tsrx',
				'src/refs.ts:1:22 ./Target.tsrx',
				'src/refs.ts:2:25 ./Target.tsrx',
			]);
		}
	}, 60_000);

	it('goes to the file a `/// <reference path>` in a .tsrx file names', async () => {
		for (const file of /** @type {const} */ (['src/Refs.tsrx', 'src/refs.ts'])) {
			const response = await server.request('definition', at(file, 'Target.tsrx'));
			expect(
				response.body.map((/** @type {any} */ location) =>
					path.relative(workspace, location.file).split(path.sep).join('/'),
				),
				file,
			).toEqual(['src/Target.tsrx']);
		}
	}, 60_000);

	it('updates a `/// <reference path>` in a .tsrx file when the file it names moves', async () => {
		const response = await server.request('getEditsForFileRename', {
			oldFilePath: path.join(workspace, 'src/Target.tsrx'),
			newFilePath: path.join(workspace, 'src/Moved.tsrx'),
		});
		expect(
			located(
				response.body.flatMap((/** @type {any} */ edit) =>
					edit.textChanges.map((/** @type {any} */ change) => ({ file: edit.fileName, ...change })),
				),
			),
		).toEqual([
			'src/Refs.tsrx:1:22 ./Target.tsrx',
			'src/Refs.tsrx:2:25 ./Target.tsrx',
			'src/refs.ts:1:22 ./Target.tsrx',
			'src/refs.ts:2:25 ./Target.tsrx',
		]);
	}, 60_000);
	it('completes the path of a `/// <reference path>` in a .tsrx file', async () => {
		for (const file of /** @type {const} */ (['src/Refs.tsrx', 'src/refs.ts'])) {
			const response = await server.request('completionInfo', at(file, 'Target.tsrx'));
			expect(
				response.body?.entries.map((/** @type {any} */ entry) => entry.name),
				file,
			).toContain('Target.tsrx');
		}
	}, 60_000);

	it('reports a `/// <reference path>` to a missing file at its path', async () => {
		const file = path.join(workspace, 'src/Missing.tsrx');
		const diagnostics = [
			...(await server.request('syntacticDiagnosticsSync', { file })).body,
			...(await server.request('semanticDiagnosticsSync', { file })).body,
		].filter((/** @type {any} */ diagnostic) => diagnostic.code === 6053);
		expect(located(diagnostics.map((/** @type {any} */ d) => ({ file, ...d })))).toEqual([
			'src/Missing.tsrx:1:22 ./Nowhere.tsrx',
		]);
	}, 60_000);
});
