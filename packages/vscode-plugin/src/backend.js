/**
 * TypeScript backend selection for the VS Code extension. Pure functions, no
 * `vscode` import, so they are unit-tested outside the extension host.
 *
 * Two backends can give `.tsrx` files TypeScript features, and only one may
 * run on a file. There is no setting of this extension's own: the backend
 * follows VS Code's own TypeScript 7 switch, which the user controls through
 * the "Select TypeScript Version" picker. Nothing here looks at, activates or
 * talks to any other extension.
 *
 * - `classic` (TypeScript 7 off): VS Code's built-in TypeScript extension
 *   (TypeScript 5.9) serves the workspace. This extension patches it to
 *   recognize `tsrx` and hosts TypeScript inside the TSRX language server.
 * - `native` (TypeScript 7 on): TypeScript 7 serves the workspace and runs
 *   `@tsrx/content-mapper` for the `.tsrx` files each project declares under
 *   `contentMappers` in its `tsconfig.json`. TypeScript reads that entry itself,
 *   so this extension only stops patching the built-in TypeScript extension and
 *   runs the TSRX language server slimmed down (`--typescript-backend=native`).
 */

/**
 * The VS Code setting that hands JavaScript and TypeScript over from the
 * built-in TypeScript extension to TypeScript 7. Declared by VS Code's built-in
 * TypeScript extension under the `js/ts` section; the `typescript` section is
 * its deprecated spelling, still honoured. The "Select TypeScript Version"
 * picker writes the same key.
 */
export const TYPESCRIPT_7_SETTING_KEY = 'experimental.useTsgo';
export const TYPESCRIPT_7_SETTING_SECTIONS = ['js/ts', 'typescript'];
export const TYPESCRIPT_7_SETTING = `${TYPESCRIPT_7_SETTING_SECTIONS[0]}.${TYPESCRIPT_7_SETTING_KEY}`;

/** @typedef {'classic' | 'native'} Backend */

/**
 * The backend that matches VS Code's TypeScript 7 switch.
 * @param {boolean} typescript7Enabled
 * @returns {Backend}
 */
export function resolve_backend(typescript7Enabled) {
	return typescript7Enabled ? 'native' : 'classic';
}

/**
 * The settings VS Code's built-in TypeScript extension reads for a workspace
 * TypeScript: the unified key and its deprecated spelling. Its "Select
 * TypeScript Version" picker writes the unified key when the user picks the
 * workspace version. That path is only loaded after the user opts in; the
 * choice itself is workspace state (`USE_WORKSPACE_TSDK_STATE_KEY`), not the
 * setting.
 */
export const TSDK_SETTINGS = [
	{ section: 'js/ts', key: 'tsdk.path' },
	{ section: 'typescript', key: 'tsdk' },
];

/**
 * Workspace-state key VS Code's TypeScript extension (and Volar-style hosts)
 * use for the "TypeScript: Select TypeScript Version" opt-in. A configured
 * `js/ts.tsdk.path` / `typescript.tsdk` is only the location to load when this
 * is true; switching back to VS Code's copy leaves the path in place.
 */
export const USE_WORKSPACE_TSDK_STATE_KEY = 'typescript.useWorkspaceTsdk';

/**
 * The TypeScript `lib` directories to try for the classic backend, in order:
 * the preferred tsdk paths (an absolute path as is, a relative one against
 * every workspace folder), then the TypeScript VS Code itself ships, then
 * optional fallback paths (a workspace tsdk that is configured but not opted
 * into, used only when VS Code's copy has no `typescript.js`). The first
 * one that contains `typescript.js` wins, so the classic backend hosts the
 * same TypeScript VS Code runs for the workspace instead of a bundled copy.
 * @param {{ settingPaths: readonly string[], workspaceFolders: readonly string[], vscodeTypescriptLib: string | undefined, fallbackSettingPaths?: readonly string[] }} input
 * @returns {string[]}
 */
export function tsdk_candidates({
	settingPaths,
	workspaceFolders,
	vscodeTypescriptLib,
	fallbackSettingPaths = [],
}) {
	/** @type {string[]} */
	const candidates = [];
	const add_setting_paths = (/** @type {readonly string[]} */ settings) => {
		for (const setting of settings) {
			const normalized = setting.replace(/\\/g, '/');
			if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
				candidates.push(normalized);
			} else {
				for (const folder of workspaceFolders) {
					candidates.push(`${folder.replace(/\\/g, '/').replace(/\/$/, '')}/${normalized}`);
				}
			}
		}
	};
	add_setting_paths(settingPaths);
	if (vscodeTypescriptLib) {
		candidates.push(vscodeTypescriptLib.replace(/\\/g, '/'));
	}
	add_setting_paths(fallbackSettingPaths);
	return [...new Set(candidates)];
}
