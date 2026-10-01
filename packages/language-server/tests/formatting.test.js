import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { format_tsrx } from '../src/formatting.js';
import { add_dev_command, setup_message } from '../src/formattingHandler.js';

const repo_root = fileURLToPath(new URL('../../../', import.meta.url));
const prettier_package = fs.realpathSync(path.join(repo_root, 'node_modules', 'prettier'));
const plugin_package = fs.realpathSync(path.join(repo_root, 'packages', 'prettier-plugin'));

const MESSY = `import { useState } from "react";
export function App() @{
      const [count,setCount]=useState(0);
  <button   onClick={() => setCount(count+1)}>{count}</button>
}
`;

/** @type {string[]} */
const projects = [];
afterEach(() => {
	for (const project of projects.splice(0)) fs.rmSync(project, { recursive: true, force: true });
});

/**
 * A project with `src/App.tsrx`, the given files, and links to the repository's
 * `prettier` and `@tsrx/prettier-plugin` for the packages named in `install`.
 * @param {{ install?: Array<'prettier' | '@tsrx/prettier-plugin'>, files?: Record<string, string> }} [options]
 */
function project({ install = ['prettier', '@tsrx/prettier-plugin'], files = {} } = {}) {
	const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-format-')));
	projects.push(dir);
	for (const [name, content] of Object.entries({ 'src/App.tsrx': MESSY, ...files })) {
		fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
		fs.writeFileSync(path.join(dir, name), content);
	}
	const links = { prettier: prettier_package, '@tsrx/prettier-plugin': plugin_package };
	for (const name of install) {
		const link = path.join(dir, 'node_modules', name);
		fs.mkdirSync(path.dirname(link), { recursive: true });
		fs.symlinkSync(links[name], link, 'junction');
	}
	return { dir, file_path: path.join(dir, 'src', 'App.tsrx') };
}

