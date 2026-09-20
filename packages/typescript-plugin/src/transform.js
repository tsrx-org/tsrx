/** @import * as AST from 'estree'; */
/** @import {CompileError, VolarMappingsResult, CodeMapping} from '@tsrx/core/types' */

/**
 * The compiler contract every TSRX target exposes for editor tooling. Octane
 * and consumer-declared modules may spell the entry `compileToVolarMappings`;
 * see `normalize_tsrx_compiler_module` in `language.js`.
 * @typedef {{
 * 	compile?: (source: string, filename: string, options?: TsrxTransformOptions) => { code?: string, errors?: CompileError[] },
 * 	compile_to_volar_mappings(source: string, filename: string, options?: { loose?: boolean } & TsrxTransformOptions): VolarMappingsResult,
 * }} TSRXCompilerModule
 */

/**
 * @typedef {object} TsrxTransformOptions
 * @property {'web' | 'ios' | 'android'} [platform] Platform selected for `import.meta.env.platform` flags.
 */

/**
 * A `<style>` or `<script>` body inside a `.tsrx` file, located by source
 * offset. Both region kinds map 1:1 onto their source text.
 * @typedef {object} EmbeddedRegion
 * @property {string} id Stable id, e.g. `style_0` / `script_0`.
 * @property {number} start Source offset of the first character of the body.
 * @property {number} length Body length in UTF-16 code units.
 * @property {string} content The body text.
 */

/**
 * The type-only transform of one `.tsrx` file, free of any Volar or
 * TypeScript-host types so that both the classic Volar language plugin and the
 * TypeScript 7 content mapper can consume it.
 *
 * `fatalError` is set when the compiler threw: `text` is then `''`,
 * `mappings` is empty and `sourceAst` is `null`. Otherwise `text` is the
 * generated TSX, `mappings` maps it back to the source, `errors` holds the
 * non-fatal (usage) diagnostics and the regions describe the embedded
 * `<style>` / `<script>` bodies.
 * @typedef {object} TsrxTransformResult
 * @property {string} text
 * @property {CodeMapping[]} mappings
 * @property {EmbeddedRegion[]} cssRegions
 * @property {EmbeddedRegion[]} scriptRegions
 * @property {CompileError[]} errors
 * @property {CompileError | null} fatalError
 * @property {AST.Program | null} sourceAst
 */

/**
 * Run a TSRX compiler's type-only transform in loose mode.
 *
 * Pure with respect to its inputs: the compiler module is the only
 * collaborator, no caches are consulted and nothing is logged.
 * @param {TSRXCompilerModule} compiler
 * @param {string} file_name
 * @param {string} content
 * @param {TsrxTransformOptions} [options]
 * @returns {TsrxTransformResult}
 */
export function transform_tsrx(compiler, file_name, content, options = {}) {
	/** @type {VolarMappingsResult} */
	let transpiled;
	try {
		transpiled = compiler.compile_to_volar_mappings(content, file_name, {
			loose: true,
			platform: options.platform,
		});
	} catch (e) {
		const error = /** @type {CompileError} */ (e);
		error.type = 'fatal';
		return {
			text: '',
			mappings: [],
			cssRegions: [],
			scriptRegions: [],
			errors: [],
			fatalError: error,
			sourceAst: null,
		};
	}

	const scriptRegions = regions_from_mappings(transpiled.scriptMappings ?? []);
	const embedded = embed_script_bodies(
		blank_script_bodies(transpiled.code ?? '', scriptRegions),
		transpiled.mappings ?? [],
		scriptRegions,
	);
	return {
		text: embedded.text,
		mappings: embedded.mappings,
		cssRegions: regions_from_mappings(transpiled.cssMappings ?? []),
		scriptRegions,
		errors: transpiled.errors ?? [],
		fatalError: null,
		sourceAst: transpiled.sourceAst ?? null,
	};
}

/**
 * The mapping data of a `<script>` body embedded in the generated TSX: every
 * language feature except formatting, exactly like the compiler's own spans.
 */
const SCRIPT_BODY_MAPPING_DATA = {
	verification: true,
	completion: true,
	semantic: true,
	navigation: true,
	structure: true,
	format: false,
	customData: {},
};

/**
 * `import` declarations at the top level of a `<script>` body, by offset. A
 * conservative statement scanner (a line starting with `import`, up to the
 * module specifier and optional attributes) rather than a parser: the body is
 * plain TypeScript and the transform has no TypeScript parser of its own.
 */
