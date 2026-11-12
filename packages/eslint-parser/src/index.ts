import type { Program } from 'estree';
import type { AST, Linter } from 'eslint';
import {
	analyzeTsrx as analyze_tsrx,
	DIAGNOSTIC_CODES,
	parseModule as parse_module,
} from '@tsrx/core';
import { Definition, Referencer, ScopeManager } from 'eslint-scope';

interface ParseResult {
	ast: Program;
	services?: Record<string, any>;
	scopeManager?: any;
	visitorKeys?: Record<string, string[]>;
}

const visitorKeys: Record<string, string[]> = {
	Program: ['body'],
	JSXElement: ['openingElement', 'children', 'closingElement'],
	JSXOpeningElement: ['name', 'attributes'],
	JSXClosingElement: ['name'],
	JSXFragment: ['openingFragment', 'children', 'closingFragment'],
	JSXOpeningFragment: [],
	JSXClosingFragment: [],
	JSXExpressionContainer: ['expression'],
	JSXAttribute: ['name', 'value'],
	JSXSpreadAttribute: ['argument'],
	JSXIdentifier: [],
	JSXMemberExpression: ['object', 'property'],
	JSXNamespacedName: ['namespace', 'name'],
	JSXText: [],
	JSXStyleElement: ['openingElement', 'children', 'closingElement'],
	JSXIfExpression: ['test', 'consequent', 'alternate'],
	JSXForExpression: ['index', 'key', 'loop', 'empty'],
	JSXSwitchExpression: ['discriminant', 'cases'],
	JSXSwitchCase: ['test', 'consequent'],
	JSXTryExpression: ['block', 'handler', 'finalizer', 'pending'],
	JSXCodeBlock: ['body', 'render'],
	StyleSheet: [],
	ForOfStatement: ['left', 'right', 'body'],
};

/**
 * eslint-scope's referencer, plus the `@for` parts: the loop's `index` and
 * `key` belong to the loop's scope, like its variable, and the `@empty` branch
 * runs outside it. TSRX gives every iteration its own index.
 */
class TSRXReferencer extends Referencer {
	#tsrx_for_by_loop = new Map<any, any>();

	JSXForExpression(node: any): void {
		this.#tsrx_for_by_loop.set(node.loop, node);
		this.visit(node.loop);
		if (node.empty) this.visit(node.empty);
	}

	close(node: any): void {
		const tsrx_for = this.#tsrx_for_by_loop.get(node);
		if (tsrx_for?.index) {
			(this.currentScope() as any).__define(
				tsrx_for.index,
				new (Definition as any)('Variable', tsrx_for.index, tsrx_for, tsrx_for, null, null),
			);
		}
		if (tsrx_for?.key) this.visit(tsrx_for.key);
		super.close(node);
	}
}

/**
 * Scope analysis as ESLint runs it, with `TSRXReferencer`. A `.tsrx` file is
 * always a module.
 */
function analyze_scope(ast: any, options: Linter.ParserOptions | undefined): any {
	const ecma_features = options?.ecmaFeatures ?? {};
	const scope_options = {
		ignoreEval: true,
		nodejsScope: ecma_features.globalReturn,
		impliedStrict: ecma_features.impliedStrict,
		ecmaVersion: typeof options?.ecmaVersion === 'number' ? options.ecmaVersion : 6,
		sourceType: 'module',
		childVisitorKeys: visitorKeys,
		// eslint-visitor-keys' `getKeys`, which ESLint passes
		fallback: (node: any) =>
			Object.keys(node).filter(
				(key) =>
					key !== 'parent' &&
					key !== 'leadingComments' &&
					key !== 'trailingComments' &&
					key[0] !== '_',
			),
		jsx: ecma_features.jsx,
	};
	const scope_manager = new ScopeManager(scope_options as any);
	new TSRXReferencer(scope_options as any, scope_manager).visit(ast);
	return scope_manager;
}

