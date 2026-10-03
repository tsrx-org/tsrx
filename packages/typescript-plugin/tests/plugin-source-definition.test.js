import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SOURCE_DEFINITION_COMMAND } from '../src/plugin-source-definition.js';
import { create_tsserver_workspace, start_tsserver } from './tsserver.js';

const FILES = {
	'tsconfig.json': JSON.stringify({
		compilerOptions: { jsx: 'preserve', module: 'esnext', moduleResolution: 'bundler', types: [] },
		tsrx: { compiler: '@tsrx/react' },
		include: ['src'],
	}),
	'node_modules/greeting/package.json': JSON.stringify({
		name: 'greeting',
		type: 'module',
		main: 'index.js',
		types: 'index.d.ts',
	}),
	'node_modules/greeting/index.js': `export function greet(name) {
	return 'Hello ' + name;
}
`,
	'node_modules/greeting/index.d.ts': `export declare function greet(name: string): string;
`,
	'src/App.tsrx': `export function App() {
	return <p>App</p>;
}
`,
	'src/Lib.tsrx': `import { greet } from 'greeting';
import { App } from './App.tsrx';

export function Lib() @{
	const text = greet('x');

	<div>
		{text}
		<App />
	</div>
}
`,
	'src/main.ts': `import { greet } from 'greeting';

export const text = greet('x');
`,
};

describe('tsserver plugin: Go to Source Definition in .tsrx files', () => {
	/** @type {string} */
	let workspace;
	/** @type {ReturnType<typeof start_tsserver>} */
	let server;

	beforeAll(async () => {
		const created = create_tsserver_workspace('tsrx-source-definition-', FILES);
		workspace = created.workspace;
		server = start_tsserver(workspace, created.probe_location);
		for (const file of ['src/main.ts', 'src/Lib.tsrx']) {
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
	 * The `file:line:offset` of each location `command` returns for the position of
	 * `needle` (plus `skip` characters) in `file`.
	 * @param {string} command
	 * @param {string} file
	 * @param {string} needle
	 * @param {number} skip
	 */
	async function locations(command, file, needle, skip) {
		const text = FILES[/** @type {keyof typeof FILES} */ (file)];
		const before = text.slice(0, text.indexOf(needle) + skip).split('\n');
		const response = await server.request(command, {
			file: path.join(workspace, file),
			line: before.length,
			offset: before[before.length - 1].length + 1,
		});
		if (!response.success) return response.message;
		return response.body.map(
			(/** @type {any} */ span) =>
				`${path.relative(workspace, span.file)}:${span.start.line}:${span.start.offset}`,
		);
	}

	it('finds the JavaScript behind a .d.ts file from a .tsrx file', async () => {
		// The helper project tsserver builds for this reads `Lib.tsrx` through the plugin
		// too; without that, the shared document registry failed an assertion.
		expect(await locations('definition', 'src/Lib.tsrx', "greet('x')", 1)).toEqual([
			'node_modules/greeting/index.d.ts:1:25',
		]);
		expect(await locations('findSourceDefinition', 'src/Lib.tsrx', "greet('x')", 1)).toEqual([
			'node_modules/greeting/index.js:1:17',
		]);
		// The same as from a `.ts` file.
		expect(await locations('findSourceDefinition', 'src/main.ts', "greet('x')", 1)).toEqual([
			'node_modules/greeting/index.js:1:17',
		]);
	}, 60_000);

	it('keeps a .tsrx component as its own source definition', async () => {
		expect(await locations('findSourceDefinition', 'src/Lib.tsrx', '<App', 2)).toEqual([
			'src/App.tsrx:1:17',
		]);
	}, 60_000);

	it(`answers ${SOURCE_DEFINITION_COMMAND}, the request VS Code lets the TSRX extension send`, async () => {
		expect(await locations(SOURCE_DEFINITION_COMMAND, 'src/Lib.tsrx', "greet('x')", 1)).toEqual([
			'node_modules/greeting/index.js:1:17',
		]);
	}, 60_000);
});
