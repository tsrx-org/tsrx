/** @import { Platform } from '@tsrx/react' */

import { replacePlatformFlags } from '@tsrx/core';

/**
 * @typedef {{
 * 	resourcePath: string,
 * 	getOptions?: () => { platform?: Platform },
 * 	async: () => (err: unknown, output?: string | null, map?: unknown) => void,
 * }} LoaderContext
 */

/**
 * Supply Turbopack's missing `define` equivalent. TSRX's own loader has already
 * pruned exact ordinary-if guards; this pass handles flags left in runtime
 * expressions and ordinary JavaScript/TypeScript modules.
 *
 * @this {LoaderContext}
 * @param {string} source
 * @param {import('source-map').RawSourceMap | string | undefined} [input_map]
 * @returns {void}
 */
export default function tsrx_react_turbopack_platform_loader(source, input_map) {
	const callback = this.async();

	try {
		const { code, map } = replacePlatformFlags(
			source,
			this.resourcePath,
			this.getOptions?.().platform,
			input_map,
		);
		callback(null, code, map);
	} catch (/** @type {any} */ error) {
		callback(error);
	}
}
