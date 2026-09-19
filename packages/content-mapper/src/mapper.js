/** @import * as AST from 'estree' */
/** @import {CompileError} from '@tsrx/core/types' */
/** @import {InitializeParams, InitializeResult, OpenProjectParams, OpenProjectResult, TransformParams, TransformResult, MapperDiagnostic, MappedOutput} from './protocol.js' */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { NODE_CONFIG_HOST } from '@tsrx/typescript-plugin/src/config-host.js';
import { resolve_consumer_platform_for_file } from '@tsrx/typescript-plugin/src/consumer-compiler.js';
import { resolve_package_entry } from '@tsrx/typescript-plugin/src/package-resolution.js';
import {
	get_compiler_entry_for_file,
	invalidateCompilerResolutionCaches,
	require_tsrx_compiler,
	source_uses_platform_flag,
} from '@tsrx/typescript-plugin/src/language.js';
import { transform_tsrx } from '@tsrx/typescript-plugin/src/transform.js';
import { build_export_stub } from './export-stub.js';
import {
	DIAGNOSTIC_CODE_COMPILE_ERROR,
	DIAGNOSTIC_CODE_INVALID_CONFIG,
	DIAGNOSTIC_CODE_NO_COMPILER,
	DIAGNOSTIC_CODE_USAGE_ERROR,
	DIAGNOSTIC_SOURCE,
	SpanMapFeature,
	SpanMapKind,
} from './protocol.js';
import { to_span_mappings } from './span-mappings.js';

const require = createRequire(import.meta.url);
const bare_package_specifier_pattern =
	/^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*(?:\/[A-Za-z0-9][A-Za-z0-9._~-]*)*$/;

/**
 * The mapper entry's `options` object in tsconfig (`contentMappers[].options`)
 * or in an inferred-project contribution.
 * @typedef {object} MapperOptions
 * @property {string} [compiler] Bare package specifier of the TSRX compiler. Takes precedence over `tsrx.compiler` in the tsconfig chain.
 * @property {'web' | 'ios' | 'android'} [platform] Platform for `import.meta.env.platform` flags. Takes precedence over `tsrx.platform`.
 * @property {boolean} [languageFeatures] `false` clears every editor feature bit while keeping spans for diagnostics (CLI-only projects).
 */

/**
 * @typedef {object} ProjectState
 * @property {string | undefined} configFileName
 * @property {MapperOptions} options
 * @property {Set<string>} dependencies Files whose content affects transform output.
 * @property {Map<string, AST.Program>} lastGood Last successfully parsed source AST per file, for the compile-failure stub. Shared by every project state of a mapper (see {@link create_tsrx_content_mapper}).
 */

/**
 * @typedef {object} ContentMapper
 * @property {(params: InitializeParams) => InitializeResult} initialize
 * @property {(params: OpenProjectParams) => OpenProjectResult} openProject
 * @property {(params: { projectHandle: string }) => void} closeProject
 * @property {(params: TransformParams) => TransformResult} transform
 */

/**
 * Create the `.tsrx` content mapper. Each `projectHandle` owns its own state;
 * nothing is shared between projects except the process-wide compiler
 * resolution caches, which are keyed by directory and reset on every
 * `openProject`, and the last successfully parsed AST per file. The latter is
 * keyed by file name and independent of the project, and TypeScript reopens a
 * project (same or new handle) whenever its identity or a watched file
 * changes, so keeping it at the mapper level is what lets a file that still
 * fails to compile keep its export stub across a reopen.
 * The mapper needs no TypeScript of its own: tsconfig files are read and
 * compilers resolved through `@tsrx/typescript-plugin`'s own reader and
 * package walk, so the native compiler's `typescript` package (which has no
 * JavaScript API) can be the only TypeScript in a project.
 * @param {{ host?: import('@tsrx/typescript-plugin/src/config-host.js').ConfigHost }} [context]
 * @returns {ContentMapper}
 */
