import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { build, createServer } from 'vite';

const RESTART_TIMEOUT_MS = 10_000;

/**
 * The same platform selection in an ordinary module, which Vite's `define`
 * specializes, and in a `.tsrx` module, which the TSRX compiler specializes.
 */
const SELECTION = `export const selected = (() => {
	if (import.meta.env.platform.web) {
		return 'web';
	} else {
		return 'ios';
	}
})();
`;

/**
 * @typedef {{ module: string, tsrx: string }} PlatformSelection
 */

/**
 * Serve a project whose platform comes from a base tsconfig outside the Vite
 * root (`app/tsconfig.json` extends `../tsconfig.base.json`), switch the base
 * from `web` to `ios` on disk, and report what an ordinary module and a
 * `.tsrx` module select before and after the dev server handled the change.
 * The change reaches the server through its real file watcher.
 *
 * As with the other fixtures, the files are written on the fly and removed
 * afterwards, and `root` has to sit inside the package under test so imports
 * resolve against its `node_modules`.
 *
 * @param {{ root: string, plugins: import('vite').PluginOption[] }} options
 * @returns {Promise<{ before: PlatformSelection, after: PlatformSelection }>}
 */
export async function servePlatformChangeFixture({ root, plugins }) {
	const cache_dir = mkdtempSync(join(tmpdir(), 'tsrx-platform-'));
	const app = join(root, 'app');
	const base = join(root, 'tsconfig.base.json');
	/** @type {import('vite').ViteDevServer | undefined} */
	let server;

	mkdirSync(app, { recursive: true });
	writeFileSync(base, JSON.stringify({ tsrx: { platform: 'web' } }));
	writeFileSync(join(app, 'tsconfig.json'), JSON.stringify({ extends: '../tsconfig.base.json' }));
	writeFileSync(join(app, 'selection.ts'), SELECTION);
	writeFileSync(join(app, 'selection.tsrx'), SELECTION);

	try {
		server = await createServer({
			root: app,
			configFile: false,
			cacheDir: cache_dir,
			logLevel: 'silent',
			plugins,
			optimizeDeps: { noDiscovery: true, include: [] },
			server: { middlewareMode: true },
		});
		const before = await load_selection(server);

		const dev_server = server;
		const restarted = new Promise((resolve) => {
			const restart = dev_server.restart.bind(dev_server);
			dev_server.restart = (force_optimize) => {
				const restarting = restart(force_optimize);
				restarting.then(() => resolve(true));
				return restarting;
			};
		});
		// The watcher may still be setting up the base file, so write it again
		// until the restart arrives.
		const deadline = Date.now() + RESTART_TIMEOUT_MS;
		for (let attempt = 0; ; attempt++) {
			writeFileSync(base, JSON.stringify({ tsrx: { platform: 'ios' } }) + ' '.repeat(attempt));
			if (await Promise.race([restarted, sleep(500).then(() => false)])) break;
			if (Date.now() > deadline) throw new Error('The dev server did not restart');
		}

		return { before, after: await load_selection(server) };
	} finally {
		await server?.close();
		rmSync(cache_dir, { recursive: true, force: true });
		rmSync(root, { recursive: true, force: true });
	}
}

/**
 * Build `source` as an ordinary `.ts` server entry of a project that
 * configures no platform, and return the built code or the build error.
 *
 * @param {{ root: string, plugins: import('vite').PluginOption[], source: string }} options
 * @returns {Promise<{ code: string } | { error: string }>}
 */
export async function buildWithoutPlatformFixture({ root, plugins, source }) {
	mkdirSync(root, { recursive: true });
	writeFileSync(join(root, 'tsconfig.json'), '{}');
	writeFileSync(join(root, 'helper.ts'), source);

	try {
		const result = await build({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins,
			build: { ssr: join(root, 'helper.ts'), write: false, minify: false },
		});
		const outputs = (Array.isArray(result) ? result : [result]).flatMap((entry) =>
			'output' in entry ? entry.output : [],
		);
		return {
			code: outputs.map((output) => (output.type === 'chunk' ? output.code : '')).join('\n'),
		};
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

/**
 * @param {import('vite').ViteDevServer} server
 * @returns {Promise<PlatformSelection>}
 */
async function load_selection(server) {
	const [module, tsrx] = await Promise.all([
		server.ssrLoadModule('/selection.ts'),
		server.ssrLoadModule('/selection.tsrx'),
	]);
	return { module: module.selected, tsrx: tsrx.selected };
}
