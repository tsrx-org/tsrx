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
