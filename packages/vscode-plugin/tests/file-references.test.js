import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	FIND_FILE_REFERENCES_COMMAND,
	register_file_references_command,
} from '../src/file-references.js';

const host = vi.hoisted(() => ({
	use_tsgo: false,
	/** @type {Set<string>} */
	extensions: new Set(),
	/** @type {Map<string, (...args: unknown[]) => Promise<unknown>>} */
	registered: new Map(),
	/** @type {unknown} */
	response: undefined,
	/** @type {{ globalValue?: string, workspaceValue?: string }} */
	preferred_location: {},
	/** The value `references.preferredLocation` had at each `editor.action.showReferences`. */
	/** @type {unknown[]} */
	shown_with: [],
	executeCommand: vi.fn(),
	openTextDocument: vi.fn(async (/** @type {unknown} */ uri) => ({ uri })),
	update: vi.fn(),
	showErrorMessage: vi.fn(),
	showInformationMessage: vi.fn(async () => /** @type {string | undefined} */ (undefined)),
	openExternal: vi.fn(),
	/** @type {{ document: { uri: { scheme: string, path: string } } } | undefined} */
	editor: { document: { uri: { scheme: 'file', path: '/project/src/App.tsrx' } } },
	/** @type {Array<{ uri: { scheme: string, authority: string, path: string, fragment: string } }>} */
	documents: [],
}));

