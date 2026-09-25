/**
 * @import { Plugin, SupportOption } from 'prettier'
 * @import { Node } from './parse.js'
 */

import * as estreePlugin from 'prettier/plugins/estree';
import * as postcssPlugin from 'prettier/plugins/postcss';
import { locEnd, locStart, parse } from './parse.js';
import { printer } from './printer.js';

/** @type {Plugin<Node>['languages']} */
export const languages = [
	{
		name: 'tsrx',
		parsers: ['tsrx'],
		extensions: ['.tsrx'],
		vscodeLanguageIds: ['tsrx'],
	},
];

/**
 * Prettier's JavaScript options (`semi`, `singleQuote`, `trailingComma`, …),
 * so they work when only this plugin is loaded, as in `prettier/standalone`.
 * @type {Record<string, SupportOption>}
 */
export const options = /** @type {any} */ (estreePlugin).options;

/** @type {Plugin<Node>['parsers']} */
export const parsers = {
	// `<style>` bodies are formatted as CSS, including in `prettier/standalone`.
	...postcssPlugin.parsers,
	tsrx: {
		astFormat: 'tsrx-estree',
		parse,
		locStart,
		locEnd,
	},
};

/** @type {Plugin<Node>['printers']} */
export const printers = {
	.../** @type {any} */ (postcssPlugin.printers),
	'tsrx-estree': printer,
};

export default { languages, options, parsers, printers };