const LOOP_FIELDS: Record<string, string[]> = {
	ForStatement: ['init', 'test', 'update', 'body'],
	ForInStatement: ['left', 'right', 'body'],
	ForOfStatement: ['await', 'left', 'right', 'body'],
};

/**
 * Keep this hook for small ESLint-only AST normalizations. Returns the `JSXText`
 * nodes, which each get a token of their own.
 */
function normalize_tsrx_ast_for_eslint(ast: any, code: string): Span[] {
	const texts: Span[] = [];
	const seen = new Set<any>();
	const visit = (node: any) => {
		if (!node || typeof node !== 'object') return;
		if (seen.has(node)) return;
		seen.add(node);

		// `<style apply={...} />` resolutions hold scope bindings whose reference
		// paths point back at AST ancestors. ESLint rules do not use them, and the
		// cycles break consumers that deep-clone or serialize the AST (RuleTester).
		if (node.type === 'JSXStyleElement' && node.metadata?.styleApplies) {
			delete node.metadata.styleApplies;
		}

		// ESLint's code path analysis handles every `SwitchCase` as a case of a
		// `switch` statement and throws on one inside `@switch`. `@case` bodies
		// never fall through, so they need no switch code paths.
		if (node.type === 'JSXSwitchExpression') {
			for (const switch_case of node.cases) switch_case.type = 'JSXSwitchCase';
		}

		// A comment in JSX text is a comment for ESLint, not a `{}` container:
		// drop the placeholder node the parser keeps for it.
		if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
			node.children = node.children.filter(
				(child: any) =>
					child.type !== 'JSXExpressionContainer' ||
					child.expression.type !== 'JSXEmptyExpression' ||
					child.start !== child.expression.start,
			);
		}

		// The loop of a `@for` is a real for statement in `loop`, so rules such as
		// `semi` and `init-declarations` know its head. ESLint's code path analysis
		// allows a for statement no fields of its own, so `index`, `key` and the
		// `@empty` branch stay on `JSXForExpression`.
		if (node.type === 'JSXForExpression') {
			const loop: any = {
				type: node.statementType,
				start: code.indexOf('for', node.start),
				end: node.body.end,
			};
			for (const key of LOOP_FIELDS[node.statementType]) {
				loop[key] = node[key];
				delete node[key];
			}
			node.loop = loop;
		}

		// Like espree, a template element spans its delimiters: `` `a${ ``, `` }b` ``.
		if (node.type === 'TemplateElement') {
			const end_offset = node.tail ? 1 : 2;
			node.start -= 1;
			node.end += end_offset;
			node.range = [node.start, node.end];
			node.loc = {
				start: { line: node.loc.start.line, column: node.loc.start.column - 1 },
				end: { line: node.loc.end.line, column: node.loc.end.column + end_offset },
			};
		}

		if (node.type === 'JSXText' && node.end > node.start) {
			texts.push({ type: 'JSXText', start: node.start, end: node.end });
		}

		for (const key of Object.keys(node)) {
			if (key === 'parent' || key === 'loc' || key === 'range') continue;
			const value = node[key];
			if (Array.isArray(value)) {
				for (const child of value) visit(child);
			} else if (value && typeof value === 'object') {
				visit(value);
			}
		}
	};

	visit(ast);
	return texts.sort((a, b) => a.start - b.start);
}

/**
 * Recursively walks the AST and ensures all nodes have range and loc properties
 * ESLint's scope analyzer requires these properties on ALL nodes
 */