vi.mock('vscode', () => {
	class Position {
		/** @param {number} line @param {number} character */
		constructor(line, character) {
			this.line = line;
			this.character = character;
		}
	}
	class Range {
		/** @param {number} a @param {number} b @param {number} c @param {number} d */
		constructor(a, b, c, d) {
			this.start = new Position(a, b);
			this.end = new Position(c, d);
		}
	}
	class Location {
		/** @param {unknown} uri @param {Range} range */
		constructor(uri, range) {
			this.uri = uri;
			this.range = range;
		}
	}
	return {
		default: {
			Position,
			Range,
			Location,
			Uri: {
				file: (/** @type {string} */ path) => ({ path }),
				parse: (/** @type {string} */ value) => ({ value }),
			},
			ProgressLocation: { Window: 10 },
			ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
			workspace: {
				openTextDocument: host.openTextDocument,
				get textDocuments() {
					return host.documents;
				},
				getConfiguration: (/** @type {string} */ section) => ({
					inspect: (/** @type {string} */ key) =>
						section === 'references' && key === 'preferredLocation'
							? { ...host.preferred_location }
							: { globalValue: section === 'js/ts' ? host.use_tsgo : undefined },
					get: (/** @type {string} */ key) =>
						section === 'references' && key === 'preferredLocation'
							? (host.preferred_location.workspaceValue ??
								host.preferred_location.globalValue ??
								'peek')
							: section === 'js/ts'
								? host.use_tsgo
								: undefined,
					update: host.update,
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
				executeCommand: host.executeCommand,
			},
			window: {
				get activeTextEditor() {
					return host.editor;
				},
				withProgress: (/** @type {unknown} */ _options, /** @type {any} */ task) => task(),
				showErrorMessage: host.showErrorMessage,
				showInformationMessage: host.showInformationMessage,
			},
			env: { openExternal: host.openExternal },
		},
	};
});

const APP = { scheme: 'file', path: '/project/src/App.tsrx' };
const LIB = { scheme: 'file', path: '/project/src/Lib.tsrx' };

/** The references `beforeEach` has tsserver return, as VS Code locations (zero-based). */
const LIB_LOCATION = {
	uri: { path: '/project/src/Lib.tsrx' },
	range: { start: { line: 1, character: 21 }, end: { line: 1, character: 31 } },
};
const MAIN_LOCATION = {
	uri: { path: '/project/src/main.ts' },
	range: { start: { line: 0, character: 21 }, end: { line: 0, character: 31 } },
};

beforeEach(() => {
	host.use_tsgo = false;
	host.extensions.clear();
	host.registered.clear();
	host.response = {
		type: 'response',
		body: {
			refs: [
				{
					file: '/project/src/Lib.tsrx',
					start: { line: 2, offset: 22 },
					end: { line: 2, offset: 32 },
					lineText: "import { App } from './App.tsrx';",
				},
				{
					file: '/project/src/main.ts',
					start: { line: 1, offset: 22 },
					end: { line: 1, offset: 32 },
					lineText: "import { App } from './App.tsrx';",
				},
			],
			symbolName: '"/project/src/App.tsrx"',
		},
	};
	host.preferred_location = {};
	host.shown_with = [];
	host.editor = { document: { uri: APP } };
	host.documents = [];
	vi.clearAllMocks();
	host.update.mockImplementation(async (_key, /** @type {string | undefined} */ value) => {
		host.preferred_location.workspaceValue = value;
	});
	host.executeCommand.mockImplementation(async (/** @type {string} */ command) => {
		if (command === 'typescript.tsserverRequest') return host.response;
		if (command === 'editor.action.showReferences') {
			host.shown_with.push(
				host.preferred_location.workspaceValue ?? host.preferred_location.globalValue,
			);
		}
		return undefined;
	});
});

/** @param {unknown[]} args */
function run(...args) {
	register_file_references_command();
	const command = host.registered.get(FIND_FILE_REFERENCES_COMMAND);
	if (!command) throw new Error(`${FIND_FILE_REFERENCES_COMMAND} is not registered`);
	return command(...args);
}

describe('Find File References', () => {
	it("asks VS Code's tsserver through the plugin's request and shows the references in the References view", async () => {
		await run();
		// The Command Palette passes nothing: the active editor's file. Opened first, so VS Code
		// hands it to tsserver.
		expect(host.openTextDocument).toHaveBeenCalledExactlyOnceWith(APP);
		expect(host.executeCommand).toHaveBeenNthCalledWith(
			1,
			'typescript.tsserverRequest',
			'_tsrx:fileReferences',
			{ file: APP },
		);
		expect(host.executeCommand).toHaveBeenNthCalledWith(
			2,
			'editor.action.showReferences',
			APP,
			{ line: 0, character: 0 },
			[LIB_LOCATION, MAIN_LOCATION],
		);
		// `view` for the call, in the workspace settings, then back to no workspace value.
		expect(host.shown_with).toEqual(['view']);
		expect(host.update.mock.calls).toEqual([
			['preferredLocation', 'view', 2],
			['preferredLocation', undefined, 2],
		]);
		expect(host.preferred_location).toEqual({ workspaceValue: undefined });
	});

	it('finds the references of the file the Explorer or the editor tab menu passes', async () => {
		await run(LIB, [LIB]);
		expect(host.openTextDocument).toHaveBeenCalledExactlyOnceWith(LIB);
		expect(host.executeCommand).toHaveBeenCalledWith(
			'typescript.tsserverRequest',
			'_tsrx:fileReferences',
			{ file: LIB },
		);
		expect(host.executeCommand).toHaveBeenCalledWith(
			'editor.action.showReferences',
			LIB,
			{ line: 0, character: 0 },
			[LIB_LOCATION, MAIN_LOCATION],
		);
	});

	it("puts back the workspace's own preferred location, even when showing fails", async () => {
		host.preferred_location = { globalValue: 'peek', workspaceValue: 'peek' };
		host.executeCommand.mockImplementation(async (/** @type {string} */ command) => {
			if (command === 'typescript.tsserverRequest') return host.response;
			if (command === 'editor.action.showReferences') throw new Error('no view');
		});
		await expect(run()).rejects.toThrow('no view');
		expect(host.update.mock.calls).toEqual([
			['preferredLocation', 'view', 2],
			['preferredLocation', 'peek', 2],
		]);
		expect(host.preferred_location).toEqual({ globalValue: 'peek', workspaceValue: 'peek' });
	});

	it('writes no setting when the References view is already the preferred location', async () => {
		host.preferred_location = { globalValue: 'view' };
		await run();
		expect(host.shown_with).toEqual(['view']);
		expect(host.update).not.toHaveBeenCalled();
	});

	it('shows the references where the setting says when the workspace settings cannot be written', async () => {
		host.update.mockRejectedValue(
			new Error('Unable to write to Workspace Settings because no workspace is opened.'),
		);
		await run();
		expect(host.update).toHaveBeenCalledOnce();
		expect(host.shown_with).toEqual([undefined]);
		expect(host.executeCommand).toHaveBeenLastCalledWith(
			'editor.action.showReferences',
			APP,
			{ line: 0, character: 0 },
			[LIB_LOCATION, MAIN_LOCATION],
		);
	});

	it('shows an empty References view when nothing imports the file', async () => {
		host.response = { type: 'response', body: { refs: [], symbolName: '"/project/src/App.tsrx"' } };
		await run();
		expect(host.executeCommand).toHaveBeenLastCalledWith(
			'editor.action.showReferences',
			APP,
			{ line: 0, character: 0 },
			[],
		);
	});

	it('reports a failed request and shows nothing', async () => {
		host.executeCommand.mockImplementation(async () => {
			throw new Error('Unrecognized JSON command: _tsrx:fileReferences');
		});
		await run();
		expect(host.showErrorMessage).toHaveBeenCalledExactlyOnceWith(
			'Find File References failed: Unrecognized JSON command: _tsrx:fileReferences',
		);
		expect(host.executeCommand).toHaveBeenCalledOnce();
		expect(host.update).not.toHaveBeenCalled();
	});

	it('shows nothing when the request is cancelled or gets no answer', async () => {
		for (const response of [
			{ type: 'cancelled' },
			{ type: 'noServer' },
			{ type: 'noContent' },
			undefined,
		]) {
			host.response = response;
			host.executeCommand.mockClear();
			await run();
			expect(host.executeCommand).toHaveBeenCalledOnce();
		}
		expect(host.showErrorMessage).not.toHaveBeenCalled();
		expect(host.update).not.toHaveBeenCalled();
	});

	it('finds an unsaved importer by the name VS Code gave tsserver for it', async () => {
		const untitled = { scheme: 'untitled', authority: '', path: 'Untitled-1', fragment: '' };
		host.documents = [{ uri: untitled }];
		const span = { start: { line: 1, offset: 22 }, end: { line: 1, offset: 32 } };
		host.response = {
			type: 'response',
			body: {
				refs: [
					{ file: '^/untitled/ts-nul-authority/Untitled-1', ...span },
					// No longer open: the URI the name spells, as VS Code's own command makes it.
					{ file: '^/vscode-vfs/github/owner/repo/src/main.ts', ...span },
				],
				symbolName: '"/project/src/App.tsrx"',
			},
		};
		await run();
		const range = { start: { line: 0, character: 21 }, end: { line: 0, character: 31 } };
		expect(host.executeCommand).toHaveBeenLastCalledWith(
			'editor.action.showReferences',
			APP,
			{ line: 0, character: 0 },
			[
				{ uri: untitled, range },
				{ uri: { value: 'vscode-vfs://github/owner/repo/src/main.ts' }, range },
			],
		);
	});

	it("says VS Code's own words for a tab that VS Code's TypeScript doesn't serve, such as a git: one", async () => {
		// `typescript.tsserverRequest` would send no `file`, and tsserver would answer "Cannot
		// read properties of undefined (reading 'includes')".
		await run({ scheme: 'git', path: '/project/src/App.tsrx' });
		expect(host.showErrorMessage).toHaveBeenCalledExactlyOnceWith(
			'Find File References failed: Unknown file type.',
		);
		expect(host.openTextDocument).not.toHaveBeenCalled();
		expect(host.executeCommand).not.toHaveBeenCalled();
	});

	it('finds the references of an unsaved .tsrx file or one in a virtual workspace', async () => {
		for (const uri of [
			{ scheme: 'untitled', path: 'Untitled-1' },
			{ scheme: 'vscode-vfs', path: '/github/owner/repo/src/App.tsrx' },
		]) {
			await run(uri);
			expect(host.executeCommand).toHaveBeenCalledWith(
				'typescript.tsserverRequest',
				'_tsrx:fileReferences',
				{ file: uri },
			);
		}
		expect(host.showErrorMessage).not.toHaveBeenCalled();
	});

	it('changes the setting for one run at a time', async () => {
		/** @type {string[]} */
		const events = [];
		host.update.mockImplementation(async (_key, /** @type {string | undefined} */ value) => {
			events.push(`write ${value}`);
			await new Promise((resolve) => setTimeout(resolve, 1));
			host.preferred_location.workspaceValue = value;
		});
		host.executeCommand.mockImplementation(async (/** @type {string} */ command) => {
			if (command === 'typescript.tsserverRequest') return host.response;
			if (command === 'editor.action.showReferences') {
				events.push(`show with ${host.preferred_location.workspaceValue}`);
			}
		});
		await Promise.all([run(APP), run(LIB)]);
		expect(events).toEqual([
			'write view',
			'show with view',
			'write undefined',
			'write view',
			'show with view',
			'write undefined',
		]);
	});

	it('does nothing without a file', async () => {
		host.editor = undefined;
		await run();
		expect(host.openTextDocument).not.toHaveBeenCalled();
		expect(host.executeCommand).not.toHaveBeenCalled();
	});

	it('says that TypeScript 7 cannot find file references yet, each time', async () => {
		host.use_tsgo = true;
		host.extensions.add('typescriptteam.native-preview');
		host.showInformationMessage.mockResolvedValue('Learn More');
		await run();
		await run({ scheme: 'git', path: '/project/src/Lib.tsrx' });
		expect(host.executeCommand).not.toHaveBeenCalled();
		expect(host.openTextDocument).not.toHaveBeenCalled();
		expect(host.showErrorMessage).not.toHaveBeenCalled();
		expect(host.showInformationMessage).toHaveBeenCalledTimes(2);
		expect(host.showInformationMessage).toHaveBeenCalledWith(
			'Find File References does not work in .tsrx files with TypeScript 7 yet.',
			'Learn More',
		);
		await vi.waitFor(() =>
			expect(host.openExternal).toHaveBeenCalledWith({
				value: 'https://github.com/tsrx-org/tsrx/issues/136',
			}),
		);
	});

	it("asks VS Code's tsserver when TypeScript 7 is on but no TypeScript 7 extension serves", async () => {
		host.use_tsgo = true;
		await run();
		expect(host.showInformationMessage).not.toHaveBeenCalled();
		expect(host.executeCommand).toHaveBeenCalledWith(
			'typescript.tsserverRequest',
			'_tsrx:fileReferences',
			{ file: APP },
		);
	});
});