export function create_tsrx_content_mapper(context = {}) {
	const host = context.host ?? NODE_CONFIG_HOST;
	/** @type {Map<string, ProjectState>} */
	const projects = new Map();
	/** @type {Map<string, AST.Program>} */
	const last_good = new Map();
	/** Transforms that arrive without a project handle. */
	const standalone = create_project_state(undefined, {});

	/** @type {ContentMapper['initialize']} */
	function initialize(params) {
		if (!params.positionEncodings?.includes('utf-16')) {
			throw new Error('@tsrx/content-mapper requires UTF-16 position encoding');
		}
		return { positionEncoding: 'utf-16', diagnosticSource: DIAGNOSTIC_SOURCE };
	}

	/** @type {ContentMapper['openProject']} */
	function openProject(params) {
		// TypeScript reopens a project when its identity or a watched file
		// changes, which is exactly when directory-keyed discovery caches
		// (installed compilers, package manifests) may be stale.
		invalidateCompilerResolutionCaches();
		const { options, optionDiagnostics } = validate_options(params.options);
		const state = create_project_state(params.configFileName || undefined, options);
		projects.set(params.projectHandle, state);

		// Resolve the compiler once up front so the tsconfig chain and the
		// compiler manifest are known and can be watched.
		try {
			resolve_compiler(state, probe_file_name(state));
		} catch {
			// Reported per file at transform time.
		}

		const watchedFiles = [...state.dependencies].sort();
		return {
			configIdentity: compute_identity(state, watchedFiles),
			watchedFiles,
			...(optionDiagnostics.length > 0 ? { optionDiagnostics } : null),
		};
	}

	/** @type {ContentMapper['closeProject']} */
	function closeProject(params) {
		projects.delete(params.projectHandle);
	}

	/** @type {ContentMapper['transform']} */
	function transform(params) {
		const state = params.projectHandle ? projects.get(params.projectHandle) : standalone;
		if (!state) {
			throw new Error(`Unknown @tsrx/content-mapper project handle: ${params.projectHandle}`);
		}
		const file_name = params.fileName.replace(/\\/g, '/');
		const content = params.content;

		/** @type {import('@tsrx/typescript-plugin/src/transform.js').TSRXCompilerModule | null} */
		let compiler;
		try {
			compiler = resolve_compiler(state, file_name);
		} catch (error) {
			return failure(state, file_name, content, {
				start: 0,
				length: 0,
				code: DIAGNOSTIC_CODE_INVALID_CONFIG,
				messageText: error_message(error),
			});
		}
		if (!compiler) {
			return failure(state, file_name, content, {
				start: 0,
				length: 0,
				code: DIAGNOSTIC_CODE_NO_COMPILER,
				messageText:
					`No TSRX compiler found for ${file_name}. Install a target compiler ` +
					'(for example @tsrx/react) next to the project, or select one with ' +
					'"tsrx": { "compiler": "<package>" } in tsconfig.json or ' +
					'"options": { "compiler": "<package>" } on the content mapper entry.',
			});
		}

		/** @type {'web' | 'ios' | 'android' | undefined} */
		let platform;
		try {
			platform =
				state.options.platform ??
				resolve_consumer_platform_for_file(file_name, {
					configFileName: state.configFileName,
					configHost: host,
					dependencies: state.dependencies,
					requirePlatformResolution: source_uses_platform_flag(content),
				});
		} catch (error) {
			return failure(state, file_name, content, {
				start: 0,
				length: 0,
				code: DIAGNOSTIC_CODE_INVALID_CONFIG,
				messageText: error_message(error),
			});
		}

		const result = transform_tsrx(compiler, file_name, content, { platform });
		if (result.fatalError) {
			return failure(
				state,
				file_name,
				content,
				to_diagnostic(result.fatalError, content.length, DIAGNOSTIC_CODE_COMPILE_ERROR),
			);
		}
		if (result.sourceAst) {
			state.lastGood.set(file_name, result.sourceAst);
		}

		const language_features = state.options.languageFeatures !== false;
		const mappings = to_span_mappings(result.mappings, result.text, content, {
			languageFeatures: language_features,
		});
		const diagnostics = result.errors.map((error) =>
			to_diagnostic(error, content.length, DIAGNOSTIC_CODE_USAGE_ERROR),
		);
		// Each <script> body is its own compiler input. `.mts` forces module
		// scope so two bodies declaring the same name never collide as globals
		// and nothing leaks into the component's declaration output.
		/** @type {MappedOutput[]} */
		const supplemental = result.scriptRegions.map((region) => ({
			text: region.content,
			extension: '.mts',
			mappings:
				region.length > 0
					? [
							[
								0,
								region.length,
								region.start,
								region.length,
								SpanMapKind.Verbatim,
								language_features ? SpanMapFeature.All & ~SpanMapFeature.Formatting : 0,
							],
						]
					: [],
		}));

		return {
			text: result.text,
			extension: '.tsx',
			mappings,
			...(diagnostics.length > 0 ? { diagnostics } : null),
			...(supplemental.length > 0 ? { supplemental } : null),
		};
	}

	/**
	 * @param {string | undefined} config_file_name
	 * @param {MapperOptions} options
	 * @returns {ProjectState}
	 */
	function create_project_state(config_file_name, options) {
		return {
			configFileName: config_file_name ? path.normalize(config_file_name) : undefined,
			options,
			dependencies: new Set(),
			lastGood: last_good,
		};
	}

	/**
	 * A `.tsrx` path inside the project directory, used to drive compiler
	 * resolution before any real file is transformed.
	 * @param {ProjectState} state
	 */
	function probe_file_name(state) {
		const dir = state.configFileName ? path.dirname(state.configFileName) : process.cwd();
		return path.join(dir, '__tsrx_content_mapper_probe__.tsrx').replace(/\\/g, '/');
	}

	/**
	 * Precedence: the mapper entry's `options.compiler` wins over `tsrx.compiler`
	 * in the tsconfig chain, which wins over auto-detection of an installed
	 * target compiler. Whatever is found, its `package.json` joins the watched
	 * files so a compiler upgrade invalidates the project.
	 * @param {ProjectState} state
	 * @param {string} file_name
	 * @returns {import('@tsrx/typescript-plugin/src/transform.js').TSRXCompilerModule | null}
	 */
	function resolve_compiler(state, file_name) {
		/** @type {string | undefined} */
		let entry;
		if (state.options.compiler !== undefined) {
			entry = resolve_declared_compiler(state, file_name, state.options.compiler);
		} else {
			entry = get_compiler_entry_for_file(file_name, {
				configFileName: state.configFileName,
				configHost: host,
				dependencies: state.dependencies,
			});
		}
		if (!entry) {
			return null;
		}
		const manifest = nearest_package_manifest(entry);
		if (manifest) {
			state.dependencies.add(manifest);
		}
		return require_tsrx_compiler(entry);
	}

	/**
	 * @param {ProjectState} state
	 * @param {string} file_name
	 * @param {string} specifier
	 * @returns {string}
	 */
	function resolve_declared_compiler(state, file_name, specifier) {
		if (!bare_package_specifier_pattern.test(specifier)) {
			throw new Error(
				`The content mapper option "compiler" must be a bare package specifier, got ${JSON.stringify(specifier)}.`,
			);
		}
		const anchor = state.configFileName ?? file_name;
		try {
			return createRequire(anchor).resolve(specifier);
		} catch {
			// Node keeps a negative lookup after a package is installed; the
			// package walk reads manifests fresh.
			const resolved = resolve_package_entry(specifier, path.dirname(anchor), { host });
			if (!resolved) {
				throw new Error(
					`Unable to resolve the TSRX compiler ${JSON.stringify(specifier)} declared in the content mapper options from ${anchor}.`,
				);
			}
			return resolved;
		}
	}

	/**
	 * @param {ProjectState} state
	 * @param {string[]} watched_files
	 * @returns {string}
	 */
	function compute_identity(state, watched_files) {
		const hash = createHash('sha256');
		hash.update(JSON.stringify(state.options));
		hash.update('\0');
		for (const file of watched_files) {
			hash.update(file);
			hash.update('\0');
			hash.update(host.readFile(file) ?? '');
			hash.update('\0');
		}
		return hash.digest('hex');
	}

	/**
	 * @param {ProjectState} state
	 * @param {string} file_name
	 * @param {string} content
	 * @param {MapperDiagnostic} diagnostic
	 * @returns {TransformResult}
	 */
	function failure(state, file_name, content, diagnostic) {
		return {
			text: build_export_stub(state.lastGood.get(file_name)),
			extension: '.ts',
			mappings: [],
			diagnostics: [clamp_diagnostic(diagnostic, content.length)],
		};
	}

	return { initialize, openProject, closeProject, transform };
}

