/**
 * Content-mapper transport: `Content-Length`-framed JSON-RPC 2.0 over stdio.
 * TypeScript is the only requester; the mapper never sends requests or
 * notifications. stdout is reserved for protocol messages, so everything
 * else (including `console.log`) goes to stderr.
 *
 * Kept separate from the executable entry (`server.js`) so hosts that bundle
 * the mapper (the VS Code extension ships it for inferred projects) can start
 * it from their own entry file.
 */

/**
 * @typedef {{ jsonrpc: '2.0', id?: number | string | null, method: string, params?: unknown }} RequestMessage
 */

/**
 * Run the mapper server on the given streams. Installs the stream handlers
 * and returns; the process exits (with `process.exitCode`) once the input
 * stream ends, which is how TypeScript shuts a mapper down.
 * @param {import('./mapper.js').ContentMapper} mapper
 * @param {{ input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream }} [streams]
 */
export function run_mapper_server(mapper, streams = {}) {
	const input = streams.input ?? process.stdin;
	const output = streams.output ?? process.stdout;
	let buffered = Buffer.alloc(0);

	input.on('data', (chunk) => {
		buffered = Buffer.concat([buffered, typeof chunk === 'string' ? Buffer.from(chunk) : chunk]);
		read_messages();
	});
	input.on('error', (error) => {
		console.error(error);
		process.exitCode = 1;
	});
	input.on('end', () => {
		process.exit(process.exitCode ?? 0);
	});

	function read_messages() {
		while (true) {
			const header_end = buffered.indexOf('\r\n\r\n');
			if (header_end < 0) return;
			const header = buffered.subarray(0, header_end).toString('ascii');
			const length_match = /^Content-Length:\s*(\d+)\s*$/im.exec(header);
			if (!length_match) {
				console.error('@tsrx/content-mapper: missing Content-Length header');
				process.exit(1);
			}
			const content_length = Number(length_match[1]);
			const message_start = header_end + 4;
			const message_end = message_start + content_length;
			if (buffered.length < message_end) return;
			const body = buffered.subarray(message_start, message_end).toString('utf8');
			buffered = buffered.subarray(message_end);
			/** @type {RequestMessage} */
			let message;
			try {
				message = JSON.parse(body);
			} catch (error) {
				console.error('@tsrx/content-mapper: invalid JSON-RPC message', error);
				continue;
			}
			handle_message(message);
		}
	}

	/** @param {RequestMessage} message */
	function handle_message(message) {
		if (message.id === undefined || message.id === null) {
			// Notifications need no response.
			return;
		}
		try {
			/** @type {unknown} */
			let result;
			switch (message.method) {
				case 'initialize':
					result = mapper.initialize(/** @type {any} */ (message.params));
					break;
				case 'openProject':
					result = mapper.openProject(/** @type {any} */ (message.params));
					break;
				case 'closeProject':
					mapper.closeProject(/** @type {any} */ (message.params));
					result = null;
					break;
				case 'transform':
					result = mapper.transform(/** @type {any} */ (message.params));
					break;
				default:
					write({
						jsonrpc: '2.0',
						id: message.id,
						error: { code: -32601, message: `Unknown method ${message.method}` },
					});
					return;
			}
			write({ jsonrpc: '2.0', id: message.id, result });
		} catch (error) {
			write({
				jsonrpc: '2.0',
				id: message.id,
				error: {
					code: -32603,
					message: error instanceof Error ? (error.stack ?? error.message) : String(error),
				},
			});
		}
	}

	/** @param {unknown} message */
	function write(message) {
		const body = Buffer.from(JSON.stringify(message), 'utf8');
		output.write(`Content-Length: ${body.length}\r\n\r\n`);
		output.write(body);
	}
}

/**
 * Route every console method to stderr so stray logging (from a target
 * compiler, for example) can never corrupt the protocol stream on stdout.
 */
export function redirect_console_to_stderr() {
	console.log = console.info = console.warn = console.debug = (...args) => console.error(...args);
}
