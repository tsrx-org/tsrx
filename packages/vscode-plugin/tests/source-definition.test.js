import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	GO_TO_SOURCE_DEFINITION_COMMAND,
	register_source_definition_command,
} from '../src/source-definition.js';

const host = vi.hoisted(() => ({
	use_tsgo: false,
	/** @type {Set<string>} */
	extensions: new Set(),
	/** @type {Map<string, () => Promise<unknown>>} */
	registered: new Map(),
	/** @type {unknown} */
	response: undefined,
	executeCommand: vi.fn(),
	showErrorMessage: vi.fn(),
	showInformationMessage: vi.fn(async () => undefined),
	/** @type {Array<{ uri: { scheme: string, authority: string, path: string, fragment: string } }>} */
	documents: [],
	editor: {
		document: { uri: { scheme: 'file', path: '/project/src/App.tsrx' } },
		selection: { active: { line: 4, character: 10 } },
	},
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
			Range,
			Location,
			Uri: {
				file: (/** @type {string} */ path) => ({ path }),
				parse: (/** @type {string} */ value) => ({ value }),
			},
			ProgressLocation: { Window: 10 },
			workspace: {
				get textDocuments() {
					return host.documents;
				},
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
			env: { openExternal: vi.fn() },
		},
	};
});

beforeEach(() => {
	host.use_tsgo = false;
	host.extensions.clear();
	host.registered.clear();
	host.response = undefined;
	host.documents = [];
	host.editor.document.uri = { scheme: 'file', path: '/project/src/App.tsrx' };
	vi.clearAllMocks();
	host.executeCommand.mockImplementation(async (/** @type {string} */ command) =>
		command === 'typescript.tsserverRequest' ? host.response : undefined,
	);
});

function command() {
	register_source_definition_command();
	return /** @type {() => Promise<unknown>} */ (
		host.registered.get(GO_TO_SOURCE_DEFINITION_COMMAND)
	);
}

describe('Go to Source Definition', () => {
	it("asks VS Code's tsserver through the plugin's request and opens what it finds", async () => {
		host.response = {
			type: 'response',
			body: [
				{
					file: '/project/node_modules/greeting/index.js',
					start: { line: 1, offset: 17 },
					end: { line: 1, offset: 22 },
				},
			],
		};
		await command()();
		// One-based line and offset, as tsserver counts.
		expect(host.executeCommand).toHaveBeenNthCalledWith(
			1,
			'typescript.tsserverRequest',
			'_tsrx:findSourceDefinition',
			{ file: host.editor.document.uri, line: 5, offset: 11 },
		);
		expect(host.executeCommand).toHaveBeenNthCalledWith(
			2,
			'editor.action.goToLocations',
			host.editor.document.uri,
			host.editor.selection.active,
			[
				{
					uri: { path: '/project/node_modules/greeting/index.js' },
					range: { start: { line: 0, character: 16 }, end: { line: 0, character: 21 } },
				},
			],
			'goto',
			'No source definitions found.',
		);
	});

	it('says when it finds nothing', async () => {
		host.response = { type: 'response', body: [] };
		await command()();
		expect(host.executeCommand).toHaveBeenLastCalledWith(
			'editor.action.goToLocations',
			host.editor.document.uri,
			host.editor.selection.active,
			[],
			'goto',
			'No source definitions found.',
		);
	});

	it('opens a source definition in an unsaved document', async () => {
		// The name VS Code gives tsserver for it, which is no file on disk.
		const untitled = { scheme: 'untitled', authority: '', path: 'Untitled-1', fragment: '' };
		host.documents = [{ uri: untitled }];
		host.response = {
			type: 'response',
			body: [
				{
					file: '^/untitled/ts-nul-authority/Untitled-1',
					start: { line: 2, offset: 17 },
					end: { line: 2, offset: 22 },
				},
			],
		};
		await command()();
		expect(host.executeCommand).toHaveBeenLastCalledWith(
			'editor.action.goToLocations',
			host.editor.document.uri,
			host.editor.selection.active,
			[
				{
					uri: untitled,
					range: { start: { line: 1, character: 16 }, end: { line: 1, character: 21 } },
				},
			],
			'goto',
			'No source definitions found.',
		);
	});

	it("says VS Code's own words in a tab that VS Code's TypeScript doesn't serve, such as a git: one", async () => {
		host.editor.document.uri = { scheme: 'git', path: '/project/src/App.tsrx' };
		await command()();
		expect(host.showErrorMessage).toHaveBeenCalledExactlyOnceWith(
			'Go to Source Definition failed: Unknown file type.',
		);
		expect(host.executeCommand).not.toHaveBeenCalled();
	});

	it('asks for the source definition in a virtual workspace document', async () => {
		host.editor.document.uri = { scheme: 'vscode-vfs', path: '/github/owner/repo/src/App.tsrx' };
		host.response = { type: 'response', body: [] };
		await command()();
		expect(host.showErrorMessage).not.toHaveBeenCalled();
		expect(host.executeCommand).toHaveBeenCalledWith(
			'typescript.tsserverRequest',
			'_tsrx:findSourceDefinition',
			{ file: host.editor.document.uri, line: 5, offset: 11 },
		);
	});

	it('reports a failed request', async () => {
		host.executeCommand.mockImplementation(async () => {
			throw new Error('Unrecognized JSON command: _tsrx:findSourceDefinition');
		});
		await command()();
		expect(host.showErrorMessage).toHaveBeenCalledExactlyOnceWith(
			'Go to Source Definition failed: Unrecognized JSON command: _tsrx:findSourceDefinition',
		);
	});

	it('opens the definition on TypeScript 7 and says why, once', async () => {
		host.use_tsgo = true;
		// Not a document VS Code's tsserver serves: that check is for VS Code's own TypeScript.
		host.editor.document.uri = { scheme: 'git', path: '/project/src/App.tsrx' };
		host.extensions.add('typescriptteam.native-preview');
		const target = {
			targetUri: { path: '/project/node_modules/@types/react/index.d.ts' },
			targetRange: 'whole declaration',
			targetSelectionRange: 'name',
		};
		host.executeCommand.mockImplementation(async (/** @type {string} */ command) =>
			command === 'vscode.executeDefinitionProvider' ? [target] : undefined,
		);
		const run = command();
		await run();
		await run();
		expect(host.executeCommand).not.toHaveBeenCalledWith(
			'typescript.tsserverRequest',
			expect.anything(),
			expect.anything(),
		);
		expect(host.executeCommand).toHaveBeenCalledWith(
			'vscode.executeDefinitionProvider',
			host.editor.document.uri,
			host.editor.selection.active,
		);
		expect(host.executeCommand).toHaveBeenLastCalledWith(
			'editor.action.goToLocations',
			host.editor.document.uri,
			host.editor.selection.active,
			[{ uri: target.targetUri, range: 'name' }],
			'goto',
			'No definition found.',
		);
		expect(host.showInformationMessage).toHaveBeenCalledOnce();
		expect(host.showErrorMessage).not.toHaveBeenCalled();
	});
});
