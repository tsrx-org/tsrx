/**
 * The keywords TypeScript's parser suggests for a name that it reads where a
 * statement ends (`viableKeywordSuggestions`): the words in its scanner's
 * keyword table that are longer than two characters.
 */
const KEYWORDS = [
	'abstract',
	'accessor',
	'any',
	'asserts',
	'assert',
	'bigint',
	'boolean',
	'break',
	'case',
	'catch',
	'class',
	'continue',
	'const',
	'constructor',
	'debugger',
	'declare',
	'default',
	'defer',
	'delete',
	'else',
	'enum',
	'export',
	'extends',
	'false',
	'finally',
	'for',
	'from',
	'function',
	'get',
	'implements',
	'import',
	'infer',
	'instanceof',
	'interface',
	'intrinsic',
	'keyof',
	'let',
	'module',
	'namespace',
	'never',
	'new',
	'null',
	'number',
	'object',
	'package',
	'private',
	'protected',
	'public',
	'override',
	'out',
	'readonly',
	'require',
	'global',
	'return',
	'satisfies',
	'set',
	'static',
	'string',
	'super',
	'switch',
	'symbol',
	'this',
	'throw',
	'true',
	'try',
	'type',
	'typeof',
	'undefined',
	'unique',
	'unknown',
	'using',
	'var',
	'void',
	'while',
	'with',
	'yield',
	'async',
	'await',
];

/**
 * The keyword that TypeScript's parser suggests for `name`, a name followed by
 * another token where a statement ends (`parseErrorForMissingSemicolonAfter`):
 * a misspelled keyword (`cosnt`), or one without a space after it
 * (`asyncfoo`, `async foo`), or `undefined`.
 * @param {string} name
 * @returns {string | undefined}
 */
export function keyword_suggestion(name) {
	return spelling_suggestion(name) ?? space_suggestion(name);
}

/**
 * TypeScript's `getSpellingSuggestion` over the keywords.
 * @param {string} name
 * @returns {string | undefined}
 */
function spelling_suggestion(name) {
	const maximum_length_difference = Math.max(2, Math.floor(name.length * 0.34));
	let best_distance = Math.floor(name.length * 0.4) + 1;
	/** @type {string | undefined} */
	let best;
	for (const candidate of KEYWORDS) {
		if (Math.abs(candidate.length - name.length) > maximum_length_difference) continue;
		if (candidate === name) continue;
		const distance = levenshtein_with_max(name, candidate, best_distance - 0.1);
		if (distance === undefined) continue;
		best_distance = distance;
		best = candidate;
	}
	return best;
}

/**
 * TypeScript's `getSpaceSuggestion`: a keyword that `name` starts with, followed
 * by more than two characters.
 * @param {string} name
 * @returns {string | undefined}
 */
function space_suggestion(name) {
	const keyword = KEYWORDS.find(
		(keyword) => name.length > keyword.length + 2 && name.startsWith(keyword),
	);
	return keyword && `${keyword} ${name.slice(keyword.length)}`;
}

/**
 * TypeScript's `levenshteinWithMax`: the edit distance between `s1` and `s2`,
 * where a change of case costs 0.1, or `undefined` when it's more than `max`.
 * @param {string} s1
 * @param {string} s2
 * @param {number} max
 * @returns {number | undefined}
 */
function levenshtein_with_max(s1, s2, max) {
	/** @type {number[]} */
	let previous = new Array(s2.length + 1);
	/** @type {number[]} */
	let current = new Array(s2.length + 1);
	const big = max + 0.01;
	for (let i = 0; i <= s2.length; i++) previous[i] = i;
	for (let i = 1; i <= s1.length; i++) {
		const c1 = s1.charCodeAt(i - 1);
		const min_j = Math.ceil(i > max ? i - max : 1);
		const max_j = Math.floor(s2.length > max + i ? max + i : s2.length);
		current[0] = i;
		let column_min = i;
		for (let j = 1; j < min_j; j++) current[j] = big;
		for (let j = min_j; j <= max_j; j++) {
			const substitution =
				s1[i - 1].toLowerCase() === s2[j - 1].toLowerCase()
					? previous[j - 1] + 0.1
					: previous[j - 1] + 2;
			const distance =
				c1 === s2.charCodeAt(j - 1)
					? previous[j - 1]
					: Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
			current[j] = distance;
			column_min = Math.min(column_min, distance);
		}
		for (let j = max_j + 1; j <= s2.length; j++) current[j] = big;
		if (column_min > max) return undefined;
		[previous, current] = [current, previous];
	}
	const result = previous[s2.length];
	return result > max ? undefined : result;
}
