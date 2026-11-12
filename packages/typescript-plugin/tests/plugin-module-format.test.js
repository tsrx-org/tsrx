import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { create_tsserver_workspace, start_tsserver } from './tsserver.js';

const TS1470 =
	"The 'import.meta' meta-property is not allowed in files which will build into CommonJS output.";

/** A `.tsrx` file without imports, and one whose JSX imports nothing either (`jsx: preserve`). */
const FILES = {
	'tsconfig.json': JSON.stringify({
		compilerOptions: {
			module: 'NodeNext',
			moduleResolution: 'NodeNext',
			jsx: 'preserve',
			allowImportingTsExtensions: true,
			noEmit: true,
			target: 'ESNext',
			types: [],
		},
		tsrx: { compiler: '@tsrx/react' },
		include: ['src'],
	}),
	'src/Meta.tsrx': 'export const url = import.meta.url;\n',
	'src/Component.tsrx':
		'console.log(import.meta.url);\n\nexport default function Component() @{\n\t<div>{String(import.meta.url)}</div>\n}\n',
};

/** @type {Array<() => void>} */
const cleanups = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

/**
 * The TS1470 diagnostics tsserver reports for each `.tsrx` file of a package
 * whose `package.json` has `type`, as `[file, line, offset]`.
 * @param {string} type
 */
async function import_meta_errors(type) {
	const { workspace, probe_location } = create_tsserver_workspace('tsrx-module-format-', {
		...FILES,
		'package.json': JSON.stringify({ type }),
	});
	const server = start_tsserver(workspace, probe_location);
	cleanups.push(() => {
		server.stop();
		fs.rmSync(workspace, { recursive: true, force: true });
	});
	/** @type {Array<[string, number, number]>} */
	const errors = [];
	for (const file of ['src/Meta.tsrx', 'src/Component.tsrx']) {
		const full = path.join(workspace, file);
		await server.request('open', {
			file: full,
			fileContent: fs.readFileSync(full, 'utf8'),
			projectRootPath: workspace,
		});
		const response = await server.request('semanticDiagnosticsSync', { file: full });
		for (const diagnostic of response.body ?? []) {
			if (diagnostic.code === 1470) {
				expect(diagnostic.text).toBe(TS1470);
				errors.push([file, diagnostic.start.line, diagnostic.start.offset]);
			}
		}
	}
	return errors;
}

describe('tsserver plugin: module format of .tsrx files (#163)', () => {
	it('treats .tsrx files of a "type": "module" package as ESM under NodeNext', async () => {
		expect(await import_meta_errors('module')).toEqual([]);
	}, 60_000);

	it('keeps them CommonJS in a "type": "commonjs" package', async () => {
		expect(await import_meta_errors('commonjs')).toEqual([
			['src/Meta.tsrx', 1, 20],
			['src/Component.tsrx', 1, 13],
			['src/Component.tsrx', 4, 15],
		]);
	}, 60_000);
});
