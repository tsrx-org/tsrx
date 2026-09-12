import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root_dir = path.resolve(dirname, '../../..');
const tsrx_tsc_path = path.join(root_dir, 'packages', 'typescript-plugin', 'src', 'tsc.js');
const hono_package_dir = path.join(root_dir, 'packages', 'tsrx-hono');
const TYPE_MESSAGE = 'Hono JSX DOM components must render synchronously';

/** @type {string} */
let workspace;

/** @param {string} relative_path @param {string} source */
function write(relative_path, source) {
	const file_name = path.join(workspace, relative_path);
	fs.mkdirSync(path.dirname(file_name), { recursive: true });
	fs.writeFileSync(file_name, source);
}

/** @param {'@tsrx/hono' | '@tsrx/hono/dom'} compiler */
function configure_workspace(compiler) {
	write(
		'tsconfig.json',
		JSON.stringify(
			{
				compilerOptions: {
					jsx: 'preserve',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					target: 'ESNext',
					strict: true,
					skipLibCheck: true,
					noEmit: true,
				},
				tsrx: { compiler },
				include: ['src/**/*'],
			},
			null,
			2,
		) + '\n',
	);
	const scope_dir = path.join(workspace, 'node_modules', '@tsrx');
	fs.mkdirSync(scope_dir, { recursive: true });
	fs.symlinkSync(hono_package_dir, path.join(scope_dir, 'hono'), 'dir');
}

function run_tsrx_tsc() {
	const result = spawnSync(
		process.execPath,
		[tsrx_tsc_path, '--pretty', 'false', '-p', 'tsconfig.json'],
		{
			cwd: workspace,
			encoding: 'utf8',
		},
	);
	return { ...result, output: `${result.stdout}${result.stderr}` };
}

beforeEach(() => {
	workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-hono-diagnostics-'));
});

afterEach(() => {
	fs.rmSync(workspace, { recursive: true, force: true });
});

describe('tsrx-tsc Hono diagnostics', () => {
	it('reports imported and inferred definite Promise components through the declared DOM entry', () => {
		configure_workspace('@tsrx/hono/dom');
		write(
			'src/components.ts',
			`export function ImportedAsync(): Promise<string> {
	return Promise.resolve('async');
}
`,
		);
		write(
			'src/App.tsrx',
			`import { ImportedAsync } from './components';
		function InferredAsync() { return Promise.resolve('inferred'); }
		export function App() {
			return <><ImportedAsync /><InferredAsync /></>;
		}
`,
		);

		const result = run_tsrx_tsc();
		const hono_lines = result.output.split('\n').filter((line) => line.includes(TYPE_MESSAGE));

		expect(result.status).not.toBe(0);
		expect(hono_lines).toHaveLength(2);
		expect(hono_lines.every((line) => line.includes('src/App.tsrx('))).toBe(true);
	});

	it('does not apply the DOM Promise policy through the server entry', () => {
		configure_workspace('@tsrx/hono');
		write(
			'src/App.tsrx',
			`function InferredAsync() { return Promise.resolve('server'); }
		export function App() { return <InferredAsync />; }
`,
		);

		const result = run_tsrx_tsc();

		expect(result.output).not.toContain(TYPE_MESSAGE);
	});
});