describe('formatting .tsrx files with the project Prettier', () => {
	it('adds the plugin itself and uses the editor indentation without a Prettier config', async () => {
		const { file_path } = project();
		expect(await format_tsrx({ file_path, text: MESSY, insert_spaces: false })).toEqual({
			status: 'formatted',
			text: `import { useState } from "react";
export function App() @{
	const [count, setCount] = useState(0);
	<button onClick={() => setCount(count + 1)}>{count}</button>
}
`,
		});
	});

	it('follows only the Prettier config, as the prettier command does, with the plugin listed or not', async () => {
		const expected = `import { useState } from 'react';
export function App() @{
    const [count, setCount] = useState(0);
    <button onClick={() => setCount(count + 1)}>{count}</button>
}
`;
		for (const plugins of [undefined, ['@tsrx/prettier-plugin']]) {
			const { file_path } = project({
				files: { '.prettierrc': JSON.stringify({ singleQuote: true, tabWidth: 4, plugins }) },
			});
			expect(await format_tsrx({ file_path, text: MESSY, insert_spaces: false })).toEqual({
				status: 'formatted',
				text: expected,
			});
		}
	});

	it('finds a plugin the Prettier config names from the file, in a monorepo package', () => {
		// Prettier at the root, the plugin only in the package, and the config naming it.
		// Prettier would resolve the name from the process's working directory, which for
		// a language server is not the project, so this runs from the temp folder.
		const { dir } = project({ install: ['prettier'] });
		const pkg = path.join(dir, 'packages', 'app');
		fs.mkdirSync(path.join(pkg, 'node_modules', '@tsrx'), { recursive: true });
		fs.symlinkSync(
			plugin_package,
			path.join(pkg, 'node_modules', '@tsrx', 'prettier-plugin'),
			'junction',
		);
		fs.writeFileSync(
			path.join(pkg, '.prettierrc'),
			JSON.stringify({ plugins: ['@tsrx/prettier-plugin'] }),
		);
		const file_path = path.join(pkg, 'App.tsrx');
		fs.writeFileSync(file_path, MESSY);
		const module_url = pathToFileURL(
			fileURLToPath(new URL('../src/formatting.js', import.meta.url)),
		).href;
		const output = execFileSync(
			process.execPath,
			[
				'--input-type=module',
				'-e',
				`import { format_tsrx } from ${JSON.stringify(module_url)};
const result = await format_tsrx({ file_path: ${JSON.stringify(file_path)}, text: ${JSON.stringify(MESSY)} });
console.log(JSON.stringify({ status: result.status, error: result.error ? String(result.error.message) : undefined }));`,
			],
			{ cwd: os.tmpdir(), env: { ...process.env, NODE_PATH: '' }, encoding: 'utf8' },
		);
		expect(JSON.parse(output)).toEqual({ status: 'formatted' });
	});

	it('reads .editorconfig', async () => {
		const { file_path } = project({
			files: { '.editorconfig': '[*.tsrx]\nindent_style = space\nindent_size = 3\n' },
		});
		const result = await format_tsrx({ file_path, text: MESSY, insert_spaces: false });
		expect(result.status === 'formatted' && result.text.split('\n')[2]).toBe(
			'   const [count, setCount] = useState(0);',
		);
	});

	it('leaves files in the nearest .prettierignore alone', async () => {
		const { file_path } = project({ files: { '.prettierignore': 'src/App.tsrx\n' } });
		expect(await format_tsrx({ file_path, text: MESSY })).toEqual({ status: 'ignored' });
	});

	it('formats only the selected range (Format Selection, format on paste)', async () => {
		const { file_path } = project();
		const start = MESSY.indexOf('<button');
		const end = MESSY.indexOf('\n', start);
		expect(await format_tsrx({ file_path, text: MESSY, range: { start, end } })).toEqual({
			status: 'formatted',
			text: MESSY.replace(
				'<button   onClick={() => setCount(count+1)}>{count}</button>',
				'<button onClick={() => setCount(count + 1)}>{count}</button>',
			),
		});
	});

	it('reports a formatted file as unchanged', async () => {
		const { file_path } = project();
		const formatted = await format_tsrx({ file_path, text: MESSY, insert_spaces: false });
		const text = formatted.status === 'formatted' ? formatted.text : '';
		expect(await format_tsrx({ file_path, text, insert_spaces: false })).toEqual({
			status: 'unchanged',
		});
	});

	it('reports a file Prettier cannot parse', async () => {
		const { file_path } = project();
		const result = await format_tsrx({ file_path, text: 'export function A() @{ <div> }' });
		expect(result.status).toBe('failed');
	});

	it('names the packages the project is missing', async () => {
		expect(
			await format_tsrx({ file_path: project({ install: [] }).file_path, text: MESSY }),
		).toEqual({ status: 'missing', packages: ['prettier', '@tsrx/prettier-plugin'] });
		expect(
			await format_tsrx({ file_path: project({ install: ['prettier'] }).file_path, text: MESSY }),
		).toEqual({ status: 'missing', packages: ['@tsrx/prettier-plugin'] });
	});

	it('names a Prettier older than the plugin supports', async () => {
		const { dir, file_path } = project({ install: ['@tsrx/prettier-plugin'] });
		const old = path.join(dir, 'node_modules', 'prettier');
		fs.mkdirSync(old, { recursive: true });
		fs.writeFileSync(
			path.join(old, 'package.json'),
			JSON.stringify({ name: 'prettier', main: 'index.cjs' }),
		);
		fs.writeFileSync(path.join(old, 'index.cjs'), "module.exports = { version: '3.4.2' };\n");
		expect(await format_tsrx({ file_path, text: MESSY })).toEqual({
			status: 'unsupported',
			version: '3.4.2',
		});
	});
});

describe('what the editor shows when formatting needs setup', () => {
	it('says what to install', () => {
		expect(
			setup_message({ status: 'missing', packages: ['prettier', '@tsrx/prettier-plugin'] }),
		).toBe(
			'To format .tsrx files, TSRX needs prettier and @tsrx/prettier-plugin in this project. To install them, run: npm install -D prettier @tsrx/prettier-plugin',
		);
		expect(setup_message({ status: 'missing', packages: ['@tsrx/prettier-plugin'] })).toBe(
			'To format .tsrx files, TSRX needs @tsrx/prettier-plugin in this project. To install it, run: npm install -D @tsrx/prettier-plugin',
		);
		expect(setup_message({ status: 'unsupported', version: '3.4.2' })).toBe(
			'To format .tsrx files, TSRX needs Prettier 3.6.0 or newer for @tsrx/prettier-plugin. This project has Prettier 3.4.2.',
		);
		expect(setup_message({ status: 'failed', error: new Error('x') })).toBeUndefined();
	});

	it("uses the project's package manager in the install command", () => {
		const { dir, file_path } = project({ install: [] });
		expect(add_dev_command(file_path)).toBe('npm install -D');
		// The nearest lockfile decides, as in a pnpm workspace with a nested package.
		fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
		expect(add_dev_command(file_path)).toBe('pnpm add -D');
		fs.writeFileSync(path.join(dir, 'src', 'yarn.lock'), '');
		expect(add_dev_command(file_path)).toBe('yarn add -D');
		expect(
			setup_message({ status: 'missing', packages: ['@tsrx/prettier-plugin'] }, 'pnpm add -D'),
		).toBe(
			'To format .tsrx files, TSRX needs @tsrx/prettier-plugin in this project. To install it, run: pnpm add -D @tsrx/prettier-plugin',
		);
	});
});
