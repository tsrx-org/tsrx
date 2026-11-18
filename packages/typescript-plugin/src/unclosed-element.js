/** @import * as AST from 'estree' */

// Whether an element in the parsed source still needs its closing tag. The
// editor's generated code closes a tag that loose recovery found unclosed
// (#978), so the closing-tag features read the parsed source: the TSRX
// language server's auto-insert and the tsserver plugin's
// `getJsxClosingTagAtPosition`.

/**
 * Elements whose body is raw text, each with a pattern for its opening tag. The
 * body ends at the next `</style>` or `</script>`, wherever it is later in the
 * file, so that closing tag can belong to a later element (see `isUnclosed`).
 */
const RAW_TEXT_OPENING_TAGS = new Map([
	['style', /<style[\s/>]/],
	['script', /<script[\s/>]/],
]);

/**
 * An element of the parsed source and, when the element is one of its children,
 * the element that holds it.
 * @typedef {{ element: AST.TSRXJSXElement; parent: ElementPath | null }} ElementPath
 */

/**
 * Find the element whose opening tag ends at `end` in the parsed source.
 * @param {unknown} node
 * @param {number} end - The offset right after the opening tag's `>`
 * @param {ElementPath | null} [parent] - The element whose `children` hold `node`
 * @returns {ElementPath | null}
 */
export function findElement(node, end, parent = null) {
	if (Array.isArray(node)) {
		for (const child of node) {
			const found = findElement(child, end, parent);
			if (found) return found;
		}
		return null;
	}
	if (!node || typeof node !== 'object') {
		return null;
	}

	const element = /** @type {AST.TSRXJSXElement} */ (node);
	const path = element.openingElement ? { element, parent } : null;
	if (path?.element.openingElement.end === end) {
		return path;
	}

	for (const [key, value] of Object.entries(node)) {
		// `metadata` holds analysis results, such as scopes, not source nodes.
		if (key === 'loc' || key === 'metadata') continue;
		const found = findElement(value, end, key === 'children' ? path : null);
		if (found) return found;
	}
	return null;
}

/**
 * Whether the element still needs its closing tag, decided like TypeScript's
 * `isUnclosedTag`: the element is unclosed, or it took the closing tag of a parent
 * with the same name (`<div>` typed as the first child of a `<div>`), which is then
 * the unclosed one. Loose-mode recovery marks an element without its closing tag
 * `unclosed`.
 *
 * A `<style>` or `<script>` body ends at the next closing tag with its name, which
 * can belong to a later element: a new `<style>` typed in one component takes the
 * `</style>` of the style block in the next component. That element's opening tag
 * is then in the body, so the new element still needs its own closing tag.
 * @param {ElementPath} path
 * @param {string} sourceCode
 * @returns {boolean}
 */
export function isUnclosed(path, sourceCode) {
	/** @param {AST.TSRXJSXElement} element */
	const name = (element) => {
		const { start, end } = /** @type {AST.NodeWithLocation} */ (element.openingElement.name);
		return sourceCode.slice(start, end);
	};

	const { element } = path;
	const rawTextOpeningTag = RAW_TEXT_OPENING_TAGS.get(name(element));
	if (rawTextOpeningTag) {
		if (element.unclosed || !element.closingElement) return true;
		const bodyEnd = /** @type {AST.NodeWithLocation} */ (element.closingElement).start;
		return rawTextOpeningTag.test(sourceCode.slice(element.openingElement.end, bodyEnd));
	}

	for (let current = path; ; current = current.parent) {
		if (current.element.unclosed) return true;
		if (!current.parent || name(current.parent.element) !== name(current.element)) return false;
	}
}
