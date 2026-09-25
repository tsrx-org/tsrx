/** @import { ParseOptions } from '../../types/index' */

import { Worker } from 'node:worker_threads';

const PARSER_URL = new URL('../../src/index.js', import.meta.url).href;
const DEFAULT_TIMEOUT_MS = 10_000;
// A runaway parse that allocates fails the worker with an out-of-memory error
// instead of growing the test process.
const WORKER_HEAP_LIMIT_MB = 512;

// Parses each input in turn and posts its outcome as soon as it has one. A
// parse runs synchronously, so a test's own timeout cannot interrupt one that
// never returns; the worker can be terminated instead.
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
import(workerData.parser).then(({ parseModule }) => {
	parentPort.postMessage({ ready: true });
	for (const { source, options } of workerData.inputs) {
		// A fresh errors array per parse: inputs may share one options object.
		const parse_options = options && { ...options, errors: [] };
		try {
			const ast = parseModule(source, 'App.tsrx', parse_options);
			const errors = parse_options?.collect || parse_options?.loose ? parse_options.errors : undefined;
			const outcome = workerData.details
				? { ok: true, errors: errors?.map((e) => ({ message: e.message, pos: e.pos, end: e.end })), ast }
				: { ok: true, errors: errors?.map((e) => e.message) };
			parentPort.postMessage({ outcome });
		} catch (error) {
			parentPort.postMessage({ outcome: { ok: false, message: String(error?.message), pos: error?.pos } });
		}
	}
});
`;

/**
 * @typedef {{ ok: true, errors: string[] | undefined } | { ok: false, message: string, pos: number | undefined }} ParseOutcome
 * @typedef {{ message: string, pos: number | undefined, end: number | undefined }} CollectedError
 * @typedef {{ ok: true, errors: CollectedError[] | undefined, ast: import('estree').Program } | { ok: false, message: string, pos: number | undefined }} DetailedParseOutcome
 */

/**
 * Parse each input with `parseModule` in a worker thread, failing as soon as
 * one parse runs longer than `timeout` instead of stalling the test run.
 * Collected `errors` are returned by message; a thrown error by its message and
 * position.
 *
 * @param {Array<{ source: string, options?: ParseOptions }>} inputs
 * @param {{ timeout?: number }} [settings]
 * @returns {Promise<ParseOutcome[]>}
 */
export function parse_in_worker(inputs, settings) {
	return /** @type {Promise<ParseOutcome[]>} */ (run_parse_worker(inputs, false, settings));
}

/**
 * Like `parse_in_worker`, but a parse that returns also gives its AST, and each
 * collected error its position.
 *
 * @param {Array<{ source: string, options?: ParseOptions }>} inputs
 * @param {{ timeout?: number }} [settings]
 * @returns {Promise<DetailedParseOutcome[]>}
 */
export function parse_in_worker_with_ast(inputs, settings) {
	return /** @type {Promise<DetailedParseOutcome[]>} */ (run_parse_worker(inputs, true, settings));
}

/**
 * @param {Array<{ source: string, options?: ParseOptions }>} inputs
 * @param {boolean} details
 * @param {{ timeout?: number }} [settings]
 * @returns {Promise<Array<ParseOutcome | DetailedParseOutcome>>}
 */
function run_parse_worker(inputs, details, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
	return new Promise((resolve, reject) => {
		const worker = new Worker(WORKER_SOURCE, {
			eval: true,
			workerData: { parser: PARSER_URL, inputs, details },
			resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_LIMIT_MB },
		});
		/** @type {Array<ParseOutcome | DetailedParseOutcome>} */
		const outcomes = [];
		let ready = false;
		let settled = false;
		/** @type {ReturnType<typeof setTimeout> | undefined} */
		let timer;

		/** @param {() => void} settle */
		const finish = (settle) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			void worker.terminate();
			settle();
		};
		const restart_timer = () => {
			clearTimeout(timer);
			timer = setTimeout(() => {
				const stuck = inputs[outcomes.length];
				const message = ready
					? `Parsing ${JSON.stringify(stuck.source)} with ${JSON.stringify(stuck.options)} ` +
						`did not return within ${timeout} ms.`
					: `The parse worker did not load the parser within ${timeout} ms.`;
				finish(() => reject(new Error(message)));
			}, timeout);
		};

		worker.on(
			'message',
			/** @param {{ ready?: true, outcome?: ParseOutcome | DetailedParseOutcome }} message */
			(message) => {
				if (message.ready) {
					ready = true;
				}
				if (message.outcome) {
					outcomes.push(message.outcome);
				}
				if (outcomes.length === inputs.length) {
					finish(() => resolve(outcomes));
					return;
				}
				restart_timer();
			},
		);
		worker.on('error', (error) => finish(() => reject(error)));
		worker.on('exit', (code) =>
			finish(() =>
				reject(new Error(`The parse worker exited with code ${code} before it finished.`)),
			),
		);
		restart_timer();
	});
}