const IMPORT_DECLARATION =
	/^[ \t]*import\s+(?:type\s+)?(?:(?:[\w$]+\s*,\s*)?(?:\{[^}]*\}|\*\s+as\s+[\w$]+|[\w$]+)\s+from\s+)?(['"])[^'"\n]*\1(?:\s+with\s*\{[^}]*\})?[ \t]*;?/gm;

/**
 * Whole export statements that carry no declaration: re-exports
 * (`export ... from '...'`), local export lists (`export { a as b };`),
 * `export type { T };` and `export = x;`. Module-level syntax with nothing to
 * export from an inline script, blanked entirely.
 */
const EXPORT_STATEMENT =
	/^[ \t]*export\s+(?:type\s+)?(?:(?:\{[^}]*\}|\*(?:\s+as\s+[\w$]+)?)(?:\s+from\s+(['"])[^'"\n]*\1(?:\s+with\s*\{[^}]*\})?)?|=\s*[^;\n]*)[ \t]*;?/gm;

/**
 * `export default` in front of a named function or class declaration: only the
 * keywords are blanked, so the declaration keeps its name in the block's scope.
 */
const EXPORT_DEFAULT_NAMED =
	/^([ \t]*)(export[ \t]+default[ \t]+)(?=(?:async[ \t]+)?function[ \t]*\*?[ \t]*[A-Za-z_$]|(?:abstract[ \t]+)?class[ \t]+[A-Za-z_$])/gm;

/**
 * `export default` in front of an expression, an anonymous function or an
 * anonymous class: replaced by a same-length `const <name>=` so the rest stays
 * a valid, checked initializer (an anonymous `function () {}` or `class {}` is
 * only valid as an expression).
 */
const EXPORT_DEFAULT = /^([ \t]*)(export[ \t]+default[ \t]+)(?=\S)/gm;

/** The `export` keyword in front of a declaration. */
const EXPORT_KEYWORD =
	/^([ \t]*)(export[ \t]+)(?=(?:async[ \t]+)?(?:const|let|var|function|class|type|interface|enum|abstract|declare|namespace|module)\b)/gm;

/**
 * A `<script type="module">` body may `export`, but nothing can import an inline
 * script, so its exports are dead and a block cannot hold them: statements that
 * only export are blanked, `export default` becomes a same-length `const`
 * binding, and the keyword in front of a declaration is blanked, keeping every
 * length so the body's mapping stays one to one.
 * @param {string} body
 * @returns {string}
 */
export function blank_export_syntax(body) {
	return body
		.replace(EXPORT_STATEMENT, (statement) => statement.replace(/[^\r\n]/g, ' '))
		.replace(
			EXPORT_DEFAULT_NAMED,
			(_match, indent, keywords) => indent + ' '.repeat(keywords.length),
		)
		.replace(EXPORT_DEFAULT, (_match, indent, keywords) => {
			// `const ` + name + `=` must be exactly as long as the keywords (15+ chars).
			const name = '_default'.padEnd(keywords.length - 'const '.length - '='.length, '_');
			return `${indent}const ${name}=`;
		})
		.replace(EXPORT_KEYWORD, (_match, indent, keyword) => indent + ' '.repeat(keyword.length));
}

/**
 * @param {string} body
 * @returns {Array<{ start: number, end: number }>}
 */
export function find_import_declarations(body) {
	/** @type {Array<{ start: number, end: number }>} */
	const imports = [];
	for (const match of body.matchAll(IMPORT_DECLARATION)) {
		const start = match.index + match[0].length - match[0].trimStart().length;
		imports.push({ start, end: match.index + match[0].length });
	}
	return imports;
}

/**
 * Append every `<script>` body to the generated TSX as a block statement, so
 * TypeScript checks it in the same file as the component, on every path that
 * consumes the transform (the language server, tsserver through the plugin, and
 * the content mapper), with ordinary mappings back to the source. A block keeps
 * one body's declarations from colliding with another's or with the
 * component's, and contributes nothing to declaration output.
 *
 * `import` declarations cannot live in a block, so each body's imports are
 * hoisted verbatim in front of its block, at module level, where TypeScript
 * resolves them like any other import (a browser-only URL in a
 * `<script type="module">` yields a mapped "cannot find module"); their place
 * in the block is blanked. `export` syntax is blanked in place
 * ({@link blank_export_syntax}). Top-level `await` is legal inside a block of a
 * module and stays as written. Each body maps in one multi-segment mapping.
 * @param {string} text
 * @param {CodeMapping[]} mappings
 * @param {EmbeddedRegion[]} script_regions
 * @returns {{ text: string, mappings: CodeMapping[] }}
 */
export function embed_script_bodies(text, mappings, script_regions) {
	const result_mappings = [...mappings];
	for (const region of script_regions) {
		if (region.length === 0 || region.content.length !== region.length) continue;
		const imports = find_import_declarations(region.content);
		/** @type {number[]} */
		const sourceOffsets = [];
		/** @type {number[]} */
		const generatedOffsets = [];
		/** @type {number[]} */
		const lengths = [];

		let hoisted = '';
		let body = blank_export_syntax(region.content);
		for (const { start, end } of imports) {
			sourceOffsets.push(region.start + start);
			generatedOffsets.push(text.length + 1 + hoisted.length);
			lengths.push(end - start);
			hoisted += region.content.slice(start, end) + '\n';
			body = body.slice(0, start) + ' '.repeat(end - start) + body.slice(end);
		}
		const block_prefix = `\n${hoisted};{\n`;
		const body_offset = text.length + block_prefix.length;
		let cursor = 0;
		for (const { start, end } of [...imports, { start: region.length, end: region.length }]) {
			if (start > cursor) {
				sourceOffsets.push(region.start + cursor);
				generatedOffsets.push(body_offset + cursor);
				lengths.push(start - cursor);
			}
			cursor = end;
		}
		text += `${block_prefix}${body}\n}\n`;
		if (sourceOffsets.length > 0) {
			result_mappings.push({
				sourceOffsets,
				generatedOffsets,
				lengths,
				generatedLengths: [...lengths],
				data: { ...SCRIPT_BODY_MAPPING_DATA, customData: { embeddedId: region.id } },
			});
		}
	}
	return { text, mappings: result_mappings };
}

/**
 * Blank every `<script>` body in the generated TSX, keeping its length and
 * line breaks. The compilers copy the body verbatim into the JSX text of the
 * `<script>` element, where a `<` (as in `1 < 2`) parses as a tag and yields a
 * syntax error that only the Volar path used to hide (it drops diagnostics
 * with no source mapping; the content-mapper protocol reports them). The body
 * is type-checked as a block appended by {@link embed_script_bodies}, and no
 * mapping of the generated TSX points into the copy in the JSX text
 * (`regions_from_mappings`), so blanking it loses nothing. A body is located by its text followed by the closing tag; a body
 * that is not found unchanged in the output is left alone.
 * @param {string} text
 * @param {EmbeddedRegion[]} script_regions
 * @returns {string}
 */
export function blank_script_bodies(text, script_regions) {
	let cursor = 0;
	for (const region of script_regions) {
		if (region.length === 0) continue;
		const needle = `${region.content}</script>`;
		const index = text.indexOf(needle, cursor);
		if (index < 0) continue;
		const blank = region.content.replace(/[^\r\n]/g, ' ');
		text = text.slice(0, index) + blank + text.slice(index + region.content.length);
		cursor = index + needle.length;
	}
	return text;
}

/**
 * @param {CodeMapping[]} mappings
 * @returns {EmbeddedRegion[]}
 */
function regions_from_mappings(mappings) {
	return mappings.map((mapping) => ({
		id: String(mapping.data?.customData?.embeddedId ?? ''),
		start: mapping.sourceOffsets[0],
		length: mapping.lengths[0],
		content: String(mapping.data?.customData?.content ?? ''),
	}));
}

/**
 * Extract raw `<style>...</style>` bodies from source text, used as a fallback
 * for CSS intellisense while the file has a fatal compile error (no AST
 * available; the normal path derives regions from the compiler's
 * `cssMappings` instead). Parallels {@link extract_script_regions}.
 *
 * The opening-tag pattern is attribute-aware: a `>` inside a quoted value or an
 * `{...}` expression container (one level of nesting) does not end the tag, so
 * `apply={cond ? a : b}` and `apply={(x) => y}` are handled. It refuses to
 * match self-closing `<style apply={theme} />` blocks (the `/` before `>` must
 * not close the tag): they carry no CSS body, so, like the compiler's
 * `cssMappings`, they yield no region and cannot swallow a later bodied block.
 * One region is produced per bodied block, in source order, whether the blocks
 * share a scope or sit in nested `@{ ... }` / control-flow bodies.
 * @param {string} code
 * @returns {EmbeddedRegion[]}
 */
export function extract_css_regions(code) {
	const style_regex =
		/<style\b((?:[^>"'{}/]|"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\}|\/(?!>))*)>([\s\S]*?)<\/style>/gi;
	return extract_regions(code, style_regex, '<style'.length, 'style');
}

/**
 * Extract raw `<script>...</script>` bodies from source text, used as a fallback
 * for script intellisense while the file has a fatal compile error. Every body
 * is treated as TypeScript (a superset of JS), so the attributes are never
 * inspected. The opening-tag pattern refuses to match self-closing
 * `<script src=... />` tags, so they cannot swallow a later real script's body.
 * @param {string} code
 * @returns {EmbeddedRegion[]}
 */
export function extract_script_regions(code) {
	const script_regex = /<script\b((?:[^>"'/]|"[^"]*"|'[^']*'|\/(?!>))*)>([\s\S]*?)<\/script>/gi;
	return extract_regions(code, script_regex, '<script'.length, 'script');
}

/**
 * @param {string} code
 * @param {RegExp} regex Global regex whose group 1 is the attribute text and group 2 the body.
 * @param {number} tag_name_length Length of `<tag`.
 * @param {string} id_prefix
 * @returns {EmbeddedRegion[]}
 */
function extract_regions(code, regex, tag_name_length, id_prefix) {
	/** @type {EmbeddedRegion[]} */
	const regions = [];
	let match;
	while ((match = regex.exec(code)) !== null) {
		const attrs = match[1];
		const content = match[2];
		// `<tag` + attrs + `>`; attrs may contain a quoted or braced `>`, so derive
		// the opening tag's end from the match structure rather than searching for `>`.
		const start = match.index + tag_name_length + attrs.length + 1;
		regions.push({
			id: `${id_prefix}_${regions.length}`,
			start,
			length: content.length,
			content,
		});
	}
	return regions;
}
