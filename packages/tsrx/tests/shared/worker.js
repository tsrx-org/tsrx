import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createServer } from 'vite';

const WORKER_URL_PATTERN = /new Worker\(\s*"([^"]+)"/;
const UPDATE_TIMEOUT_MS = 10_000;

/**
 * @typedef {{ status: number, contentType: string | null, code: string }} WorkerEntryResponse
 */

/**
 * Serve a generated fixture from a Vite dev server and request a web worker
 * entry the way a browser does: import the `?worker` wrapper, then fetch the
 * url it starts the worker from with a worker fetch destination.
 *
 * With `update`, the entry is then rewritten and fetched again once the dev
 * server has handled the change, which catches a hot update that leaves the
 * worker entry's old transform cached.
 *
 * As with the dep-scan fixtures, the files are written on the fly and removed
 * afterwards, and `root` has to sit inside the package under test so imports
 * resolve against its `node_modules`.
 *
 * @param {{
 *   root: string,
 *   files: Record<string, string>,
 *   entry: string,
 *   plugins: import('vite').PluginOption[],
 *   update?: string,
 * }} options
 * @returns {Promise<{
 *   url: string,
 *   initial: WorkerEntryResponse,
 *   updated?: WorkerEntryResponse,
 * }>}
 */
export async function serveWorkerFixture({ root, files, entry, plugins, update }) {
	const cache_dir = mkdtempSync(join(tmpdir(), 'tsrx-worker-'));
	/** @type {import('vite').ViteDevServer | undefined} */
	let server;

	mkdirSync(root, { recursive: true });
	for (const [name, source] of Object.entries(files)) {
		writeFileSync(join(root, name), source);
	}

	try {
		server = await createServer({
			root,
			configFile: false,
			cacheDir: cache_dir,
			logLevel: 'silent',
			plugins,
			optimizeDeps: { noDiscovery: true, include: [] },
			server: { host: '127.0.0.1', port: 0 },
		});
		await server.listen();

		const base = server.resolvedUrls?.local[0];
		if (base === undefined) throw new Error('The dev server did not report a local url');

		const wrapper = await request(base, `/${entry}?worker&import`, 'script');
		const url = WORKER_URL_PATTERN.exec(wrapper.code)?.[1];
		if (url === undefined) {
			throw new Error(`No worker url in the ${entry} wrapper:\n${wrapper.code}`);
		}

		const initial = await request(base, url, 'worker');
		if (update === undefined) return { url, initial };

		const file = join(root, entry);
		writeFileSync(file, update);
		// Report the change rather than wait on the file watcher, then poll
		// until the dev server has finished handling it.
		server.watcher.emit('change', file);

		let updated = await request(base, url, 'worker');
		const deadline = Date.now() + UPDATE_TIMEOUT_MS;
		while (updated.code === initial.code && Date.now() < deadline) {
			await sleep(50);
			updated = await request(base, url, 'worker');
		}

		return { url, initial, updated };
	} finally {
		await server?.close();
		rmSync(cache_dir, { recursive: true, force: true });
		rmSync(root, { recursive: true, force: true });
	}
}

/**
 * @param {string} base
 * @param {string} path
 * @param {'script' | 'worker'} destination
 * @returns {Promise<WorkerEntryResponse>}
 */
async function request(base, path, destination) {
	const response = await fetch(new URL(path, base), {
		headers: { 'sec-fetch-dest': destination },
	});

	return {
		status: response.status,
		contentType: response.headers.get('content-type'),
		code: await response.text(),
	};
}
