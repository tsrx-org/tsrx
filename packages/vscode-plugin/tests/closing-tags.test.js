import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activate_closing_tags } from '../src/closing-tags.js';

const host = vi.hoisted(() => ({
	/** @type {Map<string, Record<string, unknown>>} section → scope values of `experimental.useTsgo` */
	settings: new Map(),
	/** @type {Set<string>} */
	extensions: new Set(),
	/** @type {((event: { affectsConfiguration: (section: string) => boolean }) => void)[]} */
	configuration_listeners: [],
	/** @type {(() => void)[]} */
	extension_listeners: [],
	activateAutoInsertion: vi.fn(),
}));

vi.mock('vscode', () => ({
	default: {
		workspace: {
			getConfiguration: (/** @type {string} */ section) => ({
				inspect: () => ({ key: section, ...host.settings.get(section) }),
				get: () => {
					const scopes = host.settings.get(section) ?? {};
					return scopes.workspaceValue ?? scopes.globalValue;
				},
			}),
			onDidChangeConfiguration: (/** @type {any} */ listener) => {
				host.configuration_listeners.push(listener);
				return { dispose() {} };
			},
		},
		extensions: {
			getExtension: (/** @type {string} */ id) =>
				host.extensions.has(id.toLowerCase()) ? { id } : undefined,
			onDidChange: (/** @type {any} */ listener) => {
				host.extension_listeners.push(listener);
				return { dispose() {} };
			},
		},
	},
}));

vi.mock('@volar/vscode', () => ({ activateAutoInsertion: host.activateAutoInsertion }));

/**
 * @param {string} section
 * @param {boolean | undefined} value
 */
function set_use_tsgo(section, value) {
	host.settings.set(section, value === undefined ? {} : { globalValue: value });
	for (const listener of host.configuration_listeners) {
		listener({ affectsConfiguration: (name) => name === `${section}.experimental.useTsgo` });
	}
}

/** @param {string} id */
function install(id) {
	host.extensions.add(id.toLowerCase());
	for (const listener of host.extension_listeners) listener();
}

/** @param {string} id */
function uninstall(id) {
	host.extensions.delete(id.toLowerCase());
	for (const listener of host.extension_listeners) listener();
}

function activate() {
	const context = /** @type {import('vscode').ExtensionContext} */ (
		/** @type {unknown} */ ({ subscriptions: [] })
	);
	const client = /** @type {import('vscode-languageclient/node').BaseLanguageClient} */ (
		/** @type {unknown} */ ({})
	);
	activate_closing_tags(context, client);
	return {
		client,
		dispose: () => context.subscriptions.forEach((subscription) => subscription.dispose()),
	};
}

/** @type {{ dispose: import('vitest').Mock }[]} */
let registrations = [];

beforeEach(() => {
	host.settings.clear();
	host.extensions.clear();
	host.configuration_listeners.length = 0;
	host.extension_listeners.length = 0;
	registrations = [];
	host.activateAutoInsertion.mockReset();
	host.activateAutoInsertion.mockImplementation(() => {
		const registration = { dispose: vi.fn() };
		registrations.push(registration);
		return registration;
	});
});

describe('TSRX closing tags', () => {
	it("stay off on VS Code's own TypeScript, which closes tags through the tsserver plugin", () => {
		install('TypeScriptTeam.native-preview');
		activate();
		expect(host.activateAutoInsertion).not.toHaveBeenCalled();
	});

	it('run for .tsrx documents while TypeScript 7 serves them', () => {
		install('TypeScriptTeam.native-preview');
		set_use_tsgo('js/ts', true);
		const { client } = activate();
		expect(host.activateAutoInsertion).toHaveBeenCalledExactlyOnceWith(
			[{ language: 'tsrx' }],
			client,
		);
	});

	it.each([
		'TypeScriptTeam.vscode-typescript',
		'TypeScriptTeam.vscode-typescript-nightly',
		'TypeScriptTeam.native-preview',
	])('count %s as a TypeScript 7 extension, as VS Code does', (id) => {
		install(id);
		set_use_tsgo('js/ts', true);
		activate();
		expect(host.activateAutoInsertion).toHaveBeenCalledOnce();
	});

	it('stay off when TypeScript 7 is on but no TypeScript 7 extension is installed', () => {
		set_use_tsgo('js/ts', true);
		activate();
		expect(host.activateAutoInsertion).not.toHaveBeenCalled();
	});

	it('read typescript.experimental.useTsgo only while js/ts.experimental.useTsgo is not set', () => {
		install('TypeScriptTeam.native-preview');
		set_use_tsgo('typescript', true);
		activate();
		expect(host.activateAutoInsertion).toHaveBeenCalledOnce();
		set_use_tsgo('js/ts', false);
		expect(registrations[0].dispose).toHaveBeenCalledOnce();
	});

	it('follow TypeScript 7 being turned on and off, and its extension being removed', () => {
		install('TypeScriptTeam.native-preview');
		activate();
		// The TypeScript 7 extension turns itself on at its first start.
		set_use_tsgo('js/ts', true);
		expect(host.activateAutoInsertion).toHaveBeenCalledOnce();
		set_use_tsgo('js/ts', true);
		expect(host.activateAutoInsertion).toHaveBeenCalledOnce();
		set_use_tsgo('js/ts', false);
		expect(registrations[0].dispose).toHaveBeenCalledOnce();
		set_use_tsgo('js/ts', true);
		expect(host.activateAutoInsertion).toHaveBeenCalledTimes(2);
		uninstall('TypeScriptTeam.native-preview');
		expect(registrations[1].dispose).toHaveBeenCalledOnce();
	});

	it('stop with the extension', () => {
		install('TypeScriptTeam.native-preview');
		set_use_tsgo('js/ts', true);
		const { dispose } = activate();
		dispose();
		expect(registrations[0].dispose).toHaveBeenCalledOnce();
	});
});
