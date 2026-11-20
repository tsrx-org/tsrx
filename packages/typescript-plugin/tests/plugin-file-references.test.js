import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FILE_REFERENCES_COMMAND } from '../src/plugin-file-references.js';
import { create_tsserver_workspace, start_tsserver } from './tsserver.js';

const FILES = {
	'tsconfig.json': JSON.stringify({
		compilerOptions: { jsx: 'preserve', module: 'esnext', moduleResolution: 'bundler', types: [] },
		tsrx: { compiler: '@tsrx/react' },
		include: ['src'],
	}),
	'src/App.tsrx': `export function App() {
	return <p>App</p>;
}
`,
	'src/format.ts': `export function format(value: string) {
	return value.trim();
}
`,
	'src/Lib.tsrx': `import { format } from './format';
import { App } from './App.tsrx';

export function Lib() @{
	const text = format(' x ');

	<div>
		{text}
		<App />
	</div>
}
`,
	'src/Page.tsrx': `import { Lib } from './Lib.tsrx';

export function Page() @{
	const load = () => import('./App.tsrx');

	<Lib />
}
`,
	'src/main.ts': `import { App } from './App.tsrx';
export { Lib } from './Lib.tsrx';

export const app = App;
`,
};

describe('tsserver plugin: Find File References for .tsrx files', () => {
	/** @type {string} */
	let workspace;
	/** @type {ReturnType<typeof start_tsserver>} */
	let server;

	beforeAll(async () => {
		const created = create_tsserver_workspace('tsrx-file-references-', FILES);
		workspace = created.workspace;
		server = start_tsserver(workspace, created.probe_location);
		// What VS Code does before it asks: the file is open in tsserver.
		for (const file of ['src/App.tsrx', 'src/Lib.tsrx', 'src/format.ts']) {
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
	 * Each reference `command` returns for `file`, as `file:line:offset` and the source
	 * text its span covers, sorted.
	 * @param {string} command
	 * @param {string} file
	 */
	async function references(command, file) {
		const response = await server.request(command, { file: path.join(workspace, file) });
		if (!response.success) return response.message;
		expect(response.body.symbolName).toBe(`"${path.join(workspace, file)}"`);
		return response.body.refs
			.map((/** @type {any} */ ref) => {
				const name = path.relative(workspace, ref.file);
				const lines = FILES[/** @type {keyof typeof FILES} */ (name)].split('\n');
				expect(ref.start.line).toBe(ref.end.line);
				const text = lines[ref.start.line - 1].slice(ref.start.offset - 1, ref.end.offset - 1);
				return `${name}:${ref.start.line}:${ref.start.offset} ${text}`;
			})
			.sort();
	}

	it(`answers ${FILE_REFERENCES_COMMAND} with the importers of a .tsrx file, at their source positions`, async () => {
		expect(await references(FILE_REFERENCES_COMMAND, 'src/App.tsrx')).toEqual([
			'src/Lib.tsrx:2:22 ./App.tsrx',
			'src/Page.tsrx:4:29 ./App.tsrx',
			'src/main.ts:1:22 ./App.tsrx',
		]);
		expect(await references(FILE_REFERENCES_COMMAND, 'src/Lib.tsrx')).toEqual([
			'src/Page.tsrx:1:22 ./Lib.tsrx',
			'src/main.ts:2:22 ./Lib.tsrx',
		]);
	}, 60_000);

	it('answers the same as tsserver itself, which maps .tsrx importers of a .ts file too', async () => {
		for (const file of ['src/App.tsrx', 'src/Lib.tsrx', 'src/format.ts']) {
			expect(await references(FILE_REFERENCES_COMMAND, file)).toEqual(
				await references('fileReferences', file),
			);
		}
		expect(await references(FILE_REFERENCES_COMMAND, 'src/format.ts')).toEqual([
			'src/Lib.tsrx:1:25 ./format',
		]);
	}, 60_000);

	it('finds no references to a file nothing imports', async () => {
		const page = path.join(workspace, 'src/Page.tsrx');
		await server.request('open', {
			file: page,
			fileContent: FILES['src/Page.tsrx'],
			projectRootPath: workspace,
		});
		expect(await references(FILE_REFERENCES_COMMAND, 'src/Page.tsrx')).toEqual([]);
	}, 60_000);
});