/**
 * @param {unknown} raw
 * @returns {{ options: MapperOptions, optionDiagnostics: NonNullable<OpenProjectResult['optionDiagnostics']> }}
 */
export function validate_options(raw) {
	/** @type {MapperOptions} */
	const options = {};
	/** @type {NonNullable<OpenProjectResult['optionDiagnostics']>} */
	const optionDiagnostics = [];
	if (raw === undefined || raw === null) {
		return { options, optionDiagnostics };
	}
	if (typeof raw !== 'object' || Array.isArray(raw)) {
		optionDiagnostics.push({
			path: [],
			messageText: 'Content mapper options must be an object.',
			code: DIAGNOSTIC_CODE_INVALID_CONFIG,
		});
		return { options, optionDiagnostics };
	}
	const record = /** @type {Record<string, unknown>} */ (raw);
	for (const key of Object.keys(record)) {
		const value = record[key];
		switch (key) {
			case 'compiler':
				if (typeof value === 'string' && bare_package_specifier_pattern.test(value.trim())) {
					options.compiler = value.trim();
				} else {
					optionDiagnostics.push({
						path: [key],
						messageText: '"compiler" must be a bare package specifier such as "@tsrx/react".',
						code: DIAGNOSTIC_CODE_INVALID_CONFIG,
					});
				}
				break;
			case 'platform':
				if (value === 'web' || value === 'ios' || value === 'android') {
					options.platform = value;
				} else {
					optionDiagnostics.push({
						path: [key],
						messageText: '"platform" must be "web", "ios", or "android".',
						code: DIAGNOSTIC_CODE_INVALID_CONFIG,
					});
				}
				break;
			case 'languageFeatures':
				if (typeof value === 'boolean') {
					options.languageFeatures = value;
				} else {
					optionDiagnostics.push({
						path: [key],
						messageText: '"languageFeatures" must be a boolean.',
						code: DIAGNOSTIC_CODE_INVALID_CONFIG,
					});
				}
				break;
			default:
				optionDiagnostics.push({
					path: [key],
					messageText: `Unknown content mapper option "${key}".`,
					code: DIAGNOSTIC_CODE_INVALID_CONFIG,
				});
		}
	}
	return { options, optionDiagnostics };
}

