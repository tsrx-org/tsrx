/**
 * TypeScript backend selection for the VS Code extension. Pure functions, no
 * `vscode` import, so they are unit-tested outside the extension host.
 *
 * Two backends can give `.tsrx` files TypeScript features, and only one may
 * run on a file:
 *
 * - `classic`: this extension patches the built-in TypeScript extension to
 *   recognise `tsrx` and hosts TypeScript 5 or 6 inside the TSRX language server.
 * - `native`: TypeScript 7 owns TypeScript features through
 *   `@tsrx/content-mapper`, which the project declares under `contentMappers`
 *   in its `tsconfig.json`. TypeScript reads that entry itself, so this
 *   extension never talks to the TypeScript 7 extension; it only stops patching
 *   the built-in TypeScript extension and runs the TSRX language server slimmed
 *   down (`--typescript-backend=native`).
 */

export const BACKEND_SETTING = 'tsrx.typescript.backend';

/**
 * The VS Code setting that hands JavaScript and TypeScript over from the
 * built-in TypeScript extension to the TypeScript 7 extension. Declared by VS
 * Code's built-in TypeScript extension under the `js/ts` section; the
 * `typescript` section is its deprecated spelling, still honoured by both
 * extensions. The "Select TypeScript Version" picker writes the same key.
 */
export const TYPESCRIPT_7_SETTING_KEY = 'experimental.useTsgo';
export const TYPESCRIPT_7_SETTING_SECTIONS = ['js/ts', 'typescript'];
export const TYPESCRIPT_7_SETTING = `${TYPESCRIPT_7_SETTING_SECTIONS[0]}.${TYPESCRIPT_7_SETTING_KEY}`;

/** @typedef {'auto' | 'classic' | 'native'} BackendSetting */
/** @typedef {'classic' | 'native'} Backend */
/** @typedef {'setting-classic' | 'setting-native' | 'auto-native' | 'auto-classic'} BackendReason */

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
 * - An explicit `classic` or `native` setting always wins.
 * - `auto` picks native exactly when TypeScript 7 is enabled in VS Code
 *   (`js/ts.experimental.useTsgo`). That is the state in which the TypeScript 7
 *   extension serves the workspace and honours `contentMappers`, and in which
 *   the built-in TypeScript extension that the classic path patches is off.
 *   When it is off, TypeScript 5.9 serves the workspace and ignores
 *   `contentMappers`, so classic is the only backend that gives `.tsrx` files
 *   TypeScript features.
 * @param {{ setting: unknown, typescript7Enabled: boolean }} input
 * @returns {{ backend: Backend, reason: BackendReason }}
 */
export function resolve_backend({ setting, typescript7Enabled }) {
	const normalized = normalize_backend_setting(setting);
	if (normalized === 'classic') {
		return { backend: 'classic', reason: 'setting-classic' };
	}
	if (normalized === 'native') {
		return { backend: 'native', reason: 'setting-native' };
	}
	return typescript7Enabled
		? { backend: 'native', reason: 'auto-native' }
		: { backend: 'classic', reason: 'auto-classic' };
}
