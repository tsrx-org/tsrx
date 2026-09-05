/** @import { RuntimeImportMode } from '@tsrx/react' */

import { compile } from '@tsrx/react';

const CSS_QUERY = '?tsrx-css&lang.css';

/**
 * Appends an import of the sibling virtual CSS resource. It goes after the
 * module's own imports so the stylesheets of imported themes are added to the
 * graph first and a rule in the applying module wins at equal specificity.
 * Top-level directives such as `'use client'` stay first, and nothing above
 * the import moves, so the compiler's source map still applies.
 *
 * @param {string} code
 * @param {string} resource_path
 * @returns {string}
 */
function append_css_import(code, resource_path) {
	return `${code}\nimport ${JSON.stringify(resource_path + CSS_QUERY)};\n`;
}

/**
 * @typedef {{
 * 	resourcePath: string,
 * 	getOptions?: () => { runtimeImports?: RuntimeImportMode },
 * 	async: () => (err: unknown, output?: string | null, map?: unknown) => void,
 * }} LoaderContext
 */

/**
 * Compile `.tsrx` files to TSX for consumption by Turbopack's built-in
 * TypeScript/React pipeline. When a component-local `<style>` block is
 * present, append an import of a sibling virtual CSS resource that is handled
 * by the Turbopack config helper's query-targeted CSS rule.
 *
 * @this {LoaderContext}
 * @param {string} source
 * @returns {void}
 */
export default function tsrx_react_turbopack_loader(source) {
	const callback = this.async();

	try {
		const { code, map, css } = compile(source, this.resourcePath, this.getOptions?.());
		const output = css ? append_css_import(code, this.resourcePath) : code;

		callback(null, output, /** @type {any} */ (map ?? undefined));
	} catch (/** @type {any} */ err) {
		callback(err);
	}
}
