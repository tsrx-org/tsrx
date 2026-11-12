/** @type {Record<string, string>} */
const string_escapes = { n: '\n', r: '\r', t: '\t', 0: '\0' };

/**
 * The node types a tree-sitter query names: named nodes, `(name …)`, and
 * anonymous tokens, `"text"`. Comments and the arguments of predicates and
 * directives (`(#eq? @x "a")`) are skipped, and `_` (any node) is not a type.
 *
 * @param {string} query
 * @returns {{ named: Set<string>, anonymous: Set<string> }}
 */
export function query_node_types(query) {
	/** @type {Set<string>} */
	const named = new Set();
	/** @type {Set<string>} */
	const anonymous = new Set();
	// Parentheses open inside the current predicate, or 0 outside one.
	let predicate_depth = 0;

	for (let i = 0; i < query.length; i++) {
		const char = query[i];
		if (char === ';') {
			const end = query.indexOf('\n', i);
			i = end === -1 ? query.length : end;
		} else if (char === '"') {
			let value = '';
			for (i++; i < query.length && query[i] !== '"'; i++) {
				if (query[i] === '\\') {
					i++;
					value += string_escapes[query[i]] ?? query[i];
				} else {
					value += query[i];
				}
			}
			if (predicate_depth === 0) anonymous.add(value);
		} else if (char === '(') {
			if (predicate_depth > 0) {
				predicate_depth++;
			} else if (query[i + 1] === '#') {
				predicate_depth = 1;
			} else {
				const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(query.slice(i + 1))?.[0];
				if (name && name !== '_') named.add(name);
			}
		} else if (char === ')' && predicate_depth > 0) {
			predicate_depth--;
		}
	}

	return { named, anonymous };
}
