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
	return {
		text: blank_script_bodies(transpiled.code ?? '', scriptRegions),
		mappings: transpiled.mappings ?? [],
		cssRegions: regions_from_mappings(transpiled.cssMappings ?? []),
		scriptRegions,
		errors: transpiled.errors ?? [],
		fatalError: null,
		sourceAst: transpiled.sourceAst ?? null,
	};
}

/**
 * Blank every `<script>` body in the generated TSX, keeping its length and
 * line breaks. The compilers copy the body verbatim into the JSX text of the
 * `<script>` element, where a `<` (as in `1 < 2`) parses as a tag and yields a
 * syntax error that only the Volar path used to hide (it drops diagnostics
 * with no source mapping; the content-mapper protocol reports them). The body
 * is type-checked on its own as an embedded script, and no mapping of the
 * generated TSX points into it (`regions_from_mappings`), so blanking loses
 * nothing. A body is located by its text followed by the closing tag; a body
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
 * Append each `<script>` body to the generated TSX as an isolated function and
 * map it back to the source. Volar's tsserver plugin does not honor
 * `getExtraServiceScripts`, so those bodies would otherwise have no TypeScript
 * program (they are blanked in the JSX to avoid a TS1003 on `<`). A leading
 * `;` closes a previous expression so the appendix cannot be parsed as JSX.
 * @param {string} text
 * @param {CodeMapping[]} mappings
 * @param {EmbeddedRegion[]} script_regions
 * @returns {string}
 */
export function embed_script_bodies_in_service_script(text, mappings, script_regions) {
	let out = text;
	for (const region of script_regions) {
		if (region.length === 0) continue;
		const prefix = '\n;void function() {\n';
		const suffix = '\n};\n';
		const generated_offset = out.length + prefix.length;
		out += prefix + region.content + suffix;
		mappings.push({
			sourceOffsets: [region.start],
			generatedOffsets: [generated_offset],
			lengths: [region.length],
			generatedLengths: [region.length],
			data: {
				verification: true,
				completion: true,
				semantic: true,
				navigation: true,
				structure: true,
				format: false,
				customData: {},
			},
		});
	}
	return out;
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
