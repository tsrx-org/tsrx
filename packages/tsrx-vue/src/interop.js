/** @import * as AST from 'estree' */

import { parseModule } from '@tsrx/core';

const vue_import_pattern = /import(?!\s+type)\s*\{([\s\S]*?)\}\s*from\s*(['"])vue\2\s*;?/g;

/**
 * Vue's built-in renderer primitives, including `Suspense`, need Vapor/VDOM
 * interop when mounted from a Vapor app. TSRX can emit `Suspense` for
 * `try/pending`, so bundler plugins use this rewrite to make Vapor app
 * creation install the interop plugin without every app entry point needing to
 * remember it.
 *
 * @param {string} source
 * @returns {string}
 */
export function addVaporInteropToCreateVaporApp(source) {
	if (!/\bcreateVaporApp\b/.test(source) || !/\bfrom\s*['"]vue['"]/.test(source)) {
		return source;
	}

	/** @type {AST.Program} */
	let program;
	try {
		program = parseModule(source, 'module.tsx');
	} catch {
		// The TSRX parser rejects some valid modules, such as a `<number>value`
		// type assertion. Match the import text instead, as before.
		return add_interop_by_pattern(source);
	}
	return add_interop_to_imports(source, program);
}

/**
 * Rewrite the real `vue` import declarations of a parsed module, so import-like
 * text in strings, template literals, comments and regular expressions is
 * never touched.
 *
 * @param {string} source
 * @param {AST.Program} program
 * @returns {string}
 */
function add_interop_to_imports(source, program) {
	const vue_imports = program.body.filter(
		/** @returns {node is AST.ImportDeclaration} */
		(node) =>
			node.type === 'ImportDeclaration' &&
			node.source.value === 'vue' &&
			/** @type {{ importKind?: string }} */ (node).importKind !== 'type',
	);

	/** @type {string | null} */
	let existing_interop_local = null;
	for (const declaration of vue_imports) {
		for (const specifier of declaration.specifiers) {
			if (is_value_import(specifier, 'vaporInteropPlugin')) {
				existing_interop_local = specifier.local.name;
			}
		}
	}

	if (existing_interop_local && source.includes(`.use(${existing_interop_local})`)) {
		return source;
	}

	const interop_local = existing_interop_local ?? 'vaporInteropPlugin';
	let added_interop_import = existing_interop_local !== null;
	/** @type {Array<{ start: number, end: number, text: string }>} */
	const replacements = [];

	for (const declaration of vue_imports) {
		/** @type {string[]} */
		const wrappers = [];
		/** @type {string | null} */
		let default_import = null;
		/** @type {string[]} */
		const named_imports = [];

		for (const specifier of declaration.specifiers) {
			if (specifier.type !== 'ImportSpecifier') {
				default_import = slice(source, specifier);
			} else if (is_value_import(specifier, 'createVaporApp')) {
				const wrapped_local = `__tsrx_${specifier.local.name}`;
				wrappers.push(
					`const ${specifier.local.name} = (...args) => ${wrapped_local}(...args).use(${interop_local});`,
				);
				named_imports.push(`createVaporApp as ${wrapped_local}`);
			} else {
				named_imports.push(slice(source, specifier));
			}
		}

		if (wrappers.length === 0) continue;
		if (!added_interop_import) {
			named_imports.push(interop_local);
			added_interop_import = true;
		}

		// The source literal through the end keeps its quotes and any import
		// attributes.
		let tail = source.slice(start_of(declaration.source), end_of(declaration));
		if (!tail.endsWith(';')) tail += ';';
		const bindings = `${default_import === null ? '' : `${default_import}, `}{ ${named_imports.join(', ')} }`;
		replacements.push({
			start: start_of(declaration),
			end: end_of(declaration),
			text: `import ${bindings} from ${tail}\n${wrappers.join('\n')}`,
		});
	}

	let result = source;
	for (const { start, end, text } of replacements.reverse()) {
		result = result.slice(0, start) + text + result.slice(end);
	}
	return result;
}

/**
 * @param {AST.ImportDeclaration['specifiers'][number]} specifier
 * @param {string} name
 * @returns {specifier is AST.ImportSpecifier}
 */
function is_value_import(specifier, name) {
	return (
		specifier.type === 'ImportSpecifier' &&
		/** @type {{ importKind?: string }} */ (specifier).importKind !== 'type' &&
		specifier.imported.type === 'Identifier' &&
		specifier.imported.name === name
	);
}

/** @param {AST.Node} node */
function start_of(node) {
	return /** @type {AST.Node & { start: number }} */ (node).start;
}

/** @param {AST.Node} node */
function end_of(node) {
	return /** @type {AST.Node & { end: number }} */ (node).end;
}

/** @param {string} source @param {AST.Node} node */
function slice(source, node) {
	return source.slice(start_of(node), end_of(node));
}

/**
 * The rewrite for a module the parser rejects: the same edit, applied to the
 * matches of an import pattern over the raw source.
 *
 * @param {string} source
 * @returns {string}
 */
function add_interop_by_pattern(source) {
	/** @type {string | null} */
	let existing_interop_local = null;

	for (const match of source.matchAll(vue_import_pattern)) {
		for (const specifier of split_import_specifiers(match[1])) {
			const parsed = parse_import_specifier(specifier);
			if (parsed?.imported === 'vaporInteropPlugin') {
				existing_interop_local = parsed.local;
				break;
			}
		}
		if (existing_interop_local) break;
	}

	if (existing_interop_local && source.includes(`.use(${existing_interop_local})`)) {
		return source;
	}

	const interop_local = existing_interop_local ?? 'vaporInteropPlugin';
	let added_interop_import = existing_interop_local !== null;

	return source.replace(vue_import_pattern, (full, specifier_text, quote) => {
		const specifiers = split_import_specifiers(specifier_text);
		/** @type {string[]} */
		const wrappers = [];
		let import_changed = false;

		const next_specifiers = specifiers.map((specifier) => {
			const parsed = parse_import_specifier(specifier);
			if (parsed?.imported !== 'createVaporApp') {
				return specifier.trim();
			}

			const wrapped_local = `__tsrx_${parsed.local}`;
			wrappers.push(
				`const ${parsed.local} = (...args) => ${wrapped_local}(...args).use(${interop_local});`,
			);
			import_changed = true;
			return `createVaporApp as ${wrapped_local}`;
		});

		if (!import_changed) {
			return full;
		}

		if (!added_interop_import) {
			next_specifiers.push(interop_local);
			added_interop_import = true;
		}

		return `import { ${next_specifiers.join(', ')} } from ${quote}vue${quote};\n${wrappers.join('\n')}`;
	});
}

/**
 * @param {string} specifier_text
 * @returns {string[]}
 */
function split_import_specifiers(specifier_text) {
	return specifier_text
		.split(',')
		.map((specifier) => specifier.trim())
		.filter(Boolean);
}

/**
 * @param {string} specifier
 * @returns {{ imported: string, local: string } | null}
 */
function parse_import_specifier(specifier) {
	const match = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(specifier.trim());
	if (!match) {
		return null;
	}
	return { imported: match[1], local: match[2] ?? match[1] };
}