function ensure_node_properties(node: any, code: string): void {
	if (!node || typeof node !== 'object') {
		return;
	}

	// Ensure range property exists
	if (node.start !== undefined && node.end !== undefined && !node.range) {
		node.range = [node.start, node.end];
	}

	// Ensure loc property exists
	if (!node.loc && node.start !== undefined && node.end !== undefined) {
		const lines = code.split('\n');
		let current_pos = 0;
		let start_line = 1;
		let start_column = 0;
		let end_line = 1;
		let end_column = 0;

		for (let i = 0; i < lines.length; i++) {
			const line_length = lines[i].length + 1;
			if (current_pos + line_length > node.start) {
				start_line = i + 1;
				start_column = node.start - current_pos;
				break;
			}
			current_pos += line_length;
		}

		current_pos = 0;
		for (let i = 0; i < lines.length; i++) {
			const line_length = lines[i].length + 1;
			if (current_pos + line_length > node.end) {
				end_line = i + 1;
				end_column = node.end - current_pos;
				break;
			}
			current_pos += line_length;
		}

		node.loc = {
			start: { line: start_line, column: start_column },
			end: { line: end_line, column: end_column },
		};
	}

	for (const key in node) {
		if (key === 'parent' || key === 'loc' || key === 'range') {
			continue; // Skip these to avoid infinite loops
		}

		const value = node[key];
		if (Array.isArray(value)) {
			value.forEach((child) => ensure_node_properties(child, code));
		} else if (value && typeof value === 'object' && value.type) {
			ensure_node_properties(value, code);
		}
	}
}

/** The fields read from an acorn token recorded by the TSRX parser. */
interface LexerToken {
	type: { label: string; keyword?: string };
	value?: any;
	start: number;
	end: number;
}

/** A comment as the TSRX parser collects it. */
interface ParserComment {
	type: 'Line' | 'Block';
	start: number;
	end: number;
}

interface ESLintToken extends AST.Token {
	start: number;
	end: number;
	regex?: { pattern: string; flags: string };
}

interface ESLintComment {
	type: 'Line' | 'Block';
	value: string;
	start: number;
	end: number;
	range: AST.Range;
	loc: AST.SourceLocation;
}

interface Span {
	type: AST.TokenType;
	start: number;
	end: number;
	regex?: ESLintToken['regex'];
}

type Locate = (start: number, end: number) => AST.SourceLocation;

/**
 * Builds `loc` objects from offsets, with the line terminators acorn and ESLint
 * count.
 */
function create_locator(code: string): Locate {
	const line_starts = [0];
	for (const match of code.matchAll(/\r\n?|[\n\u2028\u2029]/g)) {
		line_starts.push(match.index + match[0].length);
	}
	const position = (offset: number) => {
		let low = 0;
		let high = line_starts.length - 1;
		while (low < high) {
			const middle = (low + high + 1) >> 1;
			if (line_starts[middle] <= offset) low = middle;
			else high = middle - 1;
		}
		return { line: low + 1, column: offset - line_starts[low] };
	};
	return (start, end) => ({ start: position(start), end: position(end) });
}

/**
 * Converts the parser's comments to ESLint comments, in source order. The value
 * is read from the source: the parser strips the indentation from the value of
 * a multi-line block comment.
 */
function to_eslint_comments(
	code: string,
	comments: ParserComment[],
	locate: Locate,
): ESLintComment[] {
	const result: ESLintComment[] = [];
	for (const { type, start, end } of [...comments].sort((a, b) => a.start - b.start)) {
		if (result.at(-1)?.start === start) continue;
		const value_end = type === 'Block' && code.startsWith('*/', end - 2) ? end - 2 : end;
		result.push({
			type,
			value: code.slice(start + 2, value_end),
			start,
			end,
			range: [start, end],
			loc: locate(start, end),
		});
	}
	return result;
}

/**
 * Converts the tokens the TSRX lexer reported into the token list ESLint
 * expects: in source order, without overlaps, in espree's token types, and
 * covering every character that is not whitespace or a comment.
 */
