/** @import * as AST from 'estree' */
/** @import {CodeMapping, CompileError} from '@tsrx/core/types' */
/** @import {DiagnosticDirectives} from './protocol.js' */

import { DIAGNOSTIC_CODES } from '@tsrx/core/diagnostics';
import { DiagnosticDirectivePolicy } from './protocol.js';

/**
 * The nodes whose generated code an error's directive covers: the innermost
 * statement, declaration, class or type member, or element that holds the
 * error.
 */
const HOLDER_TYPE =
	/(?:Statement|Declaration|Definition|Signature)$|^(?:StaticBlock|AccessorProperty|JSXElement|JSXFragment|JSXStyleElement)$/;

/** Keys of a tree node that hold no child nodes, or nodes that aren't its children. */
const NOT_CHILDREN = new Set([
	'metadata',
	'loc',
	'range',
	'parent',
	'comments',
	'leadingComments',
	'trailingComments',
]);

/**
 * An `ignore` directive for each error the mapper reports, so that a mistake
 * shows once. TypeScript reports some mistakes itself from the generated code,
 * with a code of its own, and would show them next to the mapper's error. The
 * directive hides TypeScript's errors in the generated code of the statement,
 * class or type member, or element that holds the error, until the error is
 * fixed and the mapper stops sending it. The mapper's own errors are not
 * TypeScript's, so they stay.
 *
 * The ranges come from what every TSRX compiler returns, whatever its target:
 * the source tree (`sourceAst`) finds the node that holds an error, and the
 * mappings give that node's generated code. Without a source tree the error's
 * own span stands in. A node without mappings gets no directive.
 * @param {readonly CompileError[]} errors
 * @param {AST.Program | null} source_ast
 * @param {readonly CodeMapping[]} mappings
 * @param {number} original_length
 * @param {string} generated_text
 * @returns {DiagnosticDirectives | null}
 */
export function ignore_directives(errors, source_ast, mappings, original_length, generated_text) {
	const generated_length = generated_text.length;
	/** @type {Array<[original_start: number, original_end: number, generated_start: number, generated_end: number]>} */
	const ranges = [];
	/** @type {Set<number>} */
	const claimed_closing_tags = new Set();
	for (const error of errors) {
		if (typeof error.pos !== 'number') {
			continue;
		}
		const closing_tag =
			error.code === DIAGNOSTIC_CODES.UNCLOSED_TAG && source_ast
				? recovered_closing_tag(
						source_ast,
						error.pos,
						mappings,
						generated_text,
						claimed_closing_tags,
					)
				: null;
		if (closing_tag) {
			ranges.push([
				Math.min(error.pos, original_length),
				Math.min(typeof error.end === 'number' ? error.end : error.pos, original_length),
				closing_tag[0],
				closing_tag[1],
			]);
		}
		const on_tag = reported_on_tag(error);
		const position = on_tag ? /** @type {number} */ (error.raisedAt) - 1 : error.pos;
		const holder = source_ast ? holder_at(source_ast, position) : null;
		const start = holder ? /** @type {number} */ (holder.start) : error.pos;
		const end = holder
			? /** @type {number} */ (holder.end)
			: typeof error.end === 'number' && error.end > error.pos
				? error.end
				: error.pos + 1;
		// With nothing holding an unclosed tag, only its own code is covered. Its
		// anchor isn't that: it sits on whatever else is on its generated line.
		const own_code = on_tag && !holder;
		for (const generated of generated_ranges(mappings, start, end, own_code)) {
			ranges.push([
				Math.min(start, original_length),
				Math.min(end, original_length),
				Math.min(generated[0], generated_length),
				Math.min(generated[1], generated_length),
			]);
		}
	}
	if (ranges.length === 0) {
		return null;
	}

	// TypeScript rejects directives whose generated ranges overlap.
	ranges.sort((a, b) => a[2] - b[2]);
	/** @type {typeof ranges} */
	const merged = [];
	for (const range of ranges) {
		const last = merged.at(-1);
		if (last && range[2] < last[3]) {
			last[0] = Math.min(last[0], range[0]);
			last[1] = Math.max(last[1], range[1]);
			last[3] = Math.max(last[3], range[3]);
		} else {
			merged.push([...range]);
		}
	}
	return {
		unusedExpectDirectiveDiagnostics: [],
		directives: merged.map(([original_start, original_end, generated_start, generated_end]) => [
			original_start,
			original_end - original_start,
			generated_start,
			generated_end,
			DiagnosticDirectivePolicy.Ignore,
		]),
	};
}

