/** @import { LoaderContext } from '@rspack/core' */

/** @import { RuntimeImportMode } from '@tsrx/vue' */

import { compile } from '@tsrx/vue';

/**
 * Compiles `.tsrx` source to Vue-flavoured TSX and, when a `<style>` block is
 * present, appends an `import` of the sibling virtual CSS module so rspack can
 * include the styles in the asset graph.
 *
 * @this {LoaderContext<{ runtimeImports?: RuntimeImportMode }>}
 * @param {string} source
 * @returns {void}
 */
export default function jsLoader(source) {
	const callback = this.async();
	const resourcePath = this.resourcePath;

	try {
		const { code, map, css } = compile(source, resourcePath, this.getOptions?.());

		let output = code;
		if (css) {
			// The import goes after the module's own imports so the stylesheets of
			// imported themes are added to the asset graph first and a rule in the
			// applying module wins at equal specificity. Nothing above it moves, so
			// the compiler's source map still applies.
			const cssImport = `${resourcePath}?tsrx-css&lang.css`;
			output = `${code}\nimport ${JSON.stringify(cssImport)};\n`;
		}

		callback(null, output, /** @type {any} */ (map ?? undefined));
	} catch (/** @type {any} */ err) {
		callback(err);
	}
}
