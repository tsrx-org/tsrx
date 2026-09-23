/**
 * Vite dev-server support for web workers whose entry is a `.tsrx` module.
 *
 * In dev, Vite starts a worker from `<path>?worker_file&type=<type>`, a URL it
 * builds from the bare file path. Two things then keep a `.tsrx` entry from
 * compiling:
 *
 * - Vite's transform middleware only takes requests that end in an extension it
 *   knows as JavaScript or that carry an `import` query. Vite adds that query to
 *   every `.tsrx` import it rewrites, but not to a worker URL, so the request
 *   falls through to the static file server and the browser receives raw TSRX
 *   source. {@link createWorkerEntryMiddleware} marks the request as an import.
 * - The module id keeps the query, so host plugins that match `.tsrx` ids
 *   exactly skip it. {@link stripWorkerEntryQuery} recovers the file path while
 *   leaving every other query alone: `?worker`, `?raw` and `?url` ids load
 *   something other than the module source and must stay unmatched.
 *
 * Builds are unaffected, because Vite bundles each worker from its bare path.
 */

const WORKER_ENTRY_QUERY_PATTERN = /\?worker_file&type=\w+$/;

/**
 * Remove the query Vite appends to a dev worker entry. Any other id is returned
 * unchanged.
 *
 * @param {string} id
 * @returns {string}
 */
export function stripWorkerEntryQuery(id) {
	return id.replace(WORKER_ENTRY_QUERY_PATTERN, '');
}

/**
 * Connect middleware that routes `.tsrx` worker entry requests through Vite's
 * transform middleware. Register it directly from `configureServer`, not from
 * a returned post hook, so it runs ahead of Vite's own middlewares.
 *
 * @param {(path: string) => boolean} isTsrxSource tests a request path with the
 *   query removed
 * @returns {(req: { url?: string }, res: unknown, next: () => void) => void}
 */
export function createWorkerEntryMiddleware(isTsrxSource) {
	return function tsrx_worker_entry(req, _res, next) {
		const url = req.url;
		if (url !== undefined) {
			const path = stripWorkerEntryQuery(url);
			// Vite strips the `import` query again before it resolves the url,
			// so the module id matches the one the worker plugin generated.
			if (path !== url && isTsrxSource(path)) req.url = url + '&import';
		}
		next();
	};
}
