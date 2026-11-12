/** @import * as AST from 'estree' */

import { isFunctionNode } from '@tsrx/core';

const AST_METADATA_KEYS = new Set(['loc', 'start', 'end', 'metadata']);

/**
 * The `yield`s that vue-jsx-vapor moves out of their generator. Vapor compiles
 * each element into an immediately called arrow that creates it, and its
 * dynamic parts into render effects and prop getters, so a `yield` anywhere in
 * an element or fragment ends up in a function that isn't its generator.
 *
 * This follows vue-jsx-vapor 3.2.14 (@vue-jsx-vapor/compiler-rs 3.2.14).
 * `packages/vite-plugin-vue/tests/template-yield-downstream.test.js` runs
 * probes through the installed compiler, so a release that compiles them
 * differently fails there.
 *
 * @param {AST.Program} program
 * @returns {AST.YieldExpression[]}
 */
export function find_deferred_template_yields(program) {
	/** @type {AST.YieldExpression[]} */
	const found = [];

	/**
	 * @param {AST.Node} node
	 * @param {boolean} in_generator whether the nearest function is a generator
	 * @param {boolean} in_template whether the node is inside an element or fragment
	 */
	const visit = (node, in_generator, in_template) => {
		if (isFunctionNode(node)) {
			in_generator = !!node.generator;
			in_template = false;
		} else if (node.type === 'YieldExpression' && in_generator && in_template) {
			found.push(node);
		} else if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
			in_template = true;
		}
		for_each_child(node, (child) => visit(child, in_generator, in_template));
	};

	visit(program, false, false);
	return found;
}

/**
 * @param {AST.Node} node
 * @param {(child: AST.Node) => void} visit
 */
function for_each_child(node, visit) {
	for (const key of Object.keys(node)) {
		if (AST_METADATA_KEYS.has(key)) continue;
		const value = /** @type {unknown} */ (/** @type {Record<string, unknown>} */ (node)[key]);
		for (const child of Array.isArray(value) ? value : [value]) {
			if (child && typeof child === 'object' && 'type' in child) {
				visit(/** @type {AST.Node} */ (child));
			}
		}
	}
}
