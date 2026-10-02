import { afterEach, describe, expect, it, vi } from 'vitest';
import { create_server_options } from '../src/server-options.js';

/** `TransportKind.stdio` (vscode-languageclient needs VS Code to load). */
const STDIO = 0;

afterEach(() => {
	vi.unstubAllEnvs();
});

/**
 * One start of a Node module server as vscode-languageclient 9.0.1 runs it in VS Code,
 * and the environment the server process gets. The client writes its environment into
 * the options it gets, copying only the own variables of `options.env`. Then the
 * `fork` of VS Code's Electron replaces `env` with an object that inherits it, and
 * sets `execPath`.
 * @param {{ options: { env?: Record<string, string | undefined>, execPath?: string } }} server
 */
function start(server) {
	const options = server.options;
	/** @type {Record<string, string | undefined>} */
	const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', ELECTRON_NO_ASAR: '1' };
	for (const key of Object.keys(options.env ?? {})) {
		env[key] = options.env?.[key];
	}
	options.env = env;

	options.env = Object.assign(Object.create(options.env), { ELECTRON_RUN_AS_NODE: '1' });
	options.execPath = '/electron/helper';
	/** @type {Record<string, string | undefined>} */
	const server_env = {};
	for (const key in options.env) {
		server_env[key] = options.env[key];
	}
	return server_env;
}

describe('TSRX language server options', () => {
	it('gives every start new options', () => {
		const { run } = create_server_options('/extension/dist/server.js', STDIO);
		expect(run.options).not.toBe(run.options);
		expect(run.options.env.TSRX_DEBUG).toBe('true');
	});

	it('keeps TSRX_DEBUG for a restarted server', () => {
		const { run } = create_server_options('/extension/dist/server.js', STDIO);
		expect(start(run).TSRX_DEBUG).toBe('true');
		expect(start(run).TSRX_DEBUG).toBe('true');
	});

	it('keeps TSRX_DEBUG off when the extension host sets it to false', () => {
		vi.stubEnv('TSRX_DEBUG', 'false');
		const { run, debug } = create_server_options('/extension/dist/server.js', STDIO);
		expect(run.options.env.TSRX_DEBUG).toBe('false');
		expect(debug.options.env.TSRX_DEBUG).toBe('false');
	});

	it('starts the debug server with the inspector', () => {
		const { run, debug } = create_server_options('/extension/dist/server.js', STDIO);
		expect(run.options.execArgv).toEqual([]);
		expect(debug.options.execArgv).toEqual(['--nolazy', '--inspect']);
		expect(debug.module).toBe('/extension/dist/server.js');
	});
});