/**
 * The generated range of the closing tag that recovery adds to the unclosed
 * element whose opening tag holds `position`, or `null`. The React, Preact and
 * Vue targets give it no mapping, so TypeScript's error on it, such as TS2304
 * for a name that isn't a value, has no place in the file and shows at its top
 * as TS18080. An ignore directive over just that tag holds no authored code, so
 * it can't hide errors in the code that follows. The tag is the first
 * `</name>` after the opening tag that no other element has claimed and that
 * no mapping ties to code outside the opening tag: the Solid target maps the
 * added tag's name to the opening tag's.
 * @param {AST.Node} source_ast
 * @param {number} position
 * @param {readonly CodeMapping[]} mappings
 * @param {string} generated_text
 * @param {Set<number>} claimed
 * @returns {[number, number] | null}
 */
function recovered_closing_tag(source_ast, position, mappings, generated_text, claimed) {
	const opening = /** @type {any} */ (unclosed_element_at(source_ast, position))?.openingElement;
	const name = opening && jsx_name(opening.name);
	if (!name) return null;
	/** @type {number | undefined} */
	let from;
	for (const mapping of mappings) {
		for (let i = 0; i < mapping.sourceOffsets.length; i++) {
			const source = mapping.sourceOffsets[i];
			if (source >= opening.start && source < opening.end) {
				from = Math.min(from ?? Infinity, mapping.generatedOffsets[i]);
			}
		}
	}
	if (from === undefined) return null;
	const text = `</${name}>`;
	for (
		let at = generated_text.indexOf(text, from);
		at !== -1;
		at = generated_text.indexOf(text, at + 1)
	) {
		if (claimed.has(at) || maps_elsewhere(mappings, at, at + text.length, opening)) continue;
		claimed.add(at);
		return [at, at + text.length];
	}
	return null;
}

/**
 * The innermost unclosed element whose opening tag holds `position`.
 * @param {AST.Node} node
 * @param {number} position
 * @returns {AST.Node | null}
 */
function unclosed_element_at(node, position) {
	/** @type {AST.Node | null} */
	let found = null;
	/** @param {AST.Node} current */
	const visit = (current) => {
		const opening = /** @type {any} */ (current).openingElement;
		if (
			current.type === 'JSXElement' &&
			/** @type {any} */ (current).unclosed &&
			opening &&
			opening.start <= position &&
			position < opening.end
		) {
			found = current;
		}
		for (const [key, value] of Object.entries(current)) {
			if (NOT_CHILDREN.has(key) || !value || typeof value !== 'object') continue;
			for (const child of Array.isArray(value) ? value : [value]) {
				if (child && typeof child.type === 'string') visit(child);
			}
		}
	};
	visit(node);
	return found;
}

/**
 * The text of a JSX tag name, as the recovered closing tag prints it.
 * @param {any} name
 * @returns {string | null}
 */
function jsx_name(name) {
	if (!name) return null;
	if (name.type === 'JSXIdentifier' || name.type === 'Identifier') return name.name;
	if (name.type === 'JSXMemberExpression') {
		const object = jsx_name(name.object);
		return object ? `${object}.${name.property.name}` : null;
	}
	if (name.type === 'JSXNamespacedName') return `${name.namespace.name}:${name.name.name}`;
	return null;
}

/**
 * Whether a mapping ties generated code in `[start, end)` to source code
 * outside `node`.
 * @param {readonly CodeMapping[]} mappings
 * @param {number} start
 * @param {number} end
 * @param {{ start: number, end: number }} node
 * @returns {boolean}
 */
function maps_elsewhere(mappings, start, end, node) {
	return mappings.some((mapping) =>
		mapping.generatedOffsets.some((offset, i) => {
			const length = mapping.generatedLengths?.[i] ?? mapping.lengths[i];
			const source = mapping.sourceOffsets[i];
			return (
				offset < end &&
				start < offset + length &&
				(source < node.start || source + mapping.lengths[i] > node.end)
			);
		}),
	);
}

