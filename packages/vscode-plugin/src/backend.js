/**
 * TypeScript backend selection for the VS Code extension. Pure functions, no
 * `vscode` import, so they are unit-tested outside the extension host.
 *
 * Two backends can give `.tsrx` files TypeScript features, and only one may
 * run on a file:
 *
 * - `classic`: this extension patches the built-in TypeScript extension to
 *   recognise `tsrx` and hosts TypeScript 5 inside the TSRX language server.
 * - `native`: the TypeScript 7 extension (`TypeScriptTeam.vscode-typescript`)
 *   owns TypeScript features through `@tsrx/content-mapper`. Configured
 *   projects declare the mapper in `tsconfig.json`; for inferred projects the
 *   extension registers a bundled copy through `registerContentMappers`. The
 *   TSRX language server runs slimmed down (`--typescript-backend=native`).
 */

/** The contributor id passed to `registerContentMappers`: publisher.name of this extension. */
export const CONTRIBUTOR_ID = 'TSRX.tsrx-vscode-plugin';

/**
 * Ids of the TypeScript 7 extension, in lookup order: the current id, its
 * nightly channel and the original preview id (the same list VS Code's built-in
 * TypeScript extension consults). The nightly channel can be installed as a
 * compiler-only companion without an API beside the extension that has one, so
 * every installed id is tried for `registerContentMappers`.
 */
export const NATIVE_TYPESCRIPT_EXTENSION_IDS = [
	'TypeScriptTeam.vscode-typescript',
	'TypeScriptTeam.vscode-typescript-nightly',
	'TypeScriptTeam.native-preview',
];

export const BACKEND_SETTING = 'tsrx.typescript.backend';

/** Configuration sections that carry `experimental.useTsgo` (new and legacy spelling). */
export const USE_TSGO_SECTIONS = ['js/ts', 'typescript'];

/** @typedef {'auto' | 'classic' | 'native'} BackendSetting */
/** @typedef {'classic' | 'native'} Backend */
/**
 * `installed` is the state before the extension has been activated (its API
 * is unknown yet); `available` and `no-api` are known after activation.
 * @typedef {'missing' | 'installed' | 'no-api' | 'available'} NativeExtensionState
 */
/**
 * @typedef {'setting-classic'
 * 	| 'setting-native'
 * 	| 'auto-native'
 * 	| 'auto-classic'
 * 	| 'native-extension-missing'
 * 	| 'native-api-missing'} BackendReason
 */

/**
 * @param {unknown} value
 * @returns {BackendSetting}
 */
export function normalize_backend_setting(value) {
	return value === 'classic' || value === 'native' ? value : 'auto';
}

/**
 * Decide which backend to run.
 *
 * - `classic` always wins when asked for.
 * - `native` needs the TypeScript 7 extension with a `registerContentMappers`
 *   API; otherwise the extension falls back to classic and says why. An
 *   `installed` extension is assumed usable so it is only activated (which has
 *   side effects: TypeScript 7 onboarding) when native is the outcome; the
 *   caller re-resolves with `no-api` if activation shows the API is missing.
 * - `auto` picks native exactly when the TypeScript 7 extension is usable and
 *   TypeScript 7 is enabled (`js/ts.experimental.useTsgo`), which is also when
 *   the built-in TypeScript extension that the classic path patches is off.
 * @param {{ setting: unknown, nativeExtension: NativeExtensionState, useTsgo: boolean }} input
 * @returns {{ backend: Backend, reason: BackendReason }}
 */
export function resolve_backend({ setting, nativeExtension, useTsgo }) {
	const normalized = normalize_backend_setting(setting);
	if (normalized === 'classic') {
		return { backend: 'classic', reason: 'setting-classic' };
	}
	if (nativeExtension === 'missing') {
		return normalized === 'native'
			? { backend: 'classic', reason: 'native-extension-missing' }
			: { backend: 'classic', reason: 'auto-classic' };
	}
	if (nativeExtension === 'no-api') {
		return normalized === 'native'
			? { backend: 'classic', reason: 'native-api-missing' }
			: { backend: 'classic', reason: 'auto-classic' };
	}
	if (normalized === 'native') {
		return { backend: 'native', reason: 'setting-native' };
	}
	return useTsgo
		? { backend: 'native', reason: 'auto-native' }
		: { backend: 'classic', reason: 'auto-classic' };
}

/**
 * The contribution handed to `registerContentMappers` so `.tsrx` files in
 * inferred projects (no tsconfig, or a tsconfig without `contentMappers`) are
 * mapped by the copy of `@tsrx/content-mapper` bundled with the extension.
 * Configured projects keep using the mapper they declare in `tsconfig.json`.
 *
 * `inferredProject` is the field name of the current TypeScript 7 extension
 * API; `inferredProjectContribution` is its serialized name, which earlier
 * builds (and the mdx reference extension) accepted on the API as well. Both
 * point at one object so either build reads the same manifest.
 * @param {{ serverPath: string, cwd: unknown, version: string, execPath: string }} input
 */
export function create_content_mapper_contribution({ serverPath, cwd, version, execPath }) {
	const inferredProject = {
		options: {},
		manifest: {
			name: '@tsrx/content-mapper',
			version,
			exec: [execPath, serverPath],
			cwd,
			dynamicConfig: true,
		},
	};
	return {
		extensions: ['.tsrx'],
		inferredProject,
		inferredProjectContribution: inferredProject,
	};
}
