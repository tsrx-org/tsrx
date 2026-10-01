import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	REMOVE_UNUSED_IMPORTS_COMMAND,
	SORT_IMPORTS_COMMAND,
	register_import_commands,
} from '../src/import-commands.js';

const host = vi.hoisted(() => ({
	/** @type {Map<string, () => unknown>} */
	registered: new Map(),
	/** @type {unknown[]} */
	actions: [],
	executeCommand: vi.fn(),
	applyEdit: vi.fn(),
	showInformationMessage: vi.fn(),
	document: { uri: { path: '/project/src/App.tsrx' }, lineCount: 8 },
}));

vi.mock('vscode', () => ({
	default: {
		Disposable: { from: () => ({ dispose() {} }) },
		Range: class {
			/** @param {number[]} args */
			constructor(...args) {
				this.args = args;
			}
		},
		commands: {
			registerCommand: (/** @type {string} */ id, /** @type {() => unknown} */ run) => {
				host.registered.set(id, run);
				return { dispose() {} };
			},
			executeCommand: host.executeCommand,
		},
		window: {
			activeTextEditor: { document: host.document },
			showInformationMessage: host.showInformationMessage,
		},
		workspace: { applyEdit: host.applyEdit },
	},
}));

beforeEach(() => {
	vi.clearAllMocks();
	host.registered.clear();
	host.actions = [];
	host.executeCommand.mockImplementation(async (/** @type {string} */ command) =>
		command === 'vscode.executeCodeActionProvider' ? host.actions : undefined,
	);
	register_import_commands();
});

describe('TSRX: Sort Imports and Remove Unused Imports', () => {
	it('apply the first source action TypeScript offers, with its edit and command', async () => {
		const edit = { size: 1 };
		const command = { command: '_typescript.didOrganizeImports', arguments: [1] };
		host.actions = [{ title: 'Sort Imports', disabled: undefined, edit, command }];
		await host.registered.get(SORT_IMPORTS_COMMAND)?.();
		expect(host.executeCommand).toHaveBeenNthCalledWith(
			1,
			'vscode.executeCodeActionProvider',
			host.document.uri,
			{ args: [0, 0, 8, 0] },
			'source.sortImports',
			1,
		);
		expect(host.applyEdit).toHaveBeenCalledExactlyOnceWith(edit);
		expect(host.executeCommand).toHaveBeenNthCalledWith(2, '_typescript.didOrganizeImports', 1);
	});

	it('says when TypeScript offers no such action', async () => {
		await host.registered.get(REMOVE_UNUSED_IMPORTS_COMMAND)?.();
		expect(host.executeCommand).toHaveBeenCalledWith(
			'vscode.executeCodeActionProvider',
			host.document.uri,
			{ args: [0, 0, 8, 0] },
			'source.removeUnusedImports',
			1,
		);
		expect(host.applyEdit).not.toHaveBeenCalled();
		expect(host.showInformationMessage).toHaveBeenCalledExactlyOnceWith(
			'TypeScript offers no Remove Unused Imports for this file.',
		);
	});
});
