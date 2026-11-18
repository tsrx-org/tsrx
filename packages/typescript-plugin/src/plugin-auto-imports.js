import { isCodeActionsEnabled, isCompletionEnabled } from '@volar/language-core';
import {
	getMappingOffset,
	toGeneratedOffset,
	transformFileTextChanges,
} from '@volar/typescript/lib/node/transform.js';
import { getServiceScript } from '@volar/typescript/lib/node/utils.js';

/** The language service methods whose edits add imports. */
const IMPORT_EDIT_METHODS = new Set([
	'getCodeFixesAtPosition',
	'getCombinedCodeFix',
	'getCompletionEntryDetails',
]);

/**
 * The first imports of `.tsrx` files that `with_top_of_file_imports` took out of a
 * code fix, a combined code fix or a completion's code action, for
 * `with_top_of_file_import_edits` to add back in source coordinates.
 * @type {WeakMap<object, TopOfFileImport[]>}
 */
const top_of_file_imports = new WeakMap();

/**
 * @typedef {object} TopOfFileImport
 * @property {string} fileName
 * @property {string} newText TypeScript's text for the generated file.
 * @property {boolean} atStart Whether TypeScript inserted it at the start of the file.
 * @property {boolean} beforeLineBreak Whether a line break followed the insertion point.
 */

