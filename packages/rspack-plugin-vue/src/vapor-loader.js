/** @import { LoaderContext } from '@rspack/core' */
/** @import { VaporOptions, VueJsxVapor } from './vue-jsx-vapor.js' */

import { SourceMapConsumer, SourceMapGenerator } from 'source-map';
import { create_vue_jsx_vapor } from './vue-jsx-vapor.js';

/**
 * @param {any} inputMap
 * @param {any} outputMap
 * @returns {Promise<any>}
 */
async function composeSourceMaps(inputMap, outputMap) {
	if (!inputMap) return outputMap ?? null;
	if (!outputMap) return inputMap;

	const generator = new SourceMapGenerator();

	await SourceMapConsumer.with(outputMap, null, async (outputConsumer) => {
		await SourceMapConsumer.with(inputMap, null, async (inputConsumer) => {
			outputConsumer.eachMapping((mapping) => {
				if (mapping.originalLine == null || mapping.originalColumn == null) return;

				const original = inputConsumer.originalPositionFor({
					line: mapping.originalLine,
					column: mapping.originalColumn,
				});

				if (original.line == null || original.column == null || original.source == null) return;

				generator.addMapping({
					generated: {
						line: mapping.generatedLine,
						column: mapping.generatedColumn,
					},
					original: {
						line: original.line,
						column: original.column,
					},
					source: original.source,
					name: original.name ?? mapping.name ?? undefined,
				});
			});

			for (const source of inputConsumer.sources) {
				const content = inputConsumer.sourceContentFor(source, true);
				if (content != null) {
					generator.setSourceContent(source, content);
				}
			}
		});
	});

	return JSON.parse(generator.toString());
}

/**
 * Runs the compiled TSX through `vue-jsx-vapor`'s macros and Vapor transform,
 * then composes their sourcemaps with the upstream tsrx compile map when
 * available. The plugin passes the `vueJsxVapor` it serves the macros' helper
 * modules from.
 *
 * @this {LoaderContext<{ vapor?: VaporOptions, vueJsxVapor?: VueJsxVapor }>}
 * @param {string} source
 * @param {unknown} inputMap
 * @returns {void}
 */
export default function vaporLoader(source, inputMap) {
	const callback = this.async();
	const options = this.getOptions?.() ?? {};
	const vue_jsx_vapor = options.vueJsxVapor ?? create_vue_jsx_vapor(options.vapor);
	const resourcePath = this.resourcePath;

	Promise.resolve()
		.then(async () => {
			const result = await vue_jsx_vapor.transform(source, resourcePath);
			let output_map =
				typeof inputMap === 'string' ? JSON.parse(inputMap) : /** @type {any} */ (inputMap ?? null);
			for (const map of result.maps) {
				output_map = await composeSourceMaps(output_map, map ?? null);
			}

			callback(null, result.code, /** @type {any} */ (output_map ?? undefined));
		})
		.catch((/** @type {any} */ err) => {
			callback(err);
		});
}
