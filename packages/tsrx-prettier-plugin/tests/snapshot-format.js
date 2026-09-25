/**
 * Reads Prettier's format-test snapshots (`tests/format/**\/format.test.js.snap`
 * in the Prettier repository). Each entry records the options, the input, and
 * Prettier's output for one fixture; see Prettier's
 * `tests/config/format-test/create-snapshot.js`.
 */

/**
 * @typedef {{ title: string, raw: string, body: string }} SnapshotEntry
 * @typedef {{
 *   title: string,
 *   filename: string | undefined,
 *   parsers: string[],
 *   options: Record<string, unknown>,
 *   input: string,
 *   output: string,
 * }} FormatCase
 */

export const SNAPSHOT_HEADER = '// Jest Snapshot v1, https://jestjs.io/docs/snapshot-testing';

const ENTRY = /^exports\[`((?:[^`\\]|\\.)*)`\] = `\n([\s\S]*?)\n`;$/gmu;

/**
 * @param {string} description
 * @returns {string}
 */
function separator(description = '') {
	const left = Math.floor((80 - description.length) / 2);
	return '='.repeat(left) + description + '='.repeat(80 - left - description.length);
}

const OPTIONS_SEPARATOR = separator('options');
const INPUT_SEPARATOR = separator('input');
const OUTPUT_SEPARATOR = separator('output');
const END_SEPARATOR = separator();

/**
 * Jest escapes backticks, backslashes, and `${` in snapshot strings.
 * @param {string} text
 * @returns {string}
 */
function unescape(text) {
	return text.replace(/\\([\\`]|\$\{)/gu, '$1');
}

/**
 * @param {string} text The contents of a `.snap` file.
 * @returns {SnapshotEntry[]}
 */
export function readSnapshotEntries(text) {
	return [...text.matchAll(ENTRY)].map((match) => ({
		title: unescape(match[1]),
		raw: match[0],
		body: unescape(match[2]),
	}));
}

/**
 * @param {SnapshotEntry[]} entries
 * @returns {string}
 */
export function writeSnapshotEntries(entries) {
	return `${SNAPSHOT_HEADER}\n\n${entries.map((entry) => entry.raw).join('\n\n')}\n`;
}

/**
 * Split an entry into its options, input, and output. Returns `null` for
 * entries that don't record a formatted output, such as expected errors.
 * @param {SnapshotEntry} entry
 * @returns {FormatCase | null}
 */
export function readFormatCase({ title, body }) {
	if (!body.startsWith(`${OPTIONS_SEPARATOR}\n`) || !body.endsWith(`\n${END_SEPARATOR}`)) {
		return null;
	}
	const inputStart = body.indexOf(`\n${INPUT_SEPARATOR}\n`);
	const outputStart = body.lastIndexOf(`\n${OUTPUT_SEPARATOR}\n`);
	if (inputStart === -1 || outputStart === -1 || outputStart < inputStart) {
		return null;
	}

	/** @type {Record<string, unknown>} */
	const options = {};
	/** @type {string[]} */
	let parsers = [];
	for (const line of body.slice(OPTIONS_SEPARATOR.length + 1, inputStart).split('\n')) {
		// The print-width ruler is indented or starts with `|`; option lines aren't.
		const match = /^(\w+): (.*)$/u.exec(line);
		if (!match) continue;
		const [, key, value] = match;
		const parsed = value === 'Infinity' ? Infinity : JSON.parse(value);
		if (key === 'parsers') parsers = parsed;
		else options[key] = parsed;
	}

	return {
		title,
		filename: filenameOf(title),
		parsers,
		options,
		input: body.slice(inputStart + INPUT_SEPARATOR.length + 2, outputStart),
		output: body.slice(outputStart + OUTPUT_SEPARATOR.length + 2, -(END_SEPARATOR.length + 1)),
	};
}

/**
 * The fixture's file name, from a title like `jsx.js - {"semi":false} format 1`
 * or `snippet: #0 format 1`. Snippets have no file unless they are named like one.
 * @param {string} title
 * @returns {string | undefined}
 */
function filenameOf(title) {
	const name = /^(.*?)(?: - \{.*\})? format \d+$/u.exec(title)?.[1] ?? title;
	const file = name.startsWith('snippet: ') ? name.slice('snippet: '.length) : name;
	return /\.[cm]?[jt]sx?$/u.test(file) ? file : undefined;
}
