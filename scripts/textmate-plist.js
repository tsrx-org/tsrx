/**
 * The TextMate grammar as a `.tmLanguage` plist, for `scripts/regenerate-textmate.js`.
 */

/** The keys of a grammar rule that hold captures. */
const CAPTURE_KEYS = new Set(['captures', 'beginCaptures', 'endCaptures', 'whileCaptures']);

/**
 * A copy of `grammar` without `patterns` inside captures. TextMate and VS Code
 * scan a capture's text again with its patterns. Sublime Text's `.tmLanguage`
 * loader does not support that and rejects the whole file ("Unexpected capture
 * value"), so `.tsrx` files open as Plain Text there (tsrx-org/tsrx#1021). Without
 * the patterns, the captured text keeps the capture's scope name only.
 * @param {unknown} grammar
 * @returns {unknown}
 */
export function withoutCapturePatterns(grammar) {
	if (Array.isArray(grammar)) return grammar.map(withoutCapturePatterns);
	if (!grammar || typeof grammar !== 'object') return grammar;
	return Object.fromEntries(
		Object.entries(grammar).map(([key, value]) => [
			key,
			CAPTURE_KEYS.has(key) && value && typeof value === 'object'
				? Object.fromEntries(
						Object.entries(value).map(([group, capture]) => {
							const { patterns: _patterns, ...rest } = capture ?? {};
							return [group, withoutCapturePatterns(rest)];
						}),
					)
				: withoutCapturePatterns(value),
		]),
	);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function toPlist(value) {
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
		'<plist version="1.0">',
		formatPlistValue(value, 0),
		'</plist>',
		'',
	].join('\n');
}

/**
 * @param {unknown} value
 * @param {number} depth
 * @returns {string}
 */
function formatPlistValue(value, depth) {
	const indent = '\t'.repeat(depth);
	const childIndent = '\t'.repeat(depth + 1);

	if (Array.isArray(value)) {
		if (value.length === 0) return `${indent}<array/>`;

		return [
			`${indent}<array>`,
			...value.map((item) => formatPlistValue(item, depth + 1)),
			`${indent}</array>`,
		].join('\n');
	}

	if (value && typeof value === 'object') {
		const entries = Object.entries(value).sort(comparePlistKeys);
		if (entries.length === 0) return `${indent}<dict/>`;

		return [
			`${indent}<dict>`,
			...entries.flatMap(([key, item]) => [
				`${childIndent}<key>${escapeXml(key)}</key>`,
				formatPlistValue(item, depth + 1),
			]),
			`${indent}</dict>`,
		].join('\n');
	}

	if (typeof value === 'boolean') {
		return `${indent}<${value ? 'true' : 'false'}/>`;
	}

	if (typeof value === 'number') {
		return Number.isInteger(value)
			? `${indent}<integer>${value}</integer>`
			: `${indent}<real>${value}</real>`;
	}

	if (value == null) {
		return `${indent}<string></string>`;
	}

	return `${indent}<string>${escapeXml(String(value))}</string>`;
}

/**
 * @param {[string, unknown]} left
 * @param {[string, unknown]} right
 * @returns {number}
 */
function comparePlistKeys(left, right) {
	return left[0].localeCompare(right[0]);
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeXml(value) {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
