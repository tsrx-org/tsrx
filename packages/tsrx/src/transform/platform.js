/** @import * as AST from 'estree' */
/** @import { CompileError, Platform, PlatformSpecializationOptions } from '../../types/index' */

import MagicString from 'magic-string';
import { decode, encode } from '@jridgewell/sourcemap-codec';
import { DIAGNOSTIC_CODES } from '../diagnostics.js';
import { error } from '../errors.js';
import { parse_module } from '../parse/parse-module.js';
import { child_nodes, is_ast_node } from '../utils/ast.js';

export const PLATFORMS = /** @type {const} */ (['web', 'ios', 'android']);

const platform_set = new Set(PLATFORMS);

/** @param {unknown} value @returns {string} */
function render_value(value) {
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

/**
 * Validate a public compiler/build integration platform option without
 * coercion. `undefined` represents an unconfigured project and remains valid.
 *
 * @param {unknown} platform
 * @param {string} [option_name]
 * @returns {Platform | undefined}
 */
export function validate_platform(platform, option_name = 'platform') {
	if (platform === undefined || platform_set.has(/** @type {Platform} */ (platform))) {
		return /** @type {Platform | undefined} */ (platform);
	}

	const rendered = render_value(platform);
	throw new TypeError(
		`Invalid TSRX ${option_name} ${rendered}. Expected "web", "ios", or "android".`,
	);
}

/**
 * Return the selected platform name for one of the three exact supported
 * property paths, or `null` for every other expression.
 *
 * Parentheses do not change whether an if-test is exact. Other wrappers and
 * operators intentionally do: `!flag`, `flag === true`, optional access, and
 * computed access remain ordinary runtime expressions.
 *
 * @param {AST.Node | null | undefined} node
 * @returns {Platform | null}
 */
export function get_platform_flag(node) {
	while (node?.type === 'ParenthesizedExpression') {
		node = node.expression;
	}

	if (
		node?.type !== 'MemberExpression' ||
		node.computed ||
		node.optional ||
		node.property.type !== 'Identifier' ||
		!platform_set.has(/** @type {Platform} */ (node.property.name))
	) {
		return null;
	}

	const platform = node.object;
	if (!is_platform_namespace(platform)) return null;

	return /** @type {Platform} */ (node.property.name);
}

/** @param {AST.Node | null | undefined} node @returns {boolean} */
function is_platform_namespace(node) {
	if (
		node?.type !== 'MemberExpression' ||
		node.computed ||
		node.optional ||
		node.property.type !== 'Identifier' ||
		node.property.name !== 'platform'
	) {
		return false;
	}

	const env = node.object;
	if (
		env.type !== 'MemberExpression' ||
		env.computed ||
		env.optional ||
		env.property.type !== 'Identifier' ||
		env.property.name !== 'env'
	) {
		return false;
	}

	const import_meta = env.object;
	if (
		import_meta.type !== 'MetaProperty' ||
		import_meta.meta.type !== 'Identifier' ||
		import_meta.meta.name !== 'import' ||
		import_meta.property.type !== 'Identifier' ||
		import_meta.property.name !== 'meta'
	) {
		return false;
	}

	return true;
}

/**
 * Find the first exact platform flag anywhere in a parsed source tree.
 *
 * @param {AST.Node} node
 * @returns {AST.Node | null}
 */
function find_platform_flag(node) {
	if (get_platform_flag(node) !== null) return node;

	for (const child of child_nodes(node)) {
		const found = find_platform_flag(child);
		if (found) return found;
	}

	return null;
}

/** @param {AST.Node} node @returns {boolean} */
export function has_platform_flag(node) {
	return find_platform_flag(node) !== null;
}

/** @param {AST.Node} node @returns {boolean} */
export function has_platform_namespace(node) {
	if (is_platform_namespace(node)) return true;
	return child_nodes(node).some(has_platform_namespace);
}

/**
 * A location-free no-op used when a false platform guard has no `else` arm.
 * Keeping a statement in single-statement slots (labels, loops, and outer
 * if-statements) preserves a valid ESTree shape without mapping discarded
 * source into generated output.
 *
 * @returns {AST.EmptyStatement}
 */
function empty_statement() {
	return { type: 'EmptyStatement', metadata: { path: [] } };
}

/**
 * Copy-on-write specialization of arbitrary AST properties. An exact ordinary
 * `if (import.meta.env.platform.<name>)` is replaced by its selected original
 * statement. A selected block therefore retains both its lexical scope and its
 * authored source locations.
 *
 * @param {AST.Node} node
 * @param {Platform} platform
 * @returns {AST.Node}
 */
function specialize_node(node, platform) {
	if (node.type === 'IfStatement') {
		const flag = get_platform_flag(node.test);
		if (flag !== null) {
			const selected = flag === platform ? node.consequent : node.alternate;
			return selected ? specialize_node(selected, platform) : empty_statement();
		}
	}

	/** @type {Record<string, unknown> | null} */
	let clone = null;
	const record = /** @type {Record<string, unknown>} */ (node);

	for (const key of Object.keys(record)) {
		if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;

		const value = record[key];
		if (Array.isArray(value)) {
			/** @type {unknown[] | null} */
			let next_array = null;
			for (let index = 0; index < value.length; index += 1) {
				const item = value[index];
				if (!is_ast_node(item)) continue;
				const next_item = specialize_node(item, platform);
				if (next_item !== item) {
					next_array ??= [...value];
					next_array[index] = next_item;
				}
			}
			if (next_array) {
				clone ??= { ...record };
				clone[key] = next_array;
			}
			continue;
		}

		if (is_ast_node(value)) {
			const next_value = specialize_node(value, platform);
			if (next_value !== value) {
				clone ??= { ...record };
				clone[key] = next_value;
			}
		}
	}

	return /** @type {AST.Node} */ (clone ?? node);
}

/**
 * Select ordinary platform-guarded branches before semantic analysis. Parsing
 * has already visited every branch, so syntax errors still surface. Without a
 * configured platform, use of any recognized flag is an actionable source
 * diagnostic and the AST remains unchanged.
 *
 * @param {AST.Program} ast
 * @param {unknown} platform_value
 * @param {string | null | undefined} filename
 * @param {PlatformSpecializationOptions} [options]
 * @returns {AST.Program}
 */
export function specialize_platform(ast, platform_value, filename, options = {}) {
	const platform = validate_platform(platform_value);
	if (platform === undefined) {
		const flag = find_platform_flag(ast);
		if (flag) {
			error(
				'Platform flag usage requires a configured TSRX platform. Set `tsrx.platform` in tsconfig.json and pass the same `platform` to the build integration ("web", "ios", or "android").',
				filename ?? null,
				flag,
				options.errors,
				options.comments,
				DIAGNOSTIC_CODES.PLATFORM_REQUIRED,
			);
		}
		return ast;
	}

	return /** @type {AST.Program} */ (specialize_node(ast, platform));
}

/**
 * Build the exact boolean definitions understood by supported bundlers.
 *
 * @param {unknown} platform_value
 * @returns {Record<`import.meta.env.platform.${Platform}`, boolean>}
 */
export function create_platform_definitions(platform_value) {
	const platform = validate_platform(platform_value);
	if (platform === undefined) {
		return /** @type {Record<`import.meta.env.platform.${Platform}`, boolean>} */ ({});
	}

	return {
		'import.meta.env.platform.web': platform === 'web',
		'import.meta.env.platform.ios': platform === 'ios',
		'import.meta.env.platform.android': platform === 'android',
	};
}

/**
 * Merge platform constants into a builder's native definition map and reject
 * an existing exact definition that selects a different value.
 *
 * @param {Record<string, unknown> | undefined} definitions
 * @param {unknown} platform_value
 * @param {{ integration?: string, serialize?: boolean }} [options]
 * @returns {Record<string, unknown>}
 */
export function merge_platform_definitions(definitions, platform_value, options = {}) {
	const platform_definitions = create_platform_definitions(platform_value);
	const merged = { ...(definitions ?? {}) };
	const integration = options.integration ?? 'build integration';
	for (const parent of ['import.meta', 'import.meta.env', 'import.meta.env.platform']) {
		if (Object.prototype.hasOwnProperty.call(merged, parent)) {
			throw new Error(
				`Conflicting ${integration} definition for ${parent}: TSRX defines the three exact import.meta.env.platform.* paths for platform ${render_value(platform_value)}.`,
			);
		}
	}

	for (const [key, expected] of Object.entries(platform_definitions)) {
		if (Object.prototype.hasOwnProperty.call(merged, key)) {
			const actual = merged[key];
			const matches = actual === expected || actual === String(expected);
			if (!matches) {
				throw new Error(
					`Conflicting ${integration} definition for ${key}: expected ${expected} for TSRX platform ${render_value(platform_value)}, received ${render_value(actual)}.`,
				);
			}
		}
		merged[key] = options.serialize ? String(expected) : expected;
	}

	return merged;
}

/**
 * Add editor-only ambient types for flags retained in virtual TSX (for example
 * a runtime `@if`). The original source is an external module by virtue of
 * using `import.meta`; `export {}` preserves that status if early pruning
 * removed its final import-meta expression.
 *
 * @param {import('../../types/index').VolarMappingsResult} result
 * @param {unknown} platform_value
 * @returns {import('../../types/index').VolarMappingsResult}
 */
export function with_platform_types(result, platform_value) {
	const platform = validate_platform(platform_value);
	const value_type = (/** @type {Platform} */ name) =>
		platform === undefined ? 'boolean' : name === platform ? 'true' : 'false';
	const declarations = `
export {};
declare global {
	interface ImportMetaEnv {
		readonly platform: string & {
			readonly web: ${value_type('web')};
			readonly ios: ${value_type('ios')};
			readonly android: ${value_type('android')};
		};
	}
	interface ImportMeta {
		readonly [key: \`env\${string}\`]: ImportMetaEnv;
	}
}
`;
	return { ...result, code: result.code + declarations };
}

/**
 * @param {unknown} map
 * @returns {import('source-map').RawSourceMap | undefined}
 */
function normalize_source_map(map) {
	if (map == null) return undefined;
	const parsed = typeof map === 'string' ? JSON.parse(map) : map;
	return parsed && typeof parsed === 'object' && typeof parsed.mappings === 'string'
		? /** @type {import('source-map').RawSourceMap} */ (parsed)
		: undefined;
}

/**
 * Compose the high-resolution follow-up map through an incoming loader map.
 *
 * @param {import('source-map').RawSourceMap} input_map
 * @param {import('source-map').RawSourceMap} output_map
 * @returns {import('source-map').RawSourceMap}
 */
function compose_source_maps(input_map, output_map) {
	const input_lines = decode(input_map.mappings);
	const output_lines = decode(output_map.mappings);

	/**
	 * Trace an intermediate generated position through the prior map with the
	 * source-map spec's greatest-lower-bound lookup.
	 *
	 * @param {number} line
	 * @param {number} column
	 * @returns {[number, number, number, number] | [number, number, number, number, number] | null}
	 */
	function trace(line, column) {
		const segments = input_lines[line];
		if (!segments?.length) return null;

		let low = 0;
		let high = segments.length - 1;
		let found = -1;
		while (low <= high) {
			const middle = (low + high) >> 1;
			if (segments[middle][0] <= column) {
				found = middle;
				low = middle + 1;
			} else {
				high = middle - 1;
			}
		}
		if (found < 0 || segments[found].length < 4) return null;

		const segment = segments[found];
		return segment.length > 4
			? [
					column,
					/** @type {number} */ (segment[1]),
					/** @type {number} */ (segment[2]),
					/** @type {number} */ (segment[3]),
					/** @type {number} */ (segment[4]),
				]
			: [
					column,
					/** @type {number} */ (segment[1]),
					/** @type {number} */ (segment[2]),
					/** @type {number} */ (segment[3]),
				];
	}

	/** @type {Array<Array<[number] | [number, number, number, number] | [number, number, number, number, number]>>} */
	const composed = [];
	for (const output_line of output_lines) {
		/** @type {Array<[number] | [number, number, number, number] | [number, number, number, number, number]>} */
		const composed_line = [];
		for (const output_segment of output_line) {
			if (output_segment.length < 4) {
				composed_line.push([output_segment[0]]);
				continue;
			}

			const traced = trace(
				/** @type {number} */ (output_segment[2]),
				/** @type {number} */ (output_segment[3]),
			);
			if (!traced) {
				// Break any preceding mapping rather than allowing it to bleed across
				// generated text that has no origin in the incoming map.
				composed_line.push([output_segment[0]]);
				continue;
			}
			traced[0] = output_segment[0];
			composed_line.push(traced);
		}
		composed.push(composed_line);
	}

	return {
		...input_map,
		file: output_map.file ?? input_map.file,
		mappings: encode(composed),
	};
}

/**
 * Replace exact platform flag expressions in a JavaScript/TypeScript module.
 * This is used by integrations without a native `define` facility. It does not
 * perform dead-code elimination; the downstream bundler sees literal booleans
 * and owns that optimization.
 *
 * @param {string} source
 * @param {string} filename
 * @param {unknown} platform_value
 * @param {import('source-map').RawSourceMap | string | null} [input_map]
 * @returns {{ code: string, map: import('source-map').RawSourceMap }}
 */
export function replace_platform_flags(source, filename, platform_value, input_map) {
	const platform = validate_platform(platform_value);
	if (platform === undefined) {
		throw new TypeError('Replacing TSRX platform flags requires a configured platform.');
	}

	const incoming = normalize_source_map(input_map);
	const ast = parse_module(source, filename);
	const output = new MagicString(source);

	/** @param {AST.Node} node */
	function visit(node) {
		const flag = get_platform_flag(node);
		if (flag !== null && node.start !== undefined && node.end !== undefined) {
			output.overwrite(node.start, node.end, flag === platform ? 'true' : 'false');
			return;
		}

		for (const child of child_nodes(node)) visit(child);
	}

	visit(ast);
	if (!output.hasChanged() && incoming) {
		return { code: source, map: incoming };
	}

	const map = output.generateMap({ source: filename, includeContent: true, hires: true });
	return {
		code: output.toString(),
		map: incoming ? compose_source_maps(incoming, map) : map,
	};
}
