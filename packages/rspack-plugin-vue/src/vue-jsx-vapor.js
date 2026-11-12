import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { transformVueJsxVapor } = require('vue-jsx-vapor/api');
// vue-jsx-vapor's plugin hooks as its Rollup plugin. Called outside Rollup,
// each hook applies its own `filter` first, as unplugin does for Rollup
// versions without hook filters.
const { default: create_vue_jsx_vapor_plugins } = require('vue-jsx-vapor/rollup');

// The macros import helper modules by ids such as `/vue-jsx-vapor/props`.
export const VAPOR_HELPER_ID_PATTERN = /^\/vue-jsx-vapor\//;
// A `defineStyle` stylesheet: `lang.css`, or `lang.module.css` for a CSS module.
export const VAPOR_STYLESHEET_ID_PATTERN =
	/^\/vue-jsx-vapor\/macros\/define-style\/.*&lang\.(module\.)?(\w+)$/;
const VAPOR_STYLESHEET_IMPORT_PATTERN = /"(\/vue-jsx-vapor\/macros\/define-style\/[^"]+)"/g;
// A stylesheet's import carries its source, so loading it needs no state.
const VAPOR_SOURCE_PARAM = '&vapor-source=';

const DEFAULT_VAPOR_OPTIONS = {
	macros: true,
	compiler: {
		runtimeModuleName: 'vue-jsx-vapor',
	},
};

/**
 * @typedef {{ macros?: boolean | object, compiler?: { runtimeModuleName?: string } }} VaporOptions
 * @typedef {{ code: string, map?: unknown }} VaporHookResult
 * @typedef {((...args: string[]) => unknown) | { handler: (...args: string[]) => unknown }} VueJsxVaporHook
 * @typedef {{ name: string, load?: VueJsxVaporHook, transform?: VueJsxVaporHook }} VueJsxVaporPlugin
 */

/**
 * @param {VaporOptions | undefined} options
 */
function resolve_vapor_options(options) {
	const { interop: _interop, ...rest } = /** @type {VaporOptions & { interop?: boolean }} */ (
		options ?? {}
	);
	return {
		...DEFAULT_VAPOR_OPTIONS,
		...rest,
		compiler: {
			...DEFAULT_VAPOR_OPTIONS.compiler,
			...rest.compiler,
		},
	};
}

/**
 * Calls a vue-jsx-vapor plugin hook and returns the code it produced, if any.
 *
 * @param {VueJsxVaporHook} hook
 * @param {...string} args
 * @returns {Promise<VaporHookResult | undefined>}
 */
async function call_vapor_hook(hook, ...args) {
	const result = /** @type {string | VaporHookResult | null | undefined} */ (
		await (typeof hook === 'function' ? hook : hook.handler)(...args)
	);
	return typeof result === 'string' ? { code: result } : (result ?? undefined);
}

/**
 * Splits a helper module request into its id and, for a stylesheet, the
 * source its import carries.
 *
 * @param {string} request
 * @returns {{ id: string, source: string | undefined }}
 */
export function parse_vapor_helper_request(request) {
	const index = request.indexOf(VAPOR_SOURCE_PARAM);
	if (index === -1) return { id: request, source: undefined };
	const source = request.slice(index + VAPOR_SOURCE_PARAM.length);
	return { id: request.slice(0, index), source: Buffer.from(source, 'base64url').toString() };
}

/**
 * vue-jsx-vapor set up as its Vite plugin sets it up: the macros, unless
 * `macros` is false, expand before the Vapor transform, and the helper modules
 * they import load through the same plugin hooks.
 *
 * @param {VaporOptions | undefined} options
 */
export function create_vue_jsx_vapor(options) {
	const vapor_options = resolve_vapor_options(options);
	/** @type {VueJsxVaporPlugin[]} */
	const plugins = [create_vue_jsx_vapor_plugins(vapor_options)].flat();
	const macros = plugins.find((plugin) => plugin.name === '@vue-jsx-vapor/macros')?.transform;

	/**
	 * The first load hook's result for a helper module id.
	 *
	 * @param {string} id
	 * @returns {Promise<string | undefined>}
	 */
	async function load(id) {
		for (const plugin of plugins) {
			const code = plugin.load && (await call_vapor_hook(plugin.load, id))?.code;
			if (code !== undefined) return code;
		}
		return undefined;
	}

	return {
		/**
		 * Expands the macros, unless their `include` and `exclude` options leave
		 * the module out, then runs the Vapor transform. Each `defineStyle`
		 * import gets its stylesheet's source, so a cached module still loads it.
		 *
		 * @param {string} code
		 * @param {string} file_path the `.tsrx` module's path
		 * @returns {Promise<{ code: string, maps: unknown[] }>} the code, and the
		 *   source map of each step in order
		 */
		async transform(code, file_path) {
			// The macros' `include` and `exclude` see the id the Vite plugin gives it.
			const expanded = macros ? await call_vapor_hook(macros, code, `${file_path}.tsx`) : undefined;
			// vue-jsx-vapor's HMR code is written for Vite's `import.meta.hot`, and its
			// SSR output is for Vue's server renderer, so both stay off, as in
			// vue-jsx-vapor's own Rspack plugin.
			const result = transformVueJsxVapor(
				expanded?.code ?? code,
				file_path.replace(/\.tsrx$/, '.tsx'),
				vapor_options,
				true,
				false,
				false,
			);
			/** @type {Map<string, string>} */
			const sources = new Map();
			for (const [, id] of String(result.code).matchAll(VAPOR_STYLESHEET_IMPORT_PATTERN)) {
				const source = await load(id);
				if (source !== undefined) sources.set(id, source);
			}
			return {
				code: String(result.code).replace(VAPOR_STYLESHEET_IMPORT_PATTERN, (specifier, id) => {
					const source = sources.get(id);
					if (source === undefined) return specifier;
					const encoded = Buffer.from(source).toString('base64url');
					return JSON.stringify(id + VAPOR_SOURCE_PARAM + encoded);
				}),
				maps: [expanded?.map, result.map ? JSON.parse(result.map) : undefined],
			};
		},

		/**
		 * Loads a helper module by its `/vue-jsx-vapor/…` id, or takes the source
		 * its import carries, then runs the transforms for helper modules, such
		 * as the one that compiles a `defineStyle` stylesheet.
		 *
		 * @param {string} id
		 * @param {string} [source]
		 * @returns {Promise<string | undefined>}
		 */
		async load_helper(id, source) {
			let code = source ?? (await load(id));
			if (code === undefined) return undefined;
			for (const { transform } of plugins) {
				code = (transform && (await call_vapor_hook(transform, code, id))?.code) ?? code;
			}
			return code;
		},
	};
}

/** @typedef {ReturnType<typeof create_vue_jsx_vapor>} VueJsxVapor */