/** A triple-slash directive, which TypeScript keeps above the first import. */
const TRIPLE_SLASH_DIRECTIVE =
	/^\/\/\/\s*<(?:(?:reference\s+(?:path|types|lib|no-default-lib)|amd-dependency\s+path)\s*=\s*(?:'[^']*'|"[^"]*")|amd-module\s).*?\/>/;

/**
 * In tsserver, Volar gives TypeScript a `.tsrx` file as blank lines as long as the
 * source, followed by the generated code. TypeScript adds the first import of a file
 * where its algorithm finds the top of that file, often at its start in the blank
 * lines, or after a directive prologue such as `'use client';` where no mapping
 * reaches either, so the import was lost (#828). Take that insertion out of the
 * result before Volar's proxy maps it, for `with_top_of_file_import_edits` to add at
 * the top of the source.
 *
 * Wraps the language service that Volar's proxy maps.
 * @template {import('typescript').LanguageService} T
 * @param {T} languageService the language service Volar's proxy wraps
 * @param {typeof import('typescript')} ts
 * @param {() => import('@volar/language-core').Language<string> | undefined} get_language
 * @returns {T}
 */
export function with_top_of_file_imports(languageService, ts, get_language) {
	return new Proxy(languageService, {
		get(target, property, receiver) {
			const method = /** @type {Function} */ (Reflect.get(target, property, receiver));
			if (typeof property !== 'string' || !IMPORT_EDIT_METHODS.has(property)) {
				return method;
			}
			return (/** @type {unknown[]} */ ...args) => {
				const result = method.apply(target, args);
				const language = get_language();
				const program = language && target.getProgram();
				if (!language || !program) return result;
				for (const owner of edit_owners_of(property, result)) {
					/** @type {TopOfFileImport[]} */
					const taken = [];
					for (const changes of owner.changes) {
						const [service_script] = getServiceScript(
							language,
							changes.fileName.replace(/\\/g, '/'),
						);
						const generated_file = program.getSourceFile(changes.fileName);
						if (!service_script || !generated_file || !getMappingOffset(language, service_script)) {
							continue;
						}
						const position = top_of_file_position(ts, generated_file);
						changes.textChanges = changes.textChanges.filter((change) => {
							if (change.span.start !== position || change.span.length !== 0) return true;
							taken.push({
								fileName: changes.fileName,
								newText: change.newText,
								atStart: position === 0,
								beforeLineBreak: is_line_break(generated_file.text[position]),
							});
							return false;
						});
					}
					if (taken.length > 0) top_of_file_imports.set(owner, taken);
				}
				return result;
			};
		},
	});
}

/**
 * Add the first imports that `with_top_of_file_imports` took out where TypeScript
 * adds them in a `.tsx` file with the same source: after the hashbang, the directive
 * prologue, and pinned, triple-slash or detached comments at the top of the source.
 * The text around the import changes with the place, as TypeScript's does.
 *
 * Wraps the language service that Volar's proxy returns.
 * @template {object} T
 * @param {T} languageService
 * @param {typeof import('typescript')} ts
 * @param {() => import('@volar/language-core').Language<string> | undefined} get_language
 * @returns {T}
 */
export function with_top_of_file_import_edits(languageService, ts, get_language) {
	return new Proxy(languageService, {
		get(target, property, receiver) {
			const method = /** @type {Function} */ (Reflect.get(target, property, receiver));
			if (typeof property !== 'string' || !IMPORT_EDIT_METHODS.has(property)) {
				return method;
			}
			return (/** @type {unknown[]} */ ...args) => {
				const result = method.apply(target, args);
				const language = get_language();
				if (!language) return result;
				for (const owner of edit_owners_of(property, result)) {
					for (const taken of top_of_file_imports.get(owner) ?? []) {
						add_top_of_file_import(ts, language, owner, taken);
					}
					top_of_file_imports.delete(owner);
				}
				return result;
			};
		},
	});
}

/**
 * The objects that hold the `FileTextChanges` of a result of one of
 * `IMPORT_EDIT_METHODS`. Volar's proxy maps their `changes` in place, so the same
 * objects come out of it.
 * @param {string} method
 * @param {any} result
 * @returns {Array<{ changes: import('typescript').FileTextChanges[] }>}
 */
function edit_owners_of(method, result) {
	switch (method) {
		case 'getCodeFixesAtPosition':
			return result ?? [];
		case 'getCombinedCodeFix':
			return result ? [result] : [];
		default:
			return result?.codeActions ?? [];
	}
}

/**
 * @param {typeof import('typescript')} ts
 * @param {import('@volar/language-core').Language<string>} language
 * @param {{ changes: import('typescript').FileTextChanges[] }} owner
 * @param {TopOfFileImport} taken
 */
function add_top_of_file_import(ts, language, owner, taken) {
	const source_script = language.scripts.get(taken.fileName.replace(/\\/g, '/'));
	if (!source_script) return;
	const text = source_script.snapshot.getText(0, source_script.snapshot.getLength());
	const position = top_of_file_position(
		ts,
		ts.createSourceFile(taken.fileName, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX),
	);
	// TypeScript writes a line break before the import unless it is at the start of
	// the file, and one after it unless a line break follows, plus one for a blank
	// line after it.
	const newline = taken.newText.includes('\r\n') ? '\r\n' : '\n';
	let core = taken.atStart ? taken.newText : taken.newText.replace(/^\r?\n/, '');
	let trailing = 0;
	while (core.endsWith(newline)) {
		core = core.slice(0, -newline.length);
		trailing++;
	}
	const blank_line = trailing > (taken.beforeLineBreak ? 0 : 1);
	const change = {
		span: { start: position, length: 0 },
		newText:
			(position === 0 ? '' : newline) +
			core +
			(is_line_break(text[position]) ? '' : newline) +
			(blank_line ? newline : ''),
	};
	const file_changes = owner.changes.find((changes) => changes.fileName === taken.fileName);
	if (file_changes) {
		file_changes.textChanges = [change, ...file_changes.textChanges].sort(
			(left, right) => left.span.start - right.span.start,
		);
	} else {
		owner.changes.push({ fileName: taken.fileName, textChanges: [change] });
	}
}

/**
 * Where TypeScript adds the first import of a file: after the directive prologue,
 * or else after the hashbang and the pinned, triple-slash and detached comments at
 * the start of the file (`getInsertionPositionAtSourceFileTop` in TypeScript's
 * `textChanges.ts`).
 * @param {typeof import('typescript')} ts
 * @param {import('typescript').SourceFile} source_file
 * @returns {number}
 */
function top_of_file_position(ts, source_file) {
	const text = source_file.text;
	const line_of = (/** @type {number} */ position) =>
		source_file.getLineAndCharacterOfPosition(position).line;

	/** @type {import('typescript').Statement | undefined} */
	let last_prologue;
	for (const statement of source_file.statements) {
		if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
		last_prologue = statement;
	}
	if (last_prologue) return past_line_break(text, last_prologue.end);

	const hashbang = /^#!.*/.exec(text);
	const position = hashbang ? past_line_break(text, hashbang[0].length) : 0;
	/** @type {{ range: import('typescript').CommentRange, pinned: boolean } | undefined} */
	let last_comment;
	for (const range of ts.getLeadingCommentRanges(text, position) ?? []) {
		const comment = text.slice(range.pos, range.end);
		if (
			range.kind === ts.SyntaxKind.MultiLineCommentTrivia
				? comment.startsWith('/*!')
				: TRIPLE_SLASH_DIRECTIVE.test(comment)
		) {
			last_comment = { range, pinned: true };
			continue;
		}
		if (last_comment?.pinned) break;
		// A comment after a blank line, or one attached to the first statement, stays
		// below the import.
		if (last_comment && line_of(range.pos) >= line_of(last_comment.range.end) + 2) break;
		const first = source_file.statements[0];
		if (first && line_of(first.getStart(source_file)) < line_of(range.end) + 2) break;
		last_comment = { range, pinned: false };
	}
	return last_comment ? past_line_break(text, last_comment.range.end) : position;
}

/**
 * @param {string} text
 * @param {number} position
 */
function past_line_break(text, position) {
	if (!is_line_break(text[position])) return position;
	return text[position] === '\r' && text[position + 1] === '\n' ? position + 2 : position + 1;
}

/** @param {string | undefined} character */
function is_line_break(character) {
	return (
		character === '\n' || character === '\r' || character === '\u2028' || character === '\u2029'
	);
}

/**
 * Map the edits of a completion the way the proxy maps a quick fix's: through
 * mappings that enable code actions, as well as mappings that enable completions.
 * Volar maps a completion's edits only through the second kind, but an auto-import
 * completion edits the imports, whose line starts map only for code actions, so a
 * completion that adds an import line inserted nothing (#1026) while the quick fix
 * on the same name added it.
 * @template {object} T
 * @param {T} languageService the language service Volar's proxy returns
 * @param {() => import('typescript').LanguageService | undefined} get_original the language service the proxy wraps
 * @param {() => import('@volar/language-core').Language<string> | undefined} get_language
 * @returns {T}
 */
export function with_completion_import_edits(languageService, get_original, get_language) {
	return new Proxy(languageService, {
		get(target, property, receiver) {
			const method = Reflect.get(target, property, receiver);
			if (property !== 'getCompletionEntryDetails') {
				return method;
			}
			const get_details =
				/** @type {import('typescript').LanguageService['getCompletionEntryDetails']} */ (method);
			/** @type {import('typescript').LanguageService['getCompletionEntryDetails']} */
			return (file_name, position, ...rest) => {
				const original = get_original();
				const language = get_language();
				const [service_script, target_script, source_script] = language
					? getServiceScript(language, file_name.replace(/\\/g, '/'))
					: [];
				if (!original || !language || !service_script || !target_script || !source_script) {
					return get_details.call(target, file_name, position, ...rest);
				}
				const generated = toGeneratedOffset(
					language,
					service_script,
					source_script,
					position,
					isCompletionEnabled,
				);
				if (generated === undefined) return undefined;
				const details = original.getCompletionEntryDetails(target_script.id, generated, ...rest);
				for (const action of details?.codeActions ?? []) {
					action.changes = transformFileTextChanges(
						language,
						action.changes,
						false,
						(data) => isCompletionEnabled(data) || isCodeActionsEnabled(data),
					);
				}
				return details;
			};
		},
	});
}
