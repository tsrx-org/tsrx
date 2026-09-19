/**
 * Selection of the TypeScript backend the language server runs beside.
 *
 * - `classic`: the server hosts TypeScript 5 itself through Volar
 *   (`volar-service-typescript`) and wraps its results for `.tsrx` files.
 * - `native`: TypeScript 7 owns every TypeScript feature for `.tsrx` files
 *   through `@tsrx/content-mapper`; the server only serves what TypeScript
 *   does not (snippets, CSS in `<style>`, document symbols, auto-insert,
 *   CSS-class hover and definition, keyword highlights).
 *
 * Both backends must never run on the same file, so the choice is made once
 * at startup, from the `--typescript-backend=<name>` command-line flag or the
 * `typescriptBackend` initialization option (the flag wins).
 */

/** @typedef {'classic' | 'native'} TypeScriptBackend */

export const TYPESCRIPT_BACKENDS = /** @type {const} */ (['classic', 'native']);
export const DEFAULT_TYPESCRIPT_BACKEND = /** @type {TypeScriptBackend} */ ('classic');
export const TYPESCRIPT_BACKEND_FLAG = '--typescript-backend';

/**
 * @param {unknown} value
 * @returns {value is TypeScriptBackend}
 */
export function is_typescript_backend(value) {
	return typeof value === 'string' && TYPESCRIPT_BACKENDS.includes(/** @type {any} */ (value));
}

/**
 * Read `--typescript-backend=<name>` (or `--typescript-backend <name>`) from
 * a command line. Returns the raw value so callers can report invalid ones.
 * @param {readonly string[]} argv
 * @returns {string | undefined}
 */
export function read_typescript_backend_flag(argv) {
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === TYPESCRIPT_BACKEND_FLAG) {
			return argv[index + 1];
		}
		if (arg.startsWith(`${TYPESCRIPT_BACKEND_FLAG}=`)) {
			return arg.slice(TYPESCRIPT_BACKEND_FLAG.length + 1);
		}
	}
	return undefined;
}

/**
 * @param {{ argv?: readonly string[], initializationOptions?: unknown }} sources
 * @returns {{ backend: TypeScriptBackend, source: 'flag' | 'initializationOptions' | 'default', invalid?: string }}
 */
export function resolve_typescript_backend({ argv = [], initializationOptions } = {}) {
	const flag = read_typescript_backend_flag(argv);
	if (flag !== undefined) {
		if (is_typescript_backend(flag)) {
			return { backend: flag, source: 'flag' };
		}
		return { backend: DEFAULT_TYPESCRIPT_BACKEND, source: 'default', invalid: flag };
	}
	const option =
		initializationOptions && typeof initializationOptions === 'object'
			? /** @type {{ typescriptBackend?: unknown }} */ (initializationOptions).typescriptBackend
			: undefined;
	if (option !== undefined) {
		if (is_typescript_backend(option)) {
			return { backend: option, source: 'initializationOptions' };
		}
		return { backend: DEFAULT_TYPESCRIPT_BACKEND, source: 'default', invalid: String(option) };
	}
	return { backend: DEFAULT_TYPESCRIPT_BACKEND, source: 'default' };
}

/**
 * The TypeScript installation the classic backend hosts, from the Volar-style
 * `typescript.tsdk` initialization option: the absolute path of a TypeScript
 * `lib` directory (the one containing `typescript.js`). The VS Code extension
 * passes the TypeScript VS Code itself runs for the workspace; other editors
 * may pass their own. Without it the server loads the `typescript` package
 * resolvable from its own location (the peer dependency).
 * @param {unknown} initializationOptions
 * @returns {string | undefined}
 */
export function resolve_typescript_tsdk(initializationOptions) {
	if (!initializationOptions || typeof initializationOptions !== 'object') {
		return undefined;
	}
	const typescript = /** @type {{ typescript?: unknown }} */ (initializationOptions).typescript;
	if (!typescript || typeof typescript !== 'object') {
		return undefined;
	}
	const tsdk = /** @type {{ tsdk?: unknown }} */ (typescript).tsdk;
	return typeof tsdk === 'string' && tsdk.length > 0 ? tsdk : undefined;
}
