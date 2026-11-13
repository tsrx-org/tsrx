/** @import { Language } from '@volar/language-core' */
/** @import { Diagnostic, Program, SourceFile } from 'typescript' */

import path from 'node:path';

/**
 * @typedef {{
 * 	message?: unknown,
 * 	code?: unknown,
 * 	severity?: unknown,
 * 	type?: unknown,
 * 	pos?: unknown,
 * 	loc?: { line?: unknown, column?: unknown, start?: { line?: unknown, column?: unknown } },
 * }} LoggedDiagnostic
 *
 * The parts of a `.tsrx` file's virtual code (`TSRXVirtualCode`) this reads.
 * @typedef {{
 * 	languageId: string,
 * 	originalCode: string,
 * 	fatalErrors: ReadonlyArray<unknown>,
 * 	usageErrors: ReadonlyArray<unknown>,
 * }} CompiledFile
 */

const TYPESCRIPT_CODE = /^TS(\d+)$/;
const LINE_BREAK = /\r\n?|[\n\u2028\u2029]/g;

/**
 * Print the compile errors and warnings of each `.tsrx` file in a program the way
 * tsc prints a diagnostic, `App.tsrx(2,13): error TS1186: message`: the path
 * relative to the current directory, the 1-based line and column when the
 * diagnostic has a position, then the severity and the diagnostic `code`. A
 * thrown (fatal) error stops the compile, so it prints as an error whatever its
 * `severity`, as the language server shows it.
 *
 * An error with a TypeScript code is a mistake the parser collects where
 * TypeScript's parser goes on (#415). When TypeScript reports the same code at
 * the same place in the file, its line is the one tsc prints, so this one is
 * left out, as the language server leaves it to TypeScript (#946).
 *
 * `tsrx-tsc` calls this once for each program it checks, after Volar has
 * decorated it, so its diagnostics point at the `.tsrx` source.
 * @param {Language<string>} language
 * @param {Program} program
 * @param {readonly string[]} extensions the file extensions the TSRX language plugin serves
 * @param {(line: string) => void} write
 * @returns {boolean} whether an error was printed
 */
export function report_tsrx_diagnostics(language, program, extensions, write) {
	let printed_error = false;
	for (const source_file of program.getSourceFiles()) {
		if (!extensions.some((extension) => source_file.fileName.endsWith(extension))) continue;
		const root = /** @type {CompiledFile | undefined} */ (
			language.scripts.get(source_file.fileName)?.generated?.root
		);
		if (root?.languageId !== 'tsrx') continue;
		const errors = [...root.fatalErrors, ...root.usageErrors];
		if (errors.length === 0) continue;

		/** @type {Set<string> | undefined} */
		let reported_by_typescript;
		/** @type {Set<string>} */
		const printed = new Set();
		const file_name = relative_file_name(source_file.fileName);
		for (const error of errors) {
			const diagnostic = describe_diagnostic(error, root.originalCode);
			if (diagnostic.severity === 'error' && diagnostic.code && diagnostic.offset !== undefined) {
				const match = TYPESCRIPT_CODE.exec(diagnostic.code);
				if (match) {
					reported_by_typescript ??= typescript_places(program, source_file);
					if (reported_by_typescript.has(`${match[1]}@${diagnostic.offset}`)) continue;
				}
			}
			const line = format_diagnostic(file_name, diagnostic);
			if (printed.has(line)) continue;
			printed.add(line);
			write(line);
			if (diagnostic.severity === 'error') printed_error = true;
		}
	}
	return printed_error;
}

/**
 * The codes and source offsets of TypeScript's own diagnostics for a file, as
 * `<code>@<offset>`. Syntactic diagnostics stop tsc from checking types, so a
 * mistake TypeScript reports is in one list or the other. Both are cached, so
 * tsc reuses them when it asks next.
 * @param {Program} program
 * @param {SourceFile} source_file
 * @returns {Set<string>}
 */
function typescript_places(program, source_file) {
	/** @type {Set<string>} */
	const places = new Set();
	/** @type {ReadonlyArray<Diagnostic>[]} */
	const lists = [
		program.getSyntacticDiagnostics(source_file),
		program.getSemanticDiagnostics(source_file),
	];
	for (const diagnostics of lists) {
		for (const diagnostic of diagnostics) {
			if (diagnostic.file?.fileName !== source_file.fileName) continue;
			if (diagnostic.start === undefined) continue;
			places.add(`${diagnostic.code}@${diagnostic.start}`);
		}
	}
	return places;
}

/**
 * The path tsc prints for a file: relative to the current directory, with `/`.
 * @param {string} file_name
 * @returns {string}
 */
function relative_file_name(file_name) {
	const relative = path.relative(process.cwd(), file_name);
	return (path.isAbsolute(relative) ? file_name : relative).replaceAll('\\', '/');
}

/**
 * @param {unknown} error
 * @param {string} source the compiled text, which a diagnostic's `pos` indexes
 * @returns {{
 * 	message: string,
 * 	severity: 'error' | 'warning',
 * 	code: string | undefined,
 * 	start: { line: number, column: number } | undefined,
 * 	offset: number | undefined,
 * }}
 */
function describe_diagnostic(error, source) {
	const details =
		error && typeof error === 'object' ? /** @type {LoggedDiagnostic} */ (error) : undefined;
	const message = details && 'message' in details ? String(details.message) : String(error);
	const severity =
		details?.severity === 'warning' && details.type !== 'fatal' ? 'warning' : 'error';
	const code =
		typeof details?.code === 'string' && details.code.length > 0 ? details.code : undefined;
	const start = diagnostic_start(details, source);
	return {
		message,
		severity,
		code,
		start,
		offset: start ? offset_of(start, source) : undefined,
	};
}

/**
 * @param {string} file_name
 * @param {ReturnType<typeof describe_diagnostic>} diagnostic
 * @returns {string}
 */
function format_diagnostic(file_name, { message, severity, code, start }) {
	const label = code === undefined ? severity : `${severity} ${code}`;
	const position = start ? `(${start.line},${start.column + 1})` : '';
	return `${file_name}${position}: ${label}: ${message}`;
}

/**
 * Where a diagnostic starts, as a 1-based line and a 0-based column. A
 * collected error's `loc` is a range, and a parse error acorn throws gives its
 * position as `loc` itself (`{ line, column }`). A diagnostic without `loc`,
 * such as one a consumer compiler builds with only `pos` and `end`, is placed
 * by `pos` in `source`, breaking lines where tsc does.
 * @param {LoggedDiagnostic | undefined} details
 * @param {string} source
 * @returns {{ line: number, column: number } | undefined}
 */
function diagnostic_start(details, source) {
	const start = details?.loc?.start ?? details?.loc;
	if (typeof start?.line === 'number' && typeof start?.column === 'number') {
		return { line: start.line, column: start.column };
	}
	const pos = details?.pos;
	if (typeof pos !== 'number' || pos < 0 || pos > source.length) return undefined;
	let line = 1;
	let line_start = 0;
	for (const match of source.slice(0, pos).matchAll(LINE_BREAK)) {
		line++;
		line_start = match.index + match[0].length;
	}
	return { line, column: pos - line_start };
}

/**
 * The offset in `source` of a 1-based line and 0-based column.
 * @param {{ line: number, column: number }} start
 * @param {string} source
 * @returns {number | undefined}
 */
function offset_of({ line, column }, source) {
	let line_start = 0;
	let current = 1;
	for (const match of source.matchAll(LINE_BREAK)) {
		if (current === line) break;
		current++;
		line_start = match.index + match[0].length;
	}
	return current === line ? line_start + column : undefined;
}