/**
 * Translate a compiler `CompileError` into a mapper diagnostic in original
 * offsets. Coded errors keep their string code in the message and derive a
 * stable numeric code from it; uncoded ones use `fallback_code`.
 * @param {CompileError} error
 * @param {number} content_length
 * @param {number} fallback_code
 * @returns {MapperDiagnostic}
 */
export function to_diagnostic(error, content_length, fallback_code) {
	const start = typeof error.pos === 'number' ? error.pos : 0;
	const end = typeof error.end === 'number' && error.end > start ? error.end : start + 1;
	const code =
		typeof error.code === 'string' && error.code ? numeric_code(error.code) : fallback_code;
	const message = String(error.message ?? error);
	return clamp_diagnostic(
		{
			start,
			length: end - start,
			code,
			messageText:
				typeof error.code === 'string' && error.code ? `${message} [${error.code}]` : message,
		},
		content_length,
	);
}

/**
 * Stable numeric code for a TSRX string diagnostic code (FNV-1a 32-bit,
 * folded into the 10000..99999 range so it never collides with the fixed
 * codes below 10000).
 * @param {string} code
 * @returns {number}
 */
export function numeric_code(code) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < code.length; index++) {
		hash ^= code.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return 10000 + ((hash >>> 0) % 90000);
}

/**
 * @param {MapperDiagnostic} diagnostic
 * @param {number} content_length
 * @returns {MapperDiagnostic}
 */
function clamp_diagnostic(diagnostic, content_length) {
	const start = Math.max(0, Math.min(diagnostic.start, content_length));
	const end = Math.max(start, Math.min(diagnostic.start + diagnostic.length, content_length));
	return { ...diagnostic, start, length: end - start };
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function error_message(error) {
	return error instanceof Error ? error.message : String(error);
}

/**
 * The `package.json` that owns a compiler entry file, stopping at a
 * `node_modules` boundary.
 * @param {string} entry
 * @returns {string | undefined}
 */
function nearest_package_manifest(entry) {
	let dir = path.dirname(entry);
	while (dir) {
		const candidate = path.join(dir, 'package.json');
		if (fs.existsSync(candidate)) return candidate;
		if (path.basename(dir) === 'node_modules') return undefined;
		const parent = path.dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
	return undefined;
}

export { require };
