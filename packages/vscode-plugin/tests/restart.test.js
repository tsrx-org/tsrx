import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	RESTART_COMMAND,
	RESTART_NOTIFICATION,
	register_restart_command,
	restart_on_request,
} from '../src/restart.js';

const host = vi.hoisted(() => ({
	use_tsgo: false,
	/** @type {Set<string>} */
	extensions: new Set(),
	/** @type {string[]} */
	commands: [],
	/** @type {Map<string, () => Promise<unknown>>} */
	registered: new Map(),
	executeCommand: vi.fn(),
	setStatusBarMessage: vi.fn(),
	showErrorMessage: vi.fn(),
}));

vi.mock('vscode', () => ({
	default: {
		workspace: {
			getConfiguration: (/** @type {string} */ section) => ({
				inspect: () => ({ globalValue: section === 'js/ts' ? host.use_tsgo : undefined }),
				get: () => (section === 'js/ts' ? host.use_tsgo : undefined),
			}),
		},
		extensions: {
			getExtension: (/** @type {string} */ id) =>
				host.extensions.has(id.toLowerCase()) ? { id } : undefined,
		},
		commands: {
			registerCommand: (/** @type {string} */ id, /** @type {any} */ run) => {
				host.registered.set(id, run);
				return { dispose() {} };
			},
			getCommands: async () => host.commands,
			executeCommand: host.executeCommand,
		},
		window: {
			setStatusBarMessage: host.setStatusBarMessage,
			showErrorMessage: host.showErrorMessage,
		},
	},
}));

beforeEach(() => {
	host.use_tsgo = false;
	host.extensions.clear();
	host.commands = ['typescript.restartTsServer', 'typescript.native-preview.restart'];
	host.registered.clear();
	vi.clearAllMocks();
});

function restart() {
	const client = { restart: vi.fn(async () => {}) };
	register_restart_command(
		() =>
			/** @type {import('vscode-languageclient/node').LanguageClient} */ (
				/** @type {unknown} */ (client)
			),
	);
	return {
		client,
		run: () => /** @type {() => Promise<unknown>} */ (host.registered.get(RESTART_COMMAND))(),
	};
}

describe('TSRX: Restart Language Server', () => {
	it("restarts the TSRX server and VS Code's tsserver while TypeScript 7 is off", async () => {
		const { client, run } = restart();
		await run();
		expect(client.restart).toHaveBeenCalledOnce();
		expect(host.executeCommand).toHaveBeenCalledExactlyOnceWith('typescript.restartTsServer');
		expect(host.setStatusBarMessage).toHaveBeenCalledOnce();
	});

	it('restarts TypeScript 7 while it serves .tsrx files', async () => {
		host.use_tsgo = true;
		host.extensions.add('typescriptteam.native-preview');
		const { client, run } = restart();
		await run();
		expect(client.restart).toHaveBeenCalledOnce();
		expect(host.executeCommand).toHaveBeenCalledExactlyOnceWith(
			'typescript.native-preview.restart',
		);
	});

	it('restarts only the TSRX server when no TypeScript server runs', async () => {
		host.use_tsgo = true;
		host.extensions.add('typescriptteam.vscode-typescript-nightly');
		host.commands = [];
		const { client, run } = restart();
		await run();
		expect(client.restart).toHaveBeenCalledOnce();
		expect(host.executeCommand).not.toHaveBeenCalled();
	});

	it('says so when a restart fails', async () => {
		const { client, run } = restart();
		client.restart.mockRejectedValue(new Error('server crashed'));
		await run();
		expect(host.showErrorMessage).toHaveBeenCalledWith(
			'TSRX could not restart the language server: server crashed',
		);
	});
});

/** A client whose server can ask for a restart (`request`). */
function requesting_client() {
	/** @type {Map<string, () => void>} */
	const handlers = new Map();
	const client = {
		onNotification: vi.fn((/** @type {string} */ method, /** @type {() => void} */ handler) => {
			handlers.set(method, handler);
			return { dispose() {} };
		}),
		restart: vi.fn(async () => {}),
		error: vi.fn(),
	};
	restart_on_request(
		/** @type {import('vscode-languageclient/node').LanguageClient} */ (
			/** @type {unknown} */ (client)
		),
	);
	return { client, request: () => handlers.get(RESTART_NOTIFICATION)?.() };
}

describe('Restart when the TSRX language server asks', () => {
	it('restarts the TSRX server only', () => {
		const { client, request } = requesting_client();
		request();
		expect(client.restart).toHaveBeenCalledOnce();
		expect(host.executeCommand).not.toHaveBeenCalled();
	});

	it('writes a failed restart to the output only', async () => {
		const { client, request } = requesting_client();
		client.restart.mockRejectedValue(new Error('server crashed'));
		request();
		await vi.waitFor(() => expect(client.error).toHaveBeenCalledOnce());
		expect(client.error).toHaveBeenCalledWith(
			'Restarting the TSRX language server failed.',
			expect.objectContaining({ message: 'server crashed' }),
			false,
		);
		expect(host.showErrorMessage).not.toHaveBeenCalled();
	});
});
