/**
 * Minimal LSP client for driving the native TypeScript 7 language server
 * (`tsc --lsp`) from tests: `Content-Length` framing over stdio, request /
 * notification helpers, and default answers for the server-to-client requests
 * the native server sends (dynamic registrations, configuration, progress).
 */

import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { native_tsc_path } from './fixture-utils.js';

/**
 * @typedef {{ id: string, method: string, registerOptions?: any }} Registration
 */

export class NativeLspClient {
	/** @type {import('node:child_process').ChildProcessWithoutNullStreams} */
	#process;
	#buffered = Buffer.alloc(0);
	#next_id = 1;
	/** @type {Map<number, { resolve: (value: any) => void, reject: (error: Error) => void }>} */
	#pending = new Map();
	/** @type {Registration[]} */
	registrations = [];
	/** @type {Array<(registration: Registration) => void>} */
	#registration_listeners = [];
	/** @type {string[]} */
	stderr = [];
	/** @type {Map<string, number>} */
	#versions = new Map();
	/** @type {Array<(method: string, params: any) => void>} */
	#notification_listeners = [];
	/**
	 * Answers to `workspace/configuration` by section (`js/ts`, `typescript`,
	 * `editor`, ...); sections without an answer get `null`.
	 * @type {Record<string, unknown>}
	 */
	configuration = {};

