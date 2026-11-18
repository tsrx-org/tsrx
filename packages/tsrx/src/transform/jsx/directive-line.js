/** @import * as AST from 'estree' */
/** @import * as ESRap from 'esrap' */

import { Context } from 'esrap';

/**
 * A command as an esrap `Context` stores it: text, a source location, a
 * layout command (an index into `LAYOUT`), or the commands of an appended
 * context. `null` stands for commands that could not be recorded.
 * @typedef {{ type: 'Location', line: number, column: number }} Location
 * @typedef {string | Location | number} Command
 * @typedef {Command | null | Recorded[]} Recorded
 */

const LAYOUT = /** @type {const} */ (['newline', 'margin', 'space', 'indent', 'dedent']);
const NEWLINE = LAYOUT.indexOf('newline');
const MARGIN = LAYOUT.indexOf('margin');
const SPACE = LAYOUT.indexOf('space');
const INDENT = LAYOUT.indexOf('indent');
const DEDENT = LAYOUT.indexOf('dedent');

/**
 * The commands of each recording context, in the order the output has them.
 * @type {WeakMap<ESRap.Context, Recorded[]>}
 */
const recordings = new WeakMap();

const regex_line_break = /[\n\r\u2028\u2029]/;
const regex_blank_or_comments = /^(?:\s|\/\/[^\n\r\u2028\u2029]*|\/\*[\s\S]*?\*\/)*$/;
const regex_comment = /^\/[/*]/;
/**
 * Text after which the code must go on, so that a line break after it cannot
 * end the statement: an opening bracket, a separator, or an operator. Not
 * `!`, `++` or `--`, which can end an operand, nor `/`, which ends a regex.
 */
const regex_continues = /(?:[([{,;:?=<.&|^~*%]|(?<![+-])[+-])$/;
/**
 * A word after which TypeScript ends the code at a line break, as a `return`
 * or a modifier, or reads the code differently, as `asserts`. The TSRX parser
 * reads some of them across a line break.
 */
const regex_no_break_after =
	/(?:^|[^\w$])(?:return|throw|yield|break|continue|async|asserts|abstract|declare|type|namespace|module|global|readonly|public|private|protected|override|static|accessor|get|set|let|using|infer|unique)$/;
/**
 * The start of code that TypeScript does not read as going on from an
 * operand on the line before: `as`, import attributes, a non-null `!`, type
 * arguments, an array type.
 */
const regex_no_break_before =
	/^(?:(?:as|satisfies|is|with|assert|extends)(?![\w$])|!|\+\+|--|=>|<|\[)/;
const regex_join_after = /[;,{([:?=]$/;
const regex_join_before = /^[)\]},;.?:]/;

/**
 * Print `node` so that the line after the TypeScript directive that leads it
 * holds the code of the source line the directive covers and no other.
 * TypeScript applies a directive to the next line only, and the printer
 * joins and splits the lines of a statement as it likes (#1144). The node is
 * printed as usual into a context that records its commands, and its lines
 * are then laid out again (see `lay_out_directive_line`).
 * @param {AST.Node} node
 * @param {ESRap.Context} context
 * @param {number} line The source line the directive covers, where `node` starts.
 * @param {string} source
 * @param {ESRap.Visitors<AST.Node>} visitors
 * @param {NonNullable<ESRap.Visitors<AST.Node>['_']>} base_visitor esrap's own `_`
 */
export function print_on_directive_line(node, context, line, source, visitors, base_visitor) {
	const recorder = context.new();
	const recorded = record(recorder);
	const lookup = /** @type {Record<string, (node: AST.Node, context: ESRap.Context) => void>} */ (
		visitors
	);
	base_visitor(node, recorder, (child) => lookup[child.type](child, recorder));

	const commands = flatten(recorded);
	if (!commands) {
		context.append(recorder);
		return;
	}
	const output = new Context(/** @type {ESRap.Visitors} */ (visitors));
	record(output);
	for (const command of lay_out_directive_line(commands, line, source)) {
		if (typeof command === 'number') {
			output[LAYOUT[command]]();
		} else if (typeof command === 'string') {
			output.write(command);
		} else {
			output.location(command.line, command.column);
		}
	}
	context.append(output);
}

/**
 * Record the commands written to `context` and to the contexts it creates.
 * Text that `write` maps to a source token is recorded as `write` pushes it:
 * the spaces around the token, and the token between its two locations.
 * @param {ESRap.Context} context
 * @returns {Recorded[]}
 */
function record(context) {
	/** @type {Recorded[]} */
	const commands = [];
	/** @type {Location[] | null} */
	let written = null;
	const proto = Context.prototype;
	const target = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (context));

	target.location = (/** @type {number} */ line, /** @type {number} */ column) => {
		/** @type {Location} */
		const location = { type: 'Location', line, column };
		if (written) written.push(location);
		else commands.push(location);
		proto.location.call(context, line, column);
	};
	target.write = (/** @type {string} */ content, /** @type {AST.Node | undefined} */ node) => {
		written = [];
		proto.write.call(context, content, node);
		const [start, end, ...rest] = written;
		written = null;
		if (!start) {
			commands.push(content);
		} else if (!end || rest.length > 0) {
			commands.push(null);
		} else if (node?.loc) {
			commands.push(start, content, end);
		} else {
			const value = content.trim();
			const index = content.indexOf(value);
			if (index > 0) commands.push(content.slice(0, index));
			commands.push(start, value, end);
			if (index + value.length < content.length) {
				commands.push(content.slice(index + value.length));
			}
		}
	};
	LAYOUT.forEach((name, index) => {
		target[name] = () => {
			commands.push(index);
			proto[name].call(context);
		};
	});
	target.append = (/** @type {ESRap.Context} */ child) => {
		commands.push(recordings.get(child) ?? null);
		proto.append.call(context, child);
	};
	target.new = () => {
		const child = proto.new.call(context);
		record(child);
		return child;
	};
	recordings.set(context, commands);
	return commands;
}

/**
 * @param {Recorded[]} recorded
 * @param {Command[]} [commands]
 * @returns {Command[] | null} `null` when a command was not recorded.
 */
function flatten(recorded, commands = []) {
	for (const command of recorded) {
		if (command === null) return null;
		if (Array.isArray(command)) {
			if (!flatten(command, commands)) return null;
		} else {
			commands.push(command);
		}
	}
	return commands;
}

/**
 * Lay out the commands of a node so that its code from source line `line`
 * makes up one output line. The printer's line breaks in that code become
 * spaces where a space reads the same, and the code from later lines starts
 * on a new line: at the printer's own line break when one comes right before
 * it, or else at a new, indented one. A new break goes where the source
 * breaks the line between the same two tokens, or after text that the code
 * must go on from, so that TypeScript reads the code as before. Where there
 * is no such place, as before the `with` of an import's attributes, which the
 * TSRX parser reads after a line break and TypeScript does not, the line
 * keeps that code too.
 * @param {Command[]} commands
 * @param {number} line
 * @param {string} source
 * @returns {Command[]}
 */
function lay_out_directive_line(commands, line, source) {
	const line_starts = get_line_starts(source);
	/** @param {Location} location */
	const offset_of = (location) =>
		(line_starts[location.line - 1] ?? source.length) + location.column;

	// Code of the covered line can come after a location on a later line: a
	// parenthesis that the printer adds maps to the next `(` of the source,
	// as in `1` followed by `(foo)()` on the next line, printed `(1)(foo)()`.
	let last_covered = -1;
	commands.forEach((command, i) => {
		if (typeof command === 'object' && command.line <= line) last_covered = i;
	});

	// The first code from a later line, and where the new line goes.
	let later = commands.length;
	let insert = -1;
	// The last text, and the location after it: its end, when it maps to a token.
	let previous_index = -1;
	/** @type {Location | null} */
	let previous_end = null;
	for (let i = 0; i < commands.length; i++) {
		const command = commands[i];
		if (typeof command === 'object') {
			if (previous_end === null && previous_index !== -1) previous_end = command;
			if (command.line <= line || i < last_covered) continue;
			later = Math.min(later, i);
			if (previous_index === -1) break;
			const previous = /** @type {string} */ (commands[previous_index]).trim();
			if (
				(!regex_comment.test(previous) && regex_continues.test(previous)) ||
				(previous_end !== null &&
					previous_end !== command &&
					is_line_break(source.slice(offset_of(previous_end), offset_of(command))) &&
					!regex_no_break_after.test(previous) &&
					!regex_no_break_before.test(text_after(commands, i) ?? ''))
			) {
				insert = i;
				break;
			}
		} else if (typeof command === 'string') {
			// Text with a line break, such as a template literal or JSX text,
			// ends the line.
			if (regex_line_break.test(command)) {
				later = Math.min(later, i);
				break;
			}
			if (command.trim() === '') continue;
			previous_index = i;
			previous_end = null;
		}
	}

	// The printer's own line break right before the code of the later lines,
	// with at most code the compiler added between them, such as the `return`
	// of a template. Or else one right before the new line.
	let kept = -1;
	for (let i = later - 1; i >= 0 && later < commands.length; i--) {
		const command = commands[i];
		if (typeof command === 'object') break;
		if (command === NEWLINE) {
			kept = i;
			break;
		}
	}
	if (kept === -1 && insert !== -1) {
		kept = commands.indexOf(NEWLINE, previous_index + 1);
		if (kept > insert) kept = -1;
	}

	/** @type {Command[]} */
	const result = [];
	let indented = false;
	for (let i = 0; i < commands.length; i++) {
		const command = commands[i];
		if (i === insert && kept === -1) {
			result.push(INDENT, NEWLINE);
			indented = true;
		}
		if (i < later && i !== kept && command === MARGIN) continue;
		if (i < later && i !== kept && command === NEWLINE) {
			result.push(can_join(text_before(commands, i), text_after(commands, i)) ? SPACE : NEWLINE);
			continue;
		}
		result.push(command);
		// Only the new line is indented.
		if (indented && typeof command === 'string') {
			result.push(DEDENT);
			indented = false;
		}
	}
	return result;
}

/**
 * Whether a space in place of the printer's line break between two texts
 * reads the same: after a separator or an opening bracket, or before a
 * closing bracket or an operator that continues the code. Never after a line
 * comment.
 * @param {string | null} previous
 * @param {string | null} next
 * @returns {boolean}
 */
function can_join(previous, next) {
	if (previous === null || next === null) return true;
	if (previous.startsWith('//')) return false;
	return regex_join_after.test(previous) || regex_join_before.test(next);
}

/**
 * Whether the source text between two tokens holds a line break and only
 * spaces and comments.
 * @param {string} text
 * @returns {boolean}
 */
function is_line_break(text) {
	return regex_line_break.test(text) && regex_blank_or_comments.test(text);
}

/**
 * @param {Command[]} commands
 * @param {number} index
 * @returns {string | null}
 */
function text_before(commands, index) {
	for (let i = index - 1; i >= 0; i--) {
		const command = commands[i];
		if (is_text(command)) return command.trim();
	}
	return null;
}

/**
 * @param {Command[]} commands
 * @param {number} index
 * @returns {string | null}
 */
function text_after(commands, index) {
	for (let i = index + 1; i < commands.length; i++) {
		const command = commands[i];
		if (is_text(command)) return command.trim();
	}
	return null;
}

/**
 * @param {Command} command
 * @returns {command is string}
 */
function is_text(command) {
	return typeof command === 'string' && command.trim() !== '';
}

/** @type {{ source: string, starts: number[] } | null} */
let line_starts_cache = null;

/**
 * The offset where each line of `source` starts, as TypeScript and acorn
 * count lines.
 * @param {string} source
 * @returns {number[]}
 */
function get_line_starts(source) {
	if (line_starts_cache?.source === source) return line_starts_cache.starts;
	const starts = [0];
	for (let i = 0; i < source.length; i++) {
		const char = source[i];
		if (char === '\r' && source[i + 1] === '\n') i++;
		else if (char !== '\n' && char !== '\r' && char !== '\u2028' && char !== '\u2029') continue;
		starts.push(i + 1);
	}
	line_starts_cache = { source, starts };
	return starts;
}

/**
 * The source line that a TypeScript directive applies to: the first line
 * after the one where it ends that is neither blank nor only a line comment,
 * or `-1` when there is none.
 * @param {AST.CommentWithLocation} comment
 * @param {string} source
 * @returns {number}
 */
export function get_directive_line(comment, source) {
	const starts = get_line_starts(source);
	for (let line = comment.loc.end.line + 1; line <= starts.length; line++) {
		const text = source.slice(starts[line - 1], starts[line] ?? source.length).trim();
		if (text !== '' && !text.startsWith('//')) return line;
	}
	return -1;
}
