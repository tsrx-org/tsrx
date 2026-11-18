import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tsrxSolid } from '../src/index.js';

// #1291: babel-preset-solid's hydratable SSR output merges the props of a
// host element with a spread in an arrow, which moves this `yield`; the DOM
// output and the non-hydratable SSR output don't.

const source = `export function* field(bag: any) {\n\treturn <input {...bag} title={yield 1} />;\n}`;

/**
 * Runs the plugin's `.tsrx` load hook, which compiles the file and runs
 * babel-preset-solid with `options.solid`.
 *
 * @param {import('../types/index.js').TsrxSolidBunPluginOptions} options
 * @returns {Promise<{ contents: string } | undefined>}
 */
async function load(options) {
	const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-solid-ssr-'));
	try {
		const file_path = path.join(dir, 'Field.tsrx');
		await writeFile(file_path, source);
		/** @type {Function | undefined} */
		let on_load;
		const build = {
			config: { entrypoints: [], plugins: [] },
			onResolve: () => build,
			/**
			 * @param {{ namespace?: string }} hook_options
			 * @param {Function} callback
			 */
			onLoad(hook_options, callback) {
				if (hook_options.namespace === 'file') on_load = callback;
				return build;
			},
		};
		tsrxSolid(options).setup(
			/** @type {import('bun').PluginBuilder} */ (/** @type {unknown} */ (build)),
		);
		return await on_load?.({
			path: file_path,
			namespace: 'file',
			importer: '',
			kind: 'entry-point',
		});
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

describe('@tsrx/bun-plugin-solid server builds', () => {
	it('reports TSRX2034 with `generate: ssr` and `hydratable`', async () => {
		await expect(load({ solid: { generate: 'ssr', hydratable: true } })).rejects.toThrow(
			expect.objectContaining({ code: 'TSRX2034', pos: source.indexOf('yield') }),
		);
	});

	it('keeps the DOM output rules otherwise', async () => {
		for (const solid of [undefined, { generate: 'dom' }, { generate: 'ssr' }]) {
			const result = await load({ solid });
			expect(result?.contents).toContain('yield 1');
		}
	});
});