function to_eslint_tokens(
	code: string,
	lexer_tokens: LexerToken[],
	texts: Span[],
	comments: ESLintComment[],
	locate: Locate,
): ESLintToken[] {
	// The lexer reports a token again when it re-reads it after looking ahead.
	const lexed: LexerToken[] = [];
	for (const token of [...lexer_tokens].sort((a, b) => a.start - b.start || a.end - b.end)) {
		const last = lexed.at(-1);
		if (last?.start === token.start && last.end === token.end) {
			lexed[lexed.length - 1] = token;
		} else if (!last || token.start >= last.end) {
			lexed.push(token);
		}
	}

	const spans: Span[] = [];
	for (let i = 0; i < lexed.length; i++) {
		const token = lexed[i];
		const label = token.type.label;

		if (label === '`' || (label === '}' && is_template_part(lexed[i + 1]))) {
			// Like espree, one token per template chunk: `` `a${ ``, `` }b${ ``, `` }c` ``.
			let last = i + 1;
			while (is_template_part(lexed[last])) last++;
			const closer = lexed[last]?.type.label;
			if (closer !== '${' && closer !== '`') last--;
			spans.push({ type: 'Template', start: token.start, end: lexed[last].end });
			i = last;
			continue;
		}

		if (code.startsWith('</', token.start) && token.end > token.start + 1) {
			// The lexer skips the body of a raw `<style>` or `<script>` element and
			// reports its closing tag as one token.
			for (const match of code.slice(token.start, token.end).matchAll(/([</>])|[^\s</>]+/g)) {
				const start = token.start + match.index;
				spans.push({
					type: match[1] ? 'Punctuator' : 'JSXIdentifier',
					start,
					end: start + match[0].length,
				});
			}
			continue;
		}

		if (label === 'eof' || token.start === token.end) continue;
		spans.push({
			type: token_type(token, lexed[i - 1], lexed[i - 2]),
			start: token.start,
			end: token.end,
			regex:
				label === 'regexp' ? { pattern: token.value.pattern, flags: token.value.flags } : undefined,
		});
	}

	// Each JSX text node is one token. The lexer reports no token for
	// whitespace-only text, and reads text after a template directive's block
	// as code (`Identifier " hello"`).
	const with_texts = [...outside(spans, texts), ...texts].sort((a, b) => a.start - b.start);
	// Text the lexer read as part of a comment is left to the gap filling below.
	const kept = outside(with_texts, comments);

	const tokens: ESLintToken[] = [];
	const add = (span: Span) => {
		const token: ESLintToken = {
			type: span.type,
			value: code.slice(span.start, span.end),
			start: span.start,
			end: span.end,
			range: [span.start, span.end],
			loc: locate(span.start, span.end),
		};
		if (span.regex) token.regex = span.regex;
		tokens.push(token);
	};

	// The lexer reports no token for the `@` of a template directive or the
	// body of a raw `<style>` or `<script>` element.
	const fill = (start: number, end: number) => {
		const at = end > start && code[end - 1] === '@';
		if (at) end--;
		if (/\S/.test(code.slice(start, end))) add({ type: 'JSXText', start, end });
		if (at) add({ type: 'Punctuator', start: end, end: end + 1 });
	};

	const covered: Array<Span | ESLintComment> = [...kept, ...comments];
	let position = 0;
	for (const item of covered.sort((a, b) => a.start - b.start)) {
		fill(position, item.start);
		if (!('value' in item)) add(item);
		position = item.end;
	}
	fill(position, code.length);

	return tokens;
}

/** The spans that overlap none of the sorted, disjoint `ranges`. */
function outside(spans: Span[], ranges: Array<{ start: number; end: number }>): Span[] {
	let index = 0;
	return spans.filter((span) => {
		while (index < ranges.length && ranges[index].end <= span.start) index++;
		return index === ranges.length || ranges[index].start >= span.end;
	});
}

function is_template_part(token: LexerToken | undefined): boolean {
	return token?.type.label === 'template' || token?.type.label === 'invalidTemplate';
}

/** The espree token type of an acorn token. */
function token_type(
	token: LexerToken,
	previous: LexerToken | undefined,
	before_previous: LexerToken | undefined,
): AST.TokenType {
	const { label, keyword } = token.type;
	switch (label) {
		case 'name':
			return token.value === 'static' || token.value === 'yield' || token.value === 'let'
				? 'Keyword'
				: 'Identifier';
		case 'privateId':
			return 'PrivateIdentifier';
		case 'jsxName':
			return 'JSXIdentifier';
		case 'jsxText':
			return 'JSXText';
		case 'num':
			return 'Numeric';
		case 'regexp':
			return 'RegularExpression';
		case 'string':
			// A JSX attribute value, as in espree.
			return previous?.type.label === '=' && before_previous?.type.label === 'jsxName'
				? 'JSXText'
				: 'String';
	}
	if (keyword === 'true' || keyword === 'false') return 'Boolean';
	if (keyword === 'null') return 'Null';
	return keyword ? 'Keyword' : 'Punctuator';
}