/**
 * Whether `error` is an unclosed tag reported on the tag and found where the
 * parser stopped, one before `raisedAt`: the end of its template, or the start
 * of a `<style>` or `<script>` body. Its directive holds there, not at the error:
 * the closing tag that recovery adds has no mapping, so TypeScript's error on it
 * could only show at the top of the file, and the tag's own statement can end
 * before it. At the end of the file nothing holds that place, as the tag's
 * declaration has stretched around the code that follows, which the directive
 * must not hide. A compiler from before tags were reported on themselves has its
 * error where the parser stopped already, with `raisedAt` no further than `end`,
 * and the mapper runs whichever compiler the project has.
 * @param {CompileError} error
 * @returns {boolean}
 */
function reported_on_tag({ code, end, raisedAt }) {
	return (
		code === DIAGNOSTIC_CODES.UNCLOSED_TAG &&
		typeof raisedAt === 'number' &&
		typeof end === 'number' &&
		raisedAt > end
	);
}

/**
 * The innermost holder node (see {@link HOLDER_TYPE}) that contains `position`,
 * found by descending from the root through the child that contains it.
 * @param {AST.Node} root
 * @param {number} position
 * @returns {AST.Node | null}
 */
function holder_at(root, position) {
	/** @type {AST.Node | null} */
	let holder = null;
	/** @type {AST.Node | null} */
	let node = root;
	while (node) {
		if (HOLDER_TYPE.test(node.type)) {
			holder = node;
		}
		node = child_at(node, position);
	}
	return holder;
}

/**
 * @param {AST.Node} node
 * @param {number} position
 * @returns {AST.Node | null}
 */
function child_at(node, position) {
	for (const [key, value] of Object.entries(node)) {
		if (NOT_CHILDREN.has(key) || !value || typeof value !== 'object') {
			continue;
		}
		for (const child of Array.isArray(value) ? value : [value]) {
			if (
				child &&
				typeof child.type === 'string' &&
				typeof child.start === 'number' &&
				typeof child.end === 'number' &&
				child.start <= position &&
				position < child.end
			) {
				return child;
			}
		}
	}
	return null;
}

/**
 * The generated ranges of the mapped code between `start` and `end` in the
 * original. A node's generated code need not be in one piece: a compiler can
 * hoist part of it (a static element above the component), and a `<script>`
 * body is checked as a block at the end of the file. So each range runs from
 * the first to the last generated offset of the node's segments until code
 * mapped from outside the node follows, and the next of its segments starts a
 * new range; a range never covers another component's code. A segment of the
 * same length on both sides that encloses the original range, as a verbatim
 * `<script>` body does, gives the matching part of its generated text.
 * @param {readonly CodeMapping[]} mappings
 * @param {number} start
 * @param {number} end
 * @param {boolean} [own_code] Count only segments inside the range, and no
 *   error's anchor. A segment that encloses the range doesn't count: a mapping of
 *   the whole file can have the same length on both sides by chance. An anchor
 *   still ends a range, as any code from outside the node does.
 * @returns {Array<[number, number]>}
 */
function generated_ranges(mappings, start, end, own_code = false) {
	/** @type {Array<[generated_start: number, generated_end: number, inside: boolean]>} */
	const segments = [];
	for (const mapping of mappings) {
		for (let i = 0; i < mapping.sourceOffsets.length; i++) {
			const source = mapping.sourceOffsets[i];
			const length = mapping.lengths[i];
			const generated = mapping.generatedOffsets[i];
			const generated_length = mapping.generatedLengths?.[i] ?? length;
			if (own_code && mapping.data?.customData?.diagnosticAnchor) {
				segments.push([generated, generated + generated_length, false]);
			} else if (source >= start && source + length <= end) {
				segments.push([generated, generated + generated_length, true]);
			} else if (
				!own_code &&
				source <= start &&
				end <= source + length &&
				generated_length === length
			) {
				segments.push([generated + start - source, generated + end - source, true]);
			} else {
				segments.push([generated, generated + generated_length, false]);
			}
		}
	}
	segments.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	/** @type {Array<[number, number]>} */
	const ranges = [];
	/** @type {[number, number] | null} */
	let range = null;
	for (const [segment_start, segment_end, inside] of segments) {
		if (inside) {
			if (range) {
				range[1] = Math.max(range[1], segment_end);
			} else {
				range = [segment_start, segment_end];
			}
		} else if (range && segment_start >= range[1]) {
			// Code from elsewhere follows: the node's next segment starts a new range.
			if (range[1] > range[0]) ranges.push(range);
			range = null;
		}
	}
	if (range && range[1] > range[0]) ranges.push(range);
	return ranges;
}
