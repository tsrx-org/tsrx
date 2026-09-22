import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activate_typescript } from '../src/typescript.js';

const host = vi.hoisted(() => ({
	getExtension: vi.fn(),
	onDidChangeExtensions: vi.fn(),
}));

// Deliberately no workspace/configuration API: selection belongs to Microsoft's extensions.
vi.mock('vscode', () => ({
	default: {
		extensions: { getExtension: host.getExtension, onDidChange: host.onDidChangeExtensions },
	},
}));

function setup() {
	const registration = { dispose: vi.fn() };
	const api = { registerContentMappers: vi.fn(() => registration) };
	const native = { id: 'TypeScriptTeam.native-preview', activate: vi.fn(async () => api) };
	const builtin = { id: 'vscode.typescript-language-features', activate: vi.fn(async () => ({})) };
	/** @type {Map<string, { id: string, activate: () => Promise<unknown> }>} */
	const extensions = new Map([
		[native.id, native],
		[builtin.id, builtin],
	]);
	host.getExtension.mockImplementation((id) => {
		const extension = extensions.get(id);
		return extension && { ...extension };
	});
	host.onDidChangeExtensions.mockReturnValue({ dispose: vi.fn() });
	const context = /** @type {import('vscode').ExtensionContext} */ (
		/** @type {unknown} */ ({
			extension: {
				id: 'TSRX.tsrx-vscode-plugin',
				packageJSON: { contributes: { languages: [{ id: 'tsrx', extensions: ['.tsrx'] }] } },
			},
			subscriptions: [],
		})
	);
	return {
		context,
		extensions,
		native,
		builtin,
		api,
		registration,
		change_extensions: () => host.onDidChangeExtensions.mock.calls[0][0](),
		dispose: () => context.subscriptions.forEach((subscription) => subscription.dispose()),
	};
}

beforeEach(() => vi.clearAllMocks());

describe('TypeScript activation for .tsrx documents', () => {
	it("activates both Microsoft extensions and registers the manifest's TSRX extensions once", async () => {
		const state = setup();
		state.context.extension.packageJSON.contributes.languages = [
			{ id: 'css', extensions: ['.css'] },
			{ id: 'tsrx', extensions: ['.tsrx', '.tsrx-test'] },
		];
		await activate_typescript(state.context);
		await state.change_extensions();
		expect(state.builtin.activate).toHaveBeenCalledOnce();
		expect(state.native.activate).toHaveBeenCalledOnce();
		expect(state.api.registerContentMappers).toHaveBeenCalledExactlyOnceWith(
			'TSRX.tsrx-vscode-plugin',
			[{ extensions: ['.tsrx', '.tsrx-test'] }],
		);
		state.dispose();
		expect(state.registration.dispose).toHaveBeenCalledOnce();
	});

	it('activates classic TypeScript when the native extension is absent', async () => {
		const state = setup();
		state.extensions.delete(state.native.id);
		await activate_typescript(state.context);
		expect(state.builtin.activate).toHaveBeenCalledOnce();
		expect(state.native.activate).not.toHaveBeenCalled();
	});

	it('registers when a native extension becomes available later', async () => {
		const state = setup();
		state.extensions.delete(state.native.id);
		await activate_typescript(state.context);
		state.extensions.set(state.native.id, state.native);
		await state.change_extensions();
		expect(state.api.registerContentMappers).toHaveBeenCalledOnce();
		expect(state.builtin.activate).toHaveBeenCalledOnce();
	});

	it('removes stale registrations and registers again if an extension returns', async () => {
		const state = setup();
		await activate_typescript(state.context);
		state.extensions.delete(state.native.id);
		await state.change_extensions();
		expect(state.registration.dispose).toHaveBeenCalledOnce();
		state.extensions.set(state.native.id, state.native);
		await state.change_extensions();
		expect(state.api.registerContentMappers).toHaveBeenCalledTimes(2);
	});

	it.each([{}, undefined])(
		'tolerates extensions without a content-mapper API (%j)',
		async (api) => {
			const state = setup();
			state.extensions.set(state.native.id, { id: state.native.id, activate: async () => api });
			await activate_typescript(state.context);
			expect(state.builtin.activate).toHaveBeenCalledOnce();
			expect(state.api.registerContentMappers).not.toHaveBeenCalled();
		},
	);

	it('uses the mapper API by capability even if the built-in extension provides it', async () => {
		const state = setup();
		state.extensions.delete(state.native.id);
		state.builtin.activate.mockResolvedValue(state.api);
		await activate_typescript(state.context);
		expect(state.api.registerContentMappers).toHaveBeenCalledOnce();
	});

	it('still activates the other extension if one fails', async () => {
		const state = setup();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		state.builtin.activate.mockRejectedValue(new Error('Activation failed'));
		try {
			await activate_typescript(state.context);
			expect(state.api.registerContentMappers).toHaveBeenCalledOnce();
			expect(warn).toHaveBeenCalledOnce();
		} finally {
			warn.mockRestore();
		}
	});

	it('does not register after disposal while activation is pending', async () => {
		const state = setup();
		const activation = Promise.withResolvers();
		state.native.activate.mockReturnValue(activation.promise);
		const pending = activate_typescript(state.context);
		await vi.waitFor(() => expect(state.native.activate).toHaveBeenCalledOnce());
		state.dispose();
		activation.resolve(state.api);
		await pending;
		expect(state.api.registerContentMappers).not.toHaveBeenCalled();
	});

	it('does not register an extension removed while its activation is pending', async () => {
		const state = setup();
		const activation = Promise.withResolvers();
		state.native.activate.mockReturnValue(activation.promise);
		const pending = activate_typescript(state.context);
		await vi.waitFor(() => expect(state.native.activate).toHaveBeenCalledOnce());
		state.extensions.delete(state.native.id);
		const changed = state.change_extensions();
		activation.resolve(state.api);
		await pending;
		await changed;
		expect(state.api.registerContentMappers).not.toHaveBeenCalled();
	});
});