function is_fatal_parser_diagnostic(error: any): boolean {
	return (
		error?.code === DIAGNOSTIC_CODES.UNCLOSED_TAG ||
		error?.code === DIAGNOSTIC_CODES.MISMATCHED_CLOSING_TAG
	);
}

function to_eslint_parse_error(error: any): SyntaxError {
	const parse_error: any = new SyntaxError(error?.message || String(error));
	const loc = error?.loc?.start;
	if (loc) {
		parse_error.lineNumber = loc.line;
		parse_error.column = loc.column + 1;
	}
	if (typeof error?.start === 'number') {
		parse_error.index = error.start;
	}
	return parse_error;
}

/**
 * ESLint parser for TSRX (.tsrx) files
 *
 * This parser uses the shared TSRX parser to parse .tsrx files
 * and returns an ESTree-compatible AST for ESLint to analyze.
 */
export function parseForESLint(code: string, options?: Linter.ParserOptions): ParseResult {
	try {
		const errors: any[] = [];
		const comments: any[] = [];
		// Parse the TSRX source code using the shared TSRX parser. ESLint passes
		// `<input>` for in-memory sources (e.g. RuleTester), so a real filename is
		// only missing when the parser is invoked directly.
		const ast = parse_module(code, options?.filePath || 'ESLintParser.tsrx', {
			collect: true,
			errors,
			comments,
			// Also records every token, as `tsrx_tokens`.
			keywordTokens: true,
		}) as any;
		if (!ast) throw new Error('Parser returned null or undefined AST');
		const lexer_tokens = ast.tsrx_tokens;
		delete ast.tsrx_tokens;
		delete ast.tsrx_keyword_tokens;
		analyze_tsrx(ast, options?.filePath || 'ESLintParser.tsrx', {
			collect: true,
			errors,
			comments,
		});

		const fatal_error = errors.find(is_fatal_parser_diagnostic);
		if (fatal_error) {
			throw to_eslint_parse_error(fatal_error);
		}

		// Normalize for ESLint traversal (avoid duplicate node visits)
		const texts = normalize_tsrx_ast_for_eslint(ast, code);

		// Recursively ensure all nodes have range and loc properties
		ensure_node_properties(ast, code);

		const locate = create_locator(code);
		const eslint_comments = to_eslint_comments(code, comments, locate);

		// Create a properly structured AST object ensuring all required properties exist
		const result: any = {
			type: ast.type || 'Program',
			start: ast.start !== undefined ? ast.start : 0,
			end: ast.end !== undefined ? ast.end : code.length,
			loc: ast.loc || {
				start: { line: 1, column: 0 },
				end: { line: code.split('\n').length, column: 0 },
			},
			range: ast.range || [0, code.length],
			body: ast.body || [],
			sourceType: ast.sourceType || 'module',
			comments: eslint_comments,
			tokens: to_eslint_tokens(code, lexer_tokens, texts, eslint_comments, locate),
		};

		return {
			ast: result,
			services: {
				tsrxDiagnostics: errors,
			},
			scopeManager: analyze_scope(result, options),
			visitorKeys,
		};
	} catch (error: any) {
		if (error instanceof SyntaxError && (error as any).lineNumber != null) {
			throw error;
		}
		// Transform TSRX parse errors to ESLint-compatible format
		throw new SyntaxError(`Failed to parse TSRX file: ${error.message || error}`);
	}
}

/**
 * Legacy parse function for older ESLint versions
 */
export function parse(code: string, options?: Linter.ParserOptions): Program {
	const result = parseForESLint(code, options);
	return result.ast;
}

export default {
	parseForESLint,
	parse,
};
