/**
 * The module format (`impliedNodeFormat`) of `.tsrx` files. TypeScript derives a
 * file's format from its extension, and knows none for `.tsrx`, so under
 * `node16`/`nodenext` it treats every `.tsrx` file as CommonJS: `import.meta`
 * reports TS1470 even in a `"type": "module"` package. Volar's
 * `fixupImpliedNodeFormatForFile` sets the format only while it resolves the
 * file's imports, and resets it afterwards.
 *
 * A `.tsrx` file takes the format a `.ts` file at the same path would have:
 * from the `type` of the nearest `package.json` under `node16`/`nodenext` (or in
 * `node_modules`), and none otherwise. TSRX has no `.mtsrx`/`.ctsrx`
 * counterparts of `.mts`/`.cts`. The format goes into the options TypeScript
 * creates the source file with, so the source file's external-module status, the
 * document registry's key and the `package.json` TypeScript watches all match it.
 */

import { is_tsrx_file } from './language.js';

/**
 * Fill in the module format of a `.tsrx` file in the options TypeScript is about
 * to create its source file with, as TypeScript fills it in for a `.ts` file.
 * Options that already carry a format, and other files, are left alone.
 * @param {typeof import('typescript')} ts
 * @param {string} file_name
 * @param {unknown} source_file_options The `languageVersionOrOptions` of `getSourceFile`.
 * @param {import('typescript').PackageJsonInfoCache | undefined} package_json_info_cache
 * @param {import('typescript').ModuleResolutionHost} host
 * @param {import('typescript').CompilerOptions} compiler_options
 */
export function fill_tsrx_module_format(
	ts,
	file_name,
	source_file_options,
	package_json_info_cache,
	host,
	compiler_options,
) {
	if (
		typeof source_file_options !== 'object' ||
		source_file_options === null ||
		/** @type {import('typescript').CreateSourceFileOptions} */ (source_file_options)
			.impliedNodeFormat !== undefined ||
		!is_tsrx_file(file_name)
	) {
		return;
	}
	// TypeScript's worker when it has one, as Volar uses it: the classic CLI's
	// module scope (`tsrx-tsc`) has only the worker, and it also returns the
	// `package.json` scope and locations TypeScript keeps on the source file.
	const worker = /** @type {any} */ (ts).getImpliedNodeFormatForFileWorker;
	const format = worker
		? worker(`${file_name}.ts`, package_json_info_cache, host, compiler_options)
		: ts.getImpliedNodeFormatForFile?.(
				/** @type {import('typescript').Path} */ (`${file_name}.ts`),
				package_json_info_cache,
				host,
				compiler_options,
			);
	if (typeof format === 'object' && format !== null) {
		Object.assign(source_file_options, format);
	} else if (format !== undefined) {
		/** @type {import('typescript').CreateSourceFileOptions} */ (
			source_file_options
		).impliedNodeFormat = format;
	}
}

/** @type {WeakSet<object>} */
const patched = new WeakSet();

/**
 * `tsrx-tsc`: fill in the module format of each `.tsrx` source file the host
 * reads. Volar's program proxy reads the file through this host, then parses
 * the generated code with the same options.
 * @param {typeof import('typescript')} ts
 * @param {import('typescript').CompilerHost} host
 * @param {import('typescript').CompilerOptions} compiler_options
 */
export function with_tsrx_module_format_on_host(ts, host, compiler_options) {
	if (patched.has(host)) return;
	patched.add(host);
	const get_source_file = host.getSourceFile;
	host.getSourceFile = (file_name, language_version_or_options, ...rest) => {
		fill_tsrx_module_format(
			ts,
			file_name,
			language_version_or_options,
			undefined,
			host,
			compiler_options,
		);
		return get_source_file.call(host, file_name, language_version_or_options, ...rest);
	};
}

/**
 * Language services (tsserver, the language server): fill in the module format
 * of each `.tsrx` document the registry creates or updates. The language
 * service passes the options the program computed, and the registry keys its
 * entries by their format, so it has to be set before the registry sees them.
 * @param {typeof import('typescript')} ts
 * @param {import('typescript').DocumentRegistry} registry
 * @returns {import('typescript').DocumentRegistry}
 */
export function with_tsrx_module_format_in_registry(ts, registry) {
	if (patched.has(registry)) return registry;
	patched.add(registry);
	for (const method of /** @type {const} */ (['acquireDocumentWithKey', 'updateDocumentWithKey'])) {
		const original = /** @type {(...args: any[]) => import('typescript').SourceFile} */ (
			registry[method]
		);
		/** @type {any} */ (registry)[method] = (
			/** @type {string} */ file_name,
			/** @type {import('typescript').Path} */ path,
			/** @type {import('typescript').LanguageServiceHost} */ host,
			/** @type {import('typescript').DocumentRegistryBucketKey} */ key,
			/** @type {import('typescript').IScriptSnapshot} */ snapshot,
			/** @type {string} */ version,
			/** @type {import('typescript').ScriptKind | undefined} */ script_kind,
			/** @type {unknown} */ source_file_options,
		) => {
			fill_tsrx_module_format(
				ts,
				file_name,
				source_file_options,
				/** @type {any} */ (host).getModuleResolutionCache?.()?.getPackageJsonInfoCache(),
				host,
				host.getCompilationSettings(),
			);
			return original.call(
				registry,
				file_name,
				path,
				host,
				key,
				snapshot,
				version,
				script_kind,
				source_file_options,
			);
		};
	}
	return registry;
}
