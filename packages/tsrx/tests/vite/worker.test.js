import { describe, expect, it } from 'vitest';
import { createWorkerEntryMiddleware, stripWorkerEntryQuery } from '../../src/vite/worker.js';

/** @param {string} path */
const is_tsrx = (path) => path.endsWith('.tsrx');

/**
 * @param {(path: string) => boolean} is_tsrx_source
 * @param {string | undefined} url
 */
function run_middleware(is_tsrx_source, url) {
	const req = { url };
	let calls = 0;
	createWorkerEntryMiddleware(is_tsrx_source)(req, {}, () => {
		calls++;
	});
	return { url: req.url, calls };
}

describe('stripWorkerEntryQuery', () => {
	it('removes the query vite adds to a dev worker entry', () => {
		expect(stripWorkerEntryQuery('/app/Worker.tsrx?worker_file&type=module')).toBe(
			'/app/Worker.tsrx',
		);
		expect(stripWorkerEntryQuery('/app/Worker.tsrx?worker_file&type=classic')).toBe(
			'/app/Worker.tsrx',
		);
		expect(stripWorkerEntryQuery('/app/Worker.tsrx.tsx?worker_file&type=module')).toBe(
			'/app/Worker.tsrx.tsx',
		);
	});

	it('leaves every other id unchanged', () => {
		for (const id of [
			'/app/App.tsrx',
			'/app/Worker.tsrx?worker',
			'/app/Worker.tsrx?sharedworker',
			'/app/Worker.tsrx?worker&inline',
			'/app/Worker.tsrx?worker&url',
			'/app/App.tsrx?raw',
			'/app/App.tsrx?url',
			'\0/app/App.tsrx?tsrx-css&lang.css',
		]) {
			expect(stripWorkerEntryQuery(id)).toBe(id);
		}
	});
});

describe('createWorkerEntryMiddleware', () => {
	it('marks a tsrx worker entry request as an import', () => {
		expect(run_middleware(is_tsrx, '/src/Worker.tsrx?worker_file&type=module')).toEqual({
			url: '/src/Worker.tsrx?worker_file&type=module&import',
			calls: 1,
		});
	});

	it('tests the request path without the worker query', () => {
		/** @type {string[]} */
		const paths = [];
		run_middleware((path) => {
			paths.push(path);
			return true;
		}, '/src/Worker.tsrx?worker_file&type=module');

		expect(paths).toEqual(['/src/Worker.tsrx']);
	});

	it('leaves other requests alone', () => {
		for (const url of [
			'/src/Worker.ts?worker_file&type=module',
			'/src/Worker.tsrx?worker&import',
			'/src/App.tsrx?import',
			'/src/App.tsrx',
			'/',
		]) {
			expect(run_middleware(is_tsrx, url)).toEqual({ url, calls: 1 });
		}

		expect(run_middleware(is_tsrx, undefined)).toEqual({ url: undefined, calls: 1 });
	});
});
