/**
@import * as AST from 'estree'
@import * as ESTreeJSX from 'estree-jsx'
@import { Parse } from '@tsrx/core/types'
 */

import * as acorn from 'acorn';
import { isWhitespaceTextNode, BINDING_TYPES, DestructuringErrors } from './parse/index.js';
import { parse_style } from './parse/style.js';
import { regex_newline_characters, regex_not_whitespace } from './utils/patterns.js';
import { error } from './errors.js';
import { DIAGNOSTIC_CODES } from './diagnostics.js';
import {
	TSRX_DYNAMIC_TAG_EXPRESSION_ERROR,
	TSRX_RETURN_STATEMENT_ERROR,
} from './analyze/validation.js';
import { is_tsrx_render_output_node } from './utils/ast.js';

/**
 * An expression being read that can be a generic arrow function (see
 * `#parseGenericArrowFunction`): where its type parameters start, where its
 * parameter list starts (known once the type parameters are read), where the
 * arrow function starts (its `(`, or `async`), and the error that the arrow
 * function threw after its `=>`.
 * @typedef {{
 *   typeParametersStart: number,
 *   parametersStart: number,
 *   arrowStart: number,
 *   error: SyntaxError | null,
 * }} GenericArrowFunction
 */

const CharCode = Object.freeze({
	tab: 9,
	lineFeed: 10,
	carriageReturn: 13,
	space: 32,
	exclamation: 33,
	doubleQuote: 34,
	numberSign: 35,
	dollar: 36,
	ampersand: 38,
	singleQuote: 39,
	openParen: 40,
	closeParen: 41,
	comma: 44,
	asterisk: 42,
	plus: 43,
	dash: 45,
	dot: 46,
	slash: 47,
	colon: 58,
	semicolon: 59,
	lessThan: 60,
	equals: 61,
	greaterThan: 62,
	at: 64,
	digit0: 48,
	digit9: 57,
	uppercaseA: 65,
	uppercaseZ: 90,
	openBracket: 91,
	closeBracket: 93,
	backslash: 92,
	underscore: 95,
	backtick: 96,
	lowercaseA: 97,
	lowercaseZ: 122,
	openBrace: 123,
	closeBrace: 125,
});

const TYPE_PARAMETER_MODIFIERS = new Set(['const']);

// Nodes that ESTree's decorators extension gives a `decorators` array.
const DECORATABLE_NODE_TYPES = new Set([
	'ClassDeclaration',
	'ClassExpression',
	'MethodDefinition',
	'PropertyDefinition',
]);
// Reserved words after which a `/` opens a regular expression literal rather
// than dividing, because they never end an operand. `of` is handled apart
// since it is also a plain identifier.
const REGEX_PRECEDING_KEYWORDS = new Set([
	'await',
	'case',
	'delete',
	'do',
	'else',
	'in',
	'instanceof',
	'new',
	'return',
	'throw',
	'typeof',
	'void',
	'yield',
]);
const regex_identifier = /[$_\p{ID_Start}][$_\u200c\u200d\p{ID_Continue}]*/uy;

const regex_line_break = /\r\n?|[\n\u2028\u2029]/;
// A word written with an escape, from `lastIndex`.
const regex_escaped_word = /[$_\p{ID_Continue}\u200c\u200d]*\\/uy;

const REST_ELEMENT_TRAILING_COMMA = 'Comma is not permitted after the rest element';
const OPTIONAL_BINDING_PATTERN_PARAMETER =
	'A binding pattern parameter cannot be optional in an implementation signature.';
// TypeScript's TS1047 and TS1317.
const OPTIONAL_REST_PARAMETER = 'A rest parameter cannot be optional.';
const REST_PARAMETER_PROPERTY = 'A parameter property cannot be declared using a rest parameter.';
// TypeScript's TS2369, which acorn-typescript raises for a modifier on a
// parameter when `parseBindingList` passes `allowModifiers: false`.
const UNEXPECTED_PARAMETER_MODIFIER =
	'A parameter property is only allowed in a constructor implementation.';
// TypeScript's TS1187, acorn-typescript's error for a parameter property with a
// binding pattern.
const PATTERN_PARAMETER_PROPERTY =
	'A parameter property may not be declared using a binding pattern.';
// TypeScript's TS2371, for a parameter with a default in a function or
// constructor type, or in a method, call, or construct signature.
const SIGNATURE_PARAMETER_INITIALIZER =
	'A parameter initializer is only allowed in a function or constructor implementation.';
// acorn-typescript's and @babel/parser's error for a type assertion in an arrow
// function's parameters.
const TYPE_CAST_IN_PARAMETER = 'Unexpected type cast in parameter position.';
// acorn-typescript's error for decorators before something other than a class.
const UNEXPECTED_LEADING_DECORATOR = 'Leading decorators must be attached to a class declaration.';
// TypeScript's parser errors for what follows `export` when it starts no
// declaration (TS1128), for a missing name (TS1003, or TS1359 for a reserved
// word), for a type alias name on the line after `declare type` (TS1142), for
// `export type` before `=` (TS1005), and for an escaped modifier (TS1260).
const DECLARATION_OR_STATEMENT_EXPECTED = 'Declaration or statement expected.';
const IDENTIFIER_EXPECTED = 'Identifier expected.';
const LINE_BREAK_NOT_PERMITTED = 'Line break not permitted here.';
const OPENING_BRACE_EXPECTED = "'{' expected.";
const KEYWORD_ESCAPE = 'Keywords cannot contain escape characters.';
// TypeScript's checker error for `abstract` before a declaration other than a
// class (TS1242).
const ABSTRACT_MODIFIER_NOT_ALLOWED =
	"'abstract' modifier can only appear on a class, method, or property declaration.";
// TypeScript's checker error for `export` before a global augmentation
// (TS2668).
const EXPORT_MODIFIER_ON_AUGMENTATION =
	"'export' modifier cannot be applied to ambient modules and module augmentations since they are always visible.";
// The words TypeScript's parser reads as keyword types (`parseKeywordAndNoDot`).
const KEYWORD_TYPES = new Set([
	'any',
	'bigint',
	'boolean',
	'never',
	'number',
	'object',
	'string',
	'symbol',
	'undefined',
	'unknown',
]);
// The modifiers acorn-typescript reads before a parameter.
const PARAMETER_MODIFIERS = ['public', 'private', 'protected', 'override', 'readonly'];
// The statements TypeScript's parser reads after decorators, as declarations
// (`parseDeclarationWorker`). Before anything else it expects a declaration.
const DECORATED_DECLARATION_TYPES = new Set([
	'VariableDeclaration',
	'FunctionDeclaration',
	'TSDeclareFunction',
	'ClassDeclaration',
	'TSInterfaceDeclaration',
	'TSTypeAliasDeclaration',
	'TSEnumDeclaration',
	'TSModuleDeclaration',
	'ImportDeclaration',
	'TSImportEqualsDeclaration',
	'ExportNamedDeclaration',
	'ExportDefaultDeclaration',
	'ExportAllDeclaration',
	'TSExportAssignment',
	'TSNamespaceExportDeclaration',
]);
// The words besides reserved words that start one of those declarations.
const DECLARATION_KEYWORDS = new Set([
	'abstract',
	'async',
	'await',
	'declare',
	'enum',
	'global',
	'interface',
	'let',
	'module',
	'namespace',
	'type',
	'using',
]);
// acorn-typescript raises these at the modifier's column instead of its offset.
const regex_modifier_order_error =
	/^'\w+' modifier (?:must precede|cannot be used with) '\w+' modifier\.$/;
// acorn-typescript raises these at the token after the repeated modifier.
const regex_repeated_modifier_error =
	/^(?:Accessibility modifier already seen\.|Duplicate modifier: '\w+'\.)$/;
// acorn's errors for `let` as a binding name or an assignment target, after
// `The keyword 'let' is reserved`.
const regex_let_binding_error =
	/^(?:(?:Binding|Assigning to) let in strict mode|let is disallowed as a lexically bound name)$/;

/**
 * Errors that acorn and `@sveltejs/acorn-typescript` raise while parsing, but that
 * TypeScript's parser accepts and reports only as checker (type-check) diagnostics
 * (#415). In `collect` and `loose` mode the parser records them in `errors` and
 * keeps parsing, as TypeScript does; a strict parse still throws them. Every other
 * error still throws.
 *
 * `raise` and `raiseRecoverable` return for these messages, so each one is listed
 * only after checking that the code raising it upstream goes on to build the same
 * node it builds for valid code. Mistakes whose raise site can't continue are
 * handled by narrow overrides instead: a comma after a rest element
 * (`#collectCheckerLevelError`, `parseBindingList`), `const` without an
 * initializer (`parseVarId`), a declaration list without a declarator
 * (`parseVarStatement`, `parseForStatement`), `await` in a namespace
 * (`canAwait`), a private name outside a class (the constructor and
 * `parsePrivateIdent`), a modifier on a rest parameter
 * (`#parseRestParameterProperty`), a modifier on an arrow function's parameter
 * (`#parseArrowParameterProperty`), and decorators before a declaration other
 * than a class (`parseDecorators`, `#parseDecoratedStatement`).
 *
 * acorn's errors here are ECMAScript early errors, which acorn rightly raises;
 * acorn-typescript's are TypeScript checker diagnostics.
 * UPSTREAM(sveltejs/acorn-typescript#89): whether acorn-typescript should report
 * TypeScript diagnostics as parse errors at all.
 *
 * @type {Array<string | RegExp>}
 */
const CHECKER_LEVEL_ERRORS = [
	// acorn and acorn-typescript: a redeclared variable, import, type alias, or
	// private name (TS2300, TS2451), and a repeated parameter name (TS2300).
	/^(?:Identifier|type) '#?[^']+' has already been declared\.?$/,
	'Argument name clash',
	// acorn: `export { missing }` (TS2304).
	/^Export '[^']+' is not defined$/,
	// acorn: `a?.b = c` (TS2779).
	'Optional chaining cannot appear in left-hand side',
	// acorn: `import.source('x')` (TS18061).
	"The only valid meta property for import is 'import.meta'",
	// acorn: `new.target` outside a function (TS17013).
	"'new.target' can only be used in functions and class static block",
	// acorn: `super` outside a method, or `super()` outside a derived class's
	// constructor (TS2337, TS2335).
	"'super' keyword outside a method",
	'super() call outside constructor of a subclass',
	// acorn: `function f(...a,) {}` (TS1013).
	REST_ELEMENT_TRAILING_COMMA,
	// acorn: an import or export inside a block (TS1184, TS1231, TS1232, TS1233,
	// TS1258, TS1316).
	"'import' and 'export' may only appear at the top level",
	// acorn: `let` used as a name in strict code (TS1213, TS1214), such as a bare
	// `let`, a binding name (`var let`, `class let {}`), or an assignment target
	// (`let = 1`). acorn reports a binding name or a target more than once, and
	// only the first is recorded (see `#collectCheckerLevelError`).
	"The keyword 'let' is reserved",
	regex_let_binding_error,
	// acorn-typescript: `abstract` members in a class that isn't abstract (TS1244).
	'Abstract methods can only appear within an abstract class.',
	// `abstract function f() {}`, `export abstract let x = 1;` (TS1242), raised
	// by `tsParseDeclaration` and `tsTryParseDeclare`.
	ABSTRACT_MODIFIER_NOT_ALLOWED,
	// `export global {}` (TS2668), raised by `parseExportDeclaration`.
	EXPORT_MODIFIER_ON_AUGMENTATION,
	// acorn-typescript: `declare class A { x = 1 }`, `declare let x = 1` (TS1039).
	'Initializers are not allowed in ambient contexts.',
	// acorn-typescript: modifiers out of order, incompatible, or repeated
	// (TS1029, TS1243, TS1030, TS1028). See `raise` for the repeated ones.
	regex_modifier_order_error,
	regex_repeated_modifier_error,
	// acorn-typescript: a modifier where TypeScript doesn't allow one, on a type
	// member (TS1070) or a type parameter (TS1273), or `in` or `out` outside the
	// type parameters of a class, interface, or type alias (TS1274). See `raise`.
	/^'\w+' modifier cannot appear on a type (?:member|parameter)\.$/,
	/^'\w+' modifier can only appear on a type parameter of a class, interface or type alias\.$/,
	// acorn-typescript: a parameter property with a binding pattern,
	// `constructor(public [a]: T) {}` (TS1187), also with a default (see
	// `#parseAssignableListItem`).
	PATTERN_PARAMETER_PROPERTY,
	// acorn-typescript: a parameter property modifier on a function's or a
	// signature's parameter, `function f(public x) {}` (TS2369), when collecting.
	// See `parseBindingList` and `tsParseBindingListForSignature`.
	UNEXPECTED_PARAMETER_MODIFIER,
	// A parameter's default in a signature, `type F = (a = 1) => void` (TS2371),
	// raised by `tsParseBindingListForSignature`.
	SIGNATURE_PARAMETER_INITIALIZER,
	// acorn-typescript: `private #x` (TS18010), `abstract #x` (TS18019).
	/^Private elements cannot have an accessibility modifier \('\w+'\)\.$/,
	"Private elements cannot have the 'abstract' modifier.",
	// `function f({ a }?: T) {}` (TS2463), raised by `parseFunctionBody` for a
	// function with a body.
	OPTIONAL_BINDING_PATTERN_PARAMETER,
	// `function f(...a?: T[]) {}` (TS1047), raised by `parseBindingListItem`.
	OPTIONAL_REST_PARAMETER,
	// acorn-typescript: `class A { @dec constructor() {} }` (TS1206).
	"Decorators can't be used with a constructor. Did you mean '@dec class { ... }'?",
	// acorn-typescript: `with { type: 'json', type: 'json' }`, an ECMAScript early
	// error that TypeScript doesn't report at all.
	'Duplicated key in attributes',
];

/**
 * @param {string | { message?: string }} message
 * @returns {string}
 */
function get_error_message(message) {
	return typeof message === 'string'
		? message
		: typeof message?.message === 'string'
			? message.message
			: String(message);
}

/**
 * Whether an arrow function's parameter, read as an expression before `=>`,
 * becomes a binding pattern, with or without a type annotation and a default.
 * @param {AST.Node} node
 * @returns {boolean}
 */
function is_pattern_parameter_expression(node) {
	/** @typedef {{ type: string, left?: unknown, expression?: unknown }} ParameterExpression */
	let target = /** @type {ParameterExpression} */ (node);
	// A default: acorn makes the left side of `=` a pattern already.
	if (target.type === 'AssignmentExpression') {
		target = /** @type {ParameterExpression} */ (target.left);
	}
	// A type annotation.
	if (target.type === 'TSTypeCastExpression') {
		target = /** @type {ParameterExpression} */ (target.expression);
	}
	return (
		target.type === 'ArrayExpression' ||
		target.type === 'ObjectExpression' ||
		target.type === 'ArrayPattern' ||
		target.type === 'ObjectPattern'
	);
}

/**
 * @param {string} message
 * @returns {boolean}
 */
function is_checker_level_error(message) {
	return CHECKER_LEVEL_ERRORS.some((entry) =>
		typeof entry === 'string' ? entry === message : entry.test(message),
	);
}

// acorn's scope flags and acorn-typescript's namespace scope flag, which neither
// package exports.
const SCOPE_FUNCTION = 2;
const SCOPE_ASYNC = 4;
// The scope of a catch clause whose parameter is a plain name, where Annex B lets
// `var` redeclare that name.
const SCOPE_SIMPLE_CATCH = 32;
const SCOPE_CLASS_STATIC_BLOCK = 256;
const SCOPE_CLASS_FIELD_INIT = 512;
const TS_SCOPE_OTHER = 1 << 20;
const TS_SCOPE_TS_MODULE = 1 << 21;

/** @type {WeakMap<Parse.Parser, number[]>} */
const parser_line_starts = new WeakMap();

/**
 * Resolve an offset without rescanning the source from the beginning on every
 * TSRX tokenizer rewind. Acorn's `getLineInfo` is linear in the offset; the
 * parser calls this path often enough that large modules otherwise pay a
 * quadratic location-tracking cost.
 *
 * @param {Parse.Parser} parser
 * @param {number} offset
 * @returns {acorn.Position}
 */
function get_line_info(parser, offset) {
	let starts = parser_line_starts.get(parser);
	if (starts === undefined) {
		starts = [0];
		for (let i = 0; i < parser.input.length; i++) {
			const ch = parser.input.charCodeAt(i);
			if (ch === CharCode.carriageReturn && parser.input.charCodeAt(i + 1) === CharCode.lineFeed) {
				i++;
				starts.push(i + 1);
			} else if (
				ch === CharCode.lineFeed ||
				ch === CharCode.carriageReturn ||
				ch === 0x2028 ||
				ch === 0x2029
			) {
				starts.push(i + 1);
			}
		}
		parser_line_starts.set(parser, starts);
	}

	let low = 0;
	let high = starts.length;
	while (low + 1 < high) {
		const middle = (low + high) >>> 1;
		if (starts[middle] <= offset) low = middle;
		else high = middle;
	}
	// `getLineInfo(input, offset)` treats a CR as a complete line break when
	// `offset` points at the LF of a CRLF pair, even though later offsets treat
	// the pair as one terminator. Preserve that boundary behavior exactly.
	if (
		offset > 0 &&
		parser.input.charCodeAt(offset) === CharCode.lineFeed &&
		parser.input.charCodeAt(offset - 1) === CharCode.carriageReturn
	) {
		return new acorn.Position(low + 2, 0);
	}
	return new acorn.Position(low + 1, offset - starts[low]);
}

/**
 * The part of a dynamic tag expression (`<{expr}>`) that isn't one of the
 * allowed forms, or `null` when the whole expression is one: an identifier, a
 * member access (`props.as`, `this.tag`, `registry[name]`, `items[0]`), or a
 * string literal. A non-self-closing element repeats the expression in its
 * closing tag, so anything more, parentheses and type-only wrappers included,
 * is computed above the element instead (`const Tag = c ? A : B;`).
 * @param {AST.Node} node
 * @returns {AST.Node | null}
 */
function find_invalid_dynamic_tag_part(node) {
	if (node.metadata?.parenthesized) return node;
	if (node.type === 'Identifier') return node.name === 'undefined' ? node : null;
	if (node.type === 'Literal') return typeof node.value === 'string' ? null : node;
	// `a?.b` is a `ChainExpression`, so a member access here is never optional.
	if (node.type !== 'MemberExpression') return node;
	// A chain starts at an identifier or `this`.
	const object = node.object;
	const invalid_object =
		object.type === 'Identifier' || object.type === 'MemberExpression'
			? find_invalid_dynamic_tag_part(object)
			: object.type !== 'ThisExpression' || object.metadata?.parenthesized
				? object
				: null;
	if (invalid_object || !node.computed) return invalid_object;
	// A computed key is an identifier, a string or number literal, or a member
	// access.
	const key = node.property;
	if (key.metadata?.parenthesized) return key;
	if (key.type === 'Identifier') return null;
	if (key.type === 'Literal') {
		return typeof key.value === 'string' || typeof key.value === 'number' ? null : key;
	}
	if (key.type === 'MemberExpression') return find_invalid_dynamic_tag_part(key);
	return key;
}

/**
 * Where `node` ends, after the parentheses around it that a parse without
 * `preserveParens` leaves out of its range (see
 * `parseParenAndDistinguishExpression`).
 * @param {string} input
 * @param {AST.Node & AST.NodeWithLocation} node
 */
function end_after_parentheses(input, node) {
	let end = node.end;
	const paren_start = node.metadata?.paren_start;
	if (paren_start === undefined) return end;
	for (let i = paren_start; i !== -1 && i < node.start;) {
		if (input.charCodeAt(i) !== CharCode.openParen) break;
		i = skip_space_and_comments_from(input, i + 1);
		const close = skip_space_and_comments_from(input, end);
		if (close === -1 || input.charCodeAt(close) !== CharCode.closeParen) break;
		end = close + 1;
	}
	return end;
}

// TypeScript's message for a missing `}` (TS1005). The parser reports it in
// place of acorn's `Unexpected token` wherever TypeScript's parser reports it.
const CLOSING_BRACE_EXPECTED = "'}' expected.";
// TypeScript's message for a tag's missing `>` (TS1005).
const TAG_END_EXPECTED = "'>' expected.";

/** @type {WeakMap<Record<string, boolean>, Map<string, number>>} */
const argument_clash_first_positions = new WeakMap();
/** @type {WeakMap<Record<string, boolean>, Set<string>>} */
const argument_clash_reported_names = new WeakMap();

/**
 * @param {Record<string, boolean>} check_clashes
 * @returns {Map<string, number>}
 */
function get_argument_clash_first_positions(check_clashes) {
	let first_positions = argument_clash_first_positions.get(check_clashes);
	if (!first_positions) {
		first_positions = new Map();
		argument_clash_first_positions.set(check_clashes, first_positions);
	}
	return first_positions;
}

/**
 * @param {Record<string, boolean>} check_clashes
 * @returns {Set<string>}
 */
function get_argument_clash_reported_names(check_clashes) {
	let reported_names = argument_clash_reported_names.get(check_clashes);
	if (!reported_names) {
		reported_names = new Set();
		argument_clash_reported_names.set(check_clashes, reported_names);
	}
	return reported_names;
}

/**
 * A `<` opens a tag only when the character after it can begin one: `/` for a
 * closing tag, `>` for a fragment, `{` for a dynamic tag, or an element or
 * component name start. Any other character, or end of input, leaves the `<`
 * as literal text.
 * @param {string} input
 * @param {number} index Index of the `<`.
 */
function can_start_tag_after_lt(input, index) {
	const next = index + 1 < input.length ? input.charCodeAt(index + 1) : -1;
	return (
		next === CharCode.slash ||
		next === CharCode.greaterThan ||
		next === CharCode.openBrace ||
		next === CharCode.at ||
		next === CharCode.dollar ||
		next === CharCode.underscore ||
		(next >= CharCode.uppercaseA && next <= CharCode.uppercaseZ) ||
		(next >= CharCode.lowercaseA && next <= CharCode.lowercaseZ)
	);
}

/**
 * @param {string} input
 * @param {number} i
 */
function skip_whitespace_from(input, i) {
	while (i < input.length) {
		const ch = input.charCodeAt(i);
		if (
			ch !== CharCode.space &&
			ch !== CharCode.tab &&
			ch !== CharCode.lineFeed &&
			ch !== CharCode.carriageReturn
		)
			break;
		i++;
	}
	return i;
}

/**
 * Skip past a string literal opened at `i` with the given quote char code.
 * @param {string} input
 * @param {number} i
 * @param {number} quote
 */
function skip_string_from(input, i, quote) {
	i++;
	while (i < input.length) {
		const ch = input.charCodeAt(i);
		i++;
		if (ch === CharCode.backslash)
			i++; // backslash escape
		else if (ch === quote) return i;
	}
	return i;
}

/**
 * Skip past a regular expression literal opened at `i`. Returns the index after
 * its flags, or -1 when a line ends before the closing `/`.
 * @param {string} input
 * @param {number} i
 */
function skip_regex_from(input, i) {
	let in_class = false;
	i++;
	while (i < input.length) {
		const ch = input.charCodeAt(i);
		if (ch === CharCode.lineFeed || ch === CharCode.carriageReturn) return -1;
		i++;
		if (ch === CharCode.backslash) i++;
		else if (ch === CharCode.openBracket) in_class = true;
		else if (ch === CharCode.closeBracket) in_class = false;
		else if (ch === CharCode.slash && !in_class) break;
	}
	const flags_end = scan_identifier_from(input, i);
	return flags_end === -1 ? i : flags_end;
}

/**
 * Scan past a balanced pair starting at `i` (which must point at `open`).
 * Strings, comments, and regular expression literals are skipped so brackets
 * inside them do not count. A `/` divides when the previous token ends an
 * operand (an identifier, number, literal, or closing bracket, kept through
 * postfix `!`, `++`, `--`, and `.`) and opens a regex otherwise. Returns the
 * position after the matching close, or -1 if unbalanced.
 * @param {string} input
 * @param {number} i
 * @param {number} open
 * @param {number} close
 */
function scan_balanced_from(input, i, open, close) {
	let depth = 1;
	let after_operand = false;
	let after_dot = false;
	i++;
	while (i < input.length) {
		const ch = input.charCodeAt(i);
		if (
			ch === CharCode.space ||
			ch === CharCode.tab ||
			ch === CharCode.lineFeed ||
			ch === CharCode.carriageReturn
		) {
			i++;
			continue;
		}
		if (ch === CharCode.doubleQuote || ch === CharCode.singleQuote || ch === CharCode.backtick) {
			i = skip_string_from(input, i, ch);
			after_operand = true;
			after_dot = false;
			continue;
		}
		if (ch === CharCode.slash) {
			const after_comment = skip_space_and_comments_from(input, i);
			if (after_comment === -1) return -1;
			if (after_comment !== i) {
				i = after_comment;
				continue;
			}
			if (after_operand) {
				after_operand = false;
				i++;
			} else {
				i = skip_regex_from(input, i);
				if (i === -1) return -1;
				after_operand = true;
			}
			after_dot = false;
			continue;
		}
		if (ch === open) depth++;
		else if (ch === close && --depth === 0) return i + 1;

		const name_end = scan_identifier_from(input, i);
		if (name_end !== -1) {
			const name = input.slice(i, name_end);
			// A property name after `.` is always an operand. `of` is only the
			// `for ... of` keyword when it follows an operand, and a reserved
			// word never ends one.
			if (after_dot) after_operand = true;
			else if (name === 'of') after_operand = !after_operand;
			else after_operand = !REGEX_PRECEDING_KEYWORDS.has(name);
			after_dot = false;
			i = name_end;
			continue;
		}
		if (ch >= CharCode.digit0 && ch <= CharCode.digit9) {
			after_operand = true;
		} else if (
			ch === CharCode.closeParen ||
			ch === CharCode.closeBracket ||
			ch === CharCode.closeBrace
		) {
			after_operand = true;
		} else if ((ch === CharCode.plus || ch === CharCode.dash) && input.charCodeAt(i + 1) === ch) {
			// Postfix `++`/`--` keeps the operand; the prefix forms follow a non-operand.
			after_dot = false;
			i += 2;
			continue;
		} else if (
			ch === CharCode.dot &&
			input.charCodeAt(i + 1) === CharCode.dot &&
			input.charCodeAt(i + 2) === CharCode.dot
		) {
			// A spread or rest `...` precedes an operand rather than a property name.
			after_operand = false;
			after_dot = false;
			i += 3;
			continue;
		} else if (ch !== CharCode.exclamation && ch !== CharCode.dot) {
			// Postfix `!` and a number's trailing `.` keep the operand; the
			// prefix `!` and a leading `.` already follow a non-operand.
			after_operand = false;
		}
		after_dot = ch === CharCode.dot;
		i++;
	}
	return -1;
}

/**
 * Skip whitespace and comments starting at `i`. Returns -1 when a block
 * comment is left open at the end of the input.
 * @param {string} input
 * @param {number} i
 */
function skip_space_and_comments_from(input, i) {
	while (i < input.length) {
		const ch = input.charCodeAt(i);
		if (
			ch === CharCode.space ||
			ch === CharCode.tab ||
			ch === CharCode.lineFeed ||
			ch === CharCode.carriageReturn
		) {
			i++;
			continue;
		}
		if (ch !== CharCode.slash) break;
		const next = input.charCodeAt(i + 1);
		if (next === CharCode.slash) {
			i += 2;
			while (i < input.length) {
				const c = input.charCodeAt(i);
				if (c === CharCode.lineFeed || c === CharCode.carriageReturn) break;
				i++;
			}
		} else if (next === CharCode.asterisk) {
			const end = input.indexOf('*/', i + 2);
			if (end === -1) return -1;
			i = end + 2;
		} else break;
	}
	return i;
}

/**
 * Scan an identifier starting at `i`. Returns the index after it, or -1 when
 * no identifier starts there.
 * @param {string} input
 * @param {number} i
 */
function scan_identifier_from(input, i) {
	regex_identifier.lastIndex = i;
	const match = regex_identifier.exec(input);
	return match === null ? -1 : i + match[0].length;
}

/**
 * Scan a type starting at `i` and return the index of the character that ends
 * it: a `,`, `;`, `=`, `>`, `)`, `]`, or `}` outside any brackets the type
 * itself opened. Inside a type `>` only closes `<` and `=>` only belongs to a
 * function type, so neither is mistaken for the end of an enclosing type
 * parameter list. With `stop_at_arrow`, a `=>` outside brackets ends the type
 * instead, which is how an arrow's return type ends. Returns -1 when the input
 * runs out first, brackets do not match, or a character that cannot appear in
 * a type is found.
 * @param {string} input
 * @param {number} i
 * @param {boolean} stop_at_arrow
 */
function scan_type_from(input, i, stop_at_arrow) {
	/** @type {number[]} */
	const closers = [];
	while (i < input.length) {
		const ch = input.charCodeAt(i);
		if (ch === CharCode.doubleQuote || ch === CharCode.singleQuote || ch === CharCode.backtick) {
			i = skip_string_from(input, i, ch);
			continue;
		}
		if (ch === CharCode.slash) {
			const after_comment = skip_space_and_comments_from(input, i);
			if (after_comment === -1 || after_comment === i) return -1;
			i = after_comment;
			continue;
		}
		if (ch === CharCode.equals && input.charCodeAt(i + 1) === CharCode.greaterThan) {
			if (stop_at_arrow && closers.length === 0) return i;
			i += 2;
			continue;
		}
		if (ch === CharCode.openParen) closers.push(CharCode.closeParen);
		else if (ch === CharCode.openBracket) closers.push(CharCode.closeBracket);
		else if (ch === CharCode.openBrace) closers.push(CharCode.closeBrace);
		else if (ch === CharCode.lessThan) closers.push(CharCode.greaterThan);
		else if (
			ch === CharCode.closeParen ||
			ch === CharCode.closeBracket ||
			ch === CharCode.closeBrace ||
			ch === CharCode.greaterThan
		) {
			if (closers.length === 0) return i;
			if (closers.pop() !== ch) return -1;
		} else if (
			closers.length === 0 &&
			(ch === CharCode.comma || ch === CharCode.semicolon || ch === CharCode.equals)
		) {
			return i;
		}
		i++;
	}
	return -1;
}

/**
 * Best-effort lookahead at a `<` to decide whether it starts a generic arrow
 * expression — `<...>(...)[: T] => ...`. The angle brackets must hold a type
 * parameter list, `<[const] Name [extends Type] [= Type], ...>`, so a JSX tag
 * whose attributes or children happen to contain `>` and `=>` (for example a
 * generic arrow passed as a prop) is never mistaken for one. Conservative:
 * returns false on any unexpected shape so JSX continues to parse as JSX.
 * @param {string} input
 * @param {number} pos
 */
function looks_like_generic_arrow(input, pos) {
	if (input.charCodeAt(pos) !== CharCode.lessThan) return false;

	let i = pos + 1;
	while (true) {
		i = skip_space_and_comments_from(input, i);
		if (i === -1) return false;
		let name_end = scan_identifier_from(input, i);
		if (name_end === -1) return false;

		// A `const` modifier precedes the parameter name.
		while (TYPE_PARAMETER_MODIFIERS.has(input.slice(i, name_end))) {
			const next = skip_space_and_comments_from(input, name_end);
			const next_end = next === -1 ? -1 : scan_identifier_from(input, next);
			if (next_end === -1) break;
			i = next;
			name_end = next_end;
		}

		i = skip_space_and_comments_from(input, name_end);
		if (i === -1) return false;
		if (input.startsWith('extends', i) && scan_identifier_from(input, i) === i + 7) {
			i = scan_type_from(input, i + 7, false);
			if (i === -1) return false;
		}
		if (input.charCodeAt(i) === CharCode.equals) {
			i = scan_type_from(input, i + 1, false);
			if (i === -1) return false;
		}

		const ch = input.charCodeAt(i);
		if (ch === CharCode.greaterThan) {
			i++;
			break;
		}
		if (ch !== CharCode.comma) return false;
		i = skip_space_and_comments_from(input, i + 1);
		if (i === -1) return false;
		if (input.charCodeAt(i) === CharCode.greaterThan) {
			i++;
			break;
		}
	}

	// `>` must be followed by `(...)`.
	i = skip_space_and_comments_from(input, i);
	if (i === -1 || input.charCodeAt(i) !== CharCode.openParen) return false;
	i = scan_balanced_from(input, i, CharCode.openParen, CharCode.closeParen);
	if (i === -1) return false;

	// Optional `: ReturnType` before `=>`.
	i = skip_space_and_comments_from(input, i);
	if (i === -1) return false;
	if (input.charCodeAt(i) === CharCode.colon) {
		i = scan_type_from(input, i + 1, true);
		if (i === -1) return false;
	}

	return (
		input.charCodeAt(i) === CharCode.equals && input.charCodeAt(i + 1) === CharCode.greaterThan
	);
}

/**
 * Acorn parser plugin for TSRX syntax extensions.
 * Adds support for: native TSRX templates, submodule imports, TSRX directives,
 * and enhanced JSX handling.
 *
 * @param {import('../types/index').TSRXPluginConfig} [config] - Plugin configuration
 * @returns {(Parser: Parse.ParserConstructor) => Parse.ParserConstructor} Parser extension function
 */
export function TSRXPlugin(config) {
	return (/** @type {Parse.ParserConstructor} */ Parser) => {
		const original = acorn.Parser.prototype;
		const tt = Parser.tokTypes || acorn.tokTypes;
		const tc = Parser.tokContexts || acorn.tokContexts;
		// Some parser constructors (e.g. via TS plugins) expose `tokContexts` without `b_stat`.
		// If we push an undefined context, Acorn's tokenizer will later crash reading `.override`.
		const b_stat = tc.b_stat || acorn.tokContexts.b_stat;
		const b_expr = tc.b_expr || acorn.tokContexts.b_expr;
		const q_tmpl = tc.q_tmpl || acorn.tokContexts.q_tmpl;
		const b_tmpl = tc.b_tmpl || acorn.tokContexts.b_tmpl;
		const tstt = Parser.acornTypeScript.tokTypes;
		const tstc = Parser.acornTypeScript.tokContexts;

		class TSRXParser extends Parser {
			/** @type {AST.Node[]} */
			#path = [];
			#commentContextId = 0;
			#collect = false;
			#loose = false;
			// Set while `parseVarStatement` or `parseVar` lets `const` declarators omit
			// the initializer (see `#parseConstWithoutInitializer`).
			#collectingConstWithoutInitializer = false;
			/** @type {import('../types/index').CompileError[] | undefined} */
			#errors = undefined;
			/** @type {string | null} */
			#filename = null;
			/** @type {WeakMap<object, { names: Set<string>, lengths: number[] }>} */
			#localExportNamesByScope = new WeakMap();
			#functionBodyDepth = 0;
			#allowExpressionContainerTrailingSemicolon = false;
			#jsxAttributeValueExpressionDepth = 0;
			#jsxExpressionContainerDepth = 0;
			// Context-stack length at the start of each open `{ … }` expression container.
			// A control-flow directive (`@if`/`@for`/…) parsed inside a container strips
			// JSX contexts so its header/body tokenize as JS; without a floor it would also
			// strip the enclosing element's and container's contexts (which nothing rebuilds),
			// underflowing the context stack when the surrounding markup closes. The directive
			// filter preserves everything below the innermost baseline. See
			// `#filterTemplateScriptContexts`.
			/** @type {number[]} */
			#expressionContainerContextBaselines = [];
			// `#path` and its length at the start of each open `{ … }` expression
			// container. Raw template text inside a container belongs only to an
			// element opened inside it (`{<div>   a</div>}`); at the container's own
			// expression level (`{cond ? (<Outer>…</Outer>) : null}` after the `)`)
			// the next characters are JS, and reading them as raw text would swallow
			// tokens like `: null`. See `#containerPathBaseline`.
			/** @type {Array<{ path: AST.Node[], length: number }>} */
			#expressionContainerPathBaselines = [];
			#consumeContainerBraceAfterScope = false;
			#scriptJSXElementDepth = 0;
			#forceScriptJSXElementDepth = 0;
			#suppressTemplateRawTextToken = false;
			// Set while the `?` of an optional class member (`m?<T>()`) is consumed:
			// `?` allows an expression next, so the tokenizer would otherwise read the
			// `<` of the type parameters as a JSX tag.
			#afterOptionalMemberName = false;
			// The node `tsParseModifiers` is reading modifiers for, so that
			// `tsParseModifier` can tell whether it has already read `static`.
			/** @type {{ static?: unknown } | null} */
			#modifiersNode = null;
			// The closing token of the binding list being read (see
			// `parseBindingListItem`).
			/** @type {Parse.TokenType | null} */
			#bindingListClose = null;
			// Where the binding list item being read starts, after its decorators (see
			// `#parseAssignableListItem`).
			#assignableListItemStart = -1;
			// When collecting, the list being read that can be an arrow function's
			// parameters: a parenthesized expression or the arguments of `async (…)`.
			// Where its `(` is, whether type parameters come before it, and how many
			// `parseMaybeAssign` calls deep the parser is in one of its items (see
			// `#parseArrowParameterProperty`).
			/** @type {{ parenStart: number, generic: boolean, depth: number } | null} */
			#arrowParameterList = null;
			// Where the last type parameter list ended (see `tsParseTypeParameters`).
			#typeParametersEnd = -1;
			// The innermost expression being read that can be a generic arrow
			// function (see `#parseGenericArrowFunction`).
			/** @type {GenericArrowFunction | null} */
			#genericArrowFunction = null;
			// Whether the binding list being read is the parameters of the generic
			// arrow function being read (see `parseBindingListItem`).
			#readingGenericArrowParameters = false;
			// While the arguments of `async (…)` are read: where the `(` is, and the
			// first `?` after a spread among them (see `parseSpread`).
			/** @type {{ start: number, question: number } | null} */
			#asyncArguments = null;
			// Whether the list that `parseExprList` is reading is those arguments.
			#readingAsyncArguments = false;
			// When collecting, where the leading decorators of the statement being read
			// start, while `parseDecorators` reads them (-1 otherwise), and the error
			// recorded for them when no class follows (see `parseDecorators`).
			#leadingDecoratorsStart = -1;
			/** @type {{ position: number, message: string } | null} */
			#droppedDecoratorsError = null;
			// Set when `parseExportDefaultDeclaration` reads the decorators after
			// `export default`, which are the declaration's leading decorators.
			#readingDefaultExportDecorators = false;
			#templateScriptParsingDepth = 0;
			#controlFlowBlockAllowsNativeReturn = false;
			#parsingJSXSwitchCaseScriptStatementDepth = 0;
			#templateControlFlowBlockDepth = 0;
			/** @type {AST.NodeWithLocation | null}	*/
			#lastClauseKeywordSpan = null;
			#templateControlFlowTryDepth = 0;
			/** @type {Parse.Parser['context']} */
			context = [b_stat];
			/** @type {AST.NativeTSRXTemplateNode | null} */
			#openingNativeTemplateNode = null;
			#closingNativeTemplateNode = false;
			// Tokenizer context depth before each element's opening `<` (see
			// `parseElement`), for its closing tag to restore.
			/** @type {WeakMap<AST.Node, number>} */
			#elementContextDepths = new WeakMap();
			// The context depth before the `<` of an element that is an attribute
			// value without braces, for `parseElement` to keep: the host's opening
			// tag contexts. -1 otherwise.
			#tagValueContextDepth = -1;
			// The elements that are attribute values without braces: each closes in
			// its host's opening tag, not in a template.
			/** @type {WeakSet<AST.Node>} */
			#tagValueElements = new WeakSet();
			// What enclosed each element when it started: `this.labels` and its length
			// (see `#insideSwitchStartedAfter`), and the setup-statement depths (see
			// `#elementStart`).
			/** @type {WeakMap<AST.Node, { labels: Parse.Parser['labels'], labelsLength: number, scriptDepth: number, switchCaseScriptDepth: number, scriptJSXDepth: number }>} */
			#elementStarts = new WeakMap();
			#readingJSXControlFlowDirectiveKeyword = false;
			#readingJSXControlFlowHeader = false;
			// Where the last element of a `{ … }` list ended, so that `expect` can
			// tell a comma expected after it at the end of the input is the list's
			// missing `}`.
			#braceListElementEnd = -1;
			// Where the last decorator ended: a class member missing after one is not
			// a missing `}`.
			#decoratorEnd = -1;
			// Where the `interface` after `export default` starts, which starts an
			// interface declaration wherever its name is (see `hasFollowingLineBreak`).
			#defaultExportInterfaceStart = -1;

			/**
			 * @type {Parse.Parser['finishNode']}
			 */
			finishNode(node, type) {
				const finished = super.finishNode(node, type);
				if (this.#collect) this.#reportAwaitInNamespace(finished);
				if (DECORATABLE_NODE_TYPES.has(type)) {
					// acorn-typescript sets `decorators` only when there is one. Give every
					// class and class member the array ESTree specifies; a member's
					// decorators are attached after it finishes and replace this one.
					const decoratable = /** @type {{ decorators?: AST.Decorator[] }} */ (
						/** @type {unknown} */ (finished)
					);
					decoratable.decorators ??= [];
				}
				if (type === 'TSModuleDeclaration') {
					const declaration = /** @type {AST.TSModuleDeclaration} */ (finished);
					const start = /** @type {number} */ (declaration.start);
					// acorn-typescript still exposes the legacy `global` flag without
					// TSESTree's replacement `kind`; replace it at the parser boundary
					// so downstream consumers only receive the current discriminator.
					const legacy = /** @type {{ global?: boolean }} */ (declaration);
					const prefix = this.input
						.slice(start, declaration.id.start)
						.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, ' ')
						.trim();
					const kind =
						declaration.kind ??
						(legacy.global ? 'global' : prefix.endsWith('namespace') ? 'namespace' : 'module');
					/** @type {AST.TSModuleDeclaration | null} */
					let current = declaration;
					while (current !== null) {
						const current_legacy = /** @type {{ global?: boolean }} */ (current);
						current.kind = kind;
						delete current_legacy.global;
						current.metadata ??= { path: [] };
						current.metadata.module_keyword = kind;
						current = current.body?.type === 'TSModuleDeclaration' ? current.body : null;
					}
				}
				return finished;
			}

			/**
			 * @param {Parse.Options} options
			 * @param {string} input
			 */
			constructor(options, input) {
				super(options, input);
				this.context ??= [b_stat];
				const tsrx_options = options?.tsrxOptions;
				this.#collect = tsrx_options?.collect === true || tsrx_options?.loose === true;
				this.#loose = tsrx_options?.loose === true;
				this.#errors = tsrx_options?.errors;
				this.#filename = tsrx_options?.filename || null;
				if (this.#collect) {
					// With private-field checks on, acorn rejects `#x in obj` outside a class
					// with `Unexpected token`. TypeScript parses it and reports TS18016 from
					// the checker. `parsePrivateIdent` records a private name outside a class
					// instead; one a class uses without declaring it TypeScript reports as
					// TS2339.
					this.options.checkPrivateFields = false;
				}
			}

			/** @this {Parse.Parser} */
			#resetTokenStartToCurrentPosition() {
				if (this.start !== this.pos) {
					this.start = this.pos;
					this.startLoc = this.curPosition();
				}
			}

			/**
			 * Native TSRX template bodies share one grammar across elements and fragments.
			 * This helper keeps the parser-state setup in one place while callers keep
			 * ownership of their distinct closing delimiter handling (`}` vs `</tag>`).
			 *
			 * @param {AST.Node & { body?: AST.Node }} node
			 * @param {AST.Node[]} body
			 * @param {{
			 *   enterScope?: boolean,
			 *   pushPath?: boolean,
			 *   resetFunctionBodyDepth?: boolean,
			 * }} [options]
			 */
			#parseNativeTemplateBody(
				node,
				body,
				{ enterScope = false, pushPath = false, resetFunctionBodyDepth = false } = {},
			) {
				const parent_function_body_depth = this.#functionBodyDepth;

				if (resetFunctionBodyDepth) {
					this.#functionBodyDepth = 0;
				}
				if (enterScope) {
					this.enterScope(0);
				}
				if (pushPath) {
					this.#path.push(node);
				}

				try {
					this.parseTemplateBody(body);
				} finally {
					if (pushPath) {
						this.#path.pop();
					}
					if (enterScope) {
						this.exitScope();
					}
					if (resetFunctionBodyDepth) {
						this.#functionBodyDepth = parent_function_body_depth;
					}
				}
			}

			/**
			 * @param {boolean} [createNewLexicalScope]
			 * @param {AST.BlockStatement} [node]
			 * @param {boolean} [exitStrict]
			 * @returns {AST.BlockStatement}
			 */
			#parseTemplateControlFlowBlock(createNewLexicalScope = true, node, exitStrict) {
				node ??= /** @type {AST.BlockStatement} */ (this.startNode());
				// Consume the flag for this block only; nested control-flow blocks
				// parsed inside the body must not inherit it.
				const allows_native_return = this.#controlFlowBlockAllowsNativeReturn;
				this.#controlFlowBlockAllowsNativeReturn = false;
				node.body = [];
				node.metadata = {
					...node.metadata,
					path: [],
					native_tsrx_template_block: true,
					templateMode: 'script',
					allows_native_return,
				};

				// A directive's `{ }` IS a code block (§2 rule 8): setup statements then
				// at most one render node. Code-only blocks are allowed (§2 rule 6). Hide
				// the enclosing template from `#path` so the body tokenizes as code (not
				// JSX raw text); render nodes re-establish their own path via `parseElement`.
				const enclosing_context = this.context;
				const enclosing_path = this.#path;
				this.context = enclosing_context.filter(
					(context) =>
						context !== tstc.tc_expr && context !== tstc.tc_oTag && context !== tstc.tc_cTag,
				);
				if (this.curContext() !== b_stat) {
					this.context.push(b_stat);
				}
				this.#path = [];
				if (createNewLexicalScope) {
					this.enterScope(0);
				}
				try {
					this.expect(tt.braceL);
					this.#parseCodeBlockBody(node.body);
					// The body stops at the end of the input too.
					if (this.type !== tt.braceR) {
						this.#raiseClosingBraceExpected();
					}
				} finally {
					if (createNewLexicalScope) {
						this.exitScope();
					}
					this.#path = enclosing_path;
				}

				if (exitStrict) {
					this.strict = false;
				}
				this.exprAllowed = true;
				this.context = enclosing_context;
				const previous_reading_header = this.#readingJSXControlFlowHeader;
				this.#readingJSXControlFlowHeader = true;
				try {
					this.next();
				} finally {
					this.#readingJSXControlFlowHeader = previous_reading_header;
				}
				return this.finishNode(node, 'BlockStatement');
			}

			/**
			 * @param {AST.Node | undefined} node
			 */
			#isNativeTemplateNode(node) {
				return (
					node?.metadata?.native_tsrx_template_block ||
					(node?.type === 'JSXElement' && node.metadata?.native_tsrx) ||
					(node?.type === 'JSXFragment' && node.metadata?.native_tsrx) ||
					(node?.type === 'JSXStyleElement' && node.metadata?.native_tsrx)
				);
			}

			#currentNativeTemplateNode() {
				return (
					this.#openingNativeTemplateNode ??
					this.#path.findLast((node) => this.#isNativeTemplateNode(node))
				);
			}

			/**
			 * Whether a `switch` (`@switch` or JS) started after `node`: the position is
			 * then in the switch's own body, between its cases, which is code. In an
			 * element opened in a case, it is that element's children. A function body
			 * starts a new `this.labels`, so a switch in it started after any element
			 * outside it.
			 * @param {AST.Node} node
			 */
			#insideSwitchStartedAfter(node) {
				const at_start = this.#elementStarts.get(node);
				const from = at_start?.labels === this.labels ? at_start.labelsLength : 0;
				for (let i = from; i < this.labels.length; i++) {
					if (this.labels[i].kind === 'switch') return true;
				}
				return false;
			}

			/**
			 * The setup-statement depths when `node` started, to compare with the
			 * current ones: a depth above its value there means a setup statement
			 * started after `node`, and the position is in that statement's code. In
			 * an element opened in the statement, it is that element's children.
			 * `scriptDepth` is `#templateScriptParsingDepth`, raised by a setup
			 * statement of a `@{ … }` or directive body; `switchCaseScriptDepth` is
			 * `#parsingJSXSwitchCaseScriptStatementDepth`, raised by one of an `@case`.
			 * `scriptJSXDepth` is `#scriptJSXElementDepth` (see
			 * `#insideScriptJSXElement`). A node that no element start recorded counts
			 * from 0.
			 * @param {AST.Node} node
			 */
			#elementStart(node) {
				return (
					this.#elementStarts.get(node) ?? {
						labels: null,
						labelsLength: 0,
						scriptDepth: 0,
						switchCaseScriptDepth: 0,
						scriptJSXDepth: 0,
					}
				);
			}

			/**
			 * Whether the position is in an element that acorn-typescript's JSX parser
			 * reads (see `jsx_parseElement`) and that started after the innermost TSRX
			 * element: an element in a dynamic tag name (`<{c ? <b>…</b> : 'i'}>`).
			 * Its children are read as template text, but that parser takes each text
			 * token as a child as it is, so a template's comments are text there, as
			 * in TSX.
			 */
			#insideScriptJSXElement() {
				const node = this.#path.findLast((node) => this.#isNativeTemplateNode(node));
				return this.#scriptJSXElementDepth > (node ? this.#elementStart(node).scriptJSXDepth : 0);
			}

			/**
			 * Where the nodes opened inside the innermost `{ … }` expression container
			 * start in `#path`: after the nodes around the container, or at 0 once a
			 * directive body or a setup statement in the container has replaced
			 * `#path`, since every node on it opened inside the container.
			 */
			#containerPathBaseline() {
				const baseline = this.#expressionContainerPathBaselines.at(-1);
				return baseline?.path === this.#path ? baseline.length : 0;
			}

			/**
			 * @param {AST.Node | undefined} node
			 * @param {string} name
			 */
			#isNativeElementNamed(node, name) {
				return (
					(node?.type === 'JSXElement' || node?.type === 'JSXStyleElement') &&
					node.metadata?.native_tsrx &&
					this.getElementName(node.openingElement?.name) === name
				);
			}

			#isInsideNativeTemplateScriptSection() {
				const node = this.#currentNativeTemplateNode();
				return !!node && node.metadata?.templateMode !== 'template';
			}

			/**
			 * Whether the `<` token at `this.start` opens the given raw-text element
			 * (`<style` or `<script` followed by `>`, `/`, or whitespace).
			 * @param {string} tagName
			 */
			#isRawTextOpeningTagStart(tagName) {
				let index = this.start + 1;
				if (this.input.charCodeAt(index) === CharCode.slash) return false;
				if (this.input.slice(index, index + tagName.length) !== tagName) return false;

				const after = this.input.charCodeAt(index + tagName.length);
				return (
					after === CharCode.greaterThan ||
					after === CharCode.slash ||
					after === CharCode.space ||
					after === CharCode.tab ||
					after === CharCode.lineFeed ||
					after === CharCode.carriageReturn
				);
			}

			/**
			 * @param {number} index
			 */
			#isLineStartPosition(index) {
				for (let i = index - 1; i >= 0; i--) {
					const ch = this.input.charCodeAt(i);
					if (ch === CharCode.lineFeed || ch === CharCode.carriageReturn) return true;
					if (ch !== CharCode.space && ch !== CharCode.tab) return false;
				}
				return true;
			}

			/**
			 * @param {number} index
			 */
			#previousNonSpaceTabIndex(index) {
				let cursor = index - 1;
				while (
					cursor >= 0 &&
					(this.input.charCodeAt(cursor) === CharCode.space ||
						this.input.charCodeAt(cursor) === CharCode.tab)
				) {
					cursor--;
				}
				return cursor;
			}

			/**
			 * Like `#previousNonSpaceTabIndex`, but also skips the comments between
			 * the previous token and `index`. When that gap holds a line break
			 * (including one inside a block comment, which separates tokens as for
			 * ASI), returns the index of its last line break; otherwise the index of
			 * the previous token's last character.
			 *
			 * The gap starts at `lastTokEnd` and is scanned forward, so comments read
			 * exactly as the tokenizer read them (`/* a /* b *\/` is one comment).
			 * When `lastTokEnd` doesn't mark the gap, because a token was re-read
			 * after a rewind, comments are not skipped.
			 * @param {number} index
			 */
			#previousNonSpaceTabCommentIndex(index) {
				const gap_start = this.lastTokEnd;
				if (gap_start > index || skip_space_and_comments_from(this.input, gap_start) !== index) {
					return this.#previousNonSpaceTabIndex(index);
				}
				for (let i = index - 1; i >= gap_start; i--) {
					if (this.#isNewlineCharCode(i)) return i;
				}
				return gap_start - 1;
			}

			/**
			 * @param {number} end_index Inclusive index of the keyword's last character.
			 * @param {string} keyword
			 */
			#keywordEndsAt(end_index, keyword) {
				const start = end_index - keyword.length + 1;
				if (start < 0) return false;
				if (this.input.slice(start, end_index + 1) !== keyword) return false;
				return !this.#isIdentifierChar(this.input.charCodeAt(start - 1));
			}

			/**
			 * Returns true when a `<` at `index` can start TypeScript type
			 * parameters/arguments in expression-like code rather than a JSX tag.
			 * Most type argument lists are adjacent to the previous token (`foo<T>`,
			 * `build<T>()`, `Map<K, V>`). The whitespace-separated form is valid for
			 * anonymous generic function expressions (`function <T>() {}`); generic
			 * arrows are handled separately by `looks_like_generic_arrow`.
			 *
			 * Returning true splits a lone `<` off whatever follows, so `<=`, `<<`,
			 * and `<<=` must be left whole. acorn-typescript re-scans a `<<` token
			 * as `<` when type arguments open with a generic function type
			 * (`f<<T>() => T>()`), so `<<` never needs splitting here.
			 *
			 * @param {number} index
			 */
			#canStartTypeParameterOrArgumentList(index) {
				const next = this.input.charCodeAt(index + 1);
				if (next === CharCode.equals || next === CharCode.lessThan) return false;
				const previous = this.#previousNonSpaceTabIndex(index);
				if (previous < 0) return false;
				if (previous === index - 1) {
					return this.#canPrecedeTypeArgumentList(this.input.charCodeAt(previous));
				}
				return this.#keywordEndsAt(previous, 'function');
			}

			#parseTemplateRawText() {
				const start = this.start;
				// The current jsxText token spans `[start, token_end]`. Comments inside
				// that span were already consumed and recorded by the tokenizer
				// (`jsx_readToken`); only comments at/after `token_end` (e.g. a body that
				// opens with a comment, where the raw-text token stops before it) still
				// need recording here. Either way we drop `//` lines from the JSXText value
				// and always advance past them so the scan can't re-tokenize the same spot.
				const token_end = this.end;
				let index = start;
				let value = '';
				while (index < this.input.length) {
					if (this.#isTemplateLineCommentStart(index, start)) {
						const comment_start = index;
						index += 2;
						while (
							index < this.input.length &&
							this.input.charCodeAt(index) !== CharCode.lineFeed &&
							this.input.charCodeAt(index) !== CharCode.carriageReturn
						) {
							index++;
						}

						if (comment_start >= token_end) {
							this.#emitTemplateLineComment(comment_start, index, null);
						}
						continue;
					}
					if (this.#isTemplateBlockCommentStart(index)) {
						const comment_start = index;
						const comment_start_loc = get_line_info(this, comment_start);
						const close = this.input.indexOf('*/', index + 2);
						const value_end = close === -1 ? this.input.length : close;
						index = close === -1 ? this.input.length : close + 2;
						if (this.options.onComment && comment_start >= token_end) {
							const comment_end_loc = get_line_info(this, index);
							this.options.onComment(
								true,
								this.input.slice(comment_start + 2, value_end),
								comment_start,
								index,
								new acorn.Position(comment_start_loc.line, comment_start_loc.column),
								new acorn.Position(comment_end_loc.line, comment_end_loc.column),
								null,
							);
						}
						continue;
					}
					const ch = this.input.charCodeAt(index);
					if (
						(ch === CharCode.lessThan && can_start_tag_after_lt(this.input, index)) ||
						ch === CharCode.openBrace ||
						ch === CharCode.closeBrace ||
						this.#isCodeBlockStart(index) ||
						this.#isJSXControlFlowDirectiveAt(index)
					) {
						break;
					}
					value += this.input[index];
					index++;
				}

				const endLoc = get_line_info(this, index);
				const node = /** @type {ESTreeJSX.JSXText} */ (this.startNodeAt(start, this.startLoc));
				node.value = value;
				// The text as written, which the printers print. A comment between
				// children isn't part of it: it is a comment, not text as in TSX.
				node.raw = value;

				if (this.input.slice(start, index).match(regex_newline_characters)) {
					this.curLine = endLoc.line;
					this.lineStart = index - endLoc.column;
				}
				this.pos = index;
				this.#popTemplateLiteralTokenContext();
				this.next();

				return this.finishNodeAt(node, 'JSXText', index, endLoc);
			}

			/**
			 * JSX significant-whitespace rule for a template text child. Text with a
			 * character other than JSX whitespace is always kept; whitespace-only text
			 * is kept only when it is an intentional inline space (no line break)
			 * separating two siblings, and dropped when it is layout indentation (has a
			 * line break). JSX whitespace is space, tab, and line breaks, as Babel and
			 * Prettier read it: a non-breaking space is text, which the JSX compiler
			 * may still trim at the edge of a line, as it does in TSX.
			 *
			 * @param {ESTreeJSX.JSXText} node
			 */
			#shouldKeepTemplateTextNode(node) {
				const value = node.value;
				return regex_not_whitespace.test(value) || (value !== '' && !/[\n\r]/.test(value));
			}

			/**
			 * @param {number} index
			 */
			#isNewlineCharCode(index) {
				const ch = this.input.charCodeAt(index);
				return ch === CharCode.lineFeed || ch === CharCode.carriageReturn;
			}

			/**
			 * @param {number} start
			 * @param {number} end
			 * @param {Parse.CommentMetaData | null} metadata
			 */
			#emitTemplateLineComment(start, end, metadata) {
				if (!this.options.onComment) return;
				this.options.onComment(
					false,
					this.input.slice(start + 2, end),
					start,
					end,
					get_line_info(this, start),
					get_line_info(this, end),
					metadata,
				);
			}

			#isSwitchCaseScriptStatementStart() {
				let index = skip_whitespace_from(this.input, this.start);

				const first = this.input.charCodeAt(index);

				if (first === CharCode.openBracket || first === CharCode.openBrace) {
					let depth = 0;
					let i = index;
					for (; i < this.input.length; i++) {
						const ch = this.input.charCodeAt(i);
						if (
							ch === CharCode.openBracket ||
							ch === CharCode.openBrace ||
							ch === CharCode.openParen
						) {
							depth++;
						} else if (
							ch === CharCode.closeBracket ||
							ch === CharCode.closeBrace ||
							ch === CharCode.closeParen
						) {
							depth--;
							if (depth === 0) {
								i++;
								break;
							}
						}
					}
					if (depth !== 0) return false;
					i = skip_whitespace_from(this.input, i);
					if (this.input.charCodeAt(i) !== CharCode.equals) return false;
					const next = this.input.charCodeAt(i + 1);
					return next !== CharCode.equals && next !== CharCode.greaterThan;
				}

				if (
					!this.#isIdentifierChar(first) ||
					(first >= CharCode.digit0 && first <= CharCode.digit9)
				) {
					return false;
				}

				const word_start = index;
				index++;
				while (this.#isIdentifierChar(this.input.charCodeAt(index))) {
					index++;
				}
				const word = this.input.slice(word_start, index);
				if (
					word === 'const' ||
					word === 'let' ||
					word === 'var' ||
					word === 'function' ||
					word === 'class' ||
					word === 'if' ||
					word === 'for' ||
					word === 'switch' ||
					word === 'try' ||
					word === 'throw'
				) {
					return true;
				}

				index = skip_whitespace_from(this.input, index);
				if (this.input.charCodeAt(index) !== CharCode.equals) return false;
				const next = this.input.charCodeAt(index + 1);
				return next !== CharCode.equals && next !== CharCode.greaterThan;
			}

			#switchCaseLabelStart(index = this.start) {
				while (index < this.input.length) {
					const ch = this.input.charCodeAt(index);
					if (
						ch !== CharCode.space &&
						ch !== CharCode.tab &&
						ch !== CharCode.lineFeed &&
						ch !== CharCode.carriageReturn
					) {
						break;
					}
					index++;
				}
				if (!this.#isLineStartPosition(index)) return -1;
				if (this.input.charCodeAt(index) !== CharCode.at) return -1;
				index++;
				if (
					this.input.slice(index, index + 4) === 'case' &&
					!this.#isIdentifierChar(this.input.charCodeAt(index + 4))
				) {
					return index;
				}
				if (
					this.input.slice(index, index + 7) === 'default' &&
					!this.#isIdentifierChar(this.input.charCodeAt(index + 7))
				) {
					return index;
				}
				return -1;
			}

			#rewindToSwitchCaseLabel() {
				const start = this.#switchCaseLabelStart();
				if (start === -1) return false;
				while (this.curContext() === tstc.tc_expr) {
					this.#popContext();
				}
				this.pos = start;
				this.start = start;
				this.startLoc = get_line_info(this, start);
				this.exprAllowed = true;
				this.#suppressTemplateRawTextToken = true;
				this.next();
				return true;
			}

			/**
			 * @param {number} index
			 */
			#switchCaseBoundaryStart(index) {
				if (!this.#isLineStartPosition(index)) return -1;
				let wordStart = index;
				while (wordStart < this.input.length) {
					const ch = this.input.charCodeAt(wordStart);
					if (ch !== CharCode.space && ch !== CharCode.tab) break;
					wordStart++;
				}

				const ch = this.input.charCodeAt(wordStart);
				if (ch === CharCode.closeBrace) return index;
				if (ch === CharCode.at) {
					const keywordStart = wordStart + 1;
					if (
						this.input.slice(keywordStart, keywordStart + 4) === 'case' &&
						!this.#isIdentifierChar(this.input.charCodeAt(keywordStart + 4))
					) {
						return index;
					}

					if (
						this.input.slice(keywordStart, keywordStart + 7) === 'default' &&
						!this.#isIdentifierChar(this.input.charCodeAt(keywordStart + 7))
					) {
						return index;
					}
				}

				for (const keyword of ['break', 'continue', 'return', 'throw']) {
					if (
						this.input.slice(wordStart, wordStart + keyword.length) === keyword &&
						!this.#isIdentifierChar(this.input.charCodeAt(wordStart + keyword.length))
					) {
						return index;
					}
				}

				return -1;
			}

			/**
			 * @param {number} ch
			 */
			#isIdentifierChar(ch) {
				return (
					(ch >= CharCode.uppercaseA && ch <= CharCode.uppercaseZ) ||
					(ch >= CharCode.lowercaseA && ch <= CharCode.lowercaseZ) ||
					(ch >= CharCode.digit0 && ch <= CharCode.digit9) ||
					ch === CharCode.underscore ||
					ch === CharCode.dollar
				);
			}

			/**
			 * @param {number} ch
			 */
			#canPrecedeTypeArgumentList(ch) {
				return this.#isIdentifierChar(ch) || ch === CharCode.closeParen;
			}

			/** @this {TSRXParser & Parse.Parser} */
			#parseJSXSwitchCaseRawText() {
				const start = this.start;
				let index = start;
				let found_boundary = false;
				while (index < this.input.length) {
					const boundary = this.#switchCaseBoundaryStart(index);
					if (boundary !== -1) {
						index = boundary;
						found_boundary = true;
						break;
					}

					const ch = this.input.charCodeAt(index);
					if (
						ch === CharCode.lessThan ||
						ch === CharCode.openBrace ||
						ch === CharCode.closeBrace ||
						ch === CharCode.at
					) {
						break;
					}
					index++;
				}

				const endLoc = get_line_info(this, index);
				const node = /** @type {ESTreeJSX.JSXText} */ (this.startNodeAt(start, this.startLoc));
				node.value = this.input.slice(start, index);
				node.raw = node.value;

				if (node.value.match(regex_newline_characters)) {
					this.curLine = endLoc.line;
					this.lineStart = index - endLoc.column;
				}
				this.pos = index;
				if (found_boundary) {
					this.#filterTemplateScriptContexts();
					if (this.curContext() !== b_stat) {
						this.context.push(b_stat);
					}
					this.exprAllowed = true;
					this.#suppressTemplateRawTextToken = true;
				}
				this.next();

				return this.finishNodeAt(node, 'JSXText', index, endLoc);
			}

			/**
			 * @param {boolean} [allow_inside_expression_container] When set, do not bail
			 *   purely because we are inside a `{ … }` expression container. A JSX
			 *   element nested in a container (e.g. `{<div>   a</div>}`) is still a
			 *   template-mode element whose text children are raw JSX text; the rest of
			 *   the directive/comment/boundary checks below still apply, so a directive
			 *   body inside an expression container is correctly excluded.
			 * @param {boolean} [ignore_directive_start] Skip the directive-start bail —
			 *   used to ask whether the position is template text APART from starting a
			 *   directive, so whitespace directly before the directive can be kept. Also
			 *   skips the value-position (`#templateScriptParsingDepth`) and `@switch`
			 *   (JS switch label) bails: those describe the surrounding construct, not
			 *   this position, and significant whitespace between template siblings must
			 *   not depend on which construct the template sits in.
			 */
			#shouldReadTemplateRawTextToken(
				allow_inside_expression_container = false,
				ignore_directive_start = false,
			) {
				if (
					this.#closingNativeTemplateNode ||
					this.#readingJSXControlFlowDirectiveKeyword ||
					this.#readingJSXControlFlowHeader ||
					(!allow_inside_expression_container && this.#jsxExpressionContainerDepth > 0)
				) {
					return false;
				}
				const current_context_token = this.curContext()?.token;
				if (current_context_token === '<tag' || current_context_token === '</tag') {
					return false;
				}
				const current_template_node = this.#currentNativeTemplateNode();
				if (!current_template_node) {
					return false;
				}
				// Code that started after the innermost element, a setup statement, isn't
				// its text. An element opened in that code reads its own children as text
				// (`const a = <b> 1</b>;` in a `@{ … }` body).
				const element_start = this.#elementStart(current_template_node);
				if (
					this.#parsingJSXSwitchCaseScriptStatementDepth > element_start.switchCaseScriptDepth ||
					(!ignore_directive_start &&
						(this.#templateScriptParsingDepth > element_start.scriptDepth ||
							this.#insideSwitchStartedAfter(current_template_node) ||
							this.#isJSXControlFlowDirectiveAt(this.pos)))
				) {
					return false;
				}
				// Inside an expression container (only reachable with
				// `allow_inside_expression_container`), raw text belongs to an element
				// opened inside the container. When the innermost native template element
				// sits below the container's path baseline we are at the container's own
				// expression level — e.g. after `(<Outer>…</Outer>)` in
				// `{cond ? (<Outer>…</Outer>) : null}` — and the following characters are
				// JS tokens, not template text.
				if (this.#jsxExpressionContainerDepth > 0 && !this.#openingNativeTemplateNode) {
					const path_baseline = this.#containerPathBaseline();
					let inside_container = false;
					for (let i = this.#path.length - 1; i >= path_baseline; i--) {
						if (this.#isNativeTemplateNode(this.#path[i])) {
							inside_container = true;
							break;
						}
					}
					if (!inside_container) {
						return false;
					}
				}
				if (this.#isTemplateLineCommentStart(this.pos)) {
					return false;
				}
				if (this.#switchCaseLabelStart(this.pos) !== -1) {
					return false;
				}
				if (this.input.charCodeAt(this.pos - 1) === CharCode.lessThan) {
					return false;
				}
				if (
					this.input.charCodeAt(this.pos - 1) === CharCode.slash &&
					this.input.charCodeAt(this.pos - 2) === CharCode.lessThan
				) {
					return false;
				}
				if (
					this.input.charCodeAt(this.pos) === CharCode.slash &&
					this.input.charCodeAt(this.pos + 1) === CharCode.greaterThan
				) {
					return false;
				}
				if (
					this.input.charCodeAt(this.pos) === CharCode.greaterThan &&
					this.input.charCodeAt(this.pos - 1) === CharCode.slash &&
					this.input.charCodeAt(this.pos - 2) === CharCode.lessThan
				) {
					return false;
				}
				// Just past a self-closing tag's `/>`: that element has no body, so any
				// following raw text belongs to an enclosing template, not to it. With no
				// enclosing template (e.g. a top-level `return <div />`), the trailing
				// text is plain JS and must not be read as template raw text.
				// Inter-token whitespace has already advanced `pos`; `lastTokEnd` still
				// identifies the consumed `>`, which whitespace or a comment can separate
				// from the `/` (`<div / >`).
				const opening = this.#openingNativeTemplateNode;
				if (
					opening &&
					current_template_node === opening &&
					opening.type !== 'JSXFragment' &&
					opening.openingElement?.selfClosing &&
					this.input.charCodeAt(this.lastTokEnd - 1) === CharCode.greaterThan
				) {
					const enclosing = this.#path.findLast(
						(node) => node !== opening && this.#isNativeTemplateNode(node),
					);
					if (!enclosing) {
						return false;
					}
					return true;
				}
				return true;
			}

			/**
			 * At a raw-text bail boundary in `jsx_readToken`, decides whether the
			 * accumulated run is template text that must be finished as a jsxText
			 * token rather than silently discarded by the token-start reset. True
			 * when the run contains non-whitespace (whitespace accumulates without
			 * consulting the raw-text gate, so a whitespace-only run can be plain JS
			 * layout — a newline before a `return`, indentation before `: null`), or
			 * when it is significant whitespace directly before a directive in an
			 * open template element (`<><a /> @for (…) { … }</>`).
			 * @param {string} accumulated
			 */
			#shouldFinishAccumulatedTemplateText(accumulated) {
				if (!accumulated) return false;
				if (regex_not_whitespace.test(accumulated)) return true;
				return (
					this.#isJSXControlFlowDirectiveAt(this.pos) &&
					this.#shouldReadTemplateRawTextToken(true, true)
				);
			}

			#readTemplateRawTextToken() {
				const start = this.pos;
				const index = this.#templateRawTextEnd(start, this.#insideScriptJSXElement());

				const endLoc = get_line_info(this, index);
				const value = this.input.slice(start, index);
				if (value.match(regex_newline_characters)) {
					this.curLine = endLoc.line;
					this.lineStart = index - endLoc.column;
				}
				this.pos = index;
				return this.finishToken(tstt.jsxText, value);
			}

			/**
			 * A `//` is a comment only when nothing but whitespace precedes it on its
			 * line, or — given `run_start`, the position where the current text run
			 * began (right after a sibling element, code block, or expression
			 * container) — since that boundary. Once real text has begun, `//` is
			 * literal so inline text like `https://…` stays text.
			 * @param {number} index
			 * @param {number} [run_start]
			 */
			#isTemplateLineCommentStart(index, run_start = -1) {
				if (
					this.input.charCodeAt(index) !== CharCode.slash ||
					this.input.charCodeAt(index + 1) !== CharCode.slash
				) {
					return false;
				}
				if (this.#isLineStartPosition(index)) return true;
				if (run_start < 0) return false;
				for (let i = index - 1; i >= run_start; i--) {
					const ch = this.input.charCodeAt(i);
					if (ch === CharCode.lineFeed || ch === CharCode.carriageReturn) return false;
					if (ch !== CharCode.space && ch !== CharCode.tab) return false;
				}
				return true;
			}

			/**
			 * Unlike `//` (which is only a comment at line-start so inline text like
			 * `https://…` stays text), `/*` starts a comment anywhere in template
			 * text, matching `jsx_readToken`.
			 * @param {number} index
			 */
			#isTemplateBlockCommentStart(index) {
				return (
					this.input.charCodeAt(index) === CharCode.slash &&
					this.input.charCodeAt(index + 1) === CharCode.asterisk
				);
			}

			/**
			 * @param {number} start
			 * @param {boolean} comments_are_text Whether a comment is part of the text
			 *   (see `#insideScriptJSXElement`) instead of ending it.
			 */
			#templateRawTextEnd(start, comments_are_text) {
				let index = start;
				while (index < this.input.length) {
					const ch = this.input.charCodeAt(index);
					if (
						(ch === CharCode.lessThan && can_start_tag_after_lt(this.input, index)) ||
						ch === CharCode.openBrace ||
						ch === CharCode.closeBrace ||
						this.#isJSXControlFlowDirectiveAt(index) ||
						(!comments_are_text &&
							(this.#isTemplateLineCommentStart(index, start) ||
								this.#isTemplateBlockCommentStart(index)))
					) {
						break;
					}
					index++;
				}
				return index;
			}

			/**
			 * The `@` and the keyword touch, but after the keyword (and after the
			 * `await` of `@for await`) the header is code, where a comment is
			 * whitespace: a block comment before the `{` of `@try` or the `(` of
			 * `@if`, or `@if // c` with the `(` on the next line.
			 * @param {number} index
			 */
			#isJSXControlFlowDirectiveAt(index) {
				if (this.input.charCodeAt(index) !== CharCode.at) return false;

				let cursor = index + 1;
				if (!this.#isIdentifierChar(this.input.charCodeAt(cursor))) return false;

				const word_start = cursor;
				cursor++;
				while (this.#isIdentifierChar(this.input.charCodeAt(cursor))) {
					cursor++;
				}

				const word = this.input.slice(word_start, cursor);
				const next_token_start = skip_space_and_comments_from(this.input, cursor);
				if (next_token_start === -1) return false;
				const next = this.input.charCodeAt(next_token_start);
				if (this.#isIdentifierChar(this.input.charCodeAt(cursor))) {
					return false;
				}
				if (word === 'try') {
					return next === CharCode.openBrace;
				}
				if (word === 'for') {
					if (next === CharCode.openParen) return true;
					if (
						this.input.slice(next_token_start, next_token_start + 5) === 'await' &&
						!this.#isIdentifierChar(this.input.charCodeAt(next_token_start + 5))
					) {
						const after_await = skip_space_and_comments_from(this.input, next_token_start + 5);
						return after_await !== -1 && this.input.charCodeAt(after_await) === CharCode.openParen;
					}
					return false;
				}
				return (word === 'if' || word === 'switch') && next === CharCode.openParen;
			}

			#isJSXControlFlowDirectiveStart() {
				return this.#isJSXControlFlowDirectiveAt(this.start);
			}

			/**
			 * `@{ … }` code block: an `@` immediately followed by `{` at child/body
			 * position. This is the marker that switches a body from plain JSX to a JS
			 * code block (§2). Whitespace between `@` and `{` is not allowed — they must
			 * be adjacent so it can never be confused with an `@directive` or a literal
			 * `@` followed by an expression container.
			 * @param {number} index
			 */
			#isCodeBlockStart(index) {
				return (
					this.input.charCodeAt(index) === CharCode.at &&
					this.input.charCodeAt(index + 1) === CharCode.openBrace
				);
			}

			/**
			 * True when the body position starting at `this.start` opens a `@{ … }`
			 * code block, skipping leading whitespace.
			 */
			#atCodeBlockStart() {
				const index = skip_whitespace_from(this.input, this.start);
				return this.#isCodeBlockStart(index);
			}

			/**
			 * Inside a code block (`@{ … }` or a directive's `{ }`), decides whether the
			 * next thing is the single bare render node (`<tag …>`, `<>…</>`, or an
			 * `@if`/`@for`/`@switch`/`@try` directive) rather than a setup statement.
			 *
			 * Render output that begins with `<` is recognized by the tokenizer
			 * (`getTokenFromCode`): it emits `jsxTagStart` for a `<` that opens a tag — at
			 * the start of a line, or in an expression position such as after `;`/`{`/`=>` —
			 * which the `jsxTagStart` fast path below covers. The char-based fallback for a
			 * raw `<` therefore only treats it as render output when the tag starts its own
			 * line or follows a `;` on the same line (so one-liners such as
			 * `@{ const foo = 1; <>{foo}</> }` work). A `<` the tokenizer left as a
			 * relational operator while trailing a value on the same line is the comparison
			 * it looks like (`aaa <b` is `aaa < b`, never a `<b>` tag), so it stays setup
			 * code rather than being mistaken for render output.
			 */
			#atRenderNodeStart() {
				if (this.type === tstt.jsxTagStart) return true;
				const index = skip_whitespace_from(this.input, this.start);
				const ch = this.input.charCodeAt(index);
				if (ch === CharCode.lessThan) {
					if (this.input.charCodeAt(index + 1) === CharCode.slash) return false;
					const tagLike = can_start_tag_after_lt(this.input, index);
					const previous = this.#previousNonSpaceTabIndex(index);
					const afterSemicolon =
						previous >= 0 && this.input.charCodeAt(previous) === CharCode.semicolon;
					return tagLike && (this.#isLineStartPosition(index) || afterSemicolon);
				}
				return this.#isCodeBlockStart(index) || this.#isJSXControlFlowDirectiveAt(index);
			}

			/**
			 * Parse one setup statement inside a code block as ordinary TS, with the
			 * native-template path hidden so `<` reads as a relational/type operator
			 * (`value < limit`, `foo<T>()`) rather than a JSX tag, and any JSX value
			 * (`const x = <div/>`) parses as a plain JSX expression.
			 */
			#parseCodeBlockSetupStatement() {
				const previous_context = this.context;
				const at_template_literal = this.type === tt.backQuote;
				// The statement's first token is already read, and a `(`, `{`, `function`,
				// or `class` has pushed its own context. The statement context goes under
				// it, so the token that closes it (`)` of `(a) / b`) pops its own context.
				const first_token_context_depth =
					previous_context.length - this.#currentTokenContextCount();
				if (at_template_literal) {
					if (this.curContext() !== q_tmpl) {
						this.context.push(q_tmpl);
					}
				} else {
					this.context = previous_context
						.slice(0, first_token_context_depth)
						.filter(
							(context) =>
								context !== tstc.tc_expr && context !== tstc.tc_oTag && context !== tstc.tc_cTag,
						);
					if (this.curContext() !== b_stat) {
						this.context.push(b_stat);
					}
					this.context.push(...previous_context.slice(first_token_context_depth));
				}
				const previous_path = this.#path;
				this.#path = [];
				this.#templateScriptParsingDepth++;
				let node;
				try {
					if (this.type === tstt.jsxText || this.type === tstt.jsxName) {
						// Read as template text; re-read it as the code token that starts a
						// statement. Only this re-read gets `exprAllowed`: for a token already
						// read as code, it decides how the token after it reads.
						const loc = get_line_info(this, this.start);
						this.pos = this.start;
						this.curLine = loc.line;
						this.lineStart = this.start - loc.column;
						this.exprAllowed = true;
						this.nextToken();
					}
					node = this.parseStatement(null);
				} finally {
					this.#templateScriptParsingDepth--;
					this.#path = previous_path;
					if (!at_template_literal) {
						// The token after the statement is already read too: keep the
						// contexts it pushed (the `(` that starts the next statement).
						const next_token_contexts = this.context.slice(
							this.context.length - this.#currentTokenContextCount(),
						);
						this.context = previous_context.slice(0, first_token_context_depth);
						this.context.push(...next_token_contexts);
					}
				}
				if (this.curContext() === tstc.tc_expr) {
					this.#popContext();
				}
				return node;
			}

			/**
			 * Parse the single bare render node of a code block — a JSX element/fragment
			 * (parsed as a native TSRX element so its own body may again be plain JSX or
			 * a nested `@{ … }`) or an `@if`/`@for`/`@switch`/`@try` directive.
			 * @returns {AST.TSRXRenderOutput}
			 */
			#parseCodeBlockRenderNode() {
				const at_index = skip_whitespace_from(this.input, this.start);
				// Reposition onto the render token so it re-tokenizes in a clean context
				// (a preceding setup statement's context restore can strip the JSX tag
				// contexts the trailing `<`/`@` token first pushed).
				if (this.start !== at_index) {
					const loc = get_line_info(this, at_index);
					this.pos = at_index;
					this.start = at_index;
					this.startLoc = new acorn.Position(loc.line, loc.column);
					this.curLine = loc.line;
					this.lineStart = at_index - loc.column;
				}

				if (this.#isCodeBlockStart(at_index)) {
					return this.#parseCodeBlock();
				}

				if (this.#isJSXControlFlowDirectiveAt(at_index)) {
					return this.#parseJSXControlFlowExpression();
				}

				// Re-read the `<` so its `jsxTagStart` pushes the opening-tag contexts,
				// in place of the ones it pushed when it was first read.
				this.#truncateContext(this.context.length - this.#currentTokenContextCount());
				this.pos = at_index;
				this.exprAllowed = true;
				this.next();
				if (this.type !== tstt.jsxTagStart) {
					this.unexpected();
				}
				this.next();
				if (this.value === '/' || this.type === tt.slash) {
					this.unexpected();
				}
				const node = this.parseElement();
				if (!node) {
					this.unexpected();
				}
				if (this.curContext() === tstc.tc_expr) {
					this.#popContext();
				}
				return node;
			}

			/**
			 * Shared `Statement* RenderOutput?` grammar for the body of a `@{ … }` code
			 * block and the `{ }` of an `@if`/`@for`/`@switch`/`@try` directive (§2
			 * rules 4–8). Fills `flat` with the setup statements followed by at most one
			 * trailing render node. Leaves the tokenizer positioned at the closing `}`.
			 * @param {AST.Node[]} flat
			 */
			#parseCodeBlockBody(flat) {
				let render_seen = false;
				while (this.type !== tt.braceR && this.type !== tt.eof) {
					// A bare `;` is an empty statement carrying no meaning. JSX render
					// output does not consume a trailing `;`, so one written after the
					// render node (`<>…</>;`) would otherwise parse as a statement and
					// trip the "statements cannot follow the rendered output" rule. Skip
					// stray semicolons silently here; prettier strips them on format.
					if (this.type === tt.semi) {
						this.next();
						continue;
					}
					if (this.#atRenderNodeStart()) {
						const render_node = this.#parseCodeBlockRenderNode();
						if (render_seen) {
							this.#report_recoverable_error_range(
								/** @type {number} */ (render_node.start),
								/** @type {number} */ (render_node.end),
								"A code block renders a single node; wrap multiple nodes or text in a fragment '<>…</>'.",
							);
						}
						flat.push(render_node);
						render_seen = true;
						continue;
					}
					const statement = this.#parseCodeBlockSetupStatement();
					if (statement) {
						if (render_seen) {
							// A statement after the rendered output: code must come first.
							this.#report_recoverable_error_range(
								/** @type {number} */ (statement.start),
								/** @type {number} */ (statement.end),
								"Code must be at the top of '@{ }'; statements cannot follow the rendered output.",
							);
						}
						flat.push(statement);
					}
				}
			}

			/**
			 * Parse an explicit `@{ … }` code block (`this.start` at `@`). Returns a
			 * `JSXCodeBlock` whose `body` holds the setup statements and `render` the
			 * single optional render output (§9).
			 */
			#parseCodeBlock({ allowReturnStatements = false } = {}) {
				const start = this.start;
				const startLoc = this.startLoc;
				const node = /** @type {AST.JSXCodeBlock} */ (this.startNodeAt(start, startLoc));
				node.body = [];
				node.render = null;
				node.metadata = { path: [] };

				// The body parses as JS, so swap the surrounding JSX/template token
				// contexts for a clean statement context and hide the enclosing template
				// from `#path` so the body tokenizes as code (not JSX raw text). Both are
				// restored before the closing `}` is consumed so the following `</tag>`
				// tokenizes against the same template context the body opened in.
				const enclosing_context = this.context;
				const enclosing_path = this.#path;
				const braceStart = start + 1;
				this.context = enclosing_context.filter(
					(context) =>
						context !== tstc.tc_expr && context !== tstc.tc_oTag && context !== tstc.tc_cTag,
				);
				if (this.curContext() !== b_stat) {
					this.context.push(b_stat);
				}
				const braceLoc = get_line_info(this, braceStart);
				this.pos = braceStart;
				this.start = braceStart;
				this.startLoc = new acorn.Position(braceLoc.line, braceLoc.column);
				this.curLine = braceLoc.line;
				this.lineStart = braceStart - braceLoc.column;
				this.exprAllowed = true;
				this.#path = [];
				this.next();
				this.expect(tt.braceL);

				/** @type {AST.Node[]} */
				const flat = [];
				this.enterScope(0);
				try {
					this.#parseCodeBlockBody(flat);
				} finally {
					this.exitScope();
					this.#path = enclosing_path;
				}
				// The body stops at the end of the input too.
				if (this.type !== tt.braceR) {
					this.#raiseClosingBraceExpected();
				}

				const last = flat[flat.length - 1];
				if (is_tsrx_render_output_node(last)) {
					node.render = last;
					node.body = /** @type {AST.Statement[]} */ (flat.slice(0, -1));
				} else {
					node.body = /** @type {AST.Statement[]} */ (flat);
				}
				if (!allowReturnStatements) {
					this.#report_invalid_template_return_statements(node.body);
				}

				// Restore the enclosing template context, then consume `}` and read the
				// following token (typically the parent's `</tag>`) against it. Finish the
				// node after the `}` so its range spans the whole `@{ … }` (this is what
				// lets trailing comments before `}` attach to the block, not the parent's
				// closing tag).
				const brace_close_end = this.end;
				const brace_close_end_loc = this.endLoc;
				this.context = enclosing_context;
				this.next();
				this.finishNodeAt(node, 'JSXCodeBlock', brace_close_end, brace_close_end_loc);
				return node;
			}

			/**
			 * At-sign constructs are expressions (§6a, §2 rule 9): code blocks and the
			 * if/for/switch/try directive forms may be returned, assigned, or passed
			 * anywhere an expression is expected. Only code blocks and the four reserved
			 * control-flow keywords are intercepted; any other at-sign form, such as a
			 * decorated class expression, falls through so decorators keep working.
			 * @type {Parse.Parser['parseExprAtom']}
			 */
			parseExprAtom(refDestructuringErrors, forInit, forNew) {
				// A token already consumed as JSX text (a script-mode element child) must
				// stay text even when it happens to begin at an `@` — otherwise whether
				// `@if` parses as a directive would depend on leading whitespace.
				if (this.input.charCodeAt(this.start) === CharCode.at && this.type !== tstt.jsxText) {
					if (this.#isCodeBlockStart(this.start)) {
						return this.#parseCodeBlock();
					}
					if (this.#isJSXControlFlowDirectiveAt(this.start)) {
						return this.#parseJSXControlFlowExpression();
					}
				}
				return super.parseExprAtom(refDestructuringErrors, forInit, forNew);
			}

			/**
			 * `yield` takes an argument that starts with `@`, like any other
			 * expression: `yield @{ … }`, `yield @if (…) { … }`, or a decorated class.
			 * TypeScript reads `@` as the start of an expression, but acorn-typescript's
			 * `parseYield` reads an argument only when the next token has
			 * `startsExpr`, which its `@` token doesn't, so it ended the `yield`
			 * before the `@`. A line break after `yield` still ends it.
			 * @type {Parse.Parser['parseYield']}
			 */
			parseYield(forInit) {
				// UPSTREAM(sveltejs/acorn-typescript#128): remove once a release includes the fix
				const next = skip_space_and_comments_from(this.input, this.end);
				if (next === -1 || this.input.charCodeAt(next) !== CharCode.at) {
					return super.parseYield(forInit);
				}
				// As acorn records the first `yield` of a function's parameters.
				const parser = /** @type {Parse.Parser} */ (this);
				if (!parser.yieldPos) parser.yieldPos = this.start;
				const node = /** @type {AST.YieldExpression} */ (this.startNode());
				this.next();
				node.delegate = false;
				node.argument = this.canInsertSemicolon() ? null : this.parseMaybeAssign(forInit);
				return this.finishNode(node, 'YieldExpression');
			}

			/**
			 * An element or fragment isn't a left-hand-side expression, as in
			 * TypeScript's TSX parser, and neither is a TSRX value that lays out like
			 * one (`@{ … }`, `@if`, `@for`, `@switch`, `@try`). Unless it's
			 * parenthesized, no call, member access, index, non-null assertion, or
			 * tagged template follows it: a `(`, `[`, or template literal on the next
			 * line starts a new statement, and `<b />.foo` fails at the `.`.
			 * `(<b />).foo` and `(<b />)(x)` are still a member access and a call.
			 *
			 * A class or function expression is one, and takes type arguments right
			 * after its body, as in TypeScript: `class<T> {}<string>` and
			 * `function <T>() {}<string>()`. A `<` after a `}` reads as a tag start
			 * (see `getTokenFromCode`), so read it again as `<` when it's on the same
			 * line. On the next line it still starts an element (the line-start `<`
			 * rule), and a closing tag's `</` stays a tag start.
			 * @type {Parse.Parser['parseSubscripts']}
			 */
			parseSubscripts(base, startPos, startLoc, noCalls, forInit) {
				if (is_tsrx_render_output_node(base) && !base.metadata?.parenthesized) {
					return base;
				}
				if (
					(base.type === 'ClassExpression' || base.type === 'FunctionExpression') &&
					!this.hasPrecedingLineBreak()
				) {
					this.#readTagStartAsTypeArgumentStart();
				}
				return super.parseSubscripts(base, startPos, startLoc, noCalls, forInit);
			}

			/**
			 * Retype a parsed control-flow statement in place as its directive
			 * expression form (`IfStatement` -> `JSXIfExpression`, …), keeping the
			 * original statement type in `statementType`.
			 *
			 * @param {AST.Node} node
			 * @param {AST.JSXTemplateDirective['type']} type
			 * @param {number} start
			 * @param {AST.Position} startLoc
			 * @returns {AST.JSXTemplateDirective}
			 */
			#finishJSXControlFlowExpression(node, type, start, startLoc) {
				node.start = start;
				/** @type {AST.NodeWithLocation} */ (node).loc.start = startLoc;
				node.metadata ??= { path: [] };
				const directive = /** @type {Parse.JSXControlFlowDirectiveSlots} */ (
					/** @type {unknown} */ (node)
				);
				directive.statementType = /** @type {AST.JSXTemplateDirective['statementType']} */ (
					node.type
				);
				directive.type = type;
				return /** @type {AST.JSXTemplateDirective} */ (directive);
			}

			/**
			 * Drop the JSX tokenizer contexts (`tc_expr`/`tc_oTag`/`tc_cTag`) so the
			 * directive header/body tokenizes as JavaScript, while preserving every
			 * context below the innermost open `{ … }` expression container. Those lower
			 * contexts belong to the enclosing markup (the container brace, the element
			 * that holds the `{ … }`, any outer fragment); a plain filter would drop them
			 * too and underflow the context stack when that markup later closes. Outside
			 * any expression container the baseline is 0, so this matches the original
			 * "strip everything" behavior the bare-template path relies on.
			 */
			#filterTemplateScriptContexts() {
				const baseline = this.#expressionContainerContextBaselines.at(-1) ?? 0;
				this.context = this.context.filter(
					(context, index) =>
						index < baseline ||
						(context !== tstc.tc_expr && context !== tstc.tc_oTag && context !== tstc.tc_cTag),
				);
			}

			#parseJSXControlFlowExpression() {
				const start = this.start;
				const startLoc = this.startLoc;
				const keywordStart = start + 1;
				this.pos = keywordStart;
				this.start = keywordStart;
				this.startLoc = get_line_info(this, keywordStart);
				this.curLine = this.startLoc.line;
				this.lineStart = keywordStart - this.startLoc.column;
				this.#filterTemplateScriptContexts();
				if (this.curContext() !== b_stat) {
					this.context.push(b_stat);
				}
				this.exprAllowed = true;
				this.#readingJSXControlFlowDirectiveKeyword = true;
				try {
					this.nextToken();
				} finally {
					this.#readingJSXControlFlowDirectiveKeyword = false;
				}

				const label = this.type.keyword || this.type.label || this.value;
				if (label === 'if') {
					return this.#finishJSXControlFlowExpression(
						this.#parseTemplateIfStatement(),
						'JSXIfExpression',
						start,
						startLoc,
					);
				}

				if (label === 'for') {
					this.#templateControlFlowBlockDepth++;
					let node;
					const previous_reading_header = this.#readingJSXControlFlowHeader;
					this.#readingJSXControlFlowHeader = true;
					try {
						node = /** @type {AST.JSXForExpression} */ (
							this.#finishJSXControlFlowExpression(
								this.parseStatement(null),
								'JSXForExpression',
								start,
								startLoc,
							)
						);
					} finally {
						this.#readingJSXControlFlowHeader = previous_reading_header;
						this.#templateControlFlowBlockDepth--;
					}
					if (
						node.statementType !== 'ForOfStatement' &&
						node.statementType !== 'ForInStatement' &&
						node.statementType !== 'ForStatement'
					) {
						this.raise(start, 'Expected `for` after `@`.');
					}
					if (node.body?.type !== 'BlockStatement') {
						this.raise(node.body?.start ?? start, 'Expected `{` after JSX control-flow directive.');
					}
					if (this.#eatJSXForEmptyKeyword()) {
						if (this.type !== tt.braceL) {
							this.raise(this.start, 'Expected `{` after JSX control-flow directive.');
						}
						const emptyKeyword = this.#lastClauseKeywordSpan;
						let empty;
						this.#templateControlFlowBlockDepth++;
						try {
							empty = this.parseBlock();
						} finally {
							this.#templateControlFlowBlockDepth--;
						}
						node.empty = empty;
						node.emptyKeyword = emptyKeyword;
						// `@empty { … }` is part of the `@for` statement, but the node was
						// already finished at the end of the for BODY (the clause is parsed
						// after `#finishJSXControlFlowExpression`, unlike `@else`/`@catch`,
						// which their own `parseStatement` consumes first). Extend it, or
						// every consumer that slices by range — editor mappings, the
						// playground's AST/position tracking, formatters, diagnostics —
						// truncates the statement before its `@empty` clause.
						node.end = empty.end;
						/** @type {AST.NodeWithLocation} */ (node).loc.end =
							/** @type {AST.NodeWithLocation} */ (empty).loc.end;
						if (node.range) node.range[1] = /** @type {number} */ (empty.end);
					} else if (this.#isUnprefixedDirectiveClauseContinuation('empty', ['{'])) {
						this.raise(this.start, 'Expected `@empty` after `@for` block.');
					} else {
						node.empty = null;
					}
					return node;
				}

				if (label === 'switch') {
					return this.#parseJSXSwitchExpression(start, startLoc);
				}

				if (label === 'try') {
					this.#templateControlFlowTryDepth++;
					try {
						return this.#finishJSXControlFlowExpression(
							this.parseStatement(null),
							'JSXTryExpression',
							start,
							startLoc,
						);
					} finally {
						this.#templateControlFlowTryDepth--;
					}
				}

				this.raise(start, 'Expected `@if`, `@for`, `@switch`, or `@try`.');
			}

			/**
			 * @param {string} keyword
			 */
			#eatJSXDirectiveClauseKeyword(keyword) {
				this.#lastClauseKeywordSpan = null;
				const keywordStart = skip_whitespace_from(this.input, this.start);
				if (this.input.charCodeAt(keywordStart) !== CharCode.at) {
					return false;
				}
				const wordStart = keywordStart + 1;
				if (
					this.input.slice(wordStart, wordStart + keyword.length) !== keyword ||
					this.#isIdentifierChar(this.input.charCodeAt(wordStart + keyword.length))
				) {
					return false;
				}

				// The clause keyword is the only authored spelling of `@empty`/`@else`/
				// `@catch` and friends: the clause node itself starts at its `{`, so
				// without this span nothing in the tree points at the keyword and
				// tooling cannot resolve a cursor placed on it.
				const keywordEnd = wordStart + keyword.length;
				this.#lastClauseKeywordSpan = {
					start: keywordStart,
					end: keywordEnd,
					loc: {
						start: get_line_info(this, keywordStart),
						end: get_line_info(this, keywordEnd),
					},
				};
				this.pos = wordStart;
				this.start = wordStart;
				this.startLoc = get_line_info(this, wordStart);
				this.curLine = this.startLoc.line;
				this.lineStart = wordStart - this.startLoc.column;
				this.#filterTemplateScriptContexts();
				if (this.curContext() !== b_stat) {
					this.context.push(b_stat);
				}
				this.exprAllowed = true;
				this.#readingJSXControlFlowDirectiveKeyword = true;
				try {
					this.nextToken();
				} finally {
					this.#readingJSXControlFlowDirectiveKeyword = false;
				}
				this.next();
				return true;
			}

			#eatJSXForEmptyKeyword() {
				return this.#eatJSXDirectiveClauseKeyword('empty');
			}

			/**
			 * @param {string} keyword
			 */
			#eatJSXDirectiveBareClauseKeyword(keyword) {
				const wordStart = skip_whitespace_from(this.input, this.start);
				if (
					this.input.slice(wordStart, wordStart + keyword.length) !== keyword ||
					this.#isIdentifierChar(this.input.charCodeAt(wordStart + keyword.length))
				) {
					return false;
				}

				this.pos = wordStart;
				this.start = wordStart;
				this.startLoc = get_line_info(this, wordStart);
				this.curLine = this.startLoc.line;
				this.lineStart = wordStart - this.startLoc.column;
				this.#filterTemplateScriptContexts();
				if (this.curContext() !== b_stat) {
					this.context.push(b_stat);
				}
				this.exprAllowed = true;
				this.#readingJSXControlFlowDirectiveKeyword = true;
				try {
					this.nextToken();
				} finally {
					this.#readingJSXControlFlowDirectiveKeyword = false;
				}
				return true;
			}

			/**
			 * @param {string} keyword
			 * @param {string[]} continuations
			 */
			#isUnprefixedDirectiveClauseContinuation(keyword, continuations) {
				const keywordStart = skip_whitespace_from(this.input, this.start);
				if (
					this.input.slice(keywordStart, keywordStart + keyword.length) !== keyword ||
					this.#isIdentifierChar(this.input.charCodeAt(keywordStart + keyword.length))
				) {
					return false;
				}

				// A comment is whitespace here too (`} else /* c */ {`).
				const continuationStart = skip_space_and_comments_from(
					this.input,
					keywordStart + keyword.length,
				);
				if (continuationStart === -1) return false;
				for (const continuation of continuations) {
					if (continuation.length === 1 && this.input[continuationStart] === continuation) {
						return true;
					}
					if (
						this.input.slice(continuationStart, continuationStart + continuation.length) ===
							continuation &&
						!this.#isIdentifierChar(this.input.charCodeAt(continuationStart + continuation.length))
					) {
						return true;
					}
				}
				return false;
			}

			/**
			 * @returns {'case' | 'default' | null}
			 */
			#eatJSXSwitchCaseClauseKeyword() {
				if (this.#eatJSXDirectiveClauseKeyword('case')) {
					return 'case';
				}
				if (this.#eatJSXDirectiveClauseKeyword('default')) {
					return 'default';
				}
				return null;
			}

			#parseTemplateControlFlowStatement() {
				if (this.type !== tt.braceL) {
					this.raise(this.start, 'Expected `{` after JSX control-flow directive.');
				}
				return this.#parseTemplateControlFlowBlock();
			}

			#parseTemplateIfStatement() {
				const node = /** @type {AST.IfStatement} */ (this.startNode());
				const previous_reading_header = this.#readingJSXControlFlowHeader;
				this.#readingJSXControlFlowHeader = true;
				try {
					this.next();
					node.test = this.parseParenExpression();
				} finally {
					this.#readingJSXControlFlowHeader = previous_reading_header;
				}
				node.consequent = /** @type {AST.Statement} */ (this.#parseTemplateControlFlowStatement());
				node.alternate = null;

				if (this.#eatJSXDirectiveClauseKeyword('else')) {
					node.alternateKeyword = this.#lastClauseKeywordSpan;
					node.alternate = this.#eatJSXDirectiveBareClauseKeyword('if')
						? this.#parseTemplateIfStatement()
						: /** @type {AST.Statement} */ (this.#parseTemplateControlFlowStatement());
				} else if (this.#isUnprefixedDirectiveClauseContinuation('else', ['{', 'if'])) {
					this.raise(this.start, 'Expected `@else` after `@if` block.');
				}

				return this.finishNode(node, 'IfStatement');
			}

			/**
			 * @param {number} start
			 * @param {AST.Position} startLoc
			 */
			#parseJSXSwitchExpression(start, startLoc) {
				const node = /** @type {AST.SwitchStatement} */ (this.startNodeAt(start, startLoc));
				const previous_reading_header = this.#readingJSXControlFlowHeader;
				this.#readingJSXControlFlowHeader = true;
				try {
					this.next();
					node.discriminant = this.parseParenExpression();
				} finally {
					this.#readingJSXControlFlowHeader = previous_reading_header;
				}
				node.cases = [];
				this.expect(tt.braceL);
				this.labels.push({ kind: 'switch' });
				this.enterScope(0);

				let sawDefault = false;
				while (this.type !== tt.braceR) {
					if (this.type === tstt.jsxText && this.#rewindToSwitchCaseLabel()) {
						continue;
					}

					const clauseStart = this.start;
					const clauseStartLoc = this.startLoc;
					const clause = this.#eatJSXSwitchCaseClauseKeyword();
					if (clause) {
						const isCase = clause === 'case';
						const current = /** @type {AST.SwitchCase} */ (
							this.startNodeAt(clauseStart, clauseStartLoc)
						);
						current.consequent = [];
						// `@case`/`@default` is the arm's only authored keyword; the node
						// itself starts before the leading whitespace.
						current.keyword = this.#lastClauseKeywordSpan;
						const previous_reading_header = this.#readingJSXControlFlowHeader;
						this.#readingJSXControlFlowHeader = true;
						try {
							if (isCase) {
								current.test = this.parseExpression();
							} else {
								if (sawDefault) {
									this.raiseRecoverable(this.lastTokStart, 'Multiple default clauses');
								}
								sawDefault = true;
								current.test = null;
							}
							this.expect(tt.colon);
						} finally {
							this.#readingJSXControlFlowHeader = previous_reading_header;
						}
						// Like an `@if` body, the arm's `{ }` is code: hide the enclosing
						// template from `#path` while its tokens are read, so a `/` reads as
						// a regex or division and a `#` as a private name instead of template
						// text. Render nodes re-establish their own path via `parseElement`.
						const enclosing_path = this.#path;
						this.#path = [];
						try {
							this.expect(tt.braceL);
							// Each arm's braces are its own template block, so setup locals
							// in separate arms may share names, like `@if`/`@else` branches.
							this.enterScope(0);
							// Stop at the end of the input too, like a code block body, so an
							// unterminated arm reaches the `expect(tt.braceR)` below and reports
							// the missing `}` instead of reading nothing forever.
							while (this.type !== tt.braceR && this.type !== tt.eof) {
								this.#parseJSXSwitchCaseConsequent(current.consequent);
							}
							this.exitScope();
						} finally {
							this.#path = enclosing_path;
						}
						this.expect(tt.braceR);
						node.cases.push(this.finishNode(current, 'SwitchCase'));
						continue;
					}

					if (this.type === tt.eof) {
						this.#raiseClosingBraceExpected();
					}
					this.unexpected();
				}

				this.exitScope();
				this.next();
				this.labels.pop();
				return this.#finishJSXControlFlowExpression(
					this.finishNode(node, 'SwitchStatement'),
					'JSXSwitchExpression',
					start,
					startLoc,
				);
			}

			/**
			 * @param {AST.Node[]} consequent
			 * @this {TSRXParser & Parse.Parser}
			 */
			#parseJSXSwitchCaseConsequent(consequent) {
				if (this.type === tt.braceL) {
					consequent.push(this.#parseNativeTemplateExpressionContainer());
					return;
				}

				// A non-whitespace, non-directive case consequent that the tokenizer read
				// as raw text is a setup statement (in the new design bare text must be
				// wrapped in `<>`, so anything left here is code, e.g.
				// `props.status satisfies never`, `doThing()`, `x = 1`). Re-tokenize it as
				// JS and parse it as a statement instead of treating it as text.
				if (
					this.type === tstt.jsxText &&
					String(this.value ?? '').trim() !== '' &&
					!this.#isJSXControlFlowDirectiveStart() &&
					this.#switchCaseLabelStart(this.start) === -1
				) {
					const raw = String(this.value ?? '').trimStart();
					if (/^break\b/.test(raw)) {
						this.raise(this.start, '`break` is invalid inside `@switch` cases.');
					}
					if (/^return\b/.test(raw)) {
						this.raise(this.start, '`return` is invalid inside `@switch` cases.');
					}
					this.#filterTemplateScriptContexts();
					this.pos = this.start;
					this.startLoc = this.curPosition();
					if (this.curContext() !== b_stat) {
						this.context.push(b_stat);
					}
					this.exprAllowed = true;
					this.#parsingJSXSwitchCaseScriptStatementDepth++;
					try {
						this.#suppressTemplateRawTextToken = true;
						this.next();
						consequent.push(this.parseStatement(null));
					} finally {
						this.#parsingJSXSwitchCaseScriptStatementDepth--;
					}
					return;
				}

				if (this.type === tstt.jsxText) {
					const text = this.#parseJSXSwitchCaseRawText();
					if (!isWhitespaceTextNode(text)) {
						consequent.push(text);
					}
					return;
				}

				if (
					this.type === tstt.jsxTagStart ||
					this.input.charCodeAt(this.start) === CharCode.lessThan
				) {
					const startPos = this.start;
					const startLoc = this.startLoc;
					if (this.type === tstt.jsxTagStart) {
						this.next();
					} else {
						this.pos = startPos + 1;
						this.type = tstt.jsxTagStart;
						this.start = startPos;
						this.startLoc = startLoc;
						this.exprAllowed = false;
						this.next();
					}
					if (this.value === '/' || this.type === tt.slash) {
						this.unexpected();
					}
					const node = this.parseElement();
					if (!node) {
						this.unexpected();
					}
					consequent.push(node);
					return;
				}

				if (this.#isJSXControlFlowDirectiveStart()) {
					consequent.push(this.#parseJSXControlFlowExpression());
					return;
				}

				if (this.#isSwitchCaseScriptStatementStart()) {
					this.#parsingJSXSwitchCaseScriptStatementDepth++;
					try {
						consequent.push(this.parseStatement(null));
					} finally {
						this.#parsingJSXSwitchCaseScriptStatementDepth--;
					}
					return;
				}

				const label = this.type.keyword || this.type.label;
				if (label === 'break') {
					this.raise(this.start, '`break` is invalid inside `@switch` cases.');
				}
				if (label === 'return') {
					this.raise(this.start, '`return` is invalid inside `@switch` cases.');
				}
				if (label === 'continue' || label === 'throw') {
					consequent.push(this.parseStatement(null));
					return;
				}

				// Anything else here is JS read as ordinary tokens (e.g.
				// `props.status satisfies never`, `doThing()`): a setup statement, not text
				// (bare text in a case must be wrapped in `<>`, and text tokens returned
				// above). The arm loop stops at the end of the input, and `parseStatement`
				// rejects it, so this call always moves forward or throws. Clear the
				// JSX/template token contexts so the statement and the following
				// `}`/`case` tokenize as code.
				this.#filterTemplateScriptContexts();
				// The statement's first token is already read. A template literal's
				// backtick or an opening paren pushed its own context, which must stay
				// on top, or the rest of the template reads as code and the closing
				// paren pops the statement context instead.
				const token_context =
					this.type === tt.backQuote || this.type === tt.parenL ? this.#popContext() : undefined;
				if (this.curContext() !== b_stat) {
					this.context.push(b_stat);
				}
				if (token_context) {
					this.context.push(token_context);
				}
				this.#parsingJSXSwitchCaseScriptStatementDepth++;
				try {
					consequent.push(this.parseStatement(null));
				} finally {
					this.#parsingJSXSwitchCaseScriptStatementDepth--;
				}
			}

			/**
			 * @param {ESTreeJSX.TSRXJSXOpeningElement} openingElement
			 * @returns {ESTreeJSX.JSXOpeningFragment}
			 */
			#toOpeningFragment(openingElement) {
				const element = /** @type {Partial<ESTreeJSX.TSRXJSXOpeningElement>} */ (openingElement);
				delete element.name;
				delete element.attributes;
				delete element.selfClosing;
				const openingFragment = /** @type {ESTreeJSX.JSXOpeningFragment} */ (
					/** @type {unknown} */ (openingElement)
				);
				openingFragment.type = 'JSXOpeningFragment';
				return openingFragment;
			}

			/**
			 * @param {ESTreeJSX.TSRXJSXClosingElement} closingElement
			 * @returns {ESTreeJSX.JSXClosingFragment}
			 */
			#toClosingFragment(closingElement) {
				delete (/** @type {Partial<ESTreeJSX.TSRXJSXClosingElement>} */ (closingElement).name);
				const closingFragment = /** @type {ESTreeJSX.JSXClosingFragment} */ (
					/** @type {unknown} */ (closingElement)
				);
				closingFragment.type = 'JSXClosingFragment';
				return closingFragment;
			}

			/**
			 * Read a raw-text element body: capture everything between the opening `>`
			 * and the literal `</tagName>` verbatim (never as template markup),
			 * synthesize the closing element, and restore the tokenizer state past it.
			 * Shared by `<style>` and `<script>`.
			 *
			 * Without a closing tag the element is unclosed and the rest of the input
			 * is its body, except that in loose mode inside a template the body stops
			 * at the next tag start (`<x`, `</x>`, `</>`): while `<style>` is being
			 * typed, partial CSS reaches the loose CSS parser, and the tokenizer
			 * resumes at the following sibling or closing tag so the rest of the file
			 * keeps its mappings. Outside a template only JS follows, with no marker to
			 * resume at, so the body runs to the end of the input.
			 *
			 * @param {ESTreeJSX.TSRXJSXOpeningElement & AST.NodeWithLocation} open
			 * @param {AST.JSXStyleElement | AST.TSRXJSXElement} node
			 * @param {'style' | 'script'} tagName
			 * @param {number} [contextDepth] tokenizer context depth to restore before
			 *   reading the token after the closing tag when the element sits outside
			 *   a template (see parseElement)
			 * @returns {string} The raw body text
			 */
			#parseRawTextElement(open, node, tagName, contextDepth) {
				const closeTag = `</${tagName}>`;
				const contentStart = open.end;
				const input = this.input.slice(contentStart);
				const parent = this.#path.at(-2);
				const insideTemplate = this.#isNativeTemplateNode(parent);
				let relativeCloseStart = input.indexOf(closeTag);
				const unclosed = relativeCloseStart === -1;

				if (unclosed) {
					this.#report_broken_markup_error(
						open.end,
						`Unclosed tag '<${tagName}>'. Expected '${closeTag}' before end of template.`,
					);
					node.unclosed = true;
					relativeCloseStart = input.length;
					if (!this.#loose) {
						const newLines = input.match(regex_newline_characters)?.length;
						if (newLines) {
							this.curLine = open.loc.end.line + newLines;
							this.lineStart = contentStart + input.lastIndexOf('\n') + 1;
						}
						return input;
					}
					if (insideTemplate) {
						// A `<` inside CSS text (`content: "<"`, `<!--`) is not a tag start.
						let lt = input.indexOf('<');
						while (lt !== -1 && !can_start_tag_after_lt(input, lt)) {
							lt = input.indexOf('<', lt + 1);
						}
						if (lt !== -1) relativeCloseStart = lt;
					}
				}

				const content = input.slice(0, relativeCloseStart);
				const newLines = content.match(regex_newline_characters)?.length;
				if (newLines) {
					this.curLine = open.loc.end.line + newLines;
					this.lineStart = contentStart + content.lastIndexOf('\n') + 1;
				}

				const closingStart = contentStart + content.length;
				let closingEnd = closingStart;
				if (!unclosed) {
					const closingLineInfo = get_line_info(this, closingStart);
					const closingStartLoc = new acorn.Position(closingLineInfo.line, closingLineInfo.column);
					const nameStart = closingStart + 2;
					const nameEnd = nameStart + tagName.length;
					const nameStartInfo = get_line_info(this, nameStart);
					const nameEndInfo = get_line_info(this, nameEnd);
					const name = /** @type {ESTreeJSX.JSXIdentifier} */ (
						this.startNodeAt(
							nameStart,
							new acorn.Position(nameStartInfo.line, nameStartInfo.column),
						)
					);
					name.name = tagName;
					this.finishNodeAt(
						name,
						'JSXIdentifier',
						nameEnd,
						new acorn.Position(nameEndInfo.line, nameEndInfo.column),
					);
					closingEnd = closingStart + closeTag.length;
					const closingEndInfo = get_line_info(this, closingEnd);
					const closingElement =
						/** @type {ESTreeJSX.TSRXJSXClosingElement & AST.NodeWithLocation} */ (
							this.startNodeAt(closingStart, closingStartLoc)
						);
					closingElement.name = name;
					this.finishNodeAt(
						closingElement,
						'JSXClosingElement',
						closingEnd,
						new acorn.Position(closingEndInfo.line, closingEndInfo.column),
					);
					node.closingElement = closingElement;
				}

				if (this.curContext() === tstc.tc_expr && !insideTemplate) {
					this.#popContext();
				}
				this.exprAllowed = false;
				this.pos = closingEnd;
				const closingEndInfo = get_line_info(this, closingEnd);
				this.curLine = closingEndInfo.line;
				this.lineStart = closingEnd - closingEndInfo.column;
				// The current token is still the first one read after the opening tag,
				// inside the raw body. `next()` below records it as the last token, and
				// nodes that finish after this element (the declarator and declaration
				// of `const theme = <style>…</style>`) end at the last token's end, so
				// make the closing tag the current token first.
				const closingStartInfo = get_line_info(this, closingStart);
				this.start = closingStart;
				this.startLoc = new acorn.Position(closingStartInfo.line, closingStartInfo.column);
				this.end = closingEnd;
				this.endLoc = new acorn.Position(closingEndInfo.line, closingEndInfo.column);
				if (insideTemplate && relativeCloseStart === 0) {
					// Acorn has already tokenized the adjacent tag start (this element's
					// closing tag, or, when unclosed, the next sibling or parent close);
					// the element resumes there manually, so drop the stale tag context.
					if (this.curContext() === tstc.tc_oTag) {
						this.#popContext();
					}
					if (this.curContext() === tstc.tc_expr) {
						this.#popContext();
					}
				}
				if (insideTemplate && this.curContext() === tstc.tc_expr) {
					// This element's own children context, pushed by its opening tag. Its
					// closing tag is never tokenized, so nothing else pops it.
					this.#popContext();
				}
				if (!insideTemplate && this.#path.at(-1) === node) {
					// Outside a template (a `@{ … }` body, a `@case` body, a statement),
					// the element must leave the tokenizer context exactly where it
					// began — like a balanced element does after its closing tag — so
					// the following `}`, `@case`, or sibling tokenizes as code, not as
					// JSX text of a children context this element's `<` opened.
					if (contextDepth !== undefined) {
						this.#truncateContext(contextDepth);
					}
					this.#path.pop();
					try {
						this.next();
					} finally {
						this.#path.push(node);
					}
				} else {
					this.next();
				}

				return content;
			}

			/**
			 * Whether the first non-whitespace character after an opening tag is
			 * `{`: the element's children start with an expression container.
			 *
			 * @param {ESTreeJSX.TSRXJSXOpeningElement & AST.NodeWithLocation} open
			 * @returns {boolean}
			 */
			#hasExpressionChildStart(open) {
				if (open.selfClosing) return false;
				const index = skip_whitespace_from(this.input, open.end);
				return this.input.charCodeAt(index) === CharCode.openBrace;
			}

			/**
			 * @param {ESTreeJSX.TSRXJSXOpeningElement & AST.NodeWithLocation} open
			 * @param {AST.JSXStyleElement} node
			 * @param {boolean} insideHead
			 * @param {number} [contextDepth] see #parseRawTextElement
			 */
			#parseStyleElement(open, node, insideHead, contextDepth) {
				const filename = this.#filename;
				if (!filename) {
					throw new Error(
						'<style> elements require a filename: pass one to parse so style scope hashes are unique per file.',
					);
				}
				const content = this.#parseRawTextElement(open, node, 'style', contextDepth);
				const bodyLoc = get_line_info(this, open.end);
				const parsedCss = parse_style(
					content,
					{
						filename,
						line: open.loc.start.line,
						column: open.loc.start.column,
						body: { start: open.end, line: bodyLoc.line, column: bodyLoc.column },
					},
					{ loose: this.#loose },
				);

				if (!insideHead) {
					node.metadata.styleScopeHash = parsedCss.hash;
				}

				node.css = content;
				node.children = [parsedCss];
			}

			/**
			 * Parse a `<script>` element as a raw-text element, exactly like `<style>`:
			 * the body is captured verbatim as `node.content`, letting authors write real
			 * JS/TS (with `<`, `{`, `}`) and letting the editor treat the body as an
			 * embedded TypeScript/JavaScript document.
			 *
			 * Mirroring `JSXStyleElement` (raw `css` string + parsed children), the body
			 * is exposed twice: verbatim on `content`, and as a single `JSXText` child so
			 * generic element paths (factory targets, static hoisting, printers) emit the
			 * body without knowing about raw-text elements. Consumers that handle
			 * `content` directly (target transforms, the Prettier plugin) must skip
			 * the children instead of emitting both.
			 *
			 * @param {ESTreeJSX.TSRXJSXOpeningElement & AST.NodeWithLocation} open
			 * @param {AST.TSRXJSXElement} node
			 * @param {number} [contextDepth] see #parseRawTextElement
			 */
			#parseScriptElement(open, node, contextDepth) {
				const content = this.#parseRawTextElement(open, node, 'script', contextDepth);
				node.content = content;
				node.children = [];

				if (content.length > 0) {
					const bodyStartInfo = get_line_info(this, open.end);
					const text = /** @type {ESTreeJSX.JSXText} */ (
						this.startNodeAt(open.end, new acorn.Position(bodyStartInfo.line, bodyStartInfo.column))
					);
					text.value = content;
					text.raw = content;
					const bodyEnd = open.end + content.length;
					const bodyEndInfo = get_line_info(this, bodyEnd);
					this.finishNodeAt(
						text,
						'JSXText',
						bodyEnd,
						new acorn.Position(bodyEndInfo.line, bodyEndInfo.column),
					);
					node.children = [/** @type {AST.Node} */ (text)];
				}
			}

			#parseNativeTemplateExpressionContainer() {
				const allow_trailing_semicolon = this.#allowExpressionContainerTrailingSemicolon;
				this.#allowExpressionContainerTrailingSemicolon = true;
				// One-shot: marks this as a template *child* container (not an attribute
				// value or script-mode JSX child), so `jsx_parseExpressionContainer`
				// consumes the closing `}` after leaving container scope.
				this.#consumeContainerBraceAfterScope = true;
				let node;
				try {
					node = this.jsx_parseExpressionContainer();
				} finally {
					this.#allowExpressionContainerTrailingSemicolon = allow_trailing_semicolon;
					this.#consumeContainerBraceAfterScope = false;
				}
				return /** @type {ESTreeJSX.JSXExpressionContainer} */ (/** @type {unknown} */ (node));
			}

			#popTemplateTokenContextBeforeExpressionChild() {
				let index = this.pos;
				let has_newline = false;

				// JSXText-only template fragments can leave the tokenizer in JSX text mode.
				// Only unwind it for ASI before a following TSRX `{expr}` child;
				// fragment props like `content={<></>}` still need the JSX context.
				while (index < this.input.length) {
					const ch = this.input.charCodeAt(index);
					if (ch === CharCode.space || ch === CharCode.tab) {
						index++;
					} else if (ch === CharCode.lineFeed || ch === CharCode.carriageReturn) {
						has_newline = true;
						index++;
					} else if (
						ch === CharCode.slash &&
						this.input.charCodeAt(index + 1) === CharCode.asterisk
					) {
						const end = this.input.indexOf('*/', index + 2);
						const comment_end = end === -1 ? this.input.length : end + 2;
						if (this.input.slice(index, comment_end).match(regex_newline_characters)) {
							has_newline = true;
						}
						index = comment_end;
					} else if (ch === CharCode.slash && this.input.charCodeAt(index + 1) === CharCode.slash) {
						has_newline = true;
						index += 2;
						while (index < this.input.length) {
							const comment_ch = this.input.charCodeAt(index);
							if (comment_ch === CharCode.lineFeed || comment_ch === CharCode.carriageReturn) break;
							index++;
						}
					} else {
						break;
					}
				}

				if (!has_newline || this.input.charCodeAt(index) !== CharCode.openBrace) {
					return;
				}

				const context_index = this.context.lastIndexOf(tstc.tc_expr);
				if (context_index !== -1) {
					this.#truncateContext(context_index);
				}
			}

			#popTemplateLiteralTokenContext() {
				while (this.curContext()?.token === '`') {
					this.#popContext();
				}
			}

			/**
			 * Pop the token context stack's top. acorn-typescript parses some
			 * values speculatively (a `<` in `parseMaybeAssign` first tries an
			 * element), recording what the parse changes so that a failed attempt
			 * can be undone. It treats the stack as append-only unless a shortening
			 * goes through `parseEffects`, and a failed attempt that finds the stack
			 * shorter than it recorded throws its own error in place of the syntax
			 * error. Outside an attempt, this is a plain pop.
			 * @returns {Parse.Parser['context'][number] | undefined}
			 */
			#popContext() {
				return this.parseEffects ? this.parseEffects.pop(this.context) : this.context.pop();
			}

			/**
			 * Shorten the token context stack to `length`, if it is longer, as
			 * `#popContext` does.
			 * @param {number} length
			 */
			#truncateContext(length) {
				if (length >= this.context.length) return;
				if (this.parseEffects) {
					this.parseEffects.truncate(this.context, length);
				} else {
					this.context.length = length;
				}
			}

			/**
			 * How many contexts the current token's own `updateContext` pushed on top
			 * of the stack: two for a tag start (`tc_expr` and `tc_oTag`), one for
			 * `(`, `{`, `${`, `function`, `class`, and an opening backquote. Code that
			 * resets the stack after this token was read keeps these on top.
			 */
			#currentTokenContextCount() {
				if (this.type === tstt.jsxTagStart) return 2;
				if (
					this.type === tt.parenL ||
					this.type === tt.braceL ||
					this.type === tt.dollarBraceL ||
					this.type === tt._function ||
					this.type === tt._class
				) {
					return 1;
				}
				// A closing backquote pops the template's context instead.
				if (this.type === tt.backQuote && this.curContext() === q_tmpl) return 1;
				return 0;
			}

			/**
			 * @param {number} index
			 * @returns {number}
			 */
			#skipWhitespaceAndComments(index) {
				while (index < this.input.length) {
					const ch = this.input.charCodeAt(index);
					if (
						ch === CharCode.space ||
						ch === CharCode.tab ||
						ch === CharCode.lineFeed ||
						ch === CharCode.carriageReturn
					) {
						index++;
					} else if (
						ch === CharCode.slash &&
						this.input.charCodeAt(index + 1) === CharCode.asterisk
					) {
						const end = this.input.indexOf('*/', index + 2);
						index = end === -1 ? this.input.length : end + 2;
					} else if (ch === CharCode.slash && this.input.charCodeAt(index + 1) === CharCode.slash) {
						index += 2;
						while (index < this.input.length) {
							const comment_ch = this.input.charCodeAt(index);
							if (comment_ch === CharCode.lineFeed || comment_ch === CharCode.carriageReturn) break;
							index++;
						}
					} else {
						break;
					}
				}
				return index;
			}

			/** @returns {number} */
			#countFollowingRightBraces() {
				let index = this.end;
				let count = 0;
				while (index < this.input.length) {
					index = this.#skipWhitespaceAndComments(index);
					if (this.input.charCodeAt(index) !== CharCode.closeBrace) break;
					count++;
					index++;
				}
				return count;
			}

			/**
			 * @param {ESTreeJSX.JSXElement | ESTreeJSX.JSXFragment} node
			 * @returns {boolean}
			 */
			#hasDirectStatementChild(node) {
				const children = /** @type {AST.Node[]} */ (/** @type {unknown} */ (node.children ?? []));
				return children.some(
					(child) => child.type.endsWith('Statement') || child.type === 'VariableDeclaration',
				);
			}

			/**
			 * @param {ESTreeJSX.JSXElement | ESTreeJSX.JSXFragment} node
			 * @param {number} enclosing_context_depth
			 */
			#popTokenContextsAfterTemplateExpressionElement(node, enclosing_context_depth) {
				// The token after the element (`;`, `:`, `,`, `return`, …) is already
				// read, and its own context update set `exprAllowed` for the token after
				// it.
				const ctx = this.context;
				const ci = ctx.length - 1;
				const top = ctx[ci];
				const second = ctx[ci - 1];

				// Expression-bodied templates (no statement child) followed by `,`
				// in an object/array literal need surgical fixups; statement-bodied
				// templates fall through to the JSX-expression-container strip.
				const has_stmt_child = this.#hasDirectStatementChild(node);
				if (this.type === tt.comma && !has_stmt_child) {
					// Tail `..., (b_expr)+, tc_expr, b_stat`: the JSX expression
					// container leaks an extra `tc_expr, b_stat`. Pop them, and if
					// the JSX container also closes immediately (`}}` ahead), drop
					// one of the doubled-up `b_expr` contexts too.
					if (top === b_stat && second === tstc.tc_expr) {
						let expr_count = 0;
						for (let i = ci - 2; ctx[i] === b_expr; i--) expr_count++;
						const following_braces = this.#countFollowingRightBraces();
						if (expr_count === 2 || following_braces > 1) {
							if (following_braces > 1 && expr_count > 1) {
								ctx.splice(ci - 2, expr_count - 1);
								ctx.pop();
								this.exprAllowed = false;
								return;
							}
							if (expr_count === 2 && following_braces === 0) {
								// Fragment expression value followed by another
								// object/array entry inside a JSX expression
								// container (`{ a: <></>, b: ... }` or
								// `[<></>, ...]`): strip both the leaked tc_expr
								// and b_stat so the next entry parses as an
								// expression, and leave exprAllowed alone so a
								// following `<` still tokenizes as jsxTagStart.
								ctx.length = ci - 1;
								return;
							}
							ctx.pop();
							this.exprAllowed = false;
							return;
						}
					}
					// Tail `..., b_expr, b_expr` for fragments-with-children
					// inside an array or object literal: re-arm expression mode
					// so the next item parses as an expression value, not a JSX
					// child. If the surrounding b_expr chain has already been
					// consumed, push one back so the subsequent item still has
					// a literal context. Leave exprAllowed alone so a following
					// `<` still tokenizes as jsxTagStart.
					if (top === b_expr && second === b_expr) {
						if (ctx[ci - 2] !== b_expr && ctx[ci - 2] !== tstc.tc_oTag) {
							ctx.push(b_expr);
						}
						return;
					}
				}

				// Inside a native template JSX expression container — strip
				// both the leaked `b_stat` and the container's `tc_expr`.
				if (top === b_stat && second === tstc.tc_expr) {
					ctx.length = ci - 1;
					return;
				}
				// Statement-bodied native template attributes can leave the attribute's
				// expression contexts above the still-open JSX tag context. Strip
				// those so a following `/>` stays in JSX opening-tag mode. Once the
				// stack has unwound below the enclosing expression's depth the same
				// tail shape means something else: the `}` closed an inner child
				// container (its own brace context already popped) and the tc_expr
				// belongs to a still-open element between the attribute brace and
				// this one — stripping would drop the attribute container's brace.
				if (
					this.type === tt.braceR &&
					ctx.length >= enclosing_context_depth &&
					top === tstc.tc_expr &&
					second === b_expr &&
					ctx[ci - 2] === tstc.tc_oTag
				) {
					ctx.length = ci - 1;
					return;
				}
				// Closing token after the template at expression position. For `}`
				// only pop if it actually closes this `b_expr` — otherwise the
				// brace targets an inner callback/object body that should pop it
				// naturally on the next token step. Only compensate while the stack
				// has not unwound below the enclosing expression's depth: a balanced
				// element leaves the stack at that depth and the closing token's own
				// `updateContext` then pops its real opener (going one below), so a
				// remaining `(`/`[`/b_expr on top belongs to a still-open outer
				// group — popping it would make the group's own closer pop the
				// context underneath it (e.g. an attribute container's brace).
				if (
					ctx.length >= enclosing_context_depth &&
					((this.type === tt.braceR &&
						top === b_expr &&
						(this.#countFollowingRightBraces() === 0 || second === b_expr)) ||
						(this.type === tt.parenR && top?.token === '(') ||
						(this.type === tt.bracketR && top?.token === '['))
				) {
					ctx.pop();
					this.exprAllowed = false;
				}
			}

			/**
			 * @param {number} position
			 * @param {number} end
			 * @param {string} message
			 * @param {string} [code]
			 */
			#report_recoverable_error_range(position, end, message, code) {
				const start = Math.max(0, Math.min(position, this.input.length));
				const range_end = Math.max(start, Math.min(end, this.input.length));
				const start_loc = get_line_info(this, start);
				const end_loc = get_line_info(this, range_end);

				error(
					message,
					this.#filename,
					/** @type {AST.NodeWithLocation} */ ({
						start,
						end: range_end,
						loc: {
							start: start_loc,
							end: end_loc,
						},
					}),
					this.#collect ? this.#errors : undefined,
					undefined,
					code,
				);
			}

			/**
			 * @param {number} position
			 * @param {string} message
			 * @param {string} [code]
			 */
			#report_recoverable_error(position, message, code) {
				this.#report_recoverable_error_range(position, position + 1, message, code);
			}

			/**
			 * @param {number} position
			 * @param {string} message
			 * @param {string} [code]
			 */
			#report_broken_markup_error(position, message, code = DIAGNOSTIC_CODES.UNCLOSED_TAG) {
				if (this.#loose) return;
				if (this.#collect) {
					this.#report_recoverable_error(position, message, code);
					return;
				}
				this.raise(position, message);
			}

			/**
			 * @param {AST.Node | AST.Node[] | unknown} maybe_node
			 * @param {boolean} [inside_nested_function]
			 * @param {boolean} [inside_loop]
			 */
			#report_invalid_template_return_statements(
				maybe_node,
				inside_nested_function = false,
				inside_loop = false,
			) {
				if (!maybe_node || typeof maybe_node !== 'object') {
					return;
				}

				let node = /** @type {AST.Node} */ (maybe_node);
				if (
					node.type === 'FunctionDeclaration' ||
					node.type === 'FunctionExpression' ||
					node.type === 'ArrowFunctionExpression'
				) {
					inside_nested_function = true;
				}

				if (
					node.type === 'ForStatement' ||
					node.type === 'ForInStatement' ||
					node.type === 'ForOfStatement' ||
					node.type === 'WhileStatement' ||
					node.type === 'DoWhileStatement'
				) {
					inside_loop = true;
				}

				if (!inside_nested_function && !inside_loop && node.type === 'ReturnStatement') {
					node.metadata = {
						...node.metadata,
						invalid_tsrx_template_return: true,
					};
					this.#report_recoverable_error_range(
						/** @type {AST.NodeWithLocation} */ (node).start ?? this.start,
						/** @type {AST.NodeWithLocation} */ (node).end ?? this.start + 1,
						TSRX_RETURN_STATEMENT_ERROR,
						DIAGNOSTIC_CODES.TEMPLATE_RETURN_STATEMENT,
					);
					return;
				}

				if (Array.isArray(node)) {
					for (const child of /** @type {AST.Node[]} */ (node)) {
						this.#report_invalid_template_return_statements(
							child,
							inside_nested_function,
							inside_loop,
						);
					}
					return;
				}

				for (const key of Object.keys(node)) {
					if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') {
						continue;
					}
					this.#report_invalid_template_return_statements(
						/** @type {Record<string, unknown>} */ (node)[key],
						inside_nested_function,
						inside_loop,
					);
				}
			}

			/**
			 * When collecting, record a checker-level error (`CHECKER_LEVEL_ERRORS`) and
			 * keep parsing, so editor tooling and the formatter still get an AST.
			 * @param {number} position
			 * @param {string | ((values: { modifier: string }) => string)} message
			 * @returns {never}
			 */
			raise(position, message) {
				if (typeof message === 'function') {
					// UPSTREAM(sveltejs/acorn-typescript#123): remove once a release includes
					// the fix. `tsParseModifiers` raises a disallowed modifier's error with
					// the error template itself, which would make the function's source
					// the message, at the token after the modifier. It is the only raise
					// site that passes a template; the modifier is the token just read.
					message = message({
						modifier: this.input.slice(this.lastTokStart, this.lastTokEnd),
					});
					position = this.lastTokStart;
				} else if (regex_repeated_modifier_error.test(message)) {
					// UPSTREAM(sveltejs/acorn-typescript#129): remove once a release includes
					// the fix. `tsParseModifiers` raises a repeated modifier's error at the
					// token after it, collected or thrown; the modifier is the token just
					// read.
					position = this.lastTokStart;
				} else if (message === UNEXPECTED_PARAMETER_MODIFIER) {
					// UPSTREAM(sveltejs/acorn-typescript#136): remove once a release includes
					// the fix. `parseAssignableListItem` raises it at the first modifier's
					// column, where `#parseAssignableListItem` started reading.
					position = this.#assignableListItemStart;
				} else if (message === 'Escape sequence in keyword asserts') {
					// UPSTREAM(sveltejs/acorn-typescript#147): remove once a release
					// includes the fix. acorn-typescript's wording of TypeScript's TS1260 for
					// an escaped `asserts` in a type predicate, the only escaped TypeScript
					// keyword it reports.
					message = KEYWORD_ESCAPE;
				} else if (
					message === UNEXPECTED_LEADING_DECORATOR &&
					this.#dropLeadingDecorators(position)
				) {
					// See `parseDecorators`.
					return /** @type {never} */ (undefined);
				}
				if (this.#collectCheckerLevelError(position, message)) {
					// The raise site goes on parsing (see `CHECKER_LEVEL_ERRORS`).
					return /** @type {never} */ (undefined);
				}
				return super.raise(position, message);
			}

			/**
			 * @param {number} position
			 * @param {string | { message?: string }} message
			 */
			raiseRecoverable(position, message) {
				if (this.#collectCheckerLevelError(position, message)) {
					return;
				}
				const error_message = get_error_message(message);
				if (
					error_message.includes('has already been declared') ||
					error_message === 'Argument name clash'
				) {
					// A strict parse throws these as a `CompileError`, without acorn's
					// location suffix.
					this.#report_recoverable_error(position, error_message);
					return;
				}
				return super.raiseRecoverable(position, error_message);
			}

			/**
			 * Record `message` in `errors` when collecting and it is a checker-level
			 * error (`CHECKER_LEVEL_ERRORS`).
			 * @param {number} position
			 * @param {string | { message?: string }} message
			 * @returns {boolean} Whether the error was recorded, and parsing goes on
			 */
			#collectCheckerLevelError(position, message) {
				if (!this.#collect) return false;
				const error_message = get_error_message(message);
				if (!is_checker_level_error(error_message)) return false;

				if (error_message === REST_ELEMENT_TRAILING_COMMA && this.type === tt.comma) {
					// acorn raises this at the comma, then expects the list to close. Skip a
					// trailing comma, as acorn-typescript does in ambient contexts (where
					// it's allowed after a rest parameter); a comma that another element
					// follows is still an error.
					if (this.#isAmbientRestParameterTrailingComma()) return false;
					const next = this.lookaheadCharCode();
					if (
						next !== CharCode.closeParen &&
						next !== CharCode.closeBracket &&
						next !== CharCode.closeBrace
					) {
						return false;
					}
					this.#recordCheckerLevelError(position, position + 1, error_message);
					this.next();
					return true;
				}

				if (
					regex_let_binding_error.test(error_message) &&
					this.#errors?.some((error) => error.pos === position)
				) {
					// acorn reports `let` as a binding name or an assignment target up to
					// three times: as a reserved word, as a name that strict code can't
					// bind or assign, and as the name of a `let` or `const` declaration.
					// Record the first.
					return true;
				}

				if (regex_modifier_order_error.test(error_message)) {
					// UPSTREAM(sveltejs/acorn-typescript#122): `tsParseModifiers` passes the
					// modifier's column as the position; remove once a release includes the
					// fix. The modifier is the token just read.
					position = this.lastTokStart;
				}

				this.#recordCheckerLevelError(position, position + 1, error_message);
				return true;
			}

			/**
			 * Whether the current token is a comma between a rest parameter and `)` in
			 * an ambient context, which TypeScript allows and acorn-typescript skips.
			 */
			#isAmbientRestParameterTrailingComma() {
				return (
					this.isAmbientContext &&
					this.type === tt.comma &&
					this.lookaheadCharCode() === CharCode.closeParen
				);
			}

			/**
			 * Record a checker-level error once: acorn checks an assignment target
			 * both when converting it and when validating it. An error recorded while
			 * acorn-typescript tries a parse that it then abandons is dropped with the
			 * rest of that parse's effects.
			 * @param {number} start
			 * @param {number} end
			 * @param {string} message
			 */
			#recordCheckerLevelError(start, end, message) {
				if (this.#errors) {
					if (this.#errors.some((error) => error.pos === start && error.message === message)) {
						return;
					}
					this.parseEffects?.willAppend(this.#errors);
				}
				this.#report_recoverable_error_range(start, end, message);
			}

			/**
			 * When collecting, private-field checks are off (see the constructor):
			 * record a private name outside any class, which acorn would raise.
			 * @type {Parse.Parser['parsePrivateIdent']}
			 */
			parsePrivateIdent() {
				const node = super.parsePrivateIdent();
				if (this.#collect && this.privateNameStack.length === 0) {
					this.#recordCheckerLevelError(
						/** @type {number} */ (node.start),
						/** @type {number} */ (node.end),
						`Private field '#${node.name}' must be declared in an enclosing class`,
					);
				}
				return node;
			}

			/**
			 * acorn throws `Unexpected token` for a `const` without an initializer
			 * outside an ambient context. TypeScript parses it and reports TS1155 from
			 * the checker. When collecting, `parseVarStatement` and `parseVar` (a `for`
			 * head) let `const` declarators omit the initializer, and `parseVarId`
			 * records the error for a name, or throws acorn's error for a pattern.
			 * @template T
			 * @param {string} kind
			 * @param {boolean | undefined} allowMissingInitializer
			 * @param {(allowMissingInitializer: boolean) => T} parse
			 * @returns {T}
			 */
			#parseConstWithoutInitializer(kind, allowMissingInitializer, parse) {
				const outer = this.#collectingConstWithoutInitializer;
				this.#collectingConstWithoutInitializer =
					this.#collect && kind === 'const' && !allowMissingInitializer && !this.isAmbientContext;
				try {
					return parse(!!allowMissingInitializer || this.#collectingConstWithoutInitializer);
				} finally {
					this.#collectingConstWithoutInitializer = outer;
				}
			}

			/**
			 * acorn-typescript's `parseVarStatement` calls acorn's `parseVar` itself
			 * (`super.parseVar`), not the `parseVar` below, so the two never apply to
			 * the same declaration.
			 * @param {AST.VariableDeclaration} node
			 * @param {string} kind
			 * @param {boolean} [allowMissingInitializer]
			 */
			parseVarStatement(node, kind, allowMissingInitializer) {
				if (
					this.#collect &&
					(kind === 'const' || kind === 'var') &&
					this.#isEmptyDeclarationList()
				) {
					return this.#parseEmptyVarStatement(node, kind);
				}
				return this.#parseConstWithoutInitializer(kind, allowMissingInitializer, (allow) =>
					super.parseVarStatement(node, kind, allow),
				);
			}

			/**
			 * Whether no declarator follows the `const` or `var` at the current token
			 * where TypeScript's parser ends an empty declaration list: the next token
			 * can't start a declarator, and it is `;`, `}`, or the end of the input,
			 * or a line break comes before it (`isVariableDeclaratorListTerminator`).
			 */
			#isEmptyDeclarationList() {
				const next = this.lookahead();
				if (
					Parser.acornTypeScript.tokenIsIdentifier(next.type) ||
					next.type === tt.braceL ||
					next.type === tt.bracketL ||
					next.type === tt.privateId
				) {
					return false;
				}
				return (
					next.type === tt.semi ||
					next.type === tt.braceR ||
					next.type === tt.eof ||
					regex_line_break.test(this.input.slice(this.end, next.start))
				);
			}

			/**
			 * Whether no declarator follows the `var`, `let`, or `const` of a `for`
			 * head at the current token, where TypeScript's parser ends an empty
			 * declaration list: as in a statement (`#isEmptyDeclarationList`), before
			 * `in`, or before `of` when a name and `)` follow it
			 * (`canFollowContextualOfKeyword`), as in `for (const of x)`. Otherwise
			 * `of` is the declarator's name, as in `for (const of of x)`.
			 */
			#isEmptyForDeclarationList() {
				if (this.#isEmptyDeclarationList()) return true;
				const next = this.lookahead();
				return (
					next.type === tt._in ||
					(this.isContextualWithState('of', next) &&
						Parser.acornTypeScript.tokenIsIdentifier(this.lookahead(2).type) &&
						this.lookahead(3).type === tt.parenR)
				);
			}

			/**
			 * acorn reads a declarator right after `const` or `var`, and throws
			 * `Unexpected token` when none follows, as while a declaration is being
			 * typed. TypeScript parses an empty declaration list and reports TS1123
			 * from the checker. When collecting, finish the declaration with no
			 * declarators, as acorn-typescript's `parseVarStatement` would.
			 * @param {AST.VariableDeclaration} node
			 * @param {'const' | 'var'} kind
			 */
			#parseEmptyVarStatement(node, kind) {
				this.#parseEmptyDeclarationList(node, kind);
				this.semicolon();
				return this.finishNode(node, 'VariableDeclaration');
			}

			/**
			 * Read the keyword of a declaration that has no declarators, and record
			 * TS1123 right after it, where TypeScript reports it.
			 * @param {AST.VariableDeclaration} node
			 * @param {AST.VariableDeclaration['kind']} kind
			 */
			#parseEmptyDeclarationList(node, kind) {
				this.next();
				node.declarations = [];
				node.kind = kind;
				this.#recordCheckerLevelError(
					this.lastTokEnd,
					this.lastTokEnd,
					'Variable declaration list cannot be empty.',
				);
			}

			/**
			 * @param {AST.VariableDeclaration} node
			 * @param {boolean} isFor
			 * @param {string} kind
			 * @param {boolean} [allowMissingInitializer]
			 */
			parseVar(node, isFor, kind, allowMissingInitializer) {
				return this.#parseConstWithoutInitializer(kind, allowMissingInitializer, (allow) =>
					super.parseVar(node, isFor, kind, allow),
				);
			}

			/**
			 * @param {AST.VariableDeclarator} decl
			 * @param {AST.VariableDeclaration['kind']} kind
			 */
			parseVarId(decl, kind) {
				super.parseVarId(decl, kind);
				// acorn's check in `parseVar`, which reads the initializer next.
				if (
					!this.#collectingConstWithoutInitializer ||
					this.type === tt.eq ||
					this.type === tt._in ||
					this.isContextual('of')
				) {
					return;
				}
				if (decl.id.type !== 'Identifier') this.unexpected();
				const start = /** @type {number} */ (decl.id.start);
				this.#recordCheckerLevelError(
					start,
					start + decl.id.name.length,
					"'const' declarations must be initialized.",
				);
			}

			/**
			 * Records the list's closing token for `parseBindingListItem`: `)` for
			 * parameters, `]` for an array pattern.
			 * @type {Parse.Parser['parseBindingList']}
			 */
			parseBindingList(close, allowEmpty, allowTrailingComma, allowModifiers) {
				if (this.#collect && close === tt.parenR && allowModifiers === undefined) {
					// UPSTREAM(sveltejs/acorn-typescript#136): remove once a release includes the fix
					// A function's parameters, which acorn's `parseFunctionParams` reads
					// with no `allowModifiers` (a method's pass `true`). TypeScript's
					// parser reads parameter property modifiers before them too, and its
					// checker reports them (TS2369). When collecting, pass `false`, so
					// that acorn-typescript reads the modifiers and raises TS2369, which
					// `raise` records, instead of failing at them. A strict parse still
					// fails: `public` is a reserved word, and a name after `readonly` is
					// unexpected.
					allowModifiers = false;
				}
				const outer = this.#bindingListClose;
				const outer_generic_arrow = this.#readingGenericArrowParameters;
				this.#bindingListClose = close;
				// acorn-typescript reads the parameters of `async <T,>(…) =>` with
				// `parseBindingList` (see `parseBindingListItem`).
				this.#readingGenericArrowParameters =
					close === tt.parenR && this.#genericArrowFunction?.parametersStart === this.lastTokStart;
				try {
					return this.#collect
						? this.#parseBindingListPastRestElement(
								close,
								allowEmpty,
								allowTrailingComma,
								allowModifiers,
							)
						: super.parseBindingList(close, allowEmpty, allowTrailingComma, allowModifiers);
				} finally {
					this.#bindingListClose = outer;
					this.#readingGenericArrowParameters = outer_generic_arrow;
				}
			}

			/**
			 * acorn ends a binding list at its rest element: it raises for a comma
			 * after it and expects the list to close. TypeScript parses the elements
			 * after a rest element and reports them from the checker (TS1014, TS2462).
			 * When collecting, record acorn's error at the comma and keep parsing the
			 * list; this is acorn's `parseBindingList` with that one change.
			 * @type {Parse.Parser['parseBindingList']}
			 */
			#parseBindingListPastRestElement(close, allowEmpty, allowTrailingComma, allowModifiers) {
				/** @type {AST.Pattern[]} */
				const elements = [];
				let first = true;
				while (!this.eat(close)) {
					if (first) first = false;
					else this.expect(tt.comma);
					if (allowEmpty && this.type === tt.comma) {
						elements.push(/** @type {AST.Pattern} */ (/** @type {unknown} */ (null)));
					} else if (allowTrailingComma && this.afterTrailingComma(close)) {
						break;
					} else if (this.type === tt.ellipsis) {
						const rest = this.parseRestBinding();
						this.parseBindingListItem(rest);
						elements.push(rest);
						if (this.type === tt.comma && !this.#isAmbientRestParameterTrailingComma()) {
							this.#recordCheckerLevelError(
								this.start,
								this.start + 1,
								REST_ELEMENT_TRAILING_COMMA,
							);
						}
					} else {
						elements.push(this.parseAssignableListItem(allowModifiers));
					}
				}
				return elements;
			}

			// UPSTREAM(sveltejs/acorn-typescript#136): remove once a release includes the fix
			// UPSTREAM(sveltejs/acorn-typescript#89)
			/**
			 * The parameters of a function or constructor type, or of a method, call,
			 * or construct signature. TypeScript's parser reads parameter property
			 * modifiers before them too, and its checker reports them (TS2369).
			 * acorn-typescript reads them with acorn's `parseBindingList`, past
			 * `parseBindingList` above, with no `allowModifiers`, so `public` failed as
			 * a reserved word and the name after `readonly` as unexpected. When
			 * collecting, read them through `parseBindingList`, which reads the
			 * modifiers there and records TS2369 at the first one, as for a function's
			 * parameters. A strict parse still fails.
			 *
			 * TypeScript's parser reads a default there too, and its checker reports it
			 * (TS2371). acorn-typescript rejected the `AssignmentPattern` with its own
			 * message, in every mode. Raise TS2371 at the parameter instead, which
			 * `raise` records when collecting, keeping the default as typescript-estree
			 * does. A strict parse throws it.
			 *
			 * This is acorn-typescript's method with those changes. Its check of each
			 * parameter looks through a parameter property to its parameter.
			 * @type {Parse.Parser['tsParseBindingListForSignature']}
			 */
			tsParseBindingListForSignature() {
				const items = this.#collect
					? this.parseBindingList(tt.parenR, true, true)
					: super.parseBindingList(tt.parenR, true, true);
				return items.map((item) => {
					const node = /** @type {AST.Node} */ (item);
					const parameter = /** @type {AST.Node & AST.NodeWithLocation} */ (
						node.type === 'TSParameterProperty' ? node.parameter : node
					);
					if (parameter.type === 'AssignmentPattern') {
						this.raise(parameter.start, SIGNATURE_PARAMETER_INITIALIZER);
					} else if (
						parameter.type !== 'Identifier' &&
						parameter.type !== 'RestElement' &&
						parameter.type !== 'ObjectPattern' &&
						parameter.type !== 'ArrayPattern'
					) {
						this.raise(
							parameter.start,
							`Name in a signature must be an Identifier, ObjectPattern or ArrayPattern, instead got ${parameter.type}.`,
						);
					}
					return item;
				});
			}

			// UPSTREAM(sveltejs/acorn-typescript#139): remove once a release includes the fix
			/**
			 * Whether a parameter starts at the current token, for the lookahead that
			 * tells a function type from a parenthesized type. TypeScript's
			 * `skipParameterStart` skips modifiers first, so
			 * `(public x: number) => void` is a function type, with TS2369 from its
			 * checker. When collecting, skip parameter property modifiers too, so
			 * that `tsParseBindingListForSignature` reads them. A strict parse still
			 * reads `(public x` as a parenthesized type and fails at `x`.
			 * @type {Parse.Parser['tsSkipParameterStart']}
			 */
			tsSkipParameterStart() {
				if (this.#collect) {
					this.tsParseModifiers({ modified: {}, allowedModifiers: PARAMETER_MODIFIERS });
				}
				return super.tsSkipParameterStart();
			}

			/**
			 * acorn-typescript gives a namespace body acorn's class static block scope
			 * flag, so acorn reads `await` there as an identifier and throws `Cannot use
			 * await in class static initialization block`. TypeScript parses an `await`
			 * expression, `for await` loop, or `await using` declaration there and
			 * reports it from the checker (TS1308, TS1103, TS2852). When collecting,
			 * look through namespaces as TypeScript does; `finishNode` records the error.
			 * UPSTREAM(sveltejs/acorn-typescript#89)
			 */
			get canAwait() {
				const can_await = super.canAwait;
				if (can_await || !this.#collect) return can_await;
				return this.#awaitContext() === 'namespace';
			}

			/**
			 * Whether `await` may be used here, going by acorn's `canAwait` with
			 * namespace scopes looked through.
			 * @returns {'none' | 'allowed' | 'namespace'} `namespace` when it may be
			 * used only because a namespace scope was looked through
			 */
			#awaitContext() {
				let in_namespace = false;
				for (let i = this.scopeStack.length - 1; i >= 0; i--) {
					const { flags } = this.scopeStack[i];
					if (flags & TS_SCOPE_TS_MODULE) {
						in_namespace = true;
					} else if (flags & (SCOPE_CLASS_STATIC_BLOCK | SCOPE_CLASS_FIELD_INIT)) {
						return 'none';
					} else if (flags & SCOPE_FUNCTION) {
						return !(flags & SCOPE_ASYNC) ? 'none' : in_namespace ? 'namespace' : 'allowed';
					}
				}
				const allowed =
					(this.inModule && this.options.ecmaVersion >= 13) ||
					this.options.allowAwaitOutsideFunction;
				return !allowed ? 'none' : in_namespace ? 'namespace' : 'allowed';
			}

			/**
			 * Record TypeScript's error for an `await` that only parses because
			 * `canAwait` looks through namespaces.
			 * @param {AST.Node} node
			 */
			#reportAwaitInNamespace(node) {
				/** @type {string | null} */
				let message = null;
				if (node.type === 'AwaitExpression') {
					message =
						"'await' expressions are only allowed within async functions and at the top levels of modules.";
				} else if (node.type === 'ForOfStatement' && node.await) {
					message =
						"'for await' loops are only allowed within async functions and at the top levels of modules.";
				} else if (node.type === 'VariableDeclaration' && node.kind === 'await using') {
					message =
						"'await using' statements are only allowed within async functions and at the top levels of modules.";
				}
				if (message === null || this.#awaitContext() !== 'namespace') return;
				// The `await` keyword, after `for` in a loop.
				const start =
					node.type === 'ForOfStatement'
						? skip_space_and_comments_from(this.input, /** @type {number} */ (node.start) + 3)
						: /** @type {number} */ (node.start);
				this.#recordCheckerLevelError(start, start + 'await'.length, message);
			}

			/**
			 * Override to allow single-parameter generic arrow functions without trailing comma.
			 * By default, @sveltejs/acorn-typescript throws an error for `<T>() => {}` when JSX is enabled
			 * because it can't disambiguate from JSX. However, the parser still parses it correctly
			 * using tryParse - it just throws afterwards. By overriding this to do nothing, we allow
			 * the valid parse to succeed.
			 * @param {AST.TSTypeParameterDeclaration} node
			 */
			reportReservedArrowTypeParam(node) {
				// Constraints and defaults already disambiguate a generic arrow from JSX.
				if (
					this.#collect &&
					node.params.length === 1 &&
					node.extra?.trailingComma === undefined &&
					!node.params[0].constraint &&
					!node.params[0].default
				) {
					error(
						'This syntax is reserved in files with the .mts or .cts extension. Add a trailing comma, as in `<T,>() => ...`.',
						this.#filename,
						node,
						this.#errors,
					);
				}
			}

			/**
			 * Override to allow `readonly` type modifier on any type when collecting.
			 * By default, @sveltejs/acorn-typescript throws an error for `readonly { ... }`
			 * because TypeScript only permits `readonly` on array and tuple types.
			 * Suppress the error in the strict mode as ts is compiled away.
			 * @param {AST.TSTypeOperator} node
			 */
			tsCheckTypeAnnotationForReadOnly(node) {
				const typeAnnotation = /** @type {AST.TypeNode} */ (node.typeAnnotation);
				if (typeAnnotation.type === 'TSTupleType' || typeAnnotation.type === 'TSArrayType') {
					// Valid readonly usage, no error needed
					return;
				}

				if (this.#collect) {
					error(
						"'readonly' type modifier is only permitted on array and tuple literal types.",
						this.#filename,
						typeAnnotation,
						this.#errors,
					);
				}
			}

			/**
			 * A `<` that starts its own line reads as a tag start (see
			 * `getTokenFromCode`), so an element there can begin a new statement. After
			 * the name of a class, interface, type alias, function, or method only type
			 * parameters can follow (`class G\n<T> {}`): read the tag start again as
			 * `<`, without the tag contexts it pushed.
			 */
			#readTagStartAsTypeParameterStart() {
				if (this.type !== tstt.jsxTagStart) return;
				this.#truncateContext(this.context.length - this.#currentTokenContextCount());
				this.finishToken(tt.relational, '<');
			}

			/**
			 * The same where a tag can't start but type arguments can: after a
			 * superclass, and after a class or function expression on its line. A
			 * closing tag's `</` stays a tag start, so an error stays at it, but not
			 * a comment right after the `<` (`</* c *\/ T>`, `<// c`), as for a `</`
			 * after an operand (see `getTokenFromCode`). Returns whether the token is
			 * now `<`.
			 */
			#readTagStartAsTypeArgumentStart() {
				if (this.type !== tstt.jsxTagStart) return false;
				if (this.input.charCodeAt(this.start + 1) === CharCode.slash) {
					const after_slash = this.input.charCodeAt(this.start + 2);
					if (after_slash !== CharCode.slash && after_slash !== CharCode.asterisk) return false;
				}
				this.#readTagStartAsTypeParameterStart();
				return true;
			}

			/**
			 * @type {Parse.Parser['tsTryParseTypeParameters']}
			 */
			tsTryParseTypeParameters(parseModifiers) {
				this.#readTagStartAsTypeParameterStart();
				return super.tsTryParseTypeParameters(parseModifiers);
			}

			// UPSTREAM(sveltejs/acorn-typescript#119): remove once a release includes the fix
			/**
			 * Records the node whose modifiers are being read, so that
			 * `tsParseModifier` can tell whether it has already read `static`.
			 * @type {Parse.Parser['tsParseModifiers']}
			 */
			tsParseModifiers(options) {
				const outer = this.#modifiersNode;
				this.#modifiersNode = options.modified;
				try {
					return super.tsParseModifiers(options);
				} finally {
					this.#modifiersNode = outer;
				}
			}

			// UPSTREAM(sveltejs/acorn-typescript#119): remove once a release includes the fix
			// UPSTREAM(sveltejs/acorn-typescript#147): remove once a release includes the fix
			/**
			 * `static` is a modifier even when the next token is on a later line, as
			 * in TypeScript (`nextTokenCanFollowModifier`) and acorn: `static` with
			 * `count = 0` on the next line is one static field. acorn-typescript
			 * requires the token after every modifier to be on the same line, so it
			 * read `static` as a field name and made the next member an instance
			 * member. Other modifiers keep that rule (`readonly` with `x` on the next
			 * line is two fields). As in TypeScript, `static` after a `static`
			 * modifier is a name, so `static` / `static` / `a() {}` on three lines
			 * is a static field named `static` and an instance method
			 * (sveltejs/acorn-typescript#119).
			 *
			 * A modifier written with an escape is still one: TypeScript's parser
			 * reads it where it reads the modifier and reports TS1260 `Keywords
			 * cannot contain escape characters.` at it. acorn-typescript read it as
			 * a name, so `static` in `class A { \u0073tatic x = 1; }` was a field
			 * name followed by an unexpected `x` (sveltejs/acorn-typescript#147).
			 * @type {Parse.Parser['tsParseModifier']}
			 */
			tsParseModifier(allowedModifiers, stopOnStartOfClassStaticBlock) {
				if (
					this.containsEsc &&
					Parser.acornTypeScript.tokenIsIdentifier(this.type) &&
					allowedModifiers.includes(/** @type {string} */ (this.value))
				) {
					// Read it as the word written out, and report it if that's a modifier.
					const start = this.start;
					const parser = /** @type {Parse.Parser} */ (this);
					parser.containsEsc = false;
					const modifier = this.tsParseModifier(allowedModifiers, stopOnStartOfClassStaticBlock);
					if (modifier !== undefined) this.raise(start, KEYWORD_ESCAPE);
					parser.containsEsc = true;
					return undefined;
				}
				if (!this.isContextual('static') || !allowedModifiers.includes('static')) {
					return super.tsParseModifier(allowedModifiers, stopOnStartOfClassStaticBlock);
				}
				if (this.#modifiersNode?.static) return undefined;
				if (stopOnStartOfClassStaticBlock && this.tsIsStartOfStaticBlocks()) return undefined;
				const is_modifier = this.tsTryParse(() => {
					this.next(true);
					// TypeScript's `canFollowModifier`: acorn-typescript's
					// `tsTokenCanFollowModifier` without the same-line check.
					return (
						this.type === tt.bracketL ||
						this.type === tt.braceL ||
						this.type === tt.star ||
						this.type === tt.ellipsis ||
						this.type === tt.privateId ||
						this.isLiteralPropertyName()
					);
				});
				return is_modifier ? 'static' : undefined;
			}

			// UPSTREAM(sveltejs/acorn-typescript#120): remove once a release includes the fix
			/**
			 * Reads the token after an interface's `{` inside the type, like the
			 * tokens of later members. acorn-typescript enters the type only after
			 * `{`, so with JSX the `<` of a generic call signature that is the first
			 * member (`interface I { <T>(x: T): T }`) was read as a tag start. The
			 * token after the closing `}` is still read outside the type, as
			 * acorn-typescript does.
			 * @type {Parse.Parser['tsParseInterfaceBody']}
			 */
			tsParseInterfaceBody() {
				const members = this.tsInType(() => {
					this.expect(tt.braceL);
					return this.tsParseList('TypeMembers', this.tsParseTypeMember.bind(this));
				});
				this.expect(tt.braceR);
				return members;
			}

			// UPSTREAM(sveltejs/acorn-typescript#110): remove once a release includes the fix
			// UPSTREAM(sveltejs/acorn-typescript#113): remove once a release includes the fix
			/**
			 * Two fixes to the class name, each with the AST of its upstream fix:
			 *
			 * - A class can be named after a TypeScript contextual keyword
			 *   (`class global {}`, `class type {}`), as in TypeScript and acorn.
			 *   acorn-typescript gives these words their own token types, which
			 *   acorn's `parseClassId` doesn't take as a name, so read the word as a
			 *   plain name (sveltejs/acorn-typescript#110).
			 * - Where the name is optional, `implements` starts the heritage clause
			 *   and the class has no name (`id: null`). acorn-typescript checked for
			 *   that only in a class expression, so acorn read `implements` as the
			 *   name of `export default class implements I {}`, whose name is also
			 *   optional (`'nullableID'`), and rejected it as reserved. A class
			 *   statement still rejects it (sveltejs/acorn-typescript#113).
			 *
			 * The rest stays with acorn-typescript, including type parameters.
			 * @type {Parse.Parser['parseClassId']}
			 */
			parseClassId(node, isStatement) {
				if (isStatement !== true && this.isContextual('implements')) {
					/** @type {AST.ClassDeclaration | AST.ClassExpression} */ (node).id = null;
					return;
				}
				if (this.type !== tt.name && Parser.acornTypeScript.tokenIsIdentifier(this.type)) {
					this.type = tt.name;
				}
				super.parseClassId(node, isStatement);
			}

			/**
			 * A superclass's type arguments belong to the class heading, as in
			 * TypeScript, whatever follows them and on whichever line they start:
			 *
			 * - A `<` that starts its own line reads as a tag start (see
			 *   `getTokenFromCode`), but after the superclass only type arguments can
			 *   follow (`class A extends B` with `<T> {}` on the next line), so the
			 *   heading stopped before the `<`. Read it again as `<`, then the type
			 *   arguments and the `implements` clause as acorn-typescript does.
			 * - acorn-typescript reads the superclass with the subscript parser, which
			 *   makes `Base<T>` an instantiation expression when a line break follows
			 *   it (`class D extends Base<T>` with the `{` or `implements` on the next
			 *   line), so the class had no `superTypeParameters`. Take an
			 *   unparenthesized one apart, as acorn-typescript's `parseNew` does for
			 *   `new A<T>`: the heading then has the AST it has on one line
			 *   (sveltejs/acorn-typescript#131).
			 * @type {Parse.Parser['parseClassSuper']}
			 */
			parseClassSuper(node) {
				super.parseClassSuper(node);
				const heading = /** @type {AST.ClassDeclaration | AST.ClassExpression} */ (node);
				// UPSTREAM(sveltejs/acorn-typescript#147): remove once a release includes the fix
				// `implements` written with an escape is TypeScript's TS1260: its parser
				// reads the clause. acorn-typescript failed at it with `Unexpected
				// token`.
				if (this.containsEsc && this.type === tt.name && this.value === 'implements') {
					this.raise(this.start, KEYWORD_ESCAPE);
				}
				const superClass = heading.superClass;
				if (!superClass) return;
				if (
					this.type === tstt.jsxTagStart &&
					superClass.type !== 'TSInstantiationExpression' &&
					!heading.superTypeParameters &&
					!heading.implements &&
					this.#readTagStartAsTypeArgumentStart()
				) {
					heading.superTypeParameters = this.tsParseTypeArgumentsInExpression();
					if (this.eatContextual('implements')) {
						heading.implements = this.tsParseHeritageClause('implements');
					}
				}
				// UPSTREAM(sveltejs/acorn-typescript#131): remove once a release includes the fix
				if (
					superClass.type === 'TSInstantiationExpression' &&
					!superClass.metadata?.parenthesized &&
					!heading.superTypeParameters
				) {
					heading.superClass = superClass.expression;
					heading.superTypeParameters = superClass.typeArguments;
				}
			}

			// UPSTREAM(sveltejs/acorn-typescript#137): remove once a release includes the fix
			/**
			 * TypeScript reads `abstract` as a modifier only before a token on the same
			 * line. acorn-typescript's check for an abstract class ignored a line break
			 * after `abstract`, so `export default abstract` with `class A {}` on the
			 * next line parsed as one abstract class, the default export, where
			 * TypeScript exports the value of `abstract` and declares the class `A`
			 * on its own. After decorators (`canHaveLeadingDecorator`), such as
			 * `@dec abstract` with the class on the next line, the decorators went to
			 * the class, where TypeScript reports TS1146 `Declaration expected.`.
			 * @type {Parse.Parser['isAbstractClass']}
			 */
			isAbstractClass() {
				return super.isAbstractClass() && !this.#lineBreakAfter(this.end);
			}

			// UPSTREAM(sveltejs/acorn-typescript#137): remove once a release includes the fix
			/**
			 * `declare`, and `abstract` after it, are modifiers only before a token on
			 * the same line too. acorn-typescript's check, which only
			 * `canHaveLeadingDecorator` uses, ignored line breaks, so `@dec declare`
			 * with `class A {}` on the next line gave the decorators to the class,
			 * where TypeScript reports TS1146.
			 * @type {Parse.Parser['isDeclareClass']}
			 */
			isDeclareClass() {
				if (!super.isDeclareClass() || this.#lineBreakAfter(this.end)) return false;
				const next = this.nextTokenStart();
				// `class`, or `abstract` and then `class`.
				return (
					this.input.startsWith('class', next) || !this.#lineBreakAfter(next + 'abstract'.length)
				);
			}

			/**
			 * Whether a line break comes between `end` and the next token, which
			 * ends a modifier: TypeScript reads a word as one only before a token on
			 * the same line.
			 * @param {number} end
			 */
			#lineBreakAfter(end) {
				return regex_line_break.test(this.input.slice(end, this.nextTokenStartSince(end)));
			}

			// UPSTREAM(sveltejs/acorn-typescript#143): remove once a release includes the fix
			/**
			 * Decorators can come before `abstract declare class A {}`, as before
			 * `declare abstract class A {}` (see `tsParseDeclaration`).
			 * @type {Parse.Parser['canHaveLeadingDecorator']}
			 */
			canHaveLeadingDecorator() {
				if (super.canHaveLeadingDecorator()) return true;
				if (this.type !== tstt.abstract || this.containsEsc || this.#lineBreakAfter(this.end)) {
					return false;
				}
				const declaration = this.#declarationAfterModifier(1);
				return (
					declaration?.length === 2 && declaration[0] === 'declare' && declaration[1] === 'class'
				);
			}

			// UPSTREAM(sveltejs/acorn-typescript#143): remove once a release includes the fix
			// UPSTREAM(sveltejs/acorn-typescript#147): remove once a release includes the fix
			/**
			 * TypeScript's parser reads `abstract` as a modifier before any
			 * declaration that it reads after one on the same line (`isDeclaration`),
			 * and reports it from its checker (TS1242 `'abstract' modifier can only
			 * appear on a class, method, or property declaration.`) unless that's a
			 * class. acorn-typescript's `tsParseAbstractDeclaration` took only a class
			 * or an interface after it: it gave the interface `abstract` without an
			 * error (`abstract interface I {}`), rejected `abstract declare class A {}`,
			 * which is valid, and before anything else raised `Unexpected token`, or
			 * declined, in every mode (`abstract function f() {}`,
			 * `export abstract let x = 1;`) (sveltejs/acorn-typescript#143).
			 *
			 * Read `abstract` at the start of a statement, after `export` (see also
			 * `#checkExportDeclarationStart`) and after `declare` (see also
			 * `tsTryParseDeclare`) as TypeScript does:
			 *
			 * - before a class, or before `declare` and a class, it makes the class
			 *   abstract;
			 * - before any other declaration it's TS1242, a checker error (see
			 *   `CHECKER_LEVEL_ERRORS`): a strict parse throws it, and a collecting
			 *   one records it and parses the declaration without the modifier,
			 *   which the formatter then refuses;
			 * - written with an escape, before a declaration, it's TypeScript's
			 *   parser error TS1260 `Keywords cannot contain escape characters.`, in
			 *   every mode. acorn-typescript read `\u0061bstract class A {}` as an
			 *   abstract class (sveltejs/acorn-typescript#147).
			 *
			 * Before anything else, a repeated modifier (`abstract abstract class A
			 * {}`), or a modifier this parser doesn't keep on a declaration
			 * (`abstract public class A {}`), acorn-typescript's reading stays.
			 * @type {Parse.Parser['tsParseDeclaration']}
			 */
			tsParseDeclaration(node, value, next) {
				if (value !== 'abstract' || (!next && this.#wordWasParenthesized())) {
					return super.tsParseDeclaration(node, value, next);
				}
				// `next` says whether `abstract` is the current token or was just read,
				// as the statement's expression.
				const start = next ? this.start : this.lastTokStart;
				const escaped = next ? this.containsEsc : this.#lastWordEscaped();
				// After `declare` (`declare abstract class A {}`), where a second
				// `declare` would be repeated.
				const after_declare =
					next && this.input.slice(this.lastTokStart, this.lastTokEnd) === 'declare';
				if (!this.tsCheckLineTerminator(next)) return undefined;
				let declaration = this.#declarationAfterModifier(0);
				if (
					declaration?.includes('abstract') ||
					(after_declare && declaration?.[0] === 'declare')
				) {
					declaration = null;
				}
				if (declaration === null) {
					return Parser.acornTypeScript.tokenIsIdentifier(this.type)
						? this.tsParseAbstractDeclaration(node)
						: undefined;
				}
				if (escaped) this.raise(start, KEYWORD_ESCAPE);
				const abstract_class = /** @type {AST.ClassDeclaration} */ (node);
				if (declaration.length === 1 && declaration[0] === 'class') {
					abstract_class.abstract = true;
					return this.parseClass(abstract_class, true);
				}
				if (declaration.length === 2 && declaration[1] === 'class') {
					// `declare class`.
					abstract_class.abstract = true;
					this.next();
					return this.tsTryParseDeclare(abstract_class);
				}
				// The declaration without `abstract`, the statement that acorn-typescript
				// parses after `export` when this returns nothing. TypeScript's checker
				// reports `abstract` only without syntax errors in it.
				const statement = this.parseStatement(null, this.#atTopLevel());
				this.raise(start, ABSTRACT_MODIFIER_NOT_ALLOWED);
				return statement;
			}

			/**
			 * Whether the statement being read is at the top level of the module or
			 * of a namespace's body, where acorn reads an import declaration: acorn's
			 * `parseTopLevel` and acorn-typescript's `tsParseModuleBlock` pass
			 * `topLevel` to `parseStatement`.
			 */
			#atTopLevel() {
				if (this.scopeStack.length === 1) return true;
				const parent = /** @type {Parse.Scope} */ (this.scopeStack.at(-2));
				return (
					this.currentScope().flags === TS_SCOPE_OTHER && (parent.flags & TS_SCOPE_TS_MODULE) !== 0
				);
			}

			// UPSTREAM(sveltejs/acorn-typescript#143): remove once a release includes the fix
			// UPSTREAM(sveltejs/acorn-typescript#147): remove once a release includes the fix
			/**
			 * Reads the declaration after `declare` at the start of a statement, as
			 * acorn-typescript does, and reports what TypeScript reports there:
			 *
			 * - `abstract` before a declaration other than a class
			 *   (`declare abstract function f(): void;`), TS1242, as in
			 *   `tsParseDeclaration`. acorn-typescript's `tsParseDeclaration` read
			 *   `abstract`, declined, and failed with `Unexpected token`, or gave the
			 *   interface `abstract` without an error
			 *   (sveltejs/acorn-typescript#143).
			 * - `declare` written with an escape before a declaration, TS1260:
			 *   TypeScript's parser reads it as the modifier. acorn-typescript read
			 *   `\u0064eclare class A {}` as an ambient class without an error
			 *   (sveltejs/acorn-typescript#147). So is `enum` or `interface` after
			 *   `declare` (see `#checkEscapedDeclarationKeyword`).
			 * @type {Parse.Parser['tsTryParseDeclare']}
			 */
			tsTryParseDeclare(node) {
				// `tsParseExpressionStatement` has read `declare` as the statement's
				// expression.
				if (this.#wordWasParenthesized()) return super.tsTryParseDeclare(node);
				this.#checkEscapedDeclarationKeyword();
				if (
					this.#lastWordEscaped() &&
					!this.hasPrecedingLineBreak() &&
					this.#declarationAfterModifier(0) !== null
				) {
					this.raise(this.lastTokStart, KEYWORD_ESCAPE);
				}
				if (this.type === tstt.abstract && !this.#lineBreakAfter(this.end)) {
					const declaration = this.#declarationAfterModifier(1);
					if (
						declaration !== null &&
						declaration.at(-1) !== 'class' &&
						!declaration.includes('abstract') &&
						!declaration.includes('declare')
					) {
						const start = this.start;
						if (this.containsEsc) this.raise(start, KEYWORD_ESCAPE);
						// The declaration without `abstract`, then its error.
						this.next();
						const declared = super.tsTryParseDeclare(node);
						this.raise(start, ABSTRACT_MODIFIER_NOT_ALLOWED);
						return declared;
					}
				}
				return super.tsTryParseDeclare(node);
			}

			/**
			 * What TypeScript's parser reads from the token `ahead` tokens on (the
			 * current one for 0), after a modifier on the same line: TypeScript's
			 * `isDeclaration`, for the modifiers this parser keeps on a declaration
			 * that isn't a class member (`abstract`, `declare`, and `async` before
			 * `function`). Returns those modifiers and the word that starts the
			 * declaration (`['declare', 'class']`), or `null` where TypeScript reads
			 * no declaration, or another modifier (`public`) comes first.
			 * @param {number} ahead
			 * @returns {string[] | null}
			 */
			#declarationAfterModifier(ahead) {
				const is_identifier = Parser.acornTypeScript.tokenIsIdentifier;
				const token = ahead === 0 ? this.getCurLookaheadState() : this.lookahead(ahead);
				switch (token.type) {
					case tt._class:
					case tt._function:
					case tt._var:
					case tt._const:
						return [/** @type {string} */ (token.type.keyword)];
					case tt._import: {
						// An import declaration, not `import(…)` or `import.meta`.
						const after = this.lookahead(ahead + 1).type;
						return after === tt.string ||
							after === tt.star ||
							after === tt.braceL ||
							after.keyword !== undefined ||
							is_identifier(after)
							? ['import']
							: null;
					}
				}
				if (!is_identifier(token.type)) return null;
				const word = /** @type {string} */ (token.value);
				const next = this.lookahead(ahead + 1);
				const same_line = !regex_line_break.test(this.input.slice(token.end, next.start));
				switch (word) {
					case 'let':
					case 'enum':
						return [word];
					case 'interface':
					case 'type':
					case 'namespace':
					case 'using':
						return same_line && is_identifier(next.type) ? [word] : null;
					case 'module':
						return same_line && (is_identifier(next.type) || next.type === tt.string)
							? [word]
							: null;
					case 'global':
						return next.type === tt.braceL ? [word] : null;
					case 'await': {
						// `await using x = y;`
						if (!same_line || next.type !== tt.name || next.value !== 'using') return null;
						const after = this.lookahead(ahead + 2);
						return !regex_line_break.test(this.input.slice(next.end, after.start)) &&
							is_identifier(after.type)
							? ['await']
							: null;
					}
					case 'async':
						return same_line && next.type === tt._function ? [word, 'function'] : null;
					case 'abstract':
					case 'declare': {
						if (!same_line) return null;
						const declaration = this.#declarationAfterModifier(ahead + 1);
						return declaration && [word, ...declaration];
					}
				}
				return null;
			}

			/**
			 * Whether the statement's expression that `tsParseExpressionStatement`
			 * reads as a TypeScript word was the word in parentheses, `(abstract)`,
			 * which acorn-typescript still reads as the word (#715).
			 */
			#wordWasParenthesized() {
				return this.input.charCodeAt(this.lastTokStart) === CharCode.closeParen;
			}

			/**
			 * Whether the last token, a word, was written with an escape.
			 */
			#lastWordEscaped() {
				return this.input.slice(this.lastTokStart, this.lastTokEnd).includes('\\');
			}

			/**
			 * Report TS1260 `Keywords cannot contain escape characters.` at the word
			 * just read, if it was written with an escape: TypeScript's parser reads
			 * an escaped keyword as the keyword and reports it.
			 */
			#checkKeywordJustRead() {
				if (this.#lastWordEscaped()) this.raise(this.lastTokStart, KEYWORD_ESCAPE);
			}

			// UPSTREAM(sveltejs/acorn-typescript#147): remove once a release includes the fix
			/**
			 * `type` before a type alias's name, written with an escape, is
			 * TypeScript's TS1260 (see `#checkKeywordJustRead`). acorn-typescript
			 * read `\u0074ype T = 1;` as a type alias without an error.
			 * @type {Parse.Parser['tsParseTypeAliasDeclaration']}
			 */
			tsParseTypeAliasDeclaration(node) {
				// `type` has just been read.
				this.#checkKeywordJustRead();
				return super.tsParseTypeAliasDeclaration(node);
			}

			// UPSTREAM(sveltejs/acorn-typescript#147): remove once a release includes the fix
			/**
			 * `module` or `namespace` before a name, written with an escape, is
			 * TypeScript's TS1260 (see `#checkKeywordJustRead`). acorn-typescript
			 * read `n\u0061mespace N {}` as a namespace without an error.
			 * @type {Parse.Parser['tsParseModuleOrNamespaceDeclaration']}
			 */
			tsParseModuleOrNamespaceDeclaration(node, nested) {
				// `module` or `namespace` has just been read, or the `.` of a dotted
				// name.
				if (!nested) this.#checkKeywordJustRead();
				return super.tsParseModuleOrNamespaceDeclaration(node, nested);
			}

			// UPSTREAM(sveltejs/acorn-typescript#147): remove once a release includes the fix
			/**
			 * `module` before a string, written with an escape, is TypeScript's
			 * TS1260 (see `#checkKeywordJustRead`); acorn-typescript read
			 * `\u006dodule "m" {}` without an error. `global` is the declaration's
			 * name, which TypeScript reads as an identifier, so an escape there is
			 * no error, where acorn-typescript rejected `declare \u0067lobal {}`.
			 * @type {Parse.Parser['tsParseAmbientExternalModuleDeclaration']}
			 */
			tsParseAmbientExternalModuleDeclaration(node) {
				if (this.type === tt.string) {
					// `module` has just been read.
					this.#checkKeywordJustRead();
				} else if (this.type === tstt.global) {
					// acorn-typescript takes `global` only without an escape.
					/** @type {Parse.Parser} */ (this).containsEsc = false;
				}
				return super.tsParseAmbientExternalModuleDeclaration(node);
			}

			// UPSTREAM(sveltejs/acorn-typescript#144): remove once a release includes the fix
			/**
			 * After `export default`, TypeScript reads `interface` as the start of an
			 * interface declaration wherever the name is (`nextTokenCanFollowDefaultKeyword`),
			 * as `interface` is a reserved word there. acorn-typescript's
			 * `tsParseInterfaceDeclaration` declines `interface` before a line break,
			 * which is TypeScript's rule at the start of a statement, and
			 * `export default interface` with `I {}` on the next line failed with
			 * `The keyword 'interface' is reserved`. `parseExportDefaultDeclaration`
			 * marks that `interface`, for which there's no line break to check.
			 * @type {Parse.Parser['hasFollowingLineBreak']}
			 */
			hasFollowingLineBreak() {
				return this.start !== this.#defaultExportInterfaceStart && super.hasFollowingLineBreak();
			}

			// UPSTREAM(sveltejs/acorn-typescript#147): remove once a release includes the fix
			/**
			 * `as` or `satisfies` after an operand, written with an escape, is
			 * TypeScript's TS1260: its parser reads the operator and reports the
			 * escape. acorn-typescript read a name there, which failed as
			 * `Unexpected token` at it.
			 * @type {Parse.Parser['parseExprOp']}
			 */
			parseExprOp(left, leftStartPos, leftStartLoc, minPrec, forInit) {
				if (
					this.containsEsc &&
					this.type === tt.name &&
					(this.value === 'as' || this.value === 'satisfies') &&
					/** @type {number} */ (tt._in.binop) > minPrec &&
					!this.hasPrecedingLineBreak()
				) {
					this.raise(this.start, KEYWORD_ESCAPE);
				}
				return super.parseExprOp(left, leftStartPos, leftStartLoc, minPrec, forInit);
			}

			// UPSTREAM(sveltejs/acorn-typescript#147): remove once a release includes the fix
			/**
			 * `keyof`, `readonly`, `unique` or `infer` where a type starts, written
			 * with an escape, is TypeScript's TS1260: its parser reads the operator
			 * and reports the escape. acorn-typescript read a type name there, and
			 * failed at the type after it.
			 * @type {Parse.Parser['tsParseTypeOperatorOrHigher']}
			 */
			tsParseTypeOperatorOrHigher() {
				if (
					this.containsEsc &&
					(Parser.acornTypeScript.tokenIsTSTypeOperator(this.type) ||
						(this.type === tt.name && this.value === 'infer'))
				) {
					this.raise(this.start, KEYWORD_ESCAPE);
				}
				return super.tsParseTypeOperatorOrHigher();
			}

			// UPSTREAM(sveltejs/acorn-typescript#147): remove once a release includes the fix
			/**
			 * A keyword type written with an escape (`\u0073tring`) is TypeScript's
			 * TS1260, unless a `.` follows, where it's the start of a type name.
			 * acorn-typescript read the keyword type without an error.
			 * @type {Parse.Parser['tsParseNonArrayType']}
			 */
			tsParseNonArrayType() {
				if (
					this.containsEsc &&
					this.type === tt.name &&
					KEYWORD_TYPES.has(/** @type {string} */ (this.value)) &&
					this.lookaheadCharCode() !== CharCode.dot
				) {
					this.raise(this.start, KEYWORD_ESCAPE);
				}
				return super.tsParseNonArrayType();
			}

			// UPSTREAM(sveltejs/acorn-typescript#147): remove once a release includes the fix
			/**
			 * `is` after a type predicate's name, written with an escape, is
			 * TypeScript's TS1260: its parser reads the predicate and reports the
			 * escape. acorn-typescript read the name as the type, then failed at `is`
			 * with `Unexpected token`.
			 * @type {Parse.Parser['tsParseTypePredicatePrefix']}
			 */
			tsParseTypePredicatePrefix() {
				const name = super.tsParseTypePredicatePrefix();
				if (name === undefined) this.#checkEscapedPredicateIs();
				return name;
			}

			// UPSTREAM(sveltejs/acorn-typescript#147): remove once a release includes the fix
			/**
			 * `is` after `this` in a type, written with an escape, is TypeScript's
			 * TS1260, as after a name (see `tsParseTypePredicatePrefix`).
			 * @type {Parse.Parser['tsParseThisTypeOrThisTypePredicate']}
			 */
			tsParseThisTypeOrThisTypePredicate() {
				const type = super.tsParseThisTypeOrThisTypePredicate();
				if (type.type === 'TSThisType') this.#checkEscapedPredicateIs();
				return type;
			}

			/**
			 * Report TS1260 at the current token if it's `is` written with an escape,
			 * on the line of a type predicate's name or `this`, which acorn-typescript
			 * has read.
			 */
			#checkEscapedPredicateIs() {
				if (
					this.containsEsc &&
					this.type === tt.name &&
					this.value === 'is' &&
					!this.hasPrecedingLineBreak()
				) {
					this.raise(this.start, KEYWORD_ESCAPE);
				}
			}

			// UPSTREAM(sveltejs/acorn-typescript#147): remove once a release includes the fix
			/**
			 * `as` after a mapped type's type parameter, written with an escape, is
			 * TypeScript's TS1260: its parser reads the `as` clause. acorn-typescript
			 * failed at `as` with `Unexpected token`.
			 * @type {Parse.Parser['tsParseMappedTypeParameter']}
			 */
			tsParseMappedTypeParameter() {
				const parameter = super.tsParseMappedTypeParameter();
				if (this.containsEsc && this.type === tt.name && this.value === 'as') {
					this.raise(this.start, KEYWORD_ESCAPE);
				}
				return parameter;
			}

			// UPSTREAM(sveltejs/acorn-typescript#147): remove once a release includes the fix
			/**
			 * `abstract` before `new` in a type, written with an escape, is
			 * TypeScript's TS1260: its parser reads an abstract constructor type.
			 * acorn-typescript read a type named `abstract` and failed at `new`.
			 * @type {Parse.Parser['isAbstractConstructorSignature']}
			 */
			isAbstractConstructorSignature() {
				if (this.type === tstt.abstract && this.containsEsc && this.lookahead().type === tt._new) {
					this.raise(this.start, KEYWORD_ESCAPE);
				}
				return super.isAbstractConstructorSignature();
			}

			// UPSTREAM(sveltejs/acorn-typescript#147): remove once a release includes the fix
			/**
			 * `require` before `(` in an import-equals declaration, written with an
			 * escape, is TypeScript's TS1260: its parser reads an external module
			 * reference. acorn-typescript read a name and failed at `(`.
			 * @type {Parse.Parser['tsIsExternalModuleReference']}
			 */
			tsIsExternalModuleReference() {
				if (
					this.containsEsc &&
					this.type === tt.name &&
					this.value === 'require' &&
					this.lookaheadCharCode() === CharCode.openParen
				) {
					this.raise(this.start, KEYWORD_ESCAPE);
				}
				return super.tsIsExternalModuleReference();
			}

			/**
			 * Report TS1260 at `enum`, or at `interface` before a name on its line,
			 * written with an escape where a statement starts, or after `const`:
			 * TypeScript's parser reads the keyword there, where acorn reported a
			 * reserved word or acorn-typescript `Unexpected token` at it
			 * (sveltejs/acorn-typescript#147).
			 */
			#checkEscapedDeclarationKeyword() {
				if (this.type === tt._const) {
					regex_escaped_word.lastIndex = this.nextTokenStart();
					if (!regex_escaped_word.test(this.input)) return;
					const next = this.lookahead();
					if (next.type === tstt.enum) this.raise(next.start, KEYWORD_ESCAPE);
					return;
				}
				if (
					this.containsEsc &&
					(this.type === tstt.enum ||
						(this.type === tstt.interface && this.#declarationAfterModifier(0) !== null))
				) {
					this.raise(this.start, KEYWORD_ESCAPE);
				}
			}

			// UPSTREAM(sveltejs/acorn-typescript#113): remove once a release includes the fix
			// UPSTREAM(sveltejs/acorn-typescript#124): remove once a release includes the fix
			/**
			 * A class after `export default` is a declaration whose name is optional,
			 * with or without `abstract` and decorators, as in TypeScript:
			 *
			 * - `export default abstract class {}`: acorn-typescript parsed the
			 *   abstract class with a required name (sveltejs/acorn-typescript#113,
			 *   also in #110).
			 * - `export default @dec class B {}` and
			 *   `export default @dec abstract class {}`: acorn-typescript left the `@`
			 *   to acorn, which parses an expression there, so the class became a
			 *   class expression, and `abstract` an identifier followed by an
			 *   unexpected `class`. Read the decorators first, as `parseStatement`
			 *   does, then parse the class declaration, which takes them and starts at
			 *   the first one (sveltejs/acorn-typescript#124).
			 *
			 * A class after `export default (` stays an expression, and so do the
			 * at-sign constructs (`export default @if (a) { … }`), which aren't
			 * decorators (see `parseExprAtom`).
			 *
			 * `interface` starts an interface declaration there wherever its name is
			 * (see `hasFollowingLineBreak`, sveltejs/acorn-typescript#144).
			 * `interface`, and `abstract` before a class, written with an escape, are
			 * TypeScript's TS1260 `Keywords cannot contain escape characters.`: its
			 * parser reads them as the keywords, where acorn-typescript failed at the
			 * name or the class (sveltejs/acorn-typescript#147).
			 * @type {Parse.Parser['parseExportDefaultDeclaration']}
			 */
			parseExportDefaultDeclaration() {
				const decorated =
					this.type === tstt.at &&
					!this.#isCodeBlockStart(this.start) &&
					!this.#isJSXControlFlowDirectiveStart();
				const parse = () => {
					if (decorated) {
						// Throws unless a class follows, as for decorators before a
						// statement, which they are (see `parseDecorators`).
						this.#readingDefaultExportDecorators = true;
						this.parseDecorators();
					}
					if (this.type === tstt.interface) {
						if (this.containsEsc) this.raise(this.start, KEYWORD_ESCAPE);
						this.#defaultExportInterfaceStart = this.start;
					} else if (
						this.type === tstt.abstract &&
						this.containsEsc &&
						this.lookahead().type === tt._class &&
						!this.#lineBreakAfter(this.end)
					) {
						this.raise(this.start, KEYWORD_ESCAPE);
					}
					if (this.isAbstractClass()) {
						const node = /** @type {AST.ClassDeclaration} */ (this.startNode());
						this.next(); // `abstract`
						node.abstract = true;
						return this.parseClass(node, 'nullableID');
					}
					if (decorated && this.type === tt._class) {
						return this.parseClass(this.startNode(), 'nullableID');
					}
					return super.parseExportDefaultDeclaration();
				};
				return decorated && this.#collect ? this.#parseDecoratedStatement(parse) : parse();
			}

			/**
			 * TypeScript's parser takes decorators before any declaration and reports
			 * those before something other than a class from its checker (TS1206,
			 * whatever `experimentalDecorators` says): `@dec function f() {}`,
			 * `@dec const x = 1;`, `export @dec function f() {}`,
			 * `export default @dec function f() {}`, `@dec export function f() {}`.
			 * acorn-typescript throws `Leading decorators must be attached to a class
			 * declaration.` for them. When collecting and a declaration follows, `raise`
			 * records it at the decorators instead and takes them off the decorator
			 * stack, so that no later class takes them, and the statement is parsed
			 * without them. Before anything else it still throws, as TypeScript's
			 * parser expects a declaration there: `#parseDecoratedStatement` throws it
			 * if the statement after all isn't one (`@dec type;`). Decorators in an
			 * expression (`const y = @dec 1;`) still throw.
			 * UPSTREAM(sveltejs/acorn-typescript#89)
			 * @type {Parse.Parser['parseDecorators']}
			 */
			parseDecorators(allowExport) {
				const outer = this.#leadingDecoratorsStart;
				// A statement's own decorators: acorn-typescript's `parseStatement` is
				// the only caller that allows `export` after them, and
				// `parseExportDefaultDeclaration` reads those after `export default`.
				const leading = allowExport || this.#readingDefaultExportDecorators;
				this.#readingDefaultExportDecorators = false;
				this.#leadingDecoratorsStart = this.#collect && leading ? this.start : -1;
				try {
					super.parseDecorators(allowExport);
					this.#checkDecoratorsBeforeExport();
				} finally {
					this.#leadingDecoratorsStart = outer;
				}
			}

			/**
			 * An at-sign construct (`@{ … }`, `@if`, `@for`, `@switch`, `@try`) after
			 * `export` isn't a declaration, though acorn-typescript takes any `@` there
			 * for the decorators of one. It's then `Unexpected token`, as any other
			 * token that starts neither a declaration nor the braces of an export
			 * (`export foo`), and after `export declare` acorn-typescript's error for
			 * a missing ambient declaration. It used to be parsed as a statement, and
			 * the parser crashed with a TypeError when `parseExport` read its `id`.
			 *
			 * `global` before `{` starts a global augmentation, which TypeScript's
			 * parser reads after `export` (or `export declare`), and reports from its
			 * checker (see `parseExportDeclaration`). acorn-typescript didn't take
			 * `global` for the start of a declaration, and failed at it
			 * (sveltejs/acorn-typescript#146).
			 * @type {Parse.Parser['shouldParseExportStatement']}
			 */
			shouldParseExportStatement() {
				if (
					this.type === tstt.at &&
					(this.#isCodeBlockStart(this.start) || this.#isJSXControlFlowDirectiveStart())
				) {
					return false;
				}
				// UPSTREAM(sveltejs/acorn-typescript#146): remove once a release includes the fix
				if (this.type === tstt.global && this.lookahead().type === tt.braceL) return true;
				return super.shouldParseExportStatement();
			}

			// UPSTREAM(sveltejs/acorn-typescript#132): remove once a release includes the fix
			// UPSTREAM(sveltejs/acorn-typescript#137): remove once a release includes the fix
			/**
			 * What follows `export` has to be a declaration. Where TypeScript's parser
			 * finds none, report its error, TS1128 `Declaration or statement
			 * expected.` at `export`:
			 *
			 * - `abstract`, `module`, `namespace` or `type` before a line break
			 *   (`export abstract` with `class A {}` on the next line), or before a
			 *   token that starts no declaration (`export abstract;`).
			 *   acorn-typescript's `shouldParseExportStatement` takes these words for
			 *   the start of one, but its `tsParseDeclaration` declines them, as
			 *   TypeScript does. `parseExportDeclaration` then parsed a statement,
			 *   which read the word as an expression, and `parseExport` crashed with
			 *   a TypeError reading that statement's `id`
			 *   (sveltejs/acorn-typescript#132).
			 * - `export declare` with a declaration on the next line, which
			 *   acorn-typescript read as an ambient declaration: TypeScript reads a
			 *   word as a modifier only before a token on the same line (see
			 *   `isAbstractClass`), so `declare` is an expression there
			 *   (sveltejs/acorn-typescript#137).
			 *
			 * `#checkExportDeclarationStart` reports the second before
			 * acorn-typescript reads `declare`, and the words that the declaration
			 * after them used to lose.
			 *
			 * A global augmentation after `export` (see `shouldParseExportStatement`)
			 * is TypeScript's checker error TS2668 `'export' modifier cannot be
			 * applied to ambient modules and module augmentations since they are
			 * always visible.`: a strict parse throws it, and a collecting one records
			 * it and keeps the export, as Prettier's `typescript` parser does
			 * (sveltejs/acorn-typescript#146). An export of an ambient declaration
			 * whose `declare` follows `abstract` (`export abstract declare class A
			 * {}`) is a type export, as after `export declare`
			 * (sveltejs/acorn-typescript#143).
			 * @type {Parse.Parser['parseExportDeclaration']}
			 */
			parseExportDeclaration(node) {
				// `parseExport` has just read `export`.
				const export_start = this.lastTokStart;
				this.#checkExportDeclarationStart(export_start);
				const declaration = super.parseExportDeclaration(node);
				if (
					declaration?.type !== 'VariableDeclaration' &&
					!(/** @type {{ id?: unknown } | null} */ (declaration)?.id)
				) {
					this.raise(export_start, DECLARATION_OR_STATEMENT_EXPECTED);
				}
				if (/** @type {{ declare?: boolean }} */ (declaration).declare) {
					/** @type {AST.ExportNamedDeclaration} */ (node).exportKind = 'type';
				}
				const module = /** @type {AST.Node} */ (declaration);
				if (module.type === 'TSModuleDeclaration' && module.kind === 'global') {
					this.raise(export_start, EXPORT_MODIFIER_ON_AUGMENTATION);
				}
				return declaration;
			}

			// UPSTREAM(sveltejs/acorn-typescript#132): remove once a release includes the fix
			// UPSTREAM(sveltejs/acorn-typescript#137): remove once a release includes the fix
			/**
			 * Report `export declare` before a line break (see
			 * `parseExportDeclaration`) before acorn-typescript reads `declare` as a
			 * modifier.
			 *
			 * acorn-typescript's `tsParseDeclaration` reads `abstract`, `module`,
			 * `namespace` or `type` after `export` (or `export declare`) before it
			 * checks what follows on the same line. When that isn't a class or a name
			 * (or a string after `module`), it declines, and `parseExportDeclaration`
			 * parses the rest as a statement without the word: `export abstract
			 * function f() {}`, `export type const x = 1;` and `export namespace
			 * class A {}` gave the plain exported declaration. Report the word
			 * before it's lost, as TypeScript's parser does:
			 *
			 * - `abstract` before a declaration is a modifier of that declaration,
			 *   which `tsParseDeclaration` reads, reporting TS1242 from TypeScript's
			 *   checker unless it's a class.
			 * - `type` after `declare`, or before `default` or `@`, starts a type
			 *   alias, whose name is missing (TS1003, or TS1359 for a reserved word),
			 *   or on the next line (TS1142). Before `=` or `as`, TypeScript expects
			 *   the braces of `export type { … }` (TS1005), where acorn-typescript
			 *   read a type alias named `as` (sveltejs/acorn-typescript#145).
			 * - `namespace` before a string starts a namespace without a name
			 *   (TS1003).
			 * - Otherwise the word starts no declaration (TS1128).
			 *
			 * Where TypeScript reads the word as the keyword, the word written with
			 * an escape is TS1260 first (sveltejs/acorn-typescript#147); before a
			 * name, `tsParseTypeAliasDeclaration` and
			 * `tsParseModuleOrNamespaceDeclaration` report it. A word before any
			 * other line break starts no declaration either, which
			 * `parseExportDeclaration` reports.
			 * @param {number} export_start
			 */
			#checkExportDeclarationStart(export_start) {
				const is_identifier = Parser.acornTypeScript.tokenIsIdentifier;
				let ahead = 0;
				let word = this.getCurLookaheadState();
				const declared = word.type === tstt.declare && !word.containsEsc;
				if (declared) {
					if (this.#lineBreakAfter(word.end)) {
						this.raise(export_start, DECLARATION_OR_STATEMENT_EXPECTED);
					}
					word = this.lookahead(++ahead);
				}
				const value = word.value;
				if (
					!is_identifier(word.type) ||
					(value !== 'abstract' && value !== 'type' && value !== 'namespace' && value !== 'module')
				) {
					return;
				}
				const next = this.lookahead(++ahead);
				const line_break = regex_line_break.test(this.input.slice(word.end, next.start));
				if (value === 'type') {
					// TypeScript's parser reads `export type` before `=`, `as`, `{` or `*`
					// as the start of `export type { … }` or `export type * …` (before `{`
					// or `*` only an escaped `type` gets here), and a type alias after
					// `declare type` or before `default` or `@`, on the same line or not.
					const braces =
						!declared &&
						(next.type === tt.eq ||
							next.type === tt.braceL ||
							next.type === tt.star ||
							(next.type === tt.name && next.value === 'as'));
					const alias = declared || next.type === tt._default || next.type === tstt.at;
					if ((braces || alias) && word.containsEsc) this.raise(word.start, KEYWORD_ESCAPE);
					if (braces) this.raise(next.start, OPENING_BRACE_EXPECTED);
					if (alias && line_break) this.raise(next.start, LINE_BREAK_NOT_PERMITTED);
					if (alias && !is_identifier(next.type)) this.#raiseIdentifierExpected(next);
				}
				if (line_break) return;
				if (value === 'abstract') {
					const declaration = this.#declarationAfterModifier(ahead);
					if (
						declaration === null ||
						declaration.includes('abstract') ||
						(declared && declaration[0] === 'declare')
					) {
						// No declaration, or a repeated modifier, which acorn-typescript's
						// `tsParseAbstractDeclaration` rejects at `abstract` after a name
						// (`export abstract abstract class A {}`).
						if (is_identifier(next.type)) return;
						this.raise(export_start, DECLARATION_OR_STATEMENT_EXPECTED);
					}
					// `tsParseDeclaration` reads the declaration, and reports `abstract`
					// before one that isn't a class.
					if (word.containsEsc) this.raise(word.start, KEYWORD_ESCAPE);
					return;
				}
				// What `tsParseDeclaration` reads after the word, which keeps the word.
				if (is_identifier(next.type) || (value === 'module' && next.type === tt.string)) return;
				if (value === 'namespace' && next.type === tt.string) {
					if (word.containsEsc) this.raise(word.start, KEYWORD_ESCAPE);
					this.#raiseIdentifierExpected(next);
				}
				this.raise(export_start, DECLARATION_OR_STATEMENT_EXPECTED);
			}

			/**
			 * Report TypeScript's error for a missing name at `token`: TS1359 for a
			 * reserved word, TS1003 for anything else.
			 * @param {Parse.LookaheadState} token
			 */
			#raiseIdentifierExpected(token) {
				this.raise(
					token.start,
					token.type.keyword
						? `Identifier expected. '${token.value}' is a reserved word that cannot be used here.`
						: IDENTIFIER_EXPECTED,
				);
			}

			// UPSTREAM(sveltejs/acorn-typescript#125): remove once a release includes the fix
			/**
			 * Decorators written before `export` decorate the class it exports, so
			 * only a class declaration can follow: `@dec export class A {}`,
			 * `@dec export default abstract class {}`. acorn-typescript checks what
			 * follows other leading decorators, but accepted any export after them,
			 * and the next class parsed took them: the class expression in
			 * `@dec export default (class {})` or `@dec export const A = class {}`.
			 * With no class, as in `@dec export function f() {}`, they were dropped.
			 * Report them at the exported declaration with acorn-typescript's error
			 * for leading decorators before something else (TypeScript's TS1206).
			 */
			#checkDecoratorsBeforeExport() {
				if (this.type !== tt._export) return;
				let ahead = 1;
				let next = this.lookahead(ahead);
				const is_default = next.type === tt._default;
				if (is_default) next = this.lookahead(++ahead);
				const declaration_start = next.start;
				// Decorators after `export` as well are checked when they are read. An
				// at-sign construct (`@if (a) { … }`, `@{ … }`) is no decorator.
				if (
					next.type === tstt.at &&
					!this.#isCodeBlockStart(declaration_start) &&
					!this.#isJSXControlFlowDirectiveAt(declaration_start)
				) {
					return;
				}
				// `declare` and `abstract` are modifiers only before a token on the same
				// line (see `isAbstractClass`): `@dec export default abstract` with
				// `class A {}` on the next line exports the value of `abstract`.
				/** @param {typeof next} modifier */
				const modifies = (modifier) => !modifier.containsEsc && !this.#lineBreakAfter(modifier.end);
				const declared = !is_default && next.type === tstt.declare && modifies(next);
				if (declared) next = this.lookahead(++ahead);
				if (next.type === tstt.abstract && modifies(next)) {
					next = this.lookahead(++ahead);
					// `abstract declare class A {}` (see `tsParseDeclaration`).
					if (!declared && !is_default && next.type === tstt.declare && modifies(next)) {
						next = this.lookahead(++ahead);
					}
				}
				if (next.type !== tt._class) {
					this.raise(declaration_start, UNEXPECTED_LEADING_DECORATOR);
				}
			}

			/**
			 * When the decorators before a statement are being read, collecting, and
			 * a declaration follows them, record their error at the first decorator,
			 * as TypeScript does, and take them off the decorator stack (see
			 * `parseDecorators`). An at-sign construct after `export`
			 * (`@dec export @if (a) { … }`) is no declaration.
			 * @param {number} position Where acorn-typescript raises the error
			 * @returns {boolean} Whether the error was recorded, and parsing goes on
			 */
			#dropLeadingDecorators(position) {
				const start = this.#leadingDecoratorsStart;
				if (
					start === -1 ||
					!this.#atDeclarationKeyword() ||
					this.#isCodeBlockStart(position) ||
					this.#isJSXControlFlowDirectiveAt(position)
				) {
					return false;
				}
				this.#recordCheckerLevelError(start, start + 1, UNEXPECTED_LEADING_DECORATOR);
				this.#droppedDecoratorsError = { position, message: UNEXPECTED_LEADING_DECORATOR };
				const index = this.decoratorStack.length - 1;
				this.parseEffects?.willSet(this.decoratorStack, String(index));
				this.decoratorStack[index] = [];
				return true;
			}

			/**
			 * Whether the current token starts a declaration in TypeScript's parser
			 * after decorators (`parseDeclarationWorker`, and the modifiers
			 * `parseModifiers` reads before one). Some of these words start an
			 * expression here (`type;`), which `#parseDecoratedStatement` checks.
			 */
			#atDeclarationKeyword() {
				switch (this.type) {
					case tt._var:
					case tt._const:
					case tt._function:
					case tt._class:
					case tt._import:
					case tt._export:
						return true;
				}
				return (
					Parser.acornTypeScript.tokenIsIdentifier(this.type) &&
					!this.containsEsc &&
					DECLARATION_KEYWORDS.has(/** @type {string} */ (this.value))
				);
			}

			/**
			 * Parse a statement, or the declaration after `export default`, that
			 * starts with decorators, when collecting, and throw the error
			 * `#dropLeadingDecorators` recorded for them, where acorn-typescript
			 * raises it, unless it is a declaration.
			 * @template {{ type: string }} T
			 * @param {() => T} parse
			 * @returns {T}
			 */
			#parseDecoratedStatement(parse) {
				const outer = this.#droppedDecoratorsError;
				this.#droppedDecoratorsError = null;
				try {
					const node = parse();
					// Set by `#dropLeadingDecorators` while `parse` runs.
					const error = /** @type {{ position: number, message: string } | null} */ (
						this.#droppedDecoratorsError
					);
					if (error && !DECORATED_DECLARATION_TYPES.has(node.type)) {
						super.raise(error.position, error.message);
					}
					return node;
				} finally {
					this.#droppedDecoratorsError = outer;
				}
			}

			// UPSTREAM(sveltejs/acorn-typescript#126): remove once a release includes the fix
			// UPSTREAM(sveltejs/acorn-typescript#133): remove once a release includes the fix
			/**
			 * Only a parameter can have decorators. acorn-typescript read them on the
			 * elements of an array pattern too (`const [@dec x] = y;`), since acorn
			 * parses those with this method, and they were dropped from the output.
			 * TypeScript rejects them (TS1181), so a decorator there is
			 * `Unexpected token`, as in an object pattern, before a rest element too
			 * (sveltejs/acorn-typescript#133).
			 *
			 * A rest parameter can have decorators, as in TypeScript:
			 * `m(@dec ...rest: T[]) {}`. TypeScript's parser reads them like the
			 * decorators of any other parameter, which this parser takes too, and
			 * its checker decides whether they are allowed (TS1206 unless
			 * `experimentalDecorators` allows parameter decorators). acorn's
			 * `parseBindingList` checks for `...` before it calls this method, where
			 * acorn-typescript reads the decorators, so a `...` after them reached
			 * `parseMaybeDefault`, which rejects it. Read the decorators here, and
			 * before `...` hang them off the `RestElement`, as typescript-estree
			 * does. Like other parameters, the element's range leaves them out. The
			 * list takes the rest element for an ordinary one, so report a comma
			 * after it here as acorn does (TS1013, TS1014), recording it when
			 * collecting as `parseBindingList` does. Modifiers before a rest parameter
			 * are `#parseRestParameterProperty`'s.
			 * @type {Parse.Parser['parseAssignableListItem']}
			 */
			parseAssignableListItem(allowModifiers) {
				if (this.type !== tstt.at) return this.#parseAssignableListItem(allowModifiers);
				if (this.#bindingListClose === tt.bracketR) this.unexpected();
				/** @type {AST.Decorator[]} */
				const decorators = [];
				while (this.type === tstt.at) decorators.push(this.parseDecorator());
				if (this.type !== tt.ellipsis) {
					const item = this.#parseAssignableListItem(allowModifiers);
					// As in acorn-typescript, a parameter property's decorators hang off
					// its parameter.
					const node = /** @type {AST.Node} */ (item);
					const decorated = /** @type {AST.Node & { decorators?: AST.Decorator[] }} */ (
						node.type === 'TSParameterProperty' ? node.parameter : node
					);
					decorated.decorators = decorators;
					return item;
				}
				const rest = /** @type {AST.RestElement & { decorators?: AST.Decorator[] }} */ (
					this.parseRestBinding()
				);
				this.parseBindingListItem(rest);
				rest.decorators = decorators;
				this.#reportCommaAfterRestParameter();
				return rest;
			}

			/**
			 * acorn-typescript's `parseAssignableListItem`, after any decorators, or
			 * the rest element after parameter property modifiers
			 * (`#parseRestParameterProperty`). Records where the item starts for
			 * `raise`.
			 *
			 * acorn-typescript raises TS1187 for a parameter property whose parameter
			 * is a binding pattern, but not for one with a default
			 * (`constructor(public [a] = [1])`), whose output then keeps the pattern
			 * after the modifier. TypeScript's checker reports both. Raise it for the
			 * pattern before the default too, at the same place.
			 * @param {boolean | undefined} allowModifiers
			 * @returns {AST.Pattern}
			 */
			#parseAssignableListItem(allowModifiers) {
				this.#assignableListItemStart = this.start;
				const item = /** @type {AST.Node} */ (
					(this.#collect &&
						allowModifiers !== undefined &&
						this.#parseRestParameterProperty(allowModifiers)) ||
						super.parseAssignableListItem(allowModifiers)
				);
				if (
					item.type === 'TSParameterProperty' &&
					item.parameter.type === 'AssignmentPattern' &&
					item.parameter.left.type !== 'Identifier'
				) {
					// UPSTREAM(sveltejs/acorn-typescript#138): remove once a release includes the fix
					this.raise(/** @type {number} */ (item.start), PATTERN_PARAMETER_PROPERTY);
				}
				return /** @type {AST.Pattern} */ (item);
			}

			/**
			 * TypeScript's parser reads parameter property modifiers before a rest
			 * parameter too (`constructor(public ...rest: T[]) {}`), and its checker
			 * reports TS1317. acorn-typescript reads the modifiers and then a name or
			 * a pattern, and fails at the `...`. When collecting, read the rest
			 * element after the modifiers, record TS1317 at them, and keep the rest
			 * element as the parameter, without them: typescript-estree rejects a rest
			 * parameter property, so there is no node to mirror. A strict parse still
			 * fails at the `...`. Returns `null`, having read nothing, when no rest
			 * element follows the modifiers. On a function's parameter
			 * (`allowModifiers` is `false`), the modifiers are TS2369 too.
			 * UPSTREAM(sveltejs/acorn-typescript#89)
			 * @param {boolean} allowModifiers
			 * @returns {AST.RestElement | null}
			 */
			#parseRestParameterProperty(allowModifiers) {
				if (!PARAMETER_MODIFIERS.includes(/** @type {string} */ (this.value))) return null;
				const start = this.start;
				const modifiers_end = this.tsTryParse(() => {
					this.tsParseModifiers({ modified: {}, allowedModifiers: PARAMETER_MODIFIERS });
					return this.type === tt.ellipsis && this.lastTokEnd;
				});
				if (modifiers_end === undefined) return null;
				this.#recordCheckerLevelError(start, modifiers_end, REST_PARAMETER_PROPERTY);
				if (!allowModifiers) {
					this.#recordCheckerLevelError(start, start + 1, UNEXPECTED_PARAMETER_MODIFIER);
				}
				const rest = this.parseRestBinding();
				this.parseBindingListItem(rest);
				this.#reportCommaAfterRestParameter();
				return rest;
			}

			/**
			 * A rest element that `parseAssignableListItem` reads is an ordinary
			 * element to the list, so report a comma after it here as acorn does
			 * (TS1013, TS1014), recording it when collecting as `parseBindingList`
			 * does. A trailing comma is allowed in an ambient context.
			 */
			#reportCommaAfterRestParameter() {
				if (this.type !== tt.comma || this.#isAmbientRestParameterTrailingComma()) return;
				if (this.#collect) {
					this.#recordCheckerLevelError(this.start, this.start + 1, REST_ELEMENT_TRAILING_COMMA);
				} else {
					this.raiseRecoverable(this.start, REST_ELEMENT_TRAILING_COMMA);
				}
			}

			/**
			 * acorn-typescript takes a `?` after any element of a binding list and
			 * raises TS2463's message for anything but a name. TypeScript's parser
			 * takes it only after a parameter:
			 *
			 * - A parameter that is a binding pattern can be optional (`{ a }?: T`).
			 *   acorn-typescript raises TS2463 for it while it reads the parameter,
			 *   before it knows whether a body follows, so an overload signature got
			 *   the error too. Accept the `?` as sveltejs/acorn-typescript#110 does,
			 *   with the same AST; `parseFunctionBody` reports it for a function with a
			 *   body.
			 * - An optional rest parameter (`...a?: T[]`) is TypeScript's TS1047, from
			 *   its checker. Report that where acorn-typescript raised TS2463's message
			 *   (not in a type or an ambient context), at the `?`, and keep the node
			 *   #110 gives it (`optional: true`).
			 * - An element of an array pattern (`[a?]`, `[{ a }?]`, `[...a?]`) takes no
			 *   `?`: TypeScript's parser expects a `,` there, and this throws acorn's
			 *   `Unexpected token` at the `?` in every mode
			 *   (sveltejs/acorn-typescript#130, where #110 accepts it with no error).
			 * @type {Parse.Parser['parseBindingListItem']}
			 */
			parseBindingListItem(param) {
				if (this.type === tt.question) {
					if (this.#bindingListClose === tt.bracketR) {
						// UPSTREAM(sveltejs/acorn-typescript#130): remove once a release includes the fix
						this.unexpected();
					}
					if (this.#bindingListClose === tt.parenR) {
						const optional = /** @type {AST.Pattern & { optional?: boolean }} */ (param);
						if (param.type === 'ObjectPattern' || param.type === 'ArrayPattern') {
							// UPSTREAM(sveltejs/acorn-typescript#110): remove once a release includes the fix
							this.next();
							optional.optional = true;
						} else if (param.type === 'RestElement' && !this.isAmbientContext && !this.inType) {
							const question = this.start;
							this.next();
							optional.optional = true;
							// acorn-typescript reads a generic async arrow function's
							// parameters in a `tsTryParseAndCatch`, before its `=>`, and takes
							// an error there to mean that it isn't one. `parseFunctionBody`
							// raises it after the `=>`, as for other arrow functions (see
							// `#parseGenericArrowFunction`).
							// UPSTREAM(sveltejs/acorn-typescript#141): remove once a release includes the fix
							if (!this.#readingGenericArrowParameters) {
								this.raise(question, OPTIONAL_REST_PARAMETER);
							}
						}
					}
				}
				return super.parseBindingListItem(param);
			}

			// UPSTREAM(sveltejs/acorn-typescript#121): remove once a release includes the fix
			// UPSTREAM(sveltejs/acorn-typescript#147): remove once a release includes the fix
			/**
			 * `assert` starts import assertions only on the line the import or
			 * export ends on, as in TypeScript and the import assertions grammar.
			 * After a line break it starts the next statement: `import "x"` with
			 * `assert(ok)` on the next line is an import and a call. `with` has no
			 * such rule (sveltejs/acorn-typescript#121).
			 *
			 * `assert` written with an escape is TypeScript's TS1260 `Keywords cannot
			 * contain escape characters.`: its parser reads it as the keyword, where
			 * acorn-typescript read the assertions without an error
			 * (sveltejs/acorn-typescript#147).
			 * @type {Parse.Parser['parseMaybeImportAttributes']}
			 */
			parseMaybeImportAttributes(node) {
				if (this.type === tstt.assert) {
					if (this.hasPrecedingLineBreak()) return;
					if (this.containsEsc) this.raise(this.start, KEYWORD_ESCAPE);
				}
				super.parseMaybeImportAttributes(node);
			}

			// UPSTREAM(sveltejs/acorn-typescript#116): remove once a release includes the fix
			/**
			 * Reads the entries of import attributes, `with { … }`, comparing keys by
			 * their value, as ECMAScript and acorn do: `'type'` is the same key as
			 * `type`. acorn-typescript compared `key.name`, which a quoted key doesn't
			 * have, so a second quoted key was a duplicate and `type` never matched
			 * `'type'`. Otherwise this is acorn-typescript's method, as fixed in
			 * sveltejs/acorn-typescript#116 (and #110), error message included.
			 * @type {Parse.Parser['parseWithEntries']}
			 */
			parseWithEntries() {
				/** @type {AST.ImportAttribute[]} */
				const attributes = [];
				/** @type {Set<unknown>} */
				const keys = new Set();
				do {
					if (this.type === tt.braceR) break;
					const node = this.startNode();
					// estree's `Node` types leave out `ImportAttribute`.
					const attribute = /** @type {AST.ImportAttribute} */ (/** @type {unknown} */ (node));
					attribute.key =
						this.type === tt.string ? this.parseLiteral(this.value) : this.parseIdent(true);
					this.next();
					const key = attribute.key.type === 'Literal' ? attribute.key.value : attribute.key.name;
					if (keys.has(key)) {
						this.raise(this.pos, 'Duplicated key in attributes');
					}
					keys.add(key);
					if (this.type !== tt.string) {
						this.raise(this.pos, 'Only string is supported as an attribute value');
					}
					attribute.value = this.parseLiteral(this.value);
					this.finishNode(
						node,
						/** @type {AST.Node['type']} */ (/** @type {string} */ ('ImportAttribute')),
					);
					attributes.push(attribute);
				} while (this.eat(tt.comma));
				return attributes;
			}

			/**
			 * Override parsePropertyValue to support TypeScript generic methods in object literals.
			 * By default, acorn-typescript doesn't handle `{ method<T>() {} }` syntax.
			 * This override checks for type parameters before parsing the method.
			 * @type {Parse.Parser['parsePropertyValue']}
			 */
			parsePropertyValue(
				prop,
				isPattern,
				isGenerator,
				isAsync,
				startPos,
				startLoc,
				refDestructuringErrors,
				containsEsc,
			) {
				// A method's type parameters on the line after its name (`m\n<T>() {}`).
				if (!isPattern) {
					this.#readTagStartAsTypeParameterStart();
				}
				// Check if this is a method with type parameters (e.g., `method<T>() {}`)
				// We need to parse type parameters before the parentheses
				if (
					!isPattern &&
					!isGenerator &&
					!isAsync &&
					this.type === tt.relational &&
					this.value === '<'
				) {
					// Try to parse type parameters, `const` ones too (`m<const T>() {}`), as
					// acorn-typescript does for the methods it parses.
					const typeParameters = this.tsTryParseTypeParameters(this.tsParseConstModifier);
					if (typeParameters && this.type === tt.parenL) {
						// This is a method with type parameters
						/** @type {AST.Property} */ (prop).method = true;
						/** @type {AST.Property} */ (prop).kind = 'init';
						/** @type {AST.Property} */ (prop).value = this.parseMethod(false, false);
						/** @type {AST.FunctionExpression} */ (
							/** @type {AST.Property} */ (prop).value
						).typeParameters = typeParameters;
						this.#startMethodAtTypeParameters(/** @type {AST.Property} */ (prop));
						return;
					}
				}

				super.parsePropertyValue(
					prop,
					isPattern,
					isGenerator,
					isAsync,
					startPos,
					startLoc,
					refDestructuringErrors,
					containsEsc,
				);
				// UPSTREAM(sveltejs/acorn-typescript#127): remove once a release includes the fix
				// A generic `async` or generator method, getter, or setter, which
				// acorn-typescript parses (its `parsePropertyValue` and
				// `parseGetterSetter`)
				this.#startMethodAtTypeParameters(/** @type {AST.Property} */ (prop));
			}

			/**
			 * Like typescript-estree, an object method's function starts at its type
			 * parameters, not at its `(`, so that they lie inside it: a comment in
			 * them (`m</* c *\/ T>() {}`) leads or trails a type parameter rather than
			 * the whole function or the key before it. A class method keeps its type
			 * parameters on the method definition instead.
			 * @param {AST.Property} prop
			 */
			#startMethodAtTypeParameters(prop) {
				const value = /** @type {AST.FunctionExpression} */ (prop.value);
				const typeParameters = /** @type {AST.Node | undefined} */ (value?.typeParameters);
				if (
					value?.type === 'FunctionExpression' &&
					typeParameters &&
					/** @type {AST.NodeWithLocation} */ (typeParameters).start <
						/** @type {AST.NodeWithLocation} */ (value).start
				) {
					this.resetStartLocationFromNode(value, typeParameters);
				}
			}

			/**
			 * Acorn expects `this.context` to always contain at least one tokContext.
			 * Some of our template/JSX escape hatches can pop contexts aggressively;
			 * if the stack becomes empty, Acorn will crash reading `curContext().override`.
			 * @type {Parse.Parser['nextToken']}
			 */
			nextToken() {
				while (this.context.length && this.context[this.context.length - 1] == null) {
					this.#popContext();
				}
				if (this.context.length === 0) {
					this.context.push(b_stat);
				}
				return super.nextToken();
			}

			/**
			 * @returns {Parse.CommentMetaData | null}
			 */
			#createCommentMetadata() {
				if (this.#path.length === 0) {
					return null;
				}

				const container = this.#path[this.#path.length - 1];
				if (!this.#isNativeTemplateNode(container)) {
					return null;
				}

				// A directive's `{ }` block is a native template node too, and it has no
				// `children`, so read the slot defensively.
				const container_children = /** @type {{ children?: unknown }} */ (container).children;
				const children = Array.isArray(container_children)
					? /** @type {AST.Node[]} */ (container_children)
					: [];
				const hasMeaningfulChildren = children.some(
					(child) => child && !isWhitespaceTextNode(child),
				);

				if (hasMeaningfulChildren) {
					return null;
				}

				container.metadata ??= { path: [] };
				if (container.metadata.commentContainerId === undefined) {
					container.metadata.commentContainerId = ++this.#commentContextId;
				}

				return /*** @type {Parse.CommentMetaData} */ ({
					containerId: container.metadata.commentContainerId,
					childIndex: children.length,
					beforeMeaningfulChild: !hasMeaningfulChildren,
				});
			}

			/**
			 * Helper method to get the element name from a JSX identifier or member expression
			 * @type {Parse.Parser['getElementName']}
			 */
			getElementName(node) {
				if (!node) return null;
				if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
					return node.name;
				} else if (node.type === 'MemberExpression' || node.type === 'JSXMemberExpression') {
					// For components like <Foo.Bar>, return "Foo.Bar"
					return this.getElementName(node.object) + '.' + this.getElementName(node.property);
				} else if (this.#isDynamicJSXElementName(node)) {
					// Dynamic tags (`<{Tag}>`) name by expression source. The braces keep
					// them from colliding with static tag names ('style', 'head', ...) and
					// read as source syntax in error messages (`</{Tag}>`).
					const expression = node.expression;
					return `{${this.input.slice(expression.start, expression.end).trim()}}`;
				}
				return null;
			}

			/**
			 * @param {AST.Node | '' | null | undefined} name
			 * @returns {name is ESTreeJSX.JSXExpressionContainer}
			 */
			#isDynamicJSXElementName(name) {
				return (
					!!name &&
					typeof name !== 'string' &&
					name.type === 'JSXExpressionContainer' &&
					name.isDynamic === true
				);
			}

			/**
			 * Acorn allows an expression after a name only for `of` and `yield`.
			 * Where `await` is a keyword (an async function, or the module top level),
			 * it is a unary operator like `yield`, so the token after it starts an
			 * expression: `await <div />` awaits an element instead of comparing.
			 *
			 * acorn-typescript takes a `/` right after a tag start for a closing tag's
			 * and drops the two contexts the tag start pushed. When an element attempt
			 * fails, `parseMaybeAssign` drops them itself and tries a generic arrow
			 * from the same `<`, which reads that `/` again: the second drop goes below
			 * the stack's start at the top of a statement (`x = </>;`), and the
			 * `RangeError` replaces the element attempt's syntax error. Without the
			 * tag start's `tc_oTag` on top, the `/` is no closing tag's and updates the
			 * context as acorn's does.
			 * @type {Parse.Parser['updateContext']}
			 */
			updateContext(prevType) {
				if (
					this.type === tt.slash &&
					prevType === tstt.jsxTagStart &&
					this.curContext() !== tstc.tc_oTag
				) {
					// UPSTREAM(sveltejs/acorn-typescript#134): remove once a release includes the fix
					// acorn's own `updateContext` for `/`, which is `beforeExpr`.
					this.exprAllowed = true;
					return;
				}
				super.updateContext(prevType);
				if (
					this.type === tt.name &&
					this.value === 'await' &&
					prevType !== tt.dot &&
					prevType !== tt.questionDot &&
					this.canAwait
				) {
					this.exprAllowed = true;
				}
			}

			/**
			 * Parse an import type, `import("./data.json", { with: { type: "json" } }).Data`.
			 * acorn-typescript expects the `)` right after the module specifier, so
			 * it rejects the import attributes TypeScript 5.3 allows as a second
			 * argument. They go on `options`, the name acorn's `ImportExpression` and
			 * typescript-estree use: the object expression, or `null` without one.
			 * TypeScript requires an object literal there, and unlike `import()` it
			 * takes no trailing comma after either argument
			 * (microsoft/TypeScript#61489), so neither does this.
			 * @type {Parse.Parser['tsParseImportType']}
			 */
			tsParseImportType() {
				// UPSTREAM(sveltejs/acorn-typescript#110): remove once a release includes the fix
				const node = /** @type {AST.TSImportType} */ (this.startNode());
				this.expect(tt._import);
				this.expect(tt.parenL);
				if (!this.match(tt.string)) {
					this.raise(this.start, 'Argument in a type import must be a string literal.');
				}
				// For estree compatibility the specifier is a `Literal`, as in acorn-typescript.
				node.argument = /** @type {AST.TSImportType['argument']} */ (this.parseExprAtom());
				node.options = null;
				if (this.eat(tt.comma)) {
					if (!this.match(tt.braceL)) this.unexpected();
					node.options = /** @type {AST.ObjectExpression} */ (this.parseObj(false));
				}
				this.expect(tt.parenR);
				if (this.eat(tt.dot)) {
					node.qualifier = this.tsParseEntityName();
				}
				if (this.tsMatchLeftRelational()) {
					node.typeArguments = this.tsParseTypeArguments();
				}
				return this.finishNode(node, /** @type {AST.TSImportType['type']} */ ('TSImportType'));
			}

			/**
			 * The token after a type is read while still inside the type, where `<`
			 * is always a type operator. Once the outermost type has ended, a `<` that
			 * starts its own line is read again by the rules for code, so an element
			 * there starts a new statement after `const x = y as T` or `let x: T`, as
			 * it does after `const x = y`. Inside a type (`type F =\n  <T>() => T`,
			 * a call signature after a member) the `<` stays a type operator.
			 * @type {Parse.Parser['tsInType']}
			 */
			tsInType(cb) {
				if (this.inType) return super.tsInType(cb);
				const type = super.tsInType(cb);
				if (
					this.type === tt.relational &&
					this.value === '<' &&
					this.hasPrecedingLineBreak() &&
					can_start_tag_after_lt(this.input, this.start)
				) {
					this.pos = this.start;
					// As after the value that ends `const x = y`.
					this.exprAllowed = false;
					this.nextToken();
				}
				return type;
			}

			/**
			 * `<T,>(x: T) => x` and `<T>(x: T): T => x` should parse as generic
			 * arrow functions, not JSX elements. acorn-typescript's `readToken`
			 * can otherwise tokenize `<` as `jsxTagStart` when expression parsing
			 * allows JSX, bypassing our `getTokenFromCode` override. We intercept
			 * only when the source from `<` actually looks like a generic arrow
			 * expression, so JSX like `<div>` keeps parsing normally.
			 *
			 * @type {Parse.Parser['readToken']}
			 */
			readToken(code) {
				const suppressTemplateRawTextToken = this.#suppressTemplateRawTextToken;
				this.#suppressTemplateRawTextToken = false;
				const afterOptionalMemberName = this.#afterOptionalMemberName;
				this.#afterOptionalMemberName = false;
				const context = this.curContext();
				if (
					(code !== CharCode.lessThan || !can_start_tag_after_lt(this.input, this.pos)) &&
					code !== CharCode.greaterThan &&
					code !== CharCode.openBrace &&
					code !== CharCode.closeBrace &&
					!suppressTemplateRawTextToken &&
					this.#shouldReadTemplateRawTextToken()
				) {
					return this.#readTemplateRawTextToken();
				}
				if (
					code === CharCode.greaterThan &&
					this.input.charCodeAt(this.pos - 1) === CharCode.equals
				) {
					const start = this.pos - 1;
					const loc = get_line_info(this, start);
					this.start = start;
					this.startLoc = loc;
					this.pos++;
					return this.finishToken(tt.arrow);
				}
				if (code === CharCode.lessThan && this.type !== tstt.jsxText) {
					// After a JSX text token a `<` can only open a tag; without this guard
					// text ending in an identifier character (`hello<div>`) would read as
					// the start of a type argument list (`hello<T>`).
					const next = this.input.charCodeAt(this.pos + 1);
					if (
						afterOptionalMemberName ||
						(next !== CharCode.slash &&
							(looks_like_generic_arrow(this.input, this.pos) ||
								this.#canStartTypeParameterOrArgumentList(this.pos)))
					) {
						++this.pos;
						return this.finishToken(tt.relational, '<');
					}
				}
				if (context === tstc.tc_expr || context === tstc.tc_oTag || context === tstc.tc_cTag) {
					return super.readToken(code);
				}
				if (code === CharCode.lessThan && !this.inType) {
					if (this.exprAllowed && can_start_tag_after_lt(this.input, this.pos)) {
						++this.pos;
						return this.finishToken(tstt.jsxTagStart);
					}
				}
				return super.readToken(code);
			}

			/**
			 * Get token from character code - handles TSRX-specific tokens
			 * @type {Parse.Parser['getTokenFromCode']}
			 */
			getTokenFromCode(code) {
				// acorn-typescript only recognizes `@` as the at-token when it is not
				// reading a type. A return-type annotation (`function f(): T @{ … }`)
				// finishes while still `inType`, so its trailing `@` reaches the base
				// tokenizer, which throws "Unexpected character '@'". Emit the at-token
				// here so the `@{ … }` code block that follows the type can be parsed.
				if (code === CharCode.at && this.inType) {
					++this.pos;
					return this.finishToken(tstt.at);
				}

				if (
					code === CharCode.greaterThan &&
					this.input.charCodeAt(this.pos - 1) === CharCode.equals
				) {
					const start = this.pos - 1;
					const loc = get_line_info(this, start);
					this.start = start;
					this.startLoc = loc;
					this.pos++;
					return this.finishToken(tt.arrow);
				}

				// Callback props that return native templates without a semicolon can
				// leave the attribute expression context above the still-open tag. Drop
				// it before tokenizing `/>`, otherwise Acorn treats `/` as a regexp.
				// Where an expression may start outside a tag (`const re = />/g`,
				// `f(/>/)`, `{/>/.test(s)}`), the `/` starts that regexp instead. Right
				// after a tag start, it is the `/` of a closing tag (`</>`).
				if (
					code === CharCode.slash &&
					this.input.charCodeAt(this.pos + 1) === CharCode.greaterThan &&
					this.type !== tstt.jsxTagStart &&
					(!this.exprAllowed || this.curContext() === tstc.tc_oTag)
				) {
					while (
						this.context.length > 0 &&
						this.curContext() !== tstc.tc_oTag &&
						this.curContext() !== tstc.tc_expr
					) {
						this.#popContext();
					}
					if (this.curContext() !== tstc.tc_oTag) {
						this.context.push(tstc.tc_oTag);
					}
					this.exprAllowed = false;
				}

				// A `/` or `#` in template TEXT position joins the text run as a
				// literal character (`<div>5/2</div>`, `<div>#tag</div>`). This must
				// not fire in the JS positions that can sit under a template element
				// on the path: inside a `{ … }` expression container (an attribute or
				// child expression — `<rect x={a / 2}/>`, `{this.#x}`) or a spread
				// attribute's argument, read as one (`{...(a / 2)}`), inside a
				// control-flow directive header (`@if (a / 2 > 1)`), or in an opening
				// tag (`<div / >`), where `/` is division or a self-closing tag's and
				// `#` is a private-field access.
				// The element being opened goes on `#path` only for the token after
				// its `>`, which is its first child.
				const template_parent = this.#path.at(-1);
				if (
					(code === CharCode.numberSign || code === CharCode.slash) &&
					this.#functionBodyDepth === 0 &&
					this.#jsxExpressionContainerDepth === 0 &&
					!this.#readingJSXControlFlowHeader &&
					this.#isNativeTemplateNode(template_parent) &&
					(!this.#openingNativeTemplateNode ||
						this.#openingNativeTemplateNode === template_parent) &&
					!(
						code === CharCode.slash &&
						(this.input.charCodeAt(this.pos - 1) === CharCode.lessThan ||
							this.input.charCodeAt(this.pos + 1) === CharCode.greaterThan)
					)
				) {
					++this.pos;
					return this.finishToken(tt.name, this.input.slice(this.start, this.pos));
				}

				// Inside a type (`new <T>()`, `f?<T>()`, the re-scanned `<<` of
				// `f<<T>() => T>()`) a `<` is never a JSX tag; acorn-typescript reads it
				// as a lone `<` there, so the JSX heuristics below only run outside types.
				if (code === CharCode.lessThan && !this.inType) {
					// < character
					const parent = this.#path.at(-1);
					const inNativeTemplate =
						this.#functionBodyDepth === 0 && this.#isNativeTemplateNode(parent);
					/** @type {number | null} */
					let prevNonWhitespaceChar = null;
					const nextChar =
						this.pos + 1 < this.input.length ? this.input.charCodeAt(this.pos + 1) : -1;

					// As in TSX, `</` starts a closing tag even after an operand, where a
					// `<` is otherwise less-than and a `/` after it would start a regular
					// expression. The expression ends there, so `<p>{count</p>` reports
					// the missing `}` at the `</`. `a < /re/` with a space is less-than.
					if (!this.exprAllowed && nextChar === CharCode.slash) {
						const after_slash = this.input.charCodeAt(this.pos + 2);
						if (after_slash !== CharCode.slash && after_slash !== CharCode.asterisk) {
							++this.pos;
							return this.finishToken(tstt.jsxTagStart);
						}
					}

					// Check if this could be TypeScript generics instead of JSX
					// TypeScript generics usually appear adjacent to an expression token,
					// for example: Array<T>, func<T>(), new Map<K,V>(), method<T>().
					// This check applies everywhere, not just inside components

					// Look back to see what precedes the <
					const lookback = this.#previousNonSpaceTabIndex(this.pos);

					// Check what character/token precedes the <
					if (lookback >= 0) {
						// Comments are skipped, so `/* note */ <div />` on its own line still
						// starts a tag after a statement without a semicolon.
						const previous = this.#previousNonSpaceTabCommentIndex(this.pos);
						prevNonWhitespaceChar = previous >= 0 ? this.input.charCodeAt(previous) : null;

						if (
							nextChar !== CharCode.slash &&
							this.#canStartTypeParameterOrArgumentList(this.pos)
						) {
							++this.pos;
							return this.finishToken(tt.relational, '<');
						}
					}

					// Support parsing standalone template markup at the top-level
					// for tooling like Prettier, e.g.:
					// <Something>...</Something>\n\n<Child />
					// <head><style>...</style></head>
					// We only do this when '<' is in a tag-like position.
					const isTagLikeAfterLt = can_start_tag_after_lt(this.input, this.pos);
					const prevAllowsTagStart =
						prevNonWhitespaceChar === null ||
						prevNonWhitespaceChar === CharCode.lineFeed || // '\n'
						prevNonWhitespaceChar === CharCode.carriageReturn || // '\r'
						prevNonWhitespaceChar === CharCode.openBrace ||
						prevNonWhitespaceChar === CharCode.closeBrace ||
						prevNonWhitespaceChar === CharCode.greaterThan;

					if (!inNativeTemplate && this.exprAllowed && isTagLikeAfterLt) {
						++this.pos;
						return this.finishToken(tstt.jsxTagStart);
					}

					if (!inNativeTemplate && prevAllowsTagStart && isTagLikeAfterLt) {
						++this.pos;
						return this.finishToken(tstt.jsxTagStart);
					}

					if (inNativeTemplate) {
						// Inside native template bodies, allow adjacent tags without requiring
						// a newline/indentation before the next '<'. This is important for inputs
						// like `<div />` and `</div><style>...</style>` which Prettier formats.
						if (
							prevNonWhitespaceChar === CharCode.openBrace ||
							prevNonWhitespaceChar === CharCode.greaterThan
						) {
							if (isTagLikeAfterLt) {
								++this.pos;
								return this.finishToken(tstt.jsxTagStart);
							}
						}

						// `<` inside a nested function body is intercepted earlier in
						// `readToken` so it never reaches this path.

						// Check if everything before this position on the current line is whitespace
						let lineStart = this.pos - 1;
						while (
							lineStart >= 0 &&
							this.input.charCodeAt(lineStart) !== CharCode.lineFeed &&
							this.input.charCodeAt(lineStart) !== CharCode.carriageReturn
						) {
							lineStart--;
						}
						lineStart++; // Move past the newline character

						// Check if all characters from line start to current position are whitespace
						let allWhitespace = true;
						for (let i = lineStart; i < this.pos; i++) {
							const ch = this.input.charCodeAt(i);
							if (ch !== CharCode.space && ch !== CharCode.tab) {
								allWhitespace = false;
								break;
							}
						}

						// At the start of a line inside template bodies, only treat `<` as
						// a tag start when the following character can actually begin a tag.
						if (allWhitespace && isTagLikeAfterLt) {
							++this.pos;
							return this.finishToken(tstt.jsxTagStart);
						}
					}
				}

				return super.getTokenFromCode(code);
			}

			/**
			 * Acorn reports only the second duplicate function parameter. When collecting,
			 * report the first one too so editor diagnostics can underline both
			 * binding sites. Keep strict mode on Acorn's normal fatal path.
			 *
			 * @type {Parse.Parser['checkLValSimple']}
			 */
			checkLValSimple(expr, bindingType = BINDING_TYPES.BIND_NONE, checkClashes) {
				if (
					this.#collect &&
					expr.type === 'Identifier' &&
					bindingType !== BINDING_TYPES.BIND_NONE &&
					checkClashes
				) {
					const first_positions = get_argument_clash_first_positions(checkClashes);
					const reported_names = get_argument_clash_reported_names(checkClashes);
					const first_position = first_positions.get(expr.name);

					if (Object.prototype.hasOwnProperty.call(checkClashes, expr.name)) {
						if (first_position != null && !reported_names.has(expr.name)) {
							this.#report_recoverable_error_range(
								first_position,
								first_position + expr.name.length,
								'Argument name clash',
							);
							reported_names.add(expr.name);
						}
						const start = /** @type {number} */ (expr.start);
						this.#report_recoverable_error_range(
							start,
							/** @type {number} */ (expr.end ?? start + expr.name.length),
							'Argument name clash',
						);
						return;
					}

					const result = super.checkLValSimple(expr, bindingType, checkClashes);
					first_positions.set(expr.name, /** @type {number} */ (expr.start));
					return result;
				}

				return super.checkLValSimple(expr, bindingType, checkClashes);
			}

			/**
			 * Override to track parenthesized expressions in metadata
			 * This allows the prettier plugin to preserve parentheses where they existed
			 * @type {Parse.Parser['parseParenAndDistinguishExpression']}
			 */
			parseParenAndDistinguishExpression(canBeArrow, forInit) {
				const startPos = this.start;
				const expr =
					canBeArrow && this.#collect
						? this.#parseArrowParameterList(
								// `<T,>(`: type parameters make it an arrow function.
								this.#typeParametersEnd === this.lastTokEnd,
								() => super.parseParenAndDistinguishExpression(canBeArrow, forInit),
							)
						: super.parseParenAndDistinguishExpression(canBeArrow, forInit);

				// If the expression's start position is after the opening paren,
				// it means it was wrapped in parentheses. Mark it in metadata.
				if (expr && /** @type {AST.NodeWithLocation} */ (expr).start > startPos) {
					expr.metadata ??= { path: [] };
					expr.metadata.parenthesized = true;
					// Nested parens finish outermost last, so this ends on the outermost `(`
					expr.metadata.paren_start = startPos;
				}

				return expr;
			}

			/**
			 * A subscript, which can start an async arrow function after `async`:
			 * the arguments of `async (…)` can be its parameters (see
			 * `#parseAsyncArguments`), and acorn-typescript reads `async <T,>(…) =>`
			 * as a generic one (see `#parseGenericArrowFunction`).
			 *
			 * acorn's `parseSubscripts` works out once, for the `async` identifier,
			 * whether a call can be an async arrow function's head, and passes that
			 * to every subscript in its loop. So an `=>` after a later call made the
			 * whole chain an async arrow function with that call's arguments for
			 * parameters, and `async(a)(b) => 1` compiled to `async (b) => 1`. Only
			 * the first subscript, while the base is still `async`, can be one, as in
			 * TypeScript, which fails at the `=>`.
			 * @type {Parse.Parser['parseSubscript']}
			 */
			parseSubscript(base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained, forInit) {
				// UPSTREAM(acornjs/acorn#1460): remove once a release includes the fix
				if (base.type !== 'Identifier') maybeAsyncArrow = false;
				if (maybeAsyncArrow && !noCalls) {
					const parse = () =>
						super.parseSubscript(
							base,
							startPos,
							startLoc,
							noCalls,
							maybeAsyncArrow,
							optionalChained,
							forInit,
						);
					if (this.type === tt.parenL) return this.#parseAsyncArguments(parse);
					if (this.tsMatchLeftRelational()) {
						return this.#parseGenericArrowFunction(startPos, parse);
					}
				}
				return super.parseSubscript(
					base,
					startPos,
					startLoc,
					noCalls,
					maybeAsyncArrow,
					optionalChained,
					forInit,
				);
			}

			/**
			 * Reads, with `parse`, `async (…)`, whose arguments can be an async arrow
			 * function's parameters (see `#parseArrowParameterProperty` and
			 * `parseSpread`).
			 * @param {() => AST.Expression} parse
			 * @returns {AST.Expression}
			 */
			#parseAsyncArguments(parse) {
				const outer = this.#asyncArguments;
				const async_arguments = { start: this.start, question: -1 };
				this.#asyncArguments = async_arguments;
				try {
					const node = this.#collect ? this.#parseArrowParameterList(false, parse) : parse();
					// A `?` after a spread belongs to a rest parameter only.
					if (async_arguments.question !== -1 && node.type !== 'ArrowFunctionExpression') {
						this.unexpected(async_arguments.question);
					}
					return node;
				} finally {
					this.#asyncArguments = outer;
				}
			}

			/**
			 * Marks the arguments of `async (…)` for `parseSpread`.
			 * @type {Parse.Parser['parseExprList']}
			 */
			parseExprList(close, allowTrailingComma, allowEmpty, refDestructuringErrors) {
				const outer = this.#readingAsyncArguments;
				this.#readingAsyncArguments =
					close === tt.parenR && this.#asyncArguments?.start === this.lastTokStart;
				try {
					return super.parseExprList(close, allowTrailingComma, allowEmpty, refDestructuringErrors);
				} finally {
					this.#readingAsyncArguments = outer;
				}
			}

			// UPSTREAM(sveltejs/acorn-typescript#140): remove once a release includes the fix
			/**
			 * A spread among the arguments of `async (…)` can be an async arrow
			 * function's rest parameter. TypeScript's parser reads a `?` after it, as
			 * after any rest parameter, and its checker reports TS1047.
			 * acorn-typescript's `parseExprList` reads a type annotation after the
			 * spread there, but not the `?`, which failed as unexpected. Take it, as
			 * `parseParenItem` does for the items of a parenthesized list, so that
			 * the rest parameter is `optional` and `parseFunctionBody` reports TS1047.
			 * When no `=>` follows the arguments, `#parseAsyncArguments` fails at the
			 * `?`, as before.
			 * @type {Parse.Parser['parseSpread']}
			 */
			parseSpread(refDestructuringErrors) {
				const in_async_arguments = this.#readingAsyncArguments;
				// A spread in an item is in another list.
				this.#readingAsyncArguments = false;
				/** @type {AST.SpreadElement & { optional?: boolean }} */
				let node;
				try {
					node = super.parseSpread(refDestructuringErrors);
				} finally {
					this.#readingAsyncArguments = in_async_arguments;
				}
				const async_arguments = this.#asyncArguments;
				if (in_async_arguments && async_arguments && this.type === tt.question) {
					if (async_arguments.question === -1) async_arguments.question = this.start;
					this.next();
					node.optional = true;
				}
				return node;
			}

			/**
			 * Records where type parameters end: after them, a parenthesized list is
			 * an arrow function's parameters (`<T,>(public x: T) => x`), and the
			 * parameters of the generic arrow function that
			 * `#parseGenericArrowFunction` reads start there.
			 * @type {Parse.Parser['tsParseTypeParameters']}
			 */
			tsParseTypeParameters(parseModifiers) {
				const start = this.start;
				const node = super.tsParseTypeParameters(parseModifiers);
				this.#typeParametersEnd = this.lastTokEnd;
				const arrow = this.#genericArrowFunction;
				if (arrow?.typeParametersStart === start) {
					arrow.parametersStart = this.start;
					// Without `async`, the arrow function starts at its `(`.
					if (arrow.arrowStart === -1) arrow.arrowStart = this.start;
				}
				return node;
			}

			// UPSTREAM(sveltejs/acorn-typescript#141): remove once a release includes the fix
			/**
			 * Reads, with `parse`, an expression that can be a generic arrow
			 * function, and throws the arrow function's own error once it was read
			 * past its `=>`, where TypeScript reads an arrow function.
			 *
			 * acorn-typescript reads an expression that starts with `<` as an element
			 * first, then as a generic arrow function, and when both fail it throws
			 * the element's error (see `#parseMaybeAssign`). It reads
			 * `async <T,>(…) => …` in a `tsTryParseAndCatch` that takes any error to
			 * mean "not an arrow function", and reads `async < T` as a comparison
			 * instead (see `parseSubscript`). Either way, an error in the arrow
			 * function's parameters or body was reported as `Unexpected token` at its
			 * type parameters, or after them. `parseArrowExpression` records the error
			 * here, and it's thrown instead. An error before the `=>` is still
			 * acorn-typescript's.
			 * @param {number} arrowStart Where the arrow function starts: `async`, or
			 * -1 for its `(`, which comes after the type parameters at the current
			 * token
			 * @param {() => AST.Expression} parse
			 * @returns {AST.Expression}
			 */
			#parseGenericArrowFunction(arrowStart, parse) {
				const outer = this.#genericArrowFunction;
				/** @type {GenericArrowFunction} */
				const arrow = {
					typeParametersStart: this.start,
					parametersStart: -1,
					arrowStart,
					error: null,
				};
				this.#genericArrowFunction = arrow;
				try {
					const node = parse();
					if (arrow.error) throw arrow.error;
					return node;
				} catch (error) {
					throw arrow.error && error instanceof SyntaxError ? arrow.error : error;
				} finally {
					this.#genericArrowFunction = outer;
				}
			}

			/**
			 * Records the error that the generic arrow function
			 * `#parseGenericArrowFunction` reads throws after its `=>`.
			 * @type {Parse.Parser['parseArrowExpression']}
			 */
			parseArrowExpression(node, params, isAsync, forInit) {
				const arrow = this.#genericArrowFunction;
				if (arrow === null || arrow.arrowStart !== node.start) {
					return super.parseArrowExpression(node, params, isAsync, forInit);
				}
				try {
					return super.parseArrowExpression(node, params, isAsync, forInit);
				} catch (error) {
					if (error instanceof SyntaxError) arrow.error = error;
					throw error;
				}
			}

			/**
			 * Reads, with `parse`, a list that can be an arrow function's parameters,
			 * for `#parseArrowParameterProperty`.
			 * @template T
			 * @param {boolean} generic Whether type parameters come before its `(`
			 * @param {() => T} parse
			 * @returns {T}
			 */
			#parseArrowParameterList(generic, parse) {
				const outer = this.#arrowParameterList;
				this.#arrowParameterList = { parenStart: this.start, generic, depth: 0 };
				try {
					return parse();
				} finally {
					this.#arrowParameterList = outer;
				}
			}

			/**
			 * Tracks how deep the parser is in an item of the list that
			 * `#parseArrowParameterList` reads. acorn reads each item with
			 * `parseParenItem` after it; before one, read parameter property
			 * modifiers (`#parseArrowParameterProperty`).
			 * @type {Parse.Parser['parseMaybeAssign']}
			 */
			parseMaybeAssign(forInit, refDestructuringErrors, afterLeftParse) {
				const list = this.#arrowParameterList;
				if (list === null) {
					return this.#parseMaybeAssign(forInit, refDestructuringErrors, afterLeftParse);
				}
				if (list.depth === 0 && afterLeftParse === this.parseParenItem) {
					const item = this.#parseArrowParameterProperty(list, refDestructuringErrors);
					if (item) return item;
				}
				list.depth++;
				try {
					return this.#parseMaybeAssign(forInit, refDestructuringErrors, afterLeftParse);
				} finally {
					list.depth--;
				}
			}

			/**
			 * acorn-typescript reads an expression that starts with `<` as an element
			 * first, then as a generic arrow function (see
			 * `#parseGenericArrowFunction`).
			 * @type {Parse.Parser['parseMaybeAssign']}
			 */
			#parseMaybeAssign(forInit, refDestructuringErrors, afterLeftParse) {
				if (this.type !== tstt.jsxTagStart && !this.tsMatchLeftRelational()) {
					return super.parseMaybeAssign(forInit, refDestructuringErrors, afterLeftParse);
				}
				return this.#parseGenericArrowFunction(-1, () =>
					super.parseMaybeAssign(forInit, refDestructuringErrors, afterLeftParse),
				);
			}

			// UPSTREAM(sveltejs/acorn-typescript#136): remove once a release includes the fix
			/**
			 * TypeScript's parser reads parameter property modifiers before an arrow
			 * function's parameters too, and its checker reports them: TS2369, and
			 * TS1187 or TS1317 as for other parameters. acorn reads an arrow
			 * function's parameters as the items of a parenthesized expression, or as
			 * the arguments of `async (…)`, and makes them patterns once `=>` follows,
			 * so `public` failed as a reserved word and the name after `readonly` as
			 * unexpected.
			 *
			 * When collecting, where TypeScript reads the list as an arrow function's
			 * parameters with modifiers here (`#startsArrowParameterProperty`), read
			 * them before the item, record the errors, and build the
			 * `TSParameterProperty` that a function's parameter gets (see
			 * `parseBindingList`). Its parameter is an expression until `toAssignable`
			 * makes it a pattern. Before a rest element, keep the rest element without
			 * them, as `#parseRestParameterProperty` does. Anywhere else, return
			 * `null`, having read nothing, so that the item reads as before, and a
			 * strict parse fails as before.
			 * @param {{ parenStart: number, generic: boolean, depth: number }} list
			 * @param {Parse.DestructuringErrors | undefined} refDestructuringErrors
			 * @returns {AST.Expression | null}
			 */
			#parseArrowParameterProperty(list, refDestructuringErrors) {
				if (
					this.containsEsc ||
					!PARAMETER_MODIFIERS.includes(/** @type {string} */ (this.value)) ||
					!Parser.acornTypeScript.tokenIsIdentifier(this.type) ||
					!this.#startsArrowParameterProperty(
						!list.generic && this.lastTokStart === list.parenStart,
					)
				) {
					return null;
				}
				const start = this.start;
				const startLoc = this.startLoc;
				/** @type {{ accessibility?: AST.TSParameterProperty['accessibility'], readonly?: boolean, override?: boolean }} */
				const modified = {};
				this.tsParseModifiers({ modified, allowedModifiers: PARAMETER_MODIFIERS });
				if (this.type === tt.ellipsis) {
					this.#recordCheckerLevelError(start, this.lastTokEnd, REST_PARAMETER_PROPERTY);
					this.#recordCheckerLevelError(start, start + 1, UNEXPECTED_PARAMETER_MODIFIER);
					const rest = this.parseParenItem(this.parseRestBinding());
					// As acorn does after a rest element in a parenthesized expression.
					if (this.type === tt.comma) this.raise(this.start, REST_ELEMENT_TRAILING_COMMA);
					return /** @type {AST.Expression} */ (/** @type {unknown} */ (rest));
				}
				this.#recordCheckerLevelError(start, start + 1, UNEXPECTED_PARAMETER_MODIFIER);
				/** @type {AST.Expression} */
				let parameter;
				list.depth++;
				try {
					parameter = super.parseMaybeAssign(false, refDestructuringErrors, this.parseParenItem);
				} finally {
					list.depth--;
				}
				if (is_pattern_parameter_expression(parameter)) {
					this.#recordCheckerLevelError(start, start + 1, PATTERN_PARAMETER_PROPERTY);
				}
				const node = /** @type {AST.TSParameterProperty} */ (this.startNodeAt(start, startLoc));
				if (modified.accessibility) node.accessibility = modified.accessibility;
				if (modified.readonly) node.readonly = true;
				if (modified.override) node.override = true;
				node.parameter = /** @type {AST.TSParameterProperty['parameter']} */ (
					/** @type {unknown} */ (parameter)
				);
				return /** @type {AST.Expression} */ (
					/** @type {unknown} */ (
						this.finishNode(
							node,
							/** @type {AST.TSParameterProperty['type']} */ ('TSParameterProperty'),
						)
					)
				);
			}

			/**
			 * Whether TypeScript reads the list as an arrow function's parameters, with
			 * parameter property modifiers from the current token: the rest of the
			 * list reads as parameters, the first of them with modifiers, and `=>`
			 * follows it (after a return type). At the list's first item, TypeScript
			 * reads `(` and a modifier as an arrow function's parameters only when a
			 * name other than `as` follows the modifier
			 * (`isParenthesizedArrowFunctionExpressionWorker`), and as a
			 * parenthesized expression otherwise, as in `(public [a]) => a`. After
			 * another item, or after type parameters, it reads parameters.
			 * @param {boolean} first Whether the item is the list's first, with no
			 * type parameters before the list
			 * @returns {boolean}
			 */
			#startsArrowParameterProperty(first) {
				if (first) {
					const next = this.lookahead();
					if (
						!Parser.acornTypeScript.tokenIsIdentifier(next.type) ||
						this.isContextualWithState('as', next)
					) {
						return false;
					}
				}
				const start = this.start;
				const errors = this.#errors;
				const errors_length = errors?.length ?? 0;
				try {
					return this.tsLookAhead(() => {
						try {
							const [item] = /** @type {AST.Node[]} */ (
								this.parseBindingList(tt.parenR, false, true, false)
							);
							// Modifiers leave a parameter property, or a rest element after them.
							if (!item || (item.type !== 'TSParameterProperty' && item.start === start)) {
								return false;
							}
							if (this.type === tt.colon) this.tsParseTypeOrTypePredicateAnnotation(tt.colon);
							return this.type === tt.arrow && !this.canInsertSemicolon();
						} catch {
							return false;
						}
					});
				} finally {
					// `error` records some errors outside the lookahead's undo log.
					if (errors) errors.length = errors_length;
				}
			}

			/**
			 * A parameter property that `#parseArrowParameterProperty` reads holds
			 * its parameter as an expression: make that a pattern, as for any other
			 * parameter of the arrow function. One that `parseBindingList` reads for
			 * a generic async arrow function holds a pattern already.
			 * UPSTREAM(sveltejs/acorn-typescript#136)
			 * @type {Parse.Parser['toAssignable']}
			 */
			toAssignable(node, isBinding, refDestructuringErrors, preserveTypeScriptWrapper) {
				if (node?.type !== 'TSParameterProperty') {
					return super.toAssignable(
						node,
						isBinding,
						refDestructuringErrors,
						preserveTypeScriptWrapper,
					);
				}
				let parameter = /** @type {AST.Node} */ (/** @type {unknown} */ (node.parameter));
				if (/** @type {string} */ (parameter.type) === 'TSTypeCastExpression') {
					parameter = this.typeCastToParameter(parameter);
				}
				node.parameter = /** @type {AST.TSParameterProperty['parameter']} */ (
					/** @type {unknown} */ (this.toAssignable(parameter, isBinding, refDestructuringErrors))
				);
				return /** @type {AST.Pattern} */ (/** @type {unknown} */ (node));
			}

			/**
			 * acorn-typescript unwraps TS expression wrappers in checkLValSimple,
			 * which is only right for simple targets (`[b as any] = arr`). A wrapped
			 * destructuring pattern (`[{ a } as T] = arr`) reaches checkLValPattern
			 * still wrapped — toAssignableList ignores return values, so the wrapper
			 * survives conversion — and would fall through to checkLValSimple's
			 * "Assigning to rvalue". Unwrap here so wrapped patterns take the
			 * pattern lane.
			 *
			 * A binding is different: TypeScript's parser doesn't read a type
			 * assertion as an arrow function's parameter (`(x as number) => x`,
			 * `(x!) => x`, `async ([a satisfies number]) => a`), so it's a syntax
			 * error there (TS1005). acorn reads the parameters as expressions, and
			 * acorn-typescript's `toAssignable` accepted a type assertion in them where
			 * @babel/parser reports it, so the parameter kept the assertion. Raise
			 * @babel/parser's error at the assertion, in every mode. A binding type
			 * tells a parameter from an assignment target: acorn-typescript's
			 * `toAssignable` gets `isBinding` for an assignment target too.
			 *
			 * @type {Parse.Parser['checkLValPattern']}
			 */
			checkLValPattern(expr, bindingType, checkClashes) {
				let node = expr;
				while (
					node.type === 'TSNonNullExpression' ||
					node.type === 'TSAsExpression' ||
					node.type === 'TSSatisfiesExpression' ||
					node.type === 'TSTypeAssertion'
				) {
					if (bindingType !== undefined && bindingType !== BINDING_TYPES.BIND_NONE) {
						// UPSTREAM(sveltejs/acorn-typescript#142): remove once a release includes the fix
						this.raise(/** @type {number} */ (node.start), TYPE_CAST_IN_PARAMETER);
					}
					node = /** @type {AST.Node} */ (
						/** @type {{ expression: AST.Node }} */ (/** @type {unknown} */ (node)).expression
					);
				}
				return super.checkLValPattern(node, bindingType, checkClashes);
			}

			/**
			 * Override checkLocalExport to check all scopes in the scope stack.
			 * This is needed because submodules create nested scopes, but exports
			 * from within submodules should still be valid if the identifier is
			 * declared in the submodule scope (not just the top-level module scope).
			 * @type {Parse.Parser['checkLocalExport']}
			 */
			checkLocalExport(id) {
				const { name } = id;
				if (this.hasImport(name)) return;
				// Check all scopes in the scope stack, not just the top-level scope
				for (let i = this.scopeStack.length - 1; i >= 0; i--) {
					if (this.#scopeDeclaredNames(this.scopeStack[i]).has(name)) {
						// Found in a scope, remove from undefinedExports if it was added
						delete this.undefinedExports[name];
						return;
					}
				}
				// Not found in any scope, add to undefinedExports for later error
				this.undefinedExports[name] = id;
			}

			/**
			 * The names declared in `scope`, as a cached Set: acorn's `lexical` and
			 * `var` names, and the ones acorn-typescript keeps apart, in `types`
			 * (type aliases and interfaces) and `exportOnlyBindings` (namespaces and
			 * top-level ambient functions). An export specifier can name any of them,
			 * as acorn-typescript's own `checkLocalExport` allows. Names are appended
			 * to these arrays as they are declared, so syncing from the last-seen
			 * lengths keeps the Set current.
			 *
			 * @param {Parse.Scope} scope
			 * @returns {Set<string>}
			 */
			#scopeDeclaredNames(scope) {
				let cached = this.#localExportNamesByScope.get(scope);
				if (!cached) {
					cached = { names: new Set(), lengths: [0, 0, 0, 0] };
					this.#localExportNamesByScope.set(scope, cached);
				}
				const lists = [scope.lexical, scope.var, scope.types, scope.exportOnlyBindings];
				for (let list = 0; list < lists.length; list++) {
					const declared = lists[list];
					for (let i = cached.lengths[list]; i < declared.length; i++) {
						cached.names.add(declared[i]);
					}
					cached.lengths[list] = declared.length;
				}
				return cached.names;
			}

			/** @type {Parse.Parser['parseForStatement']} */
			parseForStatement(node) {
				this.next();
				let awaitAt =
					this.options.ecmaVersion >= 9 && this.canAwait && this.eatContextual('await')
						? this.lastTokStart
						: -1;
				this.labels.push({ kind: 'loop' });
				this.enterScope(0);
				this.expect(tt.parenL);

				if (this.type === tt.semi) {
					if (awaitAt > -1) this.unexpected(awaitAt);
					return this.parseFor(node, null);
				}

				// @ts-ignore — acorn internal: isLet accepts 0 args at runtime
				let isLet = this.isLet();
				if (this.type === tt._var || this.type === tt._const || isLet) {
					let init = /** @type {AST.VariableDeclaration} */ (this.startNode()),
						kind = isLet ? 'let' : /** @type {AST.VariableDeclaration['kind']} */ (this.value);
					if (this.#collect && this.#isEmptyForDeclarationList()) {
						// As `parseVarStatement` does for a statement (TS1123). The loop takes
						// the empty list as its one declaration.
						this.#parseEmptyDeclarationList(init, kind);
					} else {
						this.next();
						this.parseVar(init, true, kind);
					}
					this.finishNode(init, 'VariableDeclaration');
					return this.parseForAfterInitWithIndex(
						/** @type {AST.ForInStatement | AST.ForOfStatement} */ (node),
						init,
						awaitAt,
					);
				}

				// Handle other cases like using declarations if they exist
				let startsWithLet = this.isContextual('let'),
					isForOf = false;
				let usingKind =
					this.isUsing && this.isUsing(true)
						? 'using'
						: this.isAwaitUsing && this.isAwaitUsing(true)
							? 'await using'
							: null;
				if (usingKind) {
					let init = /** @type {AST.VariableDeclaration} */ (this.startNode());
					this.next();
					if (usingKind === 'await using') {
						if (!this.canAwait) {
							this.raise(this.start, 'Await using cannot appear outside of async function');
						}
						this.next();
					}
					this.parseVar(init, true, usingKind);
					this.finishNode(init, 'VariableDeclaration');
					return this.parseForAfterInitWithIndex(
						/** @type {AST.ForInStatement | AST.ForOfStatement} */ (node),
						init,
						awaitAt,
					);
				}

				let containsEsc = this.containsEsc;
				let refDestructuringErrors = new /** @type {new () => Parse.DestructuringErrors} */ (
					/** @type {unknown} */ (DestructuringErrors)
				)();
				let initPos = this.start;
				let init_expr =
					awaitAt > -1
						? this.parseExprSubscripts(refDestructuringErrors, 'await')
						: this.parseExpression(true, refDestructuringErrors);

				if (
					this.type === tt._in ||
					(isForOf = this.options.ecmaVersion >= 6 && this.isContextual('of'))
				) {
					if (awaitAt > -1) {
						// implies `ecmaVersion >= 9`
						if (this.type === tt._in) this.unexpected(awaitAt);
						/** @type {AST.ForOfStatement} */ (node).await = true;
					} else if (isForOf && this.options.ecmaVersion >= 8) {
						if (
							init_expr.start === initPos &&
							!containsEsc &&
							init_expr.type === 'Identifier' &&
							init_expr.name === 'async'
						)
							this.unexpected();
						else if (this.options.ecmaVersion >= 9)
							/** @type {AST.ForOfStatement} */ (node).await = false;
					}
					if (startsWithLet && isForOf)
						this.raise(
							/** @type {AST.NodeWithLocation} */ (init_expr).start,
							"The left-hand side of a for-of loop may not start with 'let'.",
						);
					const init = this.toAssignable(init_expr, false, refDestructuringErrors);
					this.checkLValPattern(init);
					return this.parseForInWithIndex(
						/** @type {AST.ForInStatement | AST.ForOfStatement} */ (node),
						init,
					);
				} else {
					this.checkExpressionErrors(refDestructuringErrors, true);
				}

				if (awaitAt > -1) this.unexpected(awaitAt);
				return this.parseFor(node, init_expr);
			}

			/** @type {Parse.Parser['parseForAfterInitWithIndex']} */
			parseForAfterInitWithIndex(node, init, awaitAt) {
				if (
					(this.type === tt._in || (this.options.ecmaVersion >= 6 && this.isContextual('of'))) &&
					// When collecting, a declaration list can be empty (`parseForStatement`).
					init.declarations.length <= 1
				) {
					// Like Acorn's `parseForAfterInit`, which this replaces
					if (
						this.type === tt._in &&
						(init.kind === 'using' || init.kind === 'await using') &&
						!init.declarations[0].init
					) {
						this.raise(this.start, 'Using declaration is not allowed in for-in loops');
					}
					if (this.options.ecmaVersion >= 9) {
						if (this.type === tt._in) {
							if (awaitAt > -1) {
								this.unexpected(awaitAt);
							}
						} else {
							/** @type {AST.ForOfStatement} */ (node).await = awaitAt > -1;
						}
					}
					return this.parseForInWithIndex(
						/** @type {AST.ForInStatement | AST.ForOfStatement} */ (node),
						init,
					);
				}
				if (awaitAt > -1) {
					this.unexpected(awaitAt);
				}
				return this.parseFor(node, init);
			}

			/** @type {Parse.Parser['parseForInWithIndex']} */
			parseForInWithIndex(node, init) {
				const isForIn = this.type === tt._in;
				this.next();

				if (
					init.type === 'VariableDeclaration' &&
					init.declarations[0]?.init != null &&
					(!isForIn ||
						this.options.ecmaVersion < 8 ||
						this.strict ||
						init.kind !== 'var' ||
						init.declarations[0].id.type !== 'Identifier')
				) {
					this.raise(
						/** @type {AST.NodeWithLocation} */ (init).start,
						`${isForIn ? 'for-in' : 'for-of'} loop variable declaration may not have an initializer`,
					);
				}

				node.left = init;
				node.right = isForIn ? this.parseExpression() : this.parseMaybeAssign();

				// Check for our extended syntax: "; index varName"
				if (!isForIn && this.type === tt.semi) {
					this.next(); // consume ';'

					if (this.isContextual('index')) {
						this.next(); // consume 'index'
						/** @type {AST.ForOfStatement} */ (node).index = /** @type {AST.Identifier} */ (
							this.parseExpression()
						);
						if (
							/** @type {AST.Identifier} */ (/** @type {AST.ForOfStatement} */ (node).index)
								.type !== 'Identifier'
						) {
							this.raise(this.start, 'Expected identifier after "index" keyword');
						}
						this.eat(tt.semi);
					}

					if (this.isContextual('key')) {
						this.next(); // consume 'key'
						/** @type {AST.ForOfStatement} */ (node).key = this.parseExpression();
					}

					if (this.isContextual('index')) {
						this.raise(this.start, '"index" must come before "key" in for-of loop');
					}
				} else if (!isForIn) {
					// Set index to null for standard for-of loops
					/** @type {AST.ForOfStatement} */ (node).index = null;
				}

				this.expect(tt.parenR);
				const previous_reading_header = this.#readingJSXControlFlowHeader;
				this.#readingJSXControlFlowHeader = false;
				try {
					node.body = /** @type {AST.BlockStatement} */ (this.parseStatement('for'));
				} finally {
					this.#readingJSXControlFlowHeader = previous_reading_header;
				}
				this.exitScope();
				this.labels.pop();
				return this.finishNode(node, isForIn ? 'ForInStatement' : 'ForOfStatement');
			}

			/**
			 * acorn-typescript eats the optional `?` of a class member here; the
			 * token read right after it is the `<` of `m?<T>()`, never a JSX tag.
			 * Neither is a `<` right after the name that starts the next line
			 * (`m\n<T>() {}`).
			 *
			 * @type {Parse.Parser['parsePostMemberNameModifiers']}
			 */
			parsePostMemberNameModifiers(methodOrProp) {
				this.#readTagStartAsTypeParameterStart();
				this.#afterOptionalMemberName = this.type === tt.question;
				super.parsePostMemberNameModifiers(methodOrProp);
			}

			/**
			 * @type {Parse.Parser['parseFunctionBody']}
			 */
			parseFunctionBody(node, isArrowFunction, isMethod, forInit, ...args) {
				this.#functionBodyDepth++;
				// A body isn't part of a list that can be an arrow function's parameters,
				// though an arrow function's is read before that list is done.
				const arrow_parameter_list = this.#arrowParameterList;
				this.#arrowParameterList = null;
				try {
					// Allow a `@{ … }` code block as the body of a function, method, or
					// arrow function, so components can be written as `function Something()
					// @{ … }`, `{ Render() @{ … } }`, or `const Something = () => @{ … }`.
					//
					// A return-type annotation sits between the params and the body
					// (`function f(): T @{ … }`). acorn-typescript parses it inside
					// `super.parseFunctionBody` and then demands a `{` block, so the `@{ … }`
					// would never be seen. Parse the return type here first (exactly as
					// acorn-typescript does) so `this.start` lands on the `@` that follows.
					if (!isArrowFunction && this.match(tt.colon)) {
						node.returnType = this.tsParseTypeOrTypePredicateAnnotation(tt.colon);
					}
					const is_code_block = this.#isCodeBlockStart(this.start);
					if (isArrowFunction) {
						this.#reportOptionalRestParameter(/** @type {AST.ArrowFunctionExpression} */ (node));
						this.#reportOptionalPatternParameters(node);
					} else if (is_code_block || !this.#isBodilessSignature(args[0])) {
						this.#reportOptionalPatternParameters(node);
					}
					if (is_code_block) {
						node.body = this.#parseCodeBlock({ allowReturnStatements: true });
						this.checkParams(node, false);
						this.exitScope();
						return node;
					}
					return super.parseFunctionBody(node, isArrowFunction, isMethod, forInit, ...args);
				} finally {
					this.#functionBodyDepth--;
					this.#arrowParameterList = arrow_parameter_list;
				}
			}

			/**
			 * Raise TS1047 for an optional rest parameter of an arrow function, at its
			 * `?`, outside an ambient context, as `parseBindingListItem` does for
			 * other functions. An arrow function's parameters are read as
			 * expressions, which acorn-typescript never checked.
			 * @param {AST.ArrowFunctionExpression} node
			 */
			#reportOptionalRestParameter(node) {
				if (this.isAmbientContext) return;
				for (const param of node.params) {
					if (
						param.type === 'RestElement' &&
						/** @type {{ optional?: boolean }} */ (param).optional
					) {
						const question = skip_space_and_comments_from(
							this.input,
							/** @type {number} */ (param.argument.end),
						);
						this.raise(question, OPTIONAL_REST_PARAMETER);
					}
				}
			}

			/**
			 * Whether acorn-typescript's `parseFunctionBody` finishes a function
			 * declaration or class method here as a signature without a body
			 * (`TSDeclareFunction`, `TSDeclareMethod`): its condition, without eating
			 * the `;`. Its `isLineTerminator` calls acorn's `canInsertSemicolon`, which
			 * `super` reaches too.
			 * @param {Parse.AcornTypeScriptFunctionBodyConfig | undefined} tsConfig
			 */
			#isBodilessSignature(tsConfig) {
				return (
					!!(tsConfig?.isFunctionDeclaration || tsConfig?.isClassMethod) &&
					this.type !== tt.braceL &&
					(this.type === tt.semi || super.canInsertSemicolon())
				);
			}

			/**
			 * Raise TS2463 for each optional binding pattern parameter of a function
			 * that has a body, outside an ambient context, with the message and
			 * position acorn-typescript gave it while reading the parameter (see
			 * `parseBindingListItem`). A signature without a body, such as an
			 * overload, may have one. An arrow function always has a body; its
			 * parameters are read as expressions, which acorn-typescript never
			 * checked.
			 * @param {AST.FunctionDeclaration | AST.FunctionExpression | AST.ArrowFunctionExpression} node
			 */
			#reportOptionalPatternParameters(node) {
				if (this.isAmbientContext) return;
				for (const item of node.params) {
					// When collecting, a parameter property can have a pattern (TS1187).
					const item_node = /** @type {AST.Node} */ (item);
					const param = /** @type {AST.Pattern} */ (
						item_node.type === 'TSParameterProperty' ? item_node.parameter : item
					);
					// A default comes after the `?` and the type annotation.
					const pattern = /** @type {AST.Pattern & { optional?: boolean }} */ (
						param.type === 'AssignmentPattern' ? param.left : param
					);
					if (
						pattern.optional &&
						(pattern.type === 'ObjectPattern' || pattern.type === 'ArrayPattern')
					) {
						this.raise(/** @type {number} */ (pattern.start), OPTIONAL_BINDING_PATTERN_PARAMETER);
					}
				}
			}

			/**
			 * Parses `{ … }`, or a spread child `{...children}` like acorn-typescript
			 * does. Callers outside child position (attribute values, dynamic tag
			 * names) reject the `JSXSpreadChild`.
			 * @return {ESTreeJSX.JSXExpressionContainer | ESTreeJSX.JSXSpreadChild}
			 */
			jsx_parseExpressionContainer() {
				// Template child containers consume `}` after leaving container scope, so
				// the following sibling — which may be raw template text — tokenizes
				// normally (acorn already preserves whitespace in the surrounding
				// `tc_expr` context). Attribute-value and script-mode JSX containers keep
				// consuming `}` in scope: their following token is part of the tag or JS,
				// never template text.
				const consumeBraceAfterScope = this.#consumeContainerBraceAfterScope;
				this.#consumeContainerBraceAfterScope = false;
				let node = /** @type {ESTreeJSX.JSXExpressionContainer | ESTreeJSX.JSXSpreadChild} */ (
					this.startNode()
				);
				let is_spread = false;
				this.#jsxExpressionContainerDepth++;
				let pushed_context_baseline = false;
				// The stack depth with the container's `{` brace context on top, taken
				// before `next()` so the first expression token's own context pushes
				// (e.g. a fragment's `<` pushing its tag contexts) are not counted.
				// This is the depth the stack must return to when the container's
				// closing `}` is the current token.
				const container_context_depth = this.context.length;
				try {
					this.next();
					// A spread child, `{...children}`. The `...` pushes no token context,
					// so the baseline below still lands on the first expression token.
					is_spread = this.eat(tt.ellipsis);

					// Record the context-stack depth now that the first expression token
					// has been read. A control-flow directive parsed inside this
					// container must not strip anything below this floor (see
					// `#filterTemplateScriptContexts`).
					this.#expressionContainerContextBaselines.push(this.context.length);
					this.#expressionContainerPathBaselines.push({
						path: this.#path,
						length: this.#path.length,
					});
					pushed_context_baseline = true;

					node.expression =
						!is_spread && this.type === tt.braceR
							? this.jsx_parseEmptyExpression()
							: this.parseExpression();
					if (this.#allowExpressionContainerTrailingSemicolon && this.type === tt.semi) {
						if (this.#collect) {
							this.#report_recoverable_error(
								this.start,
								'TSRX expression containers do not use semicolons. Remove this semicolon.',
								DIAGNOSTIC_CODES.TEMPLATE_EXPRESSION_TRAILING_SEMICOLON,
							);
						}
						this.next();
					}
					if (!consumeBraceAfterScope) {
						// A control-flow directive expression restores the context stack from
						// a snapshot taken inside this container
						// (`#parseTemplateControlFlowBlock`), so the container's closing `}`
						// — read while that stale snapshot was active — pops the wrong entry
						// and leaves stale contexts above the enclosing tag's contexts (the
						// directive's statement brace, or a wrapping fragment's child
						// context). Once the `}` has been read the stack must be back at one
						// below the container's depth (its own brace context popped); drop
						// anything above that so the token after `}` (e.g. the `>` finishing
						// the enclosing opening tag) tokenizes in the right context.
						if (this.type === tt.braceR) {
							this.#truncateContext(container_context_depth - 1);
						}
						this.#expectContainerClosingBrace();
					}
				} finally {
					this.#jsxExpressionContainerDepth--;
					if (pushed_context_baseline) {
						this.#expressionContainerContextBaselines.pop();
						this.#expressionContainerPathBaselines.pop();
					}
				}

				if (consumeBraceAfterScope) {
					this.#expectContainerClosingBrace();
				}

				return this.finishNode(node, is_spread ? 'JSXSpreadChild' : 'JSXExpressionContainer');
			}

			/**
			 * @type {Parse.Parser['jsx_parseEmptyExpression']}
			 */
			jsx_parseEmptyExpression() {
				// Override to properly handle the range for JSXEmptyExpression
				// The range should be from after { to before }
				const node = /** @type {ESTreeJSX.JSXEmptyExpression} */ (
					this.startNodeAt(this.lastTokEnd, this.lastTokEndLoc)
				);
				node.end = this.start;
				node.loc.end = this.startLoc;
				return this.finishNodeAt(node, 'JSXEmptyExpression', this.start, this.startLoc);
			}

			/**
			 * @type {Parse.Parser['jsx_parseTupleContainer']}
			 */
			jsx_parseTupleContainer() {
				const t = /** @type {ESTreeJSX.JSXExpressionContainer} */ (this.startNode());
				return (
					this.next(),
					(t.expression =
						this.type === tt.bracketR ? this.jsx_parseEmptyExpression() : this.parseExpression()),
					this.expect(tt.bracketR),
					this.finishNode(t, 'JSXExpressionContainer')
				);
			}

			/**
			 * @type {Parse.Parser['jsx_parseAttribute']}
			 */
			jsx_parseAttribute() {
				let node = /** @type {ESTreeJSX.JSXAttribute | ESTreeJSX.JSXSpreadAttribute} */ (
					this.startNode()
				);

				if (this.type === tt.braceL) {
					let name_start = skip_whitespace_from(this.input, this.start + 1);
					const first = this.input.charCodeAt(name_start);
					if (
						this.#isIdentifierChar(first) &&
						!(first >= CharCode.digit0 && first <= CharCode.digit9)
					) {
						let name_end = name_start + 1;
						while (this.#isIdentifierChar(this.input.charCodeAt(name_end))) {
							name_end++;
						}
						const brace_start = skip_whitespace_from(this.input, name_end);
						if (this.input.charCodeAt(brace_start) === CharCode.closeBrace) {
							const name_start_loc = get_line_info(this, name_start);
							const name_end_loc = get_line_info(this, name_end);
							const name_value = this.input.slice(name_start, name_end);
							const id = /** @type {ESTreeJSX.JSXIdentifier} */ (
								this.startNodeAt(name_start, name_start_loc)
							);
							id.name = name_value;
							this.finishNodeAt(id, 'JSXIdentifier', name_end, name_end_loc);
							const name = /** @type {AST.Identifier} */ (
								this.startNodeAt(name_start, name_start_loc)
							);
							name.name = name_value;
							this.finishNodeAt(name, 'Identifier', name_end, name_end_loc);
							const expression = /** @type {ESTreeJSX.JSXExpressionContainer} */ (
								this.startNodeAt(this.start, this.startLoc)
							);
							expression.expression = name;
							this.finishNodeAt(
								expression,
								'JSXExpressionContainer',
								brace_start + 1,
								get_line_info(this, brace_start + 1),
							);
							/** @type {ESTreeJSX.JSXAttribute} */ (node).name = id;
							/** @type {ESTreeJSX.JSXAttribute} */ (node).value = expression;
							/** @type {ESTreeJSX.JSXAttribute} */ (node).shorthand = true;

							const end = brace_start + 1;
							const endLoc = get_line_info(this, end);
							this.pos = end;
							this.curLine = endLoc.line;
							this.lineStart = end - endLoc.column;
							if (this.curContext()?.token === '{') {
								this.#popContext();
							}
							this.exprAllowed = false;
							this.next();
							return this.finishNodeAt(node, 'JSXAttribute', end, endLoc);
						}
					}

					// Inside a native element `next()` would otherwise read whatever follows
					// the brace as raw template text, scanning (and counting line breaks) up
					// to the closing brace. An attribute brace is only ever followed by
					// JavaScript (a spread or a shorthand name), so suppress that one token
					// and let acorn's `skipSpace` handle any comments or Unicode whitespace
					// before it instead of replicating them in the peek above.
					this.#suppressTemplateRawTextToken = true;
				}

				if (this.eat(tt.braceL)) {
					if (this.type === tt.ellipsis || this.lookahead().type === tt.ellipsis) {
						// The brace's context is on top
						const brace_context_depth = this.context.length;
						this.#suppressTemplateRawTextToken = true;
						this.expect(tt.ellipsis);
						/** @type {ESTreeJSX.JSXSpreadAttribute} */ (node).argument = this.#parseOpeningTagCode(
							() => this.parseMaybeAssign(),
						);
						// A control-flow directive in an element in the argument can leave
						// contexts above the brace's, as in a container (see
						// `jsx_parseExpressionContainer`). The `}` read pops the brace's.
						if (this.type === tt.braceR) {
							this.#truncateContext(brace_context_depth - 1);
						}
						this.#expectContainerClosingBrace();
						return this.finishNode(node, 'JSXSpreadAttribute');
					} else {
						if (!(this.type === tt.name || this.type.keyword || this.type === tstt.jsxName)) {
							this.unexpected();
						}
						const name_start = this.start;
						const name_start_loc = this.startLoc;
						const name_end = this.end;
						const name_end_loc = this.endLoc;
						const name_value = /** @type {string} */ (this.value);
						const id = /** @type {ESTreeJSX.JSXIdentifier} */ (
							this.startNodeAt(name_start, name_start_loc)
						);
						id.name = name_value;
						this.finishNodeAt(id, 'JSXIdentifier', name_end, name_end_loc);
						const name = /** @type {AST.Identifier} */ (
							this.startNodeAt(name_start, name_start_loc)
						);
						name.name = name_value;
						this.finishNodeAt(name, 'Identifier', name_end, name_end_loc);
						const expression = /** @type {ESTreeJSX.JSXExpressionContainer} */ (
							this.startNodeAt(
								/** @type {number} */ (node.start),
								/** @type {AST.NodeWithLocation} */ (node).loc.start,
							)
						);
						expression.expression = name;
						/** @type {ESTreeJSX.JSXAttribute} */ (node).name = id;
						/** @type {ESTreeJSX.JSXAttribute} */ (node).value = this.finishNodeAt(
							expression,
							'JSXExpressionContainer',
							this.end + 1,
							this.endLoc,
						);
						/** @type {ESTreeJSX.JSXAttribute} */ (node).shorthand = true;
						this.next();
						this.#expectContainerClosingBrace();
						return this.finishNode(node, 'JSXAttribute');
					}
				}
				/** @type {ESTreeJSX.JSXAttribute} */ (node).name = this.jsx_parseNamespacedName();
				const value = /** @type {ESTreeJSX.JSXAttribute['value'] | null} */ (
					this.eat(tt.eq) ? this.jsx_parseAttributeValue() : null
				);
				/** @type {ESTreeJSX.JSXAttribute} */ (node).value = value;
				return this.finishNode(node, 'JSXAttribute');
			}

			/**
			 * @type {Parse.Parser['jsx_parseNamespacedName']}
			 */
			jsx_parseNamespacedName() {
				const base = this.jsx_parseIdentifier();
				if (!this.eat(tt.colon)) return base;
				const node = /** @type {ESTreeJSX.JSXNamespacedName} */ (
					this.startNodeAt(
						/** @type {AST.NodeWithLocation} */ (base).start,
						/** @type {AST.NodeWithLocation} */ (base).loc.start,
					)
				);
				node.namespace = base;
				node.name = this.jsx_parseIdentifier();
				return this.finishNode(node, 'JSXNamespacedName');
			}

			/**
			 * @type {Parse.Parser['jsx_parseIdentifier']}
			 */
			jsx_parseIdentifier() {
				const node = /** @type {ESTreeJSX.JSXIdentifier} */ (this.startNode());

				if (this.type === tt.name || this.type.keyword || this.type === tstt.jsxName) {
					node.name = /** @type {string} */ (this.value);
					this.next();
				} else {
					return super.jsx_parseIdentifier();
				}

				return this.finishNode(node, 'JSXIdentifier');
			}

			/**
			 * A dynamic tag name, `{ AssignmentExpression }`. A spread or an empty
			 * container is no expression, so it can't be read as a tag at all. Which
			 * expressions make a valid tag is checked once per element, at the
			 * opening tag (see `#reportInvalidDynamicTag`).
			 */
			#parseJSXDynamicElementName() {
				const container = this.jsx_parseExpressionContainer();
				if (
					container.type === 'JSXSpreadChild' ||
					container.expression.type === 'JSXEmptyExpression'
				) {
					this.raise(
						/** @type {number} */ (
							container.type === 'JSXSpreadChild'
								? container.start
								: (container.expression.start ?? container.start)
						),
						TSRX_DYNAMIC_TAG_EXPRESSION_ERROR,
					);
				}
				container.isDynamic = true;
				return container;
			}

			/**
			 * Report a dynamic tag expression that isn't an allowed form (see
			 * `find_invalid_dynamic_tag_part`) at its invalid part. The check doesn't
			 * change the parse: collecting records the error and goes on, and a
			 * strict parse throws it. The closing tag repeats the expression, so only
			 * the opening tag is checked.
			 * @param {ESTreeJSX.JSXExpressionContainer} name
			 */
			#reportInvalidDynamicTag(name) {
				const invalid = find_invalid_dynamic_tag_part(/** @type {AST.Node} */ (name.expression));
				if (!invalid) return;
				const node = /** @type {AST.Node & AST.NodeWithLocation} */ (invalid);
				this.#report_recoverable_error_range(
					node.metadata?.paren_start ?? node.start,
					end_after_parentheses(this.input, node),
					TSRX_DYNAMIC_TAG_EXPRESSION_ERROR,
					DIAGNOSTIC_CODES.DYNAMIC_TAG_EXPRESSION,
				);
			}

			/**
			 * @type {Parse.Parser['jsx_parseElementName']}
			 */
			jsx_parseElementName() {
				if (this.type === tstt.jsxTagEnd) {
					return '';
				}

				if (this.type === tt.braceL) {
					return this.#parseJSXDynamicElementName();
				}

				let node = this.jsx_parseNamespacedName();

				if (node.type === 'JSXNamespacedName') {
					return node;
				}

				if (this.eat(tt.dot)) {
					let memberExpr = /** @type {ESTreeJSX.JSXMemberExpression} */ (
						this.startNodeAt(
							/** @type {AST.NodeWithLocation} */ (node).start,
							/** @type {AST.NodeWithLocation} */ (node).loc.start,
						)
					);
					memberExpr.object = node;
					memberExpr.property = this.jsx_parseIdentifier();
					memberExpr.computed = false;
					memberExpr = this.finishNode(memberExpr, 'JSXMemberExpression');
					while (this.eat(tt.dot)) {
						let newMemberExpr = /** @type {ESTreeJSX.JSXMemberExpression} */ (
							this.startNodeAt(
								/** @type {AST.NodeWithLocation} */ (memberExpr).start,
								/** @type {AST.NodeWithLocation} */ (memberExpr).loc.start,
							)
						);
						newMemberExpr.object = memberExpr;
						newMemberExpr.property = this.jsx_parseIdentifier();
						newMemberExpr.computed = false;
						memberExpr = this.finishNode(newMemberExpr, 'JSXMemberExpression');
					}
					return memberExpr;
				}
				return node;
			}

			/** @type {Parse.Parser['jsx_parseAttributeValue']} */
			jsx_parseAttributeValue() {
				switch (this.type) {
					case tt.braceL: {
						// The host element's `templateMode` is still `'script'` while its
						// opening tag parses, which would route JSX inside the value
						// container to the vanilla (non-TSRX) element parser. Clear the
						// opening node so the container parses exactly like a child-position
						// `{ … }` container — an inline template value must behave the same
						// as one assigned to a variable and passed by name.
						const opening_node = this.#openingNativeTemplateNode;
						this.#openingNativeTemplateNode = null;
						this.#jsxAttributeValueExpressionDepth++;
						try {
							const value = this.jsx_parseExpressionContainer();
							if (value.type === 'JSXSpreadChild') {
								this.raise(
									/** @type {number} */ (value.start),
									'Attribute values cannot be spread. Use a spread attribute (`{...props}`) instead.',
								);
							}
							return value;
						} finally {
							this.#jsxAttributeValueExpressionDepth--;
							this.#openingNativeTemplateNode = opening_node;
						}
					}
					case tstt.jsxTagStart:
						return this.#parseOpeningTagCode(() => {
							// The element's `<` pushed its contexts on the opening tag's, which
							// the tag goes on in after the element.
							this.#tagValueContextDepth = this.context.length - 2;
							try {
								return this.parseExprAtom();
							} finally {
								this.#tagValueContextDepth = -1;
							}
						});
					case tt.string:
						return this.parseExprAtom();
					default:
						this.raise(this.start, 'value should be either an expression or a quoted text');
				}
			}

			/**
			 * Parses code in an opening tag outside a `{ … }` container: a spread
			 * attribute's argument, whose first token is read, or an element that is an
			 * attribute value without braces (`<div a=<b>…</b> />`). While the tag is
			 * read, the element it opens is `#openingNativeTemplateNode`, still in
			 * script mode, so `jsx_parseElement` would hand an element in that code to
			 * acorn-typescript's JSX parser. Hide it and read the code as a container's
			 * (see `jsx_parseExpressionContainer`), as a braced value is read: its
			 * elements are template markup, and the code around them is not template
			 * text. The token after the code is read in the tag again.
			 * @template T
			 * @param {() => T} parse
			 * @returns {T}
			 */
			#parseOpeningTagCode(parse) {
				const opening_node = this.#openingNativeTemplateNode;
				this.#openingNativeTemplateNode = null;
				this.#jsxExpressionContainerDepth++;
				this.#expressionContainerContextBaselines.push(this.context.length);
				this.#expressionContainerPathBaselines.push({
					path: this.#path,
					length: this.#path.length,
				});
				try {
					return parse();
				} finally {
					this.#jsxExpressionContainerDepth--;
					this.#expressionContainerContextBaselines.pop();
					this.#expressionContainerPathBaselines.pop();
					this.#openingNativeTemplateNode = opening_node;
				}
			}

			/**
			 * `@try`/`@pending`/`@catch` blocks are template control-flow blocks like
			 * `@if`/`@for`/`@switch`: `return` is not allowed inside them. A `return`
			 * is only valid in the JS setup at the top of a `@{ … }` code block, never
			 * inside a `@`-directive block. Report any direct `return` with the same
			 * template-return diagnostic used elsewhere.
			 * @returns {AST.BlockStatement}
			 */
			#parseTemplateControlFlowReturnBlock(createNewLexicalScope = true) {
				const block = this.#parseTemplateControlFlowBlock(createNewLexicalScope);
				this.#report_invalid_template_return_statements(block.body);
				return block;
			}

			/**
			 * @type {Parse.Parser['parseTryStatement']}
			 */
			parseTryStatement(node) {
				if (this.#templateControlFlowTryDepth > 0) {
					this.#templateControlFlowTryDepth--;
					try {
						this.next();
						node.block = this.#parseTemplateControlFlowReturnBlock();
						node.handler = null;

						if (this.#eatJSXDirectiveClauseKeyword('pending')) {
							node.pendingKeyword = this.#lastClauseKeywordSpan;
							node.pending = this.#parseTemplateControlFlowReturnBlock();
						} else if (this.#isUnprefixedDirectiveClauseContinuation('pending', ['{'])) {
							this.raise(this.start, 'Expected `@pending` after `@try` block.');
						} else {
							node.pending = null;
						}

						const clauseStart = this.start;
						const clauseStartLoc = this.startLoc;
						if (this.#eatJSXDirectiveClauseKeyword('catch')) {
							node.handlerKeyword = this.#lastClauseKeywordSpan;
							if (this.type === tt._catch || this.value === 'catch') {
								this.next();
							}
							const paramStart = skip_whitespace_from(this.input, this.start);
							if (this.input.charCodeAt(paramStart) === CharCode.openParen) {
								this.pos = paramStart;
								this.start = paramStart;
								this.startLoc = get_line_info(this, paramStart);
								this.curLine = this.startLoc.line;
								this.lineStart = paramStart - this.startLoc.column;
								this.#filterTemplateScriptContexts();
								if (this.curContext() !== b_stat) {
									this.context.push(b_stat);
								}
								this.exprAllowed = true;
								this.#suppressTemplateRawTextToken = true;
								try {
									this.nextToken();
								} finally {
									this.#suppressTemplateRawTextToken = false;
								}
							}
							const clause = /** @type {AST.CatchClause} */ (
								this.startNodeAt(clauseStart, clauseStartLoc)
							);
							const previous_reading_header = this.#readingJSXControlFlowHeader;
							this.#readingJSXControlFlowHeader = true;
							try {
								if (this.eat(tt.parenL)) {
									const param = this.parseBindingAtom();
									const simple = param.type === 'Identifier';
									this.enterScope(simple ? SCOPE_SIMPLE_CATCH : 0);
									this.checkLValPattern(
										param,
										simple ? BINDING_TYPES.BIND_SIMPLE_CATCH : BINDING_TYPES.BIND_LEXICAL,
									);
									const type = this.tsTryParseTypeAnnotation();
									if (type) {
										param.typeAnnotation = type;
										this.resetEndLocation(param);
									}
									clause.param = param;

									if (this.eat(tt.comma)) {
										const reset_param = this.parseBindingAtom();
										this.checkLValSimple(reset_param, BINDING_TYPES.BIND_LEXICAL);
										const reset_type = this.tsTryParseTypeAnnotation();
										if (reset_type) {
											reset_param.typeAnnotation = reset_type;
											this.resetEndLocation(reset_param);
										}
										clause.resetParam = reset_param;
									} else {
										clause.resetParam = null;
									}

									this.expect(tt.parenR);
								} else {
									clause.param = null;
									clause.resetParam = null;
									this.enterScope(0);
								}
							} finally {
								this.#readingJSXControlFlowHeader = previous_reading_header;
							}
							clause.body = this.#parseTemplateControlFlowReturnBlock(false);
							this.exitScope();
							node.handler = this.finishNode(clause, 'CatchClause');
						} else if (this.#isUnprefixedDirectiveClauseContinuation('catch', ['{', '('])) {
							this.raise(this.start, 'Expected `@catch` after `@try` block.');
						}
						node.finalizer = null;

						if (!node.handler && !node.pending) {
							this.raise(
								/** @type {AST.NodeWithLocation} */ (node).start,
								'Missing `@catch` or `@pending` after `@try` block.',
							);
						}
						return this.finishNode(node, 'TryStatement');
					} finally {
						this.#templateControlFlowTryDepth++;
					}
				}

				this.next();
				node.block = this.parseBlock();
				node.handler = null;

				if (this.value === 'pending') {
					this.next();
					node.pending = this.parseBlock();
				} else {
					node.pending = null;
				}

				if (this.type === tt._catch) {
					const clause = /** @type {AST.CatchClause} */ (this.startNode());
					this.next();
					if (this.eat(tt.parenL)) {
						// Parse first param (error) manually to support optional second param (reset).
						// We can't use parseCatchClauseParam() because it eats the closing paren.
						const param = this.parseBindingAtom();
						const simple = param.type === 'Identifier';
						this.enterScope(simple ? SCOPE_SIMPLE_CATCH : 0);
						this.checkLValPattern(
							param,
							simple ? BINDING_TYPES.BIND_SIMPLE_CATCH : BINDING_TYPES.BIND_LEXICAL,
						);
						const type = this.tsTryParseTypeAnnotation();
						if (type) {
							param.typeAnnotation = type;
							this.resetEndLocation(param);
						}
						clause.param = param;

						// Optional second parameter: reset function
						if (this.eat(tt.comma)) {
							const reset_param = this.parseBindingAtom();
							this.checkLValSimple(reset_param, BINDING_TYPES.BIND_LEXICAL);
							const reset_type = this.tsTryParseTypeAnnotation();
							if (reset_type) {
								reset_param.typeAnnotation = reset_type;
								this.resetEndLocation(reset_param);
							}
							clause.resetParam = reset_param;
						} else {
							clause.resetParam = null;
						}

						this.expect(tt.parenR);
					} else {
						clause.param = null;
						clause.resetParam = null;
						this.enterScope(0);
					}
					clause.body = this.parseBlock(false);
					this.exitScope();
					node.handler = this.finishNode(clause, 'CatchClause');
				}
				node.finalizer = this.eat(tt._finally) ? this.parseBlock() : null;

				if (!node.handler && !node.finalizer && !node.pending) {
					this.raise(
						/** @type {AST.NodeWithLocation} */ (node).start,
						'Missing catch or finally clause',
					);
				}
				return this.finishNode(node, 'TryStatement');
			}

			/** @type {Parse.Parser['jsx_readToken']} */
			jsx_readToken() {
				if (this.#scriptJSXElementDepth > 0 || this.#path.length === 0) {
					if (
						this.input.charCodeAt(this.pos) === CharCode.closeBrace &&
						this.context.includes(tstc.tc_expr)
					) {
						this.#resetTokenStartToCurrentPosition();
						return original.readToken.call(this, CharCode.closeBrace);
					}

					let index = this.pos;
					while (
						this.input.charCodeAt(index) === CharCode.space ||
						this.input.charCodeAt(index) === CharCode.tab ||
						this.input.charCodeAt(index) === CharCode.lineFeed ||
						this.input.charCodeAt(index) === CharCode.carriageReturn
					) {
						index++;
					}
					if (
						index !== this.pos &&
						this.input.charCodeAt(index) === CharCode.slash &&
						this.input.charCodeAt(index + 1) === CharCode.greaterThan &&
						this.context.includes(tstc.tc_expr)
					) {
						const loc = get_line_info(this, index);
						this.pos = index;
						this.start = index;
						this.startLoc = loc;
						this.curLine = loc.line;
						this.lineStart = index - loc.column;
						this.exprAllowed = false;
						if (this.curContext() !== tstc.tc_oTag) {
							this.context.push(tstc.tc_oTag);
						}
						return original.readToken.call(this, CharCode.slash);
					}
				}
				if (this.#scriptJSXElementDepth > 0 || this.#path.length === 0) {
					return super.jsx_readToken();
				}

				let out = '',
					chunkStart = this.pos;

				while (true) {
					if (this.pos >= this.input.length) {
						const inside_open_template = this.#path.findLast((n) => this.#isNativeTemplateNode(n));
						if (!inside_open_template) {
							while (this.curContext() === tstc.tc_expr) {
								this.#popContext();
							}
							return this.finishToken(tt.eof);
						}
						this.raise(this.start, 'Unterminated JSX contents');
					}
					let ch = this.input.charCodeAt(this.pos);

					switch (ch) {
						case CharCode.equals:
							// The `allow_inside_expression_container` form keeps `=` (and `=>`)
							// as text inside a container-nested element's children, matching the
							// bare-template path — see the default case below.
							if (
								!this.#shouldReadTemplateRawTextToken(true) &&
								this.input.charCodeAt(this.pos + 1) === CharCode.greaterThan
							) {
								this.#resetTokenStartToCurrentPosition();
								this.pos += 2;
								return this.finishToken(tt.arrow);
							}
							if (this.#shouldReadTemplateRawTextToken(true)) {
								++this.pos;
								break;
							}
							{
								const accumulated = out + this.input.slice(chunkStart, this.pos);
								if (this.#shouldFinishAccumulatedTemplateText(accumulated)) {
									return this.finishToken(tstt.jsxText, accumulated);
								}
							}
							this.#resetTokenStartToCurrentPosition();
							this.context.push(b_stat);
							this.exprAllowed = true;
							return original.readToken.call(this, ch);

						case CharCode.lessThan:
						case CharCode.openBrace:
							// This path reads the children of an element nested in a `{ … }`
							// expression container, where the raw-text intercept in `readToken`
							// is off, so the literal-`<` rule has to be applied here too. Keep
							// scanning rather than finishing the token: the `<` belongs to the
							// text run, and finishing here would emit an empty text token when
							// it is the run's first character.
							if (ch === CharCode.lessThan && !can_start_tag_after_lt(this.input, this.pos)) {
								++this.pos;
								break;
							}
							if (out || this.pos > chunkStart) {
								return this.finishToken(tstt.jsxText, out + this.input.slice(chunkStart, this.pos));
							}
							// In JSX text mode, '<' and '{' always start a tag/expression container.
							// `exprAllowed` can be false here due to surrounding parser state, but
							// throwing breaks valid templates (e.g. sibling tags after a close).
							this.start = this.pos;
							this.startLoc = this.curPosition();
							if (ch === CharCode.lessThan) {
								++this.pos;
								return this.finishToken(tstt.jsxTagStart);
							}
							return this.getTokenFromCode(ch);

						case CharCode.slash:
							// Check if this is a comment (// or /*)
							if (this.input.charCodeAt(this.pos + 1) === CharCode.slash) {
								// '//'
								// Line comment - handle it properly
								const commentStart = this.pos;
								const startLoc = this.curPosition();
								this.pos += 2;

								let commentText = '';
								while (this.pos < this.input.length) {
									const nextCh = this.input.charCodeAt(this.pos);
									if (acorn.isNewLine(nextCh)) break;
									commentText += this.input[this.pos];
									this.pos++;
								}

								const commentEnd = this.pos;
								const endLoc = this.curPosition();

								// Call onComment if it exists
								if (this.options.onComment) {
									const metadata = this.#createCommentMetadata();
									this.options.onComment(
										false,
										commentText,
										commentStart,
										commentEnd,
										startLoc,
										endLoc,
										metadata,
									);
								}

								// Continue processing from current position
								chunkStart = this.pos;
								break;
							} else if (this.input.charCodeAt(this.pos + 1) === CharCode.asterisk) {
								// '/*'
								// Block comment - handle it properly
								const commentStart = this.pos;
								const startLoc = this.curPosition();
								this.pos += 2;

								let commentText = '';
								while (this.pos < this.input.length - 1) {
									if (
										this.input.charCodeAt(this.pos) === CharCode.asterisk &&
										this.input.charCodeAt(this.pos + 1) === CharCode.slash
									) {
										this.pos += 2;
										break;
									}
									commentText += this.input[this.pos];
									this.pos++;
								}

								const commentEnd = this.pos;
								const endLoc = this.curPosition();

								// Call onComment if it exists
								if (this.options.onComment) {
									const metadata = this.#createCommentMetadata();
									this.options.onComment(
										true,
										commentText,
										commentStart,
										commentEnd,
										startLoc,
										endLoc,
										metadata,
									);
								}

								// Continue processing from current position
								chunkStart = this.pos;
								break;
							}
							// Like the default case below, a slash joins the raw text run even
							// when the element is nested inside a `{ … }` expression container
							// (`{cond && (<a>x/y</a>)}`, `{a}/{b}` between child expressions).
							// Bailing to JS tokenization here would read the `/` as the start
							// of a regular expression.
							if (this.#shouldReadTemplateRawTextToken(true)) {
								++this.pos;
								break;
							}
							this.#resetTokenStartToCurrentPosition();
							this.context.push(b_stat);
							this.exprAllowed = true;
							return original.readToken.call(this, ch);

						case CharCode.ampersand:
							out += this.input.slice(chunkStart, this.pos);
							out += this.jsx_readEntity();
							chunkStart = this.pos;
							break;

						case CharCode.greaterThan:
						case CharCode.closeBrace: {
							// Where template text is read, a `>` is text, as it is outside a
							// container: the text of `{c && <b>a > b</b>}` is `a > b`, which
							// the printer writes as `a &gt; b`. Like the default case below,
							// keep scanning. Right after a tag the element is still being
							// opened, and reading the `>` as code dropped the text before it;
							// after a child container it was an error.
							if (ch === CharCode.greaterThan && this.#shouldReadTemplateRawTextToken(true)) {
								++this.pos;
								break;
							}
							if (
								ch === CharCode.greaterThan &&
								this.input.charCodeAt(this.pos - 1) === CharCode.equals &&
								!this.#shouldReadTemplateRawTextToken()
							) {
								const start = this.pos - 1;
								const loc = get_line_info(this, start);
								this.start = start;
								this.startLoc = loc;
								this.pos++;
								return this.finishToken(tt.arrow);
							}
							if (
								this.#isInsideNativeTemplateScriptSection() ||
								(ch === CharCode.closeBrace &&
									(this.#path.length === 0 || this.#isNativeTemplateNode(this.#path.at(-1))))
							) {
								this.#resetTokenStartToCurrentPosition();
								return original.readToken.call(this, ch);
							}
							this.raise(
								this.pos,
								'Unexpected token `' +
									this.input[this.pos] +
									'`. Did you mean `' +
									(ch === CharCode.greaterThan ? '&gt;' : '&rbrace;') +
									'` or ' +
									'`{"' +
									this.input[this.pos] +
									'"}' +
									'`?',
							);
						}

						default:
							if (acorn.isNewLine(ch)) {
								out += this.input.slice(chunkStart, this.pos);
								out += this.jsx_readNewLine(true);
								chunkStart = this.pos;
							} else if (ch === CharCode.space || ch === CharCode.tab) {
								++this.pos;
							} else {
								// A JSX element nested inside a `{ … }` expression container is
								// still a template-mode element whose text children are raw JSX
								// text (e.g. `{<div>   a</div>}`). The default raw-text check bails
								// for everything inside an expression container, so without the
								// `allow_inside_expression_container` form the first non-space char
								// would re-anchor the token start and drop the leading whitespace
								// this loop already skipped. Keep scanning so the full run —
								// leading indentation included — is captured, matching the
								// bare-template path. Directive bodies (`@if`/`@for`/…) inside the
								// element still fall through to JS tokenization via the other
								// checks in `#shouldReadTemplateRawTextToken`.
								if (this.#shouldReadTemplateRawTextToken(true)) {
									++this.pos;
									break;
								}
								// Like `<` and `{` above, a bail boundary (e.g. a directive's `@`)
								// must first finish accumulated template text — resetting the token
								// start here would silently drop it from the template. See
								// `#shouldFinishAccumulatedTemplateText` for which runs qualify.
								{
									const accumulated = out + this.input.slice(chunkStart, this.pos);
									if (this.#shouldFinishAccumulatedTemplateText(accumulated)) {
										return this.finishToken(tstt.jsxText, accumulated);
									}
								}
								this.#resetTokenStartToCurrentPosition();
								this.context.push(b_stat);
								this.exprAllowed = true;
								return original.readToken.call(this, ch);
							}
					}
				}
			}

			/**
			 * acorn-typescript's JSX parser reads an element's children until its
			 * closing tag and takes each text token as a child. A text token that
			 * reads nothing leaves the next token where it was, so the loop would read
			 * it again until memory runs out; report it instead, as `parseTemplateBody`
			 * does for template text.
			 * @type {Parse.Parser['jsx_parseText']}
			 */
			jsx_parseText() {
				const start = this.start;
				const node = super.jsx_parseText();
				if (node.end === start && this.start === start && this.type === tstt.jsxText) {
					this.unexpected(start);
				}
				return node;
			}

			/**
			 * Override jsx_parseElement to use TSRX template parsing only where the
			 * fragment/element body can contain TSRX-only syntax.
			 * @type {Parse.Parser['jsx_parseElement']}
			 */
			jsx_parseElement() {
				if (this.#forceScriptJSXElementDepth > 0 || this.#isInsideNativeTemplateScriptSection()) {
					if (this.#isRawTextOpeningTagStart('style') || this.#isRawTextOpeningTagStart('script')) {
						this.next();
						return /** @type {ESTreeJSX.JSXElement | AST.JSXStyleElement} */ (
							/** @type {unknown} */ (this.parseElement())
						);
					}

					this.#scriptJSXElementDepth++;
					try {
						return super.jsx_parseElement();
					} finally {
						this.#scriptJSXElementDepth--;
					}
				}

				// This element's `jsxTagStart` has already pushed its own `tc_expr` and
				// `tc_oTag`, so everything below them is the enclosing expression's
				// stack — the depth a balanced element parse must return to.
				const enclosing_context_depth = this.context.length - 2;
				const tag_start = this.start;
				this.next();
				// A closing tag where an element starts (`x = (</>);`) is no expression.
				// TypeScript reports it at the `<`.
				if (this.type === tt.slash) this.unexpected(tag_start);
				const parsed = /** @type {import('estree-jsx').JSXElement} */ (
					/** @type {unknown} */ (this.parseElement())
				);
				this.#popTokenContextsAfterTemplateExpressionElement(parsed, enclosing_context_depth);
				return parsed;
			}

			/**
			 * @type {Parse.Parser['jsx_parseOpeningElementAt']}
			 */
			jsx_parseOpeningElementAt(startPos, startLoc) {
				const node = /** @type {ESTreeJSX.TSRXJSXOpeningElement & AST.NodeWithLocation} */ (
					this.startNodeAt(/** @type {number} */ (startPos), /** @type {AST.Position} */ (startLoc))
				);
				node.attributes = [];
				const nodeName = this.jsx_parseElementName();
				if (nodeName) node.name = nodeName;
				if (this.#isDynamicJSXElementName(nodeName)) {
					node.isDynamic = true;
					this.#reportInvalidDynamicTag(nodeName);
				}
				if (this.match(tt.relational) || this.match(tt.bitShift)) {
					const typeArguments = this.tsTryParseAndCatch(() =>
						this.tsParseTypeArgumentsInExpression(),
					);
					if (typeArguments) node.typeArguments = typeArguments;
				}
				while (this.type !== tt.slash && this.type !== tstt.jsxTagEnd) {
					node.attributes.push(this.jsx_parseAttribute());
				}
				node.selfClosing = this.eat(tt.slash);

				const opening_template_node = this.#openingNativeTemplateNode;
				let pushed_opening_template_node = false;
				// `>` reads the next token: the first child, or, after `/>`, the token
				// after the element. Outside a template that token is code, so a
				// self-closing element stays off `#path` (`<span /> / 2` divides).
				const reads_next_token_as_code =
					node.selfClosing && !this.#isNativeTemplateNode(this.#path.at(-1));
				if (opening_template_node) {
					// The enclosing `parseElement` started this node before the opening tag
					// said what it is; stamp its shape now that the tag has been read.
					const template_node = /** @type {Parse.NativeTemplateNodeSlots} */ (
						opening_template_node
					);
					if (nodeName) {
						template_node.type =
							this.getElementName(nodeName) === 'style' ? 'JSXStyleElement' : 'JSXElement';
						template_node.openingElement = node;
						template_node.closingElement = null;
						if (this.#isDynamicJSXElementName(nodeName)) {
							template_node.isDynamic = true;
						}
					} else {
						template_node.type = 'JSXFragment';
						template_node.openingFragment = this.#toOpeningFragment(node);
						template_node.closingFragment = null;
					}
					if (!reads_next_token_as_code) {
						this.#path.push(opening_template_node);
						pushed_opening_template_node = true;
					}
				}

				try {
					this.expect(tstt.jsxTagEnd);
				} finally {
					if (pushed_opening_template_node) {
						this.#path.pop();
					}
				}
				if (nodeName) {
					return this.finishNode(node, 'JSXOpeningElement');
				}
				// `<>` reuses the opening-element node, so finishing it also retypes it.
				return this.finishNode(
					/** @type {ESTreeJSX.JSXOpeningFragment} */ (/** @type {unknown} */ (node)),
					'JSXOpeningFragment',
				);
			}

			/**
			 * @type {Parse.Parser['parseElement']}
			 */
			parseElement() {
				// Depth the tokenizer context must return to once this element closes:
				// the stack with the element's own opening `<` contexts (a trailing
				// tc_oTag/tc_expr) stripped off. A balanced element should leave the
				// stack here; the body (especially a control-flow block) can otherwise
				// leave residue that breaks tokenizing the following JS token when the
				// element is in expression position. The token after `<` is already read,
				// so the `{` of a dynamic tag name (`<{tag}>`) doesn't count. An element
				// that is an attribute value without braces keeps its host's opening tag
				// contexts below it (see `jsx_parseAttributeValue`).
				const tag_value_context_depth = this.#tagValueContextDepth;
				this.#tagValueContextDepth = -1;
				let pre_element_context_depth = this.context.length - this.#currentTokenContextCount();
				while (pre_element_context_depth > Math.max(0, tag_value_context_depth)) {
					const ctx = this.context[pre_element_context_depth - 1];
					if (ctx === tstc.tc_expr || ctx === tstc.tc_oTag || ctx === tstc.tc_cTag) {
						pre_element_context_depth--;
					} else {
						break;
					}
				}

				// The element and its opening tag start at the `<`, the token just
				// consumed. Whitespace or a comment can separate it from the tag name
				// (`< div>`, `<\n  // c\n>`), so this can't be derived from the current
				// token.
				const start = this.lastTokStart;
				const position = new acorn.Position(this.lastTokStartLoc.line, this.lastTokStartLoc.column);

				const node =
					/** @type {ESTreeJSX.JSXElement | ESTreeJSX.JSXFragment | AST.JSXStyleElement} */ (
						/** @type {unknown} */ (this.startNodeAt(start, position))
					);
				node.metadata = {
					path: [],
					native_tsrx: true,
					templateMode: 'script',
				};
				node.children = [];
				this.#elementStarts.set(node, {
					labels: this.labels,
					labelsLength: this.labels.length,
					scriptDepth: this.#templateScriptParsingDepth,
					switchCaseScriptDepth: this.#parsingJSXSwitchCaseScriptStatementDepth,
					scriptJSXDepth: this.#scriptJSXElementDepth,
				});
				if (tag_value_context_depth >= 0) {
					this.#tagValueElements.add(node);
				}

				const previous_opening_native_template_node = this.#openingNativeTemplateNode;
				this.#openingNativeTemplateNode = node;
				let open;
				try {
					open = /** @type {ESTreeJSX.TSRXJSXOpeningElement & AST.NodeWithLocation} */ (
						this.jsx_parseOpeningElementAt(start, position)
					);
				} finally {
					this.#openingNativeTemplateNode = previous_opening_native_template_node;
				}
				const tag_name = open.name ? this.getElementName(open.name) : null;
				const is_dynamic = this.#isDynamicJSXElementName(open.name);
				// `<style>` holds raw CSS text (a JSXStyleElement) unless its first
				// child is an expression container: `<style>{css}</style>` is the
				// ordinary TSX element, parsed like any other host element.
				const is_style = tag_name === 'style' && !this.#hasExpressionChildStart(open);
				const is_script = tag_name === 'script';
				const inside_head = this.#path.findLast((n) => this.#isNativeElementNamed(n, 'head'));

				// Fragments (<>) produce JSXOpeningFragment with no `name` property
				const is_fragment = !open.name;
				const parent_template_node = this.#currentNativeTemplateNode();
				const parent_is_template_output =
					parent_template_node?.metadata?.templateMode === 'template';
				node.metadata.templateMode =
					is_fragment && parent_is_template_output ? 'template' : 'script';
				if (!is_fragment && open.name.type === 'JSXNamespacedName') {
					const namespace_node = /** @type {ESTreeJSX.JSXNamespacedName} */ (open.name);
					const tagName = namespace_node.namespace.name + ':' + namespace_node.name.name;
					this.raise(
						open.start,
						`Namespaced elements are not supported in TSRX templates: <${tagName}>.`,
					);
				}

				// The node was started before its opening tag was read, so its shape is
				// stamped through the under-construction view.
				const slots = /** @type {Parse.NativeTemplateNodeSlots} */ (node);
				if (is_fragment) {
					slots.type = 'JSXFragment';
					slots.openingFragment = this.#toOpeningFragment(open);
					slots.closingFragment = null;
				} else {
					if (is_style) {
						slots.type = 'JSXStyleElement';
						slots.openingElement = open;
						slots.closingElement = null;
					} else {
						slots.type = 'JSXElement';
						slots.openingElement = open;
						slots.closingElement = null;
						if (is_dynamic) {
							slots.isDynamic = true;
						}
					}
				}

				// Opening-tag parsing can tokenize comments that appear before the first
				// child. Preserve that early container id so the comment stays associated
				// with this element during comment attachment/printing.
				if (node.metadata.commentContainerId === undefined) {
					node.metadata.commentContainerId = ++this.#commentContextId;
				}

				this.#path.push(node);

				if (!is_fragment && open.selfClosing) {
					if (is_style) {
						// `<style apply={theme} />` has no CSS body and no scope hash of
						// its own; it only contributes its `apply` targets to the scope.
						const style = /** @type {AST.JSXStyleElement} */ (node);
						style.css = '';
						style.children = [];
					}
					this.#path.pop();
				} else if (is_style) {
					this.#parseStyleElement(
						open,
						/** @type {AST.JSXStyleElement} */ (node),
						!!inside_head,
						pre_element_context_depth,
					);
					this.#path.pop();
				} else if (is_script) {
					this.#parseScriptElement(
						open,
						/** @type {AST.TSRXJSXElement} */ (node),
						pre_element_context_depth,
					);
					this.#path.pop();
				} else {
					this.#elementContextDepths.set(node, pre_element_context_depth);
					this.#parseNativeTemplateBody(node, /** @type {AST.Node[]} */ (node.children), {
						enterScope: true,
						resetFunctionBodyDepth: true,
					});

					if (this.#path[this.#path.length - 1] === node) {
						const displayTag = is_fragment
							? ''
							: this.getElementName(/** @type {ESTreeJSX.JSXElement} */ (node).openingElement.name);
						this.#report_broken_markup_error(
							this.start,
							`Unclosed tag '<${displayTag}>'. Expected '</${displayTag}>' before end of template.`,
						);
						slots.unclosed = true;
						/** @type {AST.SourceLocation} */ (node.loc).end = {
							.../** @type {AST.SourceLocation} */ (
								is_fragment
									? /** @type {ESTreeJSX.JSXFragment} */ (node).openingFragment.loc
									: /** @type {ESTreeJSX.JSXElement} */ (node).openingElement.loc
							).end,
						};
						node.end = is_fragment
							? /** @type {ESTreeJSX.JSXFragment} */ (node).openingFragment.end
							: /** @type {ESTreeJSX.JSXElement} */ (node).openingElement.end;
						this.#path.pop();
					}

					// A balanced element must leave the tokenizer context exactly where it
					// began. The body (especially a control-flow block) can leave residue
					// above the children context — the children tc_expr plus a spurious
					// b_stat from an @if/@for block save-restore — which the old single
					// tc_expr pop missed when the b_stat sat on top. In expression position,
					// unwind back to the pre-element depth so the following JS token (e.g. a
					// comma/brace closing an enclosing object) tokenizes as code, not text.
					const parent = this.#path.at(-1);
					const insideTemplate = this.#isNativeTemplateNode(parent);

					// The token after the closing tag is already read, so only the residue
					// under the contexts it pushed goes (a sibling's `<`, a template
					// literal's backquote).
					const token_context_depth = this.context.length - this.#currentTokenContextCount();
					if (!insideTemplate && token_context_depth > pre_element_context_depth) {
						const token_contexts = this.context.slice(token_context_depth);
						this.#truncateContext(pre_element_context_depth);
						this.context.push(...token_contexts);
					}
				}

				if (is_style || is_script) {
					const raw_text = /** @type {AST.JSXStyleElement} */ (node);
					if (raw_text.closingElement) {
						const closing = /** @type {ESTreeJSX.JSXClosingElement & AST.NodeWithLocation} */ (
							raw_text.closingElement
						);
						return this.finishNodeAt(node, node.type, closing.end, closing.loc.end);
					}
					if (raw_text.unclosed && this.#loose) {
						// Loose recovery captured a body without a closing tag: the element
						// ends where its body ends, not at whatever token was read next.
						const script = /** @type {AST.TSRXJSXElement} */ (/** @type {unknown} */ (node));
						const body = (is_style ? raw_text.css : script.content) ?? '';
						const body_end =
							/** @type {ESTreeJSX.TSRXJSXOpeningElement & AST.NodeWithLocation} */ (open).end +
							body.length;
						const body_end_info = get_line_info(this, body_end);
						return this.finishNodeAt(
							node,
							node.type,
							body_end,
							new acorn.Position(body_end_info.line, body_end_info.column),
						);
					}
				}

				return this.finishNode(node, node.type);
			}

			/**
			 * @type {Parse.Parser['parseTemplateBody']}
			 */
			parseTemplateBody(body) {
				const current_template_node = this.#currentNativeTemplateNode();
				if (!current_template_node) return;
				current_template_node.metadata ??= { path: [] };
				current_template_node.metadata.templateMode = 'template';

				if (this.#atCodeBlockStart()) {
					const at_index = skip_whitespace_from(this.input, this.start);
					if (this.start !== at_index) {
						const ws_start = this.start;
						const ws_start_loc = this.startLoc;
						const ws_value = this.input.slice(ws_start, at_index);
						const text_node = /** @type {ESTreeJSX.JSXText} */ (
							this.startNodeAt(ws_start, ws_start_loc)
						);
						text_node.value = ws_value;
						text_node.raw = ws_value;
						const loc = get_line_info(this, at_index);
						const at_position = new acorn.Position(loc.line, loc.column);
						this.finishNodeAt(text_node, 'JSXText', at_index, at_position);
						if (this.#shouldKeepTemplateTextNode(text_node)) {
							body.push(text_node);
						}
						this.pos = at_index;
						this.start = at_index;
						this.startLoc = at_position;
						this.curLine = loc.line;
						this.lineStart = at_index - loc.column;
					}
					body.push(this.#parseCodeBlock());
					this.parseTemplateBody(body);
					return;
				}

				if (this.type === tt.braceL) {
					body.push(this.#parseNativeTemplateExpressionContainer());
				} else if (this.type === tstt.jsxText) {
					const text = this.#parseTemplateRawText();
					if (this.#shouldKeepTemplateTextNode(text)) {
						body.push(text);
					}
				} else if (this.#isJSXControlFlowDirectiveStart()) {
					const directive = this.#parseJSXControlFlowExpression();
					body.push(directive);
					// `#parseTemplateControlFlowBlock` reads the token after the block's
					// closing `}` in a code (b_stat) context, which runs `skipSpace()` and
					// advances `start` past any whitespace. The following token is therefore a
					// JS token (e.g. the `else` keyword), and when it is actually sibling
					// template raw text it reaches `#parseTemplateRawText` having lost the
					// space(s) between `}` and the text (e.g. `@if (x) { … } else` -> the text
					// "else" instead of " else"). JSX text after a plain element keeps that
					// whitespace, so when raw text follows and only whitespace was skipped,
					// rewind `start` to the block's end to re-include the dropped whitespace.
					const blockEnd = directive.end;
					const nextCh = this.input.charCodeAt(this.start);
					const startsRawText =
						this.type !== tt.eof &&
						nextCh !== CharCode.lessThan &&
						nextCh !== CharCode.openBrace &&
						nextCh !== CharCode.closeBrace &&
						!this.#isJSXControlFlowDirectiveStart();
					if (
						startsRawText &&
						typeof blockEnd === 'number' &&
						this.start > blockEnd &&
						/^\s*$/.test(this.input.slice(blockEnd, this.start))
					) {
						const loc = get_line_info(this, blockEnd);
						this.pos = blockEnd;
						this.start = blockEnd;
						this.startLoc = new acorn.Position(loc.line, loc.column);
					}
				} else if (this.type === tt.braceR) {
					// Leaving a native template body. We may still be in TSX/JSX tokenization
					// context (e.g. after parsing markup), but the closing `}` is a JS token.
					// If we don't reset this here, the following `next()` can read EOF using
					// `jsx_readToken()` and throw "Unterminated JSX contents".
					while (this.curContext() === tstc.tc_expr) {
						this.#popContext();
					}
					return;
				} else if (this.type === tstt.jsxTagStart) {
					const startPos = this.start;
					const startLoc = this.startLoc;
					this.next();
					if (this.value === '/' || this.type === tt.slash) {
						// Consume '/'
						this.next();

						const closingNode = this.startNodeAt(startPos, startLoc);
						// Whether the element's parent is a template node, so that the token
						// after the `>` is the parent's text. In a `{ … }` container only a
						// parent opened in the container counts: above it, the container's
						// expression goes on. Nor does a parent opened before the code the
						// element is in (see `#elementStart`), whose text that code isn't.
						const parent_template_node = this.#path
							.slice(this.#containerPathBaseline(), -1)
							.findLast((node) => this.#isNativeTemplateNode(node));
						const inside_parent_template =
							!!parent_template_node &&
							this.#templateScriptParsingDepth <=
								this.#elementStart(parent_template_node).scriptDepth;
						this.#closingNativeTemplateNode = true;
						/** @type {ReturnType<Parse.Parser['jsx_parseElementName']>} */
						let closingName;
						try {
							closingName = this.jsx_parseElementName();
						} finally {
							this.#closingNativeTemplateNode = false;
						}
						if (closingName) {
							/** @type {ESTreeJSX.TSRXJSXClosingElement} */ (closingNode).name = closingName;
						}
						const current = /** @type {ESTreeJSX.JSXFragment | ESTreeJSX.JSXElement} */ (
							this.#path[this.#path.length - 1]
						);
						const current_name = this.#isNativeTemplateNode(current)
							? current.type === 'JSXFragment'
								? ''
								: current.openingElement?.name
									? this.getElementName(current.openingElement.name)
									: null
							: null;
						const closing_name_str = !closingName
							? ''
							: closingName.type === 'JSXNamespacedName'
								? closingName.namespace.name + ':' + closingName.name.name
								: this.getElementName(closingName);
						if (!(inside_parent_template && current_name === closing_name_str)) {
							this.#closingNativeTemplateNode = true;
						}
						// `>` reads the token after the element. When the element closes and no
						// template encloses it, or in its host's opening tag as an attribute
						// value without braces, that token is code: the element leaves `#path`
						// (`<b>x</b> / 2` divides; it is popped for good below), and the
						// tokenizer context returns to where the element began, as after a
						// balanced closing tag, dropping residue its body left (a control-flow
						// block's contexts). parseElement keeps the contexts the token pushes.
						const closes_outside_template =
							this.#isNativeTemplateNode(current) &&
							current_name === closing_name_str &&
							(!this.#isNativeTemplateNode(this.#path.at(-2)) ||
								this.#tagValueElements.has(current));
						if (closes_outside_template) {
							this.#path.pop();
							const context_depth = this.#elementContextDepths.get(current);
							if (context_depth !== undefined && this.context.length > context_depth) {
								this.#truncateContext(context_depth);
								this.exprAllowed = false;
							}
						}
						try {
							this.expect(tstt.jsxTagEnd);
						} finally {
							if (closes_outside_template) {
								this.#path.push(current);
							}
						}
						this.#closingNativeTemplateNode = false;
						const closingElement =
							/** @type {ESTreeJSX.TSRXJSXClosingElement & AST.NodeWithLocation} */ (
								this.finishNode(
									closingNode,
									closingName ? 'JSXClosingElement' : 'JSXClosingFragment',
								)
							);
						if (this.#isDynamicJSXElementName(closingElement.name)) {
							closingElement.isDynamic = true;
						}

						// Validate that the closing tag matches the opening tag
						const currentElement = /** @type {AST.NativeTSRXTemplateNode} */ (
							this.#path[this.#path.length - 1]
						);
						if (!this.#isNativeTemplateNode(currentElement)) {
							this.raise(this.start, 'Unexpected closing tag');
						}

						/** @type {string | null} */
						let openingTagName;
						/** @type {string | null} */
						let closingTagName;

						if (currentElement.type === 'JSXFragment') {
							openingTagName = '';
							closingTagName = !closingElement.name
								? ''
								: closingElement.name.type === 'JSXNamespacedName'
									? closingElement.name.namespace.name + ':' + closingElement.name.name.name
									: this.getElementName(closingElement.name);
						} else {
							openingTagName = currentElement.openingElement?.name
								? this.getElementName(currentElement.openingElement.name)
								: null;
							closingTagName = closingElement.name
								? closingElement.name?.type === 'JSXNamespacedName'
									? closingElement.name.namespace.name + ':' + closingElement.name.name.name
									: this.getElementName(closingElement.name)
								: null;
						}

						if (openingTagName !== closingTagName) {
							// A closing tag that matches no open element on the path is not a
							// mismatch we can recover from by marking ancestors unclosed — it is
							// simply an unexpected closing tag (e.g. `<div></span>`).
							const normalized_closing_name = closingTagName ?? '';
							const matches_open_element = this.#path.some((node) => {
								const elem = /** @type {AST.NativeTSRXTemplateNode} */ (node);
								if (!this.#isNativeTemplateNode(elem)) return false;
								const elemName =
									elem.type === 'JSXFragment'
										? ''
										: elem.openingElement?.name
											? this.getElementName(elem.openingElement.name)
											: null;
								return elemName === normalized_closing_name;
							});
							if (!matches_open_element && this.#collect) {
								this.raise(closingElement.start, 'Unexpected closing tag');
							}
							// this will throw if not collecting errors
							this.#report_broken_markup_error(
								closingElement.start,
								`Expected closing tag to match opening tag. Expected '</${openingTagName}>' but found '</${closingTagName}>'`,
								DIAGNOSTIC_CODES.MISMATCHED_CLOSING_TAG,
							);
							// Loop through all unclosed elements on the stack
							while (this.#path.length > 0) {
								const elem = /** @type {AST.NativeTSRXTemplateNode} */ (
									this.#path[this.#path.length - 1]
								);

								// Stop at non-template boundaries.
								if (!this.#isNativeTemplateNode(elem)) {
									break;
								}

								const elemName =
									elem.type === 'JSXFragment'
										? ''
										: elem.openingElement?.name
											? this.getElementName(elem.openingElement.name)
											: null;

								// Found matching opening tag
								if (elemName === closingTagName) {
									break;
								}

								// Mark as unclosed and adjust location
								elem.unclosed = true;
								/** @type {AST.NodeWithLocation} */ (elem).loc.end = {
									.../** @type {AST.SourceLocation} */ (
										elem.type === 'JSXFragment' ? elem.openingFragment.loc : elem.openingElement.loc
									).end,
								};
								elem.end =
									elem.type === 'JSXFragment' ? elem.openingFragment.end : elem.openingElement.end;

								this.#path.pop(); // Remove from stack
							}
						}

						const elementToClose = /** @type {AST.NativeTSRXTemplateNode} */ (
							this.#path[this.#path.length - 1]
						);
						if (this.#isNativeTemplateNode(elementToClose)) {
							const elementToCloseName =
								elementToClose.type === 'JSXFragment'
									? ''
									: elementToClose.openingElement?.name
										? this.getElementName(elementToClose.openingElement.name)
										: null;
							if (elementToCloseName === closingTagName) {
								if (elementToClose.type === 'JSXFragment') {
									elementToClose.closingFragment = this.#toClosingFragment(closingElement);
								} else {
									elementToClose.closingElement = closingElement;
								}
							}
						}

						this.#path.pop();
						return;
					}
					const node = this.parseElement();
					if (node !== null) {
						body.push(node);
					}
				} else if (this.type === tt.eof) {
					return;
				} else {
					const start = this.start;
					const type = this.type;
					const text = this.#parseTemplateRawText();
					// Text that reads nothing and leaves the same token would be read
					// again until the stack runs out.
					if (text.end === start && this.start === start && this.type === type) {
						this.unexpected(start);
					}
					if (this.#shouldKeepTemplateTextNode(text)) {
						body.push(text);
					}
				}

				this.parseTemplateBody(body);
			}

			// UPSTREAM(sveltejs/acorn-typescript#110): remove once a release includes the fix
			/**
			 * Parse the arguments of `import(…)` and `import.defer(…)` with acorn's
			 * own grammar, starting at the `(`. acorn-typescript replaces it with an
			 * older one that rejected a trailing comma after either argument
			 * (`import("./a.js",)`), read `import(a, b, c)` as `import(a, (b, c))`,
			 * and put the options on `arguments`. acorn puts them on `options`, the
			 * name typescript-estree and import types here use, or `null` without
			 * them, and rejects a third argument.
			 *
			 * sveltejs/acorn-typescript#110 defers to acorn the same way, but also
			 * copies `options` onto `arguments`, and esrap prints both. If the
			 * release still does, drop `arguments` from the AST when removing this.
			 * @type {Parse.Parser['parseDynamicImport']}
			 */
			parseDynamicImport(node) {
				return original.parseDynamicImport.call(this, node);
			}

			/**
			 * Recognize the deferred dynamic-import form
			 * `import.defer(specifier, options?)` before Acorn parses `import.<name>`
			 * as an `import.meta` member access. Ordinary `import()` and `import.meta`
			 * fall through to Acorn unchanged, so the proposal never alters their
			 * existing AST shape.
			 * @type {Parse.Parser['parseExprImport']}
			 */
			parseExprImport(forNew) {
				if (
					!forNew &&
					this.lookahead().type === tt.dot &&
					this.isContextualWithState('defer', this.lookahead(2))
				) {
					const node = /** @type {AST.ImportExpression} */ (this.startNode());
					if (this.containsEsc) {
						this.raiseRecoverable(this.start, 'Escape sequence in keyword import');
					}
					this.next(); // `import`
					this.next(); // `.`
					this.next(); // `defer`
					node.phase = 'defer';
					if (this.type !== tt.parenL) this.unexpected();
					return this.parseDynamicImport(node);
				}

				return super.parseExprImport(forNew);
			}

			/**
			 * Parse proposal-style imports from an inline module declaration:
			 * `import { foo } from server;`
			 *
			 * Acorn's import parser currently requires a string literal source. TSRX
			 * extends only the source position; all specifier parsing stays delegated
			 * to Acorn/@sveltejs/acorn-typescript.
			 * @type {Parse.Parser['parseImport']}
			 */
			parseImport(node) {
				const tokenIsIdentifier = Parser.acornTypeScript.tokenIsIdentifier;
				let enterHead = this.lookahead();
				let deferred = false;
				let defer_start = -1;
				node.importKind = 'value';
				this.importOrExportOuterKind = 'value';
				if (tokenIsIdentifier(enterHead.type) || this.match(tt.star) || this.match(tt.braceL)) {
					let ahead = this.lookahead(2);
					// `defer` and `type` are only phase/kind modifiers when the following
					// token cannot continue a default import (`, `/`from`) or an
					// import-equals declaration (`=`); otherwise they are ordinary bindings.
					const head_modifies =
						ahead.type !== tt.comma &&
						!this.isContextualWithState('from', ahead) &&
						ahead.type !== tt.eq;
					// The namespace-only restriction is checked after parsing the clause,
					// which also gives invalid named/default deferred imports a focused
					// diagnostic.
					if (head_modifies && this.isContextualWithState('defer', enterHead)) {
						deferred = true;
						defer_start = enterHead.start;
						node.phase = 'defer';
						this.ts_eatContextualWithState('defer', 1, enterHead);
						enterHead = this.lookahead();
						ahead = this.lookahead(2);
					} else if (head_modifies && this.ts_eatContextualWithState('type', 1, enterHead)) {
						this.importOrExportOuterKind = 'type';
						node.importKind = 'type';
						enterHead = this.lookahead();
						ahead = this.lookahead(2);
					}
					if (tokenIsIdentifier(enterHead.type) && ahead.type === tt.eq) {
						this.next();
						const importNode = this.tsParseImportEqualsDeclaration(node);
						this.importOrExportOuterKind = 'value';
						return importNode;
					}
				}
				this.next();
				if (this.type === tt.string) {
					node.specifiers = [];
					node.source = /** @type {AST.Literal} */ (this.parseExprAtom());
				} else {
					node.specifiers = this.parseImportSpecifiers();
					this.expectContextual('from');
					if (this.type === tt.string) {
						node.source = /** @type {AST.Literal} */ (this.parseExprAtom());
					} else if (tokenIsIdentifier(this.type)) {
						const source = this.parseIdent(false);
						source.metadata ??= { path: [] };
						node.source = source;
					} else {
						this.unexpected();
					}
				}
				if (
					deferred &&
					(node.specifiers.length !== 1 ||
						node.specifiers[0].type !== 'ImportNamespaceSpecifier' ||
						node.source.type !== 'Literal')
				) {
					this.raise(
						defer_start,
						'`import defer` only supports a namespace import from a string literal.',
					);
				}
				this.parseMaybeImportAttributes(node);
				this.semicolon();
				this.finishNode(node, 'ImportDeclaration');
				this.importOrExportOuterKind = 'value';
				return node;
			}

			/**
			 * True when the token after an element that starts a statement continues
			 * an expression with it, as in TSX: a binary, logical, or relational
			 * operator, `**`, `?`, or `,`, on the element's line or a later one
			 * (`<div /> > 5;`, `<div />\n+ 1;`), and `as` or `satisfies` only on the
			 * element's line, since TypeScript stops at a line break before them. A
			 * tag start is the next element (`<div /> <span />`), and so is any `<`
			 * that starts a later line, which TypeScript reads as a tag start after
			 * an element too.
			 */
			#continuesElementExpression() {
				if (
					this.type.binop != null ||
					this.type === tt.starstar ||
					this.type === tt.question ||
					this.type === tt.comma
				) {
					return (
						!this.hasPrecedingLineBreak() || !(this.type === tt.relational && this.value === '<')
					);
				}
				return (
					!this.hasPrecedingLineBreak() &&
					(this.isContextual('as') || this.isContextual('satisfies'))
				);
			}

			/**
			 * Finish the expression statement that an element starts, with the element
			 * as the leftmost operand, as `parseExpression` would have from its atom.
			 * @param {AST.Node} element
			 * @returns {AST.ExpressionStatement}
			 */
			#parseElementExpressionStatement(element) {
				const start = /** @type {number} */ (element.start);
				const start_loc = /** @type {AST.SourceLocation} */ (element.loc).start;
				let expression = /** @type {AST.Expression} */ (element);
				// Acorn reads `**` with the unary operand before it, not as a binop.
				if (this.eat(tt.starstar)) {
					expression = this.buildBinary(
						start,
						start_loc,
						expression,
						this.parseMaybeUnary(null, false, false, false),
						'**',
						false,
					);
				}
				expression = this.parseExprOp(expression, start, start_loc, -1, false);
				expression = this.parseConditional(expression, start, start_loc, false);
				if (this.type === tt.comma) {
					const sequence = /** @type {AST.SequenceExpression} */ (
						this.startNodeAt(start, start_loc)
					);
					sequence.expressions = [expression];
					while (this.eat(tt.comma)) {
						sequence.expressions.push(this.parseMaybeAssign(false));
					}
					expression = this.finishNode(sequence, 'SequenceExpression');
				}
				const statement = /** @type {AST.ExpressionStatement} */ (
					this.startNodeAt(start, start_loc)
				);
				return /** @type {AST.ExpressionStatement} */ (
					this.parseExpressionStatement(statement, expression)
				);
			}

			/**
			 * @type {Parse.Parser['parseStatement']}
			 */
			parseStatement(context, topLevel, exports) {
				// A statement without a `context` is the next one in a block, `case`, or
				// module body (the program's own loop stops at the end of the input): at
				// the end of the input, the body's `}` is missing. A statement that
				// follows `if (…)`, `else`, a loop head, or a label (`context`) keeps
				// acorn's `Unexpected token`, where TypeScript reports a missing
				// expression.
				if (context == null && this.type === tt.eof) {
					this.#raiseClosingBraceExpected();
				}
				if (
					context !== 'for' &&
					context !== 'if' &&
					this.#functionBodyDepth === 0 &&
					this.context.at(-1) === b_stat &&
					this.type === tt.braceL &&
					this.context.some((c) => c === tstc.tc_expr)
				) {
					return /** @type {ESTreeJSX.JSXExpressionContainer} */ (
						this.#parseNativeTemplateExpressionContainer()
					);
				}

				if (this.type === tstt.jsxTagStart) {
					if (this.#forceScriptJSXElementDepth > 0) {
						return /** @type {AST.Statement} */ (
							/** @type {unknown} */ (super.parseStatement(context, topLevel, exports))
						);
					}

					const tag_start = this.start;
					this.next();
					// A closing tag where a statement starts, reported at its `<` as in an
					// expression (see `jsx_parseElement`).
					if (this.value === '/') this.unexpected(tag_start);
					const node = this.parseElement();

					if (!node) {
						this.unexpected();
					}
					if (
						this.#functionBodyDepth > 0 &&
						node.type === 'JSXFragment' &&
						this.curContext() === b_stat
					) {
						this.#popContext();
						if (this.curContext() === tstc.tc_expr) {
							this.#popContext();
						}
						if (this.curContext() === b_stat) {
							this.#popContext();
						}
					}
					if (this.#continuesElementExpression()) {
						return this.#parseElementExpressionStatement(node);
					}
					return node;
				}

				if (
					this.input.charCodeAt(this.start) === CharCode.at &&
					(this.#isCodeBlockStart(this.start) || this.#isJSXControlFlowDirectiveStart())
				) {
					const node = /** @type {AST.ExpressionStatement} */ (this.startNode());
					node.expression = /** @type {AST.Expression} */ (this.parseExpression());
					this.semicolon();
					return /** @type {AST.ExpressionStatement} */ (
						this.finishNode(node, 'ExpressionStatement')
					);
				}

				if (this.#collect && this.type === tstt.at) {
					// Decorators (see `parseDecorators`).
					return this.#parseDecoratedStatement(() =>
						super.parseStatement(context, topLevel, exports),
					);
				}

				this.#checkEscapedDeclarationKeyword();

				if (this.type === tstt.type && this.#isTypeAliasNamedOperator()) {
					const node = this.startNode();
					this.next(); // `type`
					return /** @type {AST.Statement} */ (
						/** @type {unknown} */ (this.tsParseTypeAliasDeclaration(node))
					);
				}

				return super.parseStatement(context, topLevel, exports);
			}

			// UPSTREAM(sveltejs/acorn-typescript#145): remove once a release includes the fix
			/**
			 * Whether the current token, `type`, starts a type alias named `as` or
			 * `satisfies`. TypeScript reads `type` before a name on the same line as a
			 * type alias (`isDeclaration`), and these are names. acorn-typescript
			 * reads the start of a statement as an expression first and makes a type
			 * alias of `type` and the name after it, but it read `as` or `satisfies`
			 * after the expression `type` as an operator, so `type as = 1;` failed at
			 * `=`, and `type as number;` parsed as an expression, where TypeScript
			 * expects the alias's `=` (TS1005).
			 */
			#isTypeAliasNamedOperator() {
				const next = this.lookahead();
				return (
					next.type === tt.name &&
					(next.value === 'as' || next.value === 'satisfies') &&
					!this.#lineBreakAfter(this.end)
				);
			}

			/**
			 * @type {Parse.Parser['parseBlock']}
			 */
			parseBlock(createNewLexicalScope, node, exitStrict) {
				const parent = this.#path.at(-1);

				// `#templateControlFlowBlockDepth` alone decides here — don't also
				// require `#isNativeTemplateNode(parent)`: a directive body's own
				// parsing (`#parseTemplateControlFlowBlock`) empties `#path`, so for
				// a `@for` nested inside another directive's branch, `parent` is
				// `undefined` and that check would skip this redirect, dropping the
				// `@for`'s body into plain statement parsing (nested directives then
				// land in expression position instead of template position). The
				// depth counter is set only around a `@for`'s own header+body and
				// `@empty` clause, so plain JS `for` loops can't false-positive.
				if (this.#templateControlFlowBlockDepth > 0) {
					this.#templateControlFlowBlockDepth--;
					try {
						return this.#parseTemplateControlFlowBlock(createNewLexicalScope, node, exitStrict);
					} finally {
						this.#templateControlFlowBlockDepth++;
					}
				}

				if (this.#functionBodyDepth > 0 && this.#isNativeTemplateNode(parent)) {
					let pushed_statement_context = false;
					if (this.curContext() !== b_stat) {
						this.context.push(b_stat);
						pushed_statement_context = true;
					}
					try {
						return super.parseBlock(createNewLexicalScope, node, exitStrict);
					} finally {
						if (pushed_statement_context && this.curContext() === b_stat) {
							this.#popContext();
						}
					}
				}

				return super.parseBlock(createNewLexicalScope, node, exitStrict);
			}

			/**
			 * Report a missing `}` at the current token as TypeScript does, with
			 * `'}' expected.` instead of acorn's `Unexpected token`.
			 * @returns {never}
			 */
			#raiseClosingBraceExpected() {
				return this.raise(this.start, CLOSING_BRACE_EXPECTED);
			}

			/**
			 * Consume the `}` of an expression container (`{value}`, `{...spread}`, or
			 * a `{name}` attribute), which holds a single expression: whatever token
			 * is in its place, the `}` is missing, as TypeScript reports.
			 */
			#expectContainerClosingBrace() {
				if (!this.eat(tt.braceR)) {
					this.#raiseClosingBraceExpected();
				}
			}

			/**
			 * Parse an element of a `{ … }` list: a property, a named import or
			 * export, or an enum, interface, or type literal member. At the end of the
			 * input, the list's `}` is missing. Records where the element ends for
			 * `expect`.
			 * @template T
			 * @param {() => T} parse
			 * @returns {T}
			 */
			#parseBraceListElement(parse) {
				if (this.type === tt.eof) {
					this.#raiseClosingBraceExpected();
				}
				const element = parse();
				this.#braceListElementEnd = this.lastTokEnd;
				return element;
			}

			/**
			 * Report a missing `}` like TypeScript wherever acorn expects one: at
			 * the end of the input, and at any token after the expression of a
			 * template literal's `${ … }`. Elsewhere a token in place of the `}` is
			 * one TypeScript reads differently (another member of a mapped type, or
			 * an import attribute without its comma) and keeps `Unexpected token`.
			 * At the end of the input, the comma expected after an element of a
			 * comma-separated `{ … }` list, and the first element of a list opened
			 * by an expected `{`, are the list's missing `}` too. A tag's `>`, expected
			 * after a closing tag's name or a self-closing tag's `/`, is missing
			 * whatever token is in its place, as TypeScript reports too.
			 * @param {Parse.TokenType} type
			 */
			expect(type) {
				if (this.type !== type) {
					if (type === tstt.jsxTagEnd) {
						this.raise(this.start, TAG_END_EXPECTED);
					}
					if (
						type === tt.braceR &&
						(this.type === tt.eof ||
							this.context.at(-1 - this.#currentTokenContextCount()) === b_tmpl)
					) {
						this.#raiseClosingBraceExpected();
					}
					if (
						type === tt.comma &&
						this.type === tt.eof &&
						this.lastTokEnd === this.#braceListElementEnd
					) {
						this.#raiseClosingBraceExpected();
					}
				}
				super.expect(type);
				// Every `{` that acorn expects opens a list, such as a `switch` body,
				// which would otherwise read its first `case` at the end of the input.
				if (type === tt.braceL && this.type === tt.eof) {
					this.#raiseClosingBraceExpected();
				}
			}

			/**
			 * @type {Parse.Parser['parseProperty']}
			 */
			parseProperty(isPattern, refDestructuringErrors) {
				// UPSTREAM(sveltejs/acorn-typescript#135): remove once a release includes the fix
				// A member of an object literal takes no decorators: TypeScript's
				// parser expects a property at the `@` (TS1136), as acorn does in an
				// object pattern. acorn-typescript reads them and hangs them off the
				// property, which the output leaves out. Throw acorn's `Unexpected
				// token` at the `@` in every mode.
				if (this.type === tstt.at) this.unexpected();
				return this.#parseBraceListElement(() =>
					super.parseProperty(isPattern, refDestructuringErrors),
				);
			}

			/**
			 * @type {Parse.Parser['parseImportSpecifier']}
			 */
			parseImportSpecifier() {
				return this.#parseBraceListElement(() => super.parseImportSpecifier());
			}

			/**
			 * @type {Parse.Parser['parseExportSpecifier']}
			 */
			parseExportSpecifier(exports) {
				return this.#parseBraceListElement(() => super.parseExportSpecifier(exports));
			}

			/**
			 * @type {Parse.Parser['tsParseEnumMember']}
			 */
			tsParseEnumMember() {
				return this.#parseBraceListElement(() => super.tsParseEnumMember());
			}

			/**
			 * `get` or `set` before a property name, written with an escape, is
			 * TypeScript's TS1260 `Keywords cannot contain escape characters.`: its
			 * parser reads an accessor signature there, as acorn-typescript did,
			 * without an error (sveltejs/acorn-typescript#147).
			 * @type {Parse.Parser['tsParseTypeMember']}
			 */
			tsParseTypeMember() {
				// UPSTREAM(sveltejs/acorn-typescript#147): remove once a release includes the fix
				if (
					this.containsEsc &&
					this.type === tt.name &&
					(this.value === 'get' || this.value === 'set')
				) {
					// TypeScript's `canFollowGetOrSetKeyword`.
					const next = this.lookahead().type;
					if (next === tt.bracketL || Parser.acornTypeScript.tokenIsLiteralPropertyName(next)) {
						this.raise(this.start, KEYWORD_ESCAPE);
					}
				}
				return this.#parseBraceListElement(() => super.tsParseTypeMember());
			}

			/**
			 * @type {Parse.Parser['parseDecorator']}
			 */
			parseDecorator() {
				const decorator = super.parseDecorator();
				this.#decoratorEnd = this.lastTokEnd;
				return decorator;
			}

			/**
			 * A class member at the end of the input: the class body's `}` is
			 * missing, unless a decorator came right before it, where TypeScript
			 * reports the member as missing instead.
			 *
			 * A constructor named with an escape (`\u0063onstructor() {}`) is
			 * TypeScript's TS1260 `Keywords cannot contain escape characters.`: its
			 * parser reads the `constructor` keyword there, and so a constructor
			 * even after `static`. acorn reads the constructor, or a static method,
			 * as ECMAScript does, without an error (sveltejs/acorn-typescript#147).
			 * @type {Parse.Parser['parseClassElement']}
			 */
			parseClassElement(constructorAllowsSuper) {
				if (this.type === tt.eof && this.lastTokEnd !== this.#decoratorEnd) {
					this.#raiseClosingBraceExpected();
				}
				const element = super.parseClassElement(constructorAllowsSuper);
				// UPSTREAM(sveltejs/acorn-typescript#147): remove once a release includes the fix
				if (
					element?.type === 'MethodDefinition' &&
					!element.computed &&
					element.kind !== 'get' &&
					element.kind !== 'set' &&
					!element.value.generator &&
					element.key.type === 'Identifier' &&
					element.key.name === 'constructor' &&
					this.input.slice(element.key.start, element.key.end) !== 'constructor'
				) {
					this.raise(/** @type {number} */ (element.key.start), KEYWORD_ESCAPE);
				}
				return element;
			}
		}

		return /** @type {Parse.ParserConstructor} */ (TSRXParser);
	};
}
