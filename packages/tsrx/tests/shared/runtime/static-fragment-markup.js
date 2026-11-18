import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * React server markup of each `static-fragment-markup-components.tsrx`
 * component, with `{ flag: true, items: ['p', 'q'] }` and with
 * `{ flag: false, items: [] }`, as the fragments in place render it. A `<!--
 * -->` between two texts shows where the edge whitespace of a text prints as
 * a text of its own (`{' '}`), so it pins which texts are split, as well as
 * what they say.
 *
 * @type {Record<string, [string, string]>}
 */
const MARKUP = {
	LoneReturn: [' y <i>z</i> ', ' y <i>z</i> '],
	LoneTwice: [' y <i>z</i> ', ' y <i>z</i> '],
	LoneTemplate: [' y <i>z</i> ', ' y <i>z</i> '],
	LoneArrow: [' y <i>z</i> ', ' y <i>z</i> '],
	LoneIf: ['<div> <!-- -->y <i>z</i> </div>', '<div></div>'],
	LoneIfSetup: ['<div> y <i>z</i> </div>', '<div></div>'],
	LoneElse: ['<div> <!-- -->y <i>z</i> </div>', '<div><b>t</b></div>'],
	LoneSwitch: ['<div> y <i>z</i> </div>', '<div><b>d</b></div>'],
	LoneTry: ['<div> y <i>z</i> </div>', '<div> y <i>z</i> </div>'],
	LoneFor: ['<ul> y <i>z</i> <!-- --> y <i>z</i> </ul>', '<ul></ul>'],
	LoneEmpty: ['<ul><li>p</li><li>q</li></ul>', '<ul> y <i>z</i> </ul>'],
	LoneHelper: ['<div> y <i>z</i> </div>', '<div> y <i>z</i> </div>'],
	LoneHelperFunction: ['<div> y <i>z</i> </div>', '<div> y <i>z</i> </div>'],
};

/**
 * Shared React suite for fragments hoisted as one static (#1352): each one
 * renders the same server markup as the fragment in place.
 *
 * @param {{ components: Record<string, unknown>, renderToString: (component: any, props: object) => string }} options
 */
export function runStaticFragmentMarkupTests({ components, renderToString }) {
	describe('fragments hoisted as one static, in server markup (#1352)', () => {
		beforeEach(() => {
			// `LoneFor` renders an unkeyed list
			vi.spyOn(console, 'error').mockImplementation(() => {});
		});
		afterEach(() => {
			vi.restoreAllMocks();
		});

		it.each(Object.entries(MARKUP))('renders %s as the fragment in place does', (name, markup) => {
			expect([
				renderToString(components[name], { flag: true, items: ['p', 'q'] }),
				renderToString(components[name], { flag: false, items: [] }),
			]).toEqual(markup);
		});
	});
}