	/**
	 * @param {string} cwd
	 * @param {{ command?: string, args?: string[] }} [server] Another
	 *   stdio language server to drive with the same client, for example the
	 *   classic TSRX language server in benchmarks. Defaults to the native
	 *   TypeScript 7 server.
	 */
	constructor(cwd, server = {}) {
		this.cwd = cwd;
		// `--stdio` is what vscode-languageclient appends for its stdio transport.
		const command = server.command ?? native_tsc_path();
		this.#process = spawn(command, server.args ?? ['--lsp', '--stdio'], {
			cwd,
			env: { ...process.env, TSRX_DEBUG: undefined },
		});
		this.#process.on('exit', (code, signal) => {
			const error = new Error(
				`Language server ${command} exited (code ${code}, signal ${signal}): ${this.stderr.join('')}`,
			);
			for (const pending of this.#pending.values()) pending.reject(error);
			this.#pending.clear();
		});
		this.#process.stdout.on('data', (chunk) => {
			this.#buffered = Buffer.concat([this.#buffered, chunk]);
			this.#read_messages();
		});
		this.#process.stderr.on('data', (chunk) => {
			this.stderr.push(String(chunk));
		});
	}

	#read_messages() {
		while (true) {
			const header_end = this.#buffered.indexOf('\r\n\r\n');
			if (header_end < 0) return;
			const header = this.#buffered.subarray(0, header_end).toString('ascii');
			const match = /Content-Length:\s*(\d+)/i.exec(header);
			if (!match) throw new Error(`Bad LSP header: ${header}`);
			const start = header_end + 4;
			const end = start + Number(match[1]);
			if (this.#buffered.length < end) return;
			const message = JSON.parse(this.#buffered.subarray(start, end).toString('utf8'));
			this.#buffered = this.#buffered.subarray(end);
			this.#handle(message);
		}
	}

	/** @param {any} message */
	#handle(message) {
		if (message.id !== undefined && message.method === undefined) {
			const pending = this.#pending.get(message.id);
			if (!pending) return;
			this.#pending.delete(message.id);
			if (message.error) {
				pending.reject(
					Object.assign(new Error(`${message.error.message} (LSP error ${message.error.code})`), {
						code: message.error.code,
						data: message.error.data,
					}),
				);
			} else {
				pending.resolve(message.result);
			}
			return;
		}
		if (message.id !== undefined) {
			// Server-to-client request.
			/** @type {unknown} */
			let result = null;
			switch (message.method) {
				case 'client/registerCapability':
					for (const registration of message.params.registrations) {
						this.registrations.push(registration);
						for (const listener of this.#registration_listeners) listener(registration);
					}
					break;
				case 'client/unregisterCapability':
					for (const { id } of message.params.unregisterations) {
						this.registrations = this.registrations.filter((entry) => entry.id !== id);
					}
					break;
				case 'workspace/configuration':
					result = message.params.items.map(
						(/** @type {{ section?: string }} */ item) =>
							(item.section !== undefined && this.configuration[item.section]) ?? null,
					);
					break;
				default:
					result = null;
			}
			this.#write({ jsonrpc: '2.0', id: message.id, result });
			return;
		}
		// Notifications from the server (diagnostics, logs, progress).
		for (const listener of this.#notification_listeners) listener(message.method, message.params);
	}

	/**
	 * Resolve with the params of the next server notification `method` that
	 * satisfies `predicate` (push diagnostics from servers without pull
	 * support, for example).
	 * @param {string} method
	 * @param {(params: any) => boolean} [predicate]
	 * @param {number} [timeout]
	 * @returns {Promise<any>}
	 */
	wait_for_notification(method, predicate = () => true, timeout = 30_000) {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.#notification_listeners = this.#notification_listeners.filter((l) => l !== listener);
				reject(new Error(`Timed out waiting for notification ${method}`));
			}, timeout);
			/** @type {(method: string, params: any) => void} */
			const listener = (received, params) => {
				if (received !== method || !predicate(params)) return;
				clearTimeout(timer);
				this.#notification_listeners = this.#notification_listeners.filter((l) => l !== listener);
				resolve(params);
			};
			this.#notification_listeners.push(listener);
		});
	}

	/** @param {unknown} message */
	#write(message) {
		const body = Buffer.from(JSON.stringify(message), 'utf8');
		this.#process.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
		this.#process.stdin.write(body);
	}

	/**
	 * @param {string} method
	 * @param {unknown} [params]
	 * @returns {Promise<any>}
	 */
	request(method, params) {
		const id = this.#next_id++;
		return new Promise((resolve, reject) => {
			this.#pending.set(id, { resolve, reject });
			this.#write(
				params === undefined
					? { jsonrpc: '2.0', id, method }
					: { jsonrpc: '2.0', id, method, params },
			);
		});
	}

	/**
	 * @param {string} method
	 * @param {unknown} [params]
	 */
	notify(method, params) {
		this.#write(
			params === undefined ? { jsonrpc: '2.0', method } : { jsonrpc: '2.0', method, params },
		);
	}

	/** The server process id, for process-tree measurements. */
	get pid() {
		return this.#process.pid;
	}

	/**
	 * Initialize with the capabilities the tests rely on (pull diagnostics,
	 * completion resolve with additional edits, dynamic registration).
	 * @param {{
	 * 	runExternalCode?: boolean,
	 * 	initializationOptions?: Record<string, unknown>,
	 * 	textDocumentCapabilities?: Record<string, unknown>,
	 * 	workspaceCapabilities?: Record<string, unknown>,
	 * 	configuration?: Record<string, unknown>,
	 * }} [options]
	 *   `initializationOptions` are merged over the `runExternalCode` entry;
	 *   `textDocumentCapabilities` and `workspaceCapabilities` are merged over
	 *   the default capabilities (to advertise more features than the tests
	 *   pin); `configuration` seeds the answers to `workspace/configuration`
	 *   (see {@link NativeLspClient.configuration}), which the native server
	 *   requests during initialization.
	 */
	async initialize(options = {}) {
		if (options.configuration) {
			this.configuration = options.configuration;
		}
		const result = await this.request('initialize', {
			processId: process.pid,
			rootUri: pathToFileURL(this.cwd).href,
			workspaceFolders: [{ uri: pathToFileURL(this.cwd).href, name: 'workspace' }],
			capabilities: {
				workspace: {
					configuration: true,
					workspaceFolders: true,
					didChangeWatchedFiles: { dynamicRegistration: true },
					...options.workspaceCapabilities,
				},
				textDocument: {
					...options.textDocumentCapabilities,
					synchronization: { dynamicRegistration: true },
					diagnostic: { dynamicRegistration: true },
					hover: { dynamicRegistration: true, contentFormat: ['markdown', 'plaintext'] },
					definition: { dynamicRegistration: true },
					references: { dynamicRegistration: true },
					documentHighlight: { dynamicRegistration: true },
					rename: { dynamicRegistration: true, prepareSupport: true },
					completion: {
						dynamicRegistration: true,
						completionItem: {
							snippetSupport: true,
							resolveSupport: { properties: ['additionalTextEdits', 'detail', 'documentation'] },
						},
					},
					codeAction: { dynamicRegistration: true },
					inlayHint: { dynamicRegistration: true },
					formatting: { dynamicRegistration: true },
					rangeFormatting: { dynamicRegistration: true },
				},
			},
			initializationOptions: {
				...(options.runExternalCode ? { runExternalCode: true } : null),
				...options.initializationOptions,
			},
		});
		this.notify('initialized', {});
		return result;
	}

	/**
	 * Resolve once a dynamic registration with the given id has arrived.
	 * @param {string} id
	 * @param {number} [timeout]
	 * @returns {Promise<Registration>}
	 */
	wait_for_registration(id, timeout = 30_000) {
		const existing = this.registrations.find((registration) => registration.id === id);
		if (existing) return Promise.resolve(existing);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error(`Timed out waiting for registration ${id}`)),
				timeout,
			);
			this.#registration_listeners.push((registration) => {
				if (registration.id === id) {
					clearTimeout(timer);
					resolve(registration);
				}
			});
		});
	}

	/**
	 * @param {string} file
	 * @param {string} text
	 * @param {string} [language_id]
	 */
	open(file, text, language_id = file.endsWith('.tsrx') ? 'tsrx' : 'typescript') {
		this.#versions.set(file, 1);
		this.notify('textDocument/didOpen', {
			textDocument: { uri: this.uri(file), languageId: language_id, version: 1, text },
		});
	}

	/**
	 * Replace the whole document text.
	 * @param {string} file
	 * @param {string} text
	 */
	change(file, text) {
		const version = (this.#versions.get(file) ?? 1) + 1;
		this.#versions.set(file, version);
		this.notify('textDocument/didChange', {
			textDocument: { uri: this.uri(file), version },
			contentChanges: [{ text }],
		});
	}

	/** @param {string} file */
	close(file) {
		this.notify('textDocument/didClose', { textDocument: { uri: this.uri(file) } });
	}

	/**
	 * Report file-system changes the way an editor's watcher does.
	 * @param {Array<[file: string, type: 'created' | 'changed' | 'deleted']>} changes
	 */
	watched_files_changed(changes) {
		const types = { created: 1, changed: 2, deleted: 3 };
		this.notify('workspace/didChangeWatchedFiles', {
			changes: changes.map(([file, type]) => ({ uri: this.uri(file), type: types[type] })),
		});
	}

	/** @param {string} file */
	uri(file) {
		return pathToFileURL(`${this.cwd}/${file}`).href;
	}

	/**
	 * Pull diagnostics for a file.
	 * @param {string} file
	 * @returns {Promise<Array<{ range: any, message: string, code?: number | string, source?: string, severity?: number }>>}
	 */
	async diagnostics(file) {
		const report = await this.request('textDocument/diagnostic', {
			textDocument: { uri: this.uri(file) },
		});
		return report.items ?? [];
	}

	async shutdown() {
		try {
			await this.request('shutdown');
			this.notify('exit', undefined);
		} finally {
			this.#process.kill();
		}
	}
}

/**
 * Zero-based `{ line, character }` of `needle` (plus `skip` characters) in `text`.
 * @param {string} text
 * @param {string} needle
 * @param {number} [skip]
 * @param {number} [occurrence] 1-based occurrence of `needle`.
 */
export function position_of(text, needle, skip = 0, occurrence = 1) {
	let index = -1;
	for (let count = 0; count < occurrence; count++) {
		index = text.indexOf(needle, index + 1);
		if (index < 0) throw new Error(`"${needle}" not found`);
	}
	const before = text.slice(0, index + skip).split('\n');
	return { line: before.length - 1, character: before[before.length - 1].length };
}

/**
 * The text a range covers.
 * @param {string} text
 * @param {{ start: { line: number, character: number }, end: { line: number, character: number } }} range
 */
export function range_text(text, range) {
	const lines = text.split('\n');
	const offset = (/** @type {{ line: number, character: number }} */ position) =>
		lines.slice(0, position.line).reduce((sum, line) => sum + line.length + 1, 0) +
		position.character;
	return text.slice(offset(range.start), offset(range.end));
}
