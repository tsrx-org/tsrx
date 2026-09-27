/**
 * TSRX's own error codes, one per mistake only TSRX reports. The TSRX
 * specification lists each with its message and an example (its appendix,
 * "Error codes"). A mistake TypeScript also reports has TypeScript's code
 * instead (`TS1005`), from {@link MESSAGE_CODES}.
 *
 * - `TSRX1xxx`: markup syntax only TSRX has
 * - `TSRX2xxx`: template rules
 * - `TSRX3xxx`: `<style>` and CSS
 * - `TSRX4xxx`: everything else
 */
export const DIAGNOSTIC_CODES = {
	/** An element has no closing tag before the end of its template. */
	UNCLOSED_TAG: 'TSRX1001',
	/** A closing tag doesn't match the element it closes. */
	MISMATCHED_CLOSING_TAG: 'TSRX1002',
	/** A closing tag with no element open. */
	UNEXPECTED_CLOSING_TAG: 'TSRX1003',
	/** A `</script` in a `<script>` body that isn't its closing tag, where HTML would end the script. */
	SCRIPT_END_TAG_IN_BODY: 'TSRX1004',
	/** A namespaced element name (`<foo:bar>`). */
	NAMESPACED_ELEMENT: 'TSRX1005',
	/** A spread as an attribute's value (`a={...b}`). */
	ATTRIBUTE_VALUE_SPREAD: 'TSRX1006',
	/** A `;` at the end of an expression container (`{a;}`). */
	TEMPLATE_EXPRESSION_TRAILING_SEMICOLON: 'TSRX1007',
	/** A directive without its `{ … }` body. */
	DIRECTIVE_BODY_EXPECTED: 'TSRX1008',
	/** A directive's next branch written without its `@` (`else`, `empty`, `pending`, `catch`). */
	DIRECTIVE_BRANCH_EXPECTED: 'TSRX1009',
	/** An `@try` with neither `@catch` nor `@pending`. */
	TRY_HANDLER_MISSING: 'TSRX1010',
	/** An `@for`'s `index` or `key` clause is incomplete or out of order. */
	FOR_CLAUSE: 'TSRX1011',

	/** A `return` in a template. */
	TEMPLATE_RETURN_STATEMENT: 'TSRX2001',
	/** A `return` in an `@if` body. */
	IF_RETURN_STATEMENT: 'TSRX2002',
	/** A `break` in an `@if` body. */
	IF_BREAK_STATEMENT: 'TSRX2003',
	/** A `continue` in an `@if` body. */
	IF_CONTINUE_STATEMENT: 'TSRX2004',
	/** A `return` in an `@for` body. */
	FOR_RETURN_STATEMENT: 'TSRX2005',
	/** A `break` in an `@for` body. */
	FOR_BREAK_STATEMENT: 'TSRX2006',
	/** A `continue` in an `@for` body. */
	FOR_CONTINUE_STATEMENT: 'TSRX2007',
	/** A `break` in an `@case` body. */
	SWITCH_CASE_BREAK_STATEMENT: 'TSRX2008',
	/** A `return` in an `@case` body. */
	SWITCH_CASE_RETURN_STATEMENT: 'TSRX2009',
	/** Template output nothing renders: not returned, assigned, or part of the output. */
	FORGOTTEN_STATEMENT_CONTAINER: 'TSRX2010',
	/** A `@{ … }` body with more than one output node. */
	CODE_BLOCK_SINGLE_OUTPUT: 'TSRX2011',
	/** A statement after a `@{ … }` body's output. */
	CODE_BLOCK_STATEMENT_AFTER_OUTPUT: 'TSRX2012',
	/** A JSX spread child (`{...items}`), which parses but no target supports. */
	JSX_SPREAD_CHILD: 'TSRX2013',
	/** A dynamic tag expression (`<{expr}>`) other than an identifier, a member access, or a string literal. */
	DYNAMIC_TAG_EXPRESSION: 'TSRX2014',
	/** An `@for` over something other than `for…of`. */
	FOR_OF_ONLY: 'TSRX2015',
	/** An element with more than one `ref` attribute. */
	MULTIPLE_REFS: 'TSRX2016',
	/** An element nested where HTML doesn't allow it (`<p>` in `<p>`). */
	INVALID_HTML_NESTING: 'TSRX2017',
	/** A JavaScript `try…finally` in a template. */
	TEMPLATE_TRY_FINALLY: 'TSRX2018',
	/** A `try` in a template with neither a `pending` nor a `catch` block. */
	TEMPLATE_TRY_HANDLER: 'TSRX2019',
	/** An `@pending` block on a target without it. */
	TARGET_PENDING_UNSUPPORTED: 'TSRX2020',
	/** An `await` where the target can't await (in a callback, or in its components). */
	TARGET_AWAIT_UNSUPPORTED: 'TSRX2021',
	/** A `yield` in a part of the template that runs in a callback. */
	TARGET_YIELD_UNSUPPORTED: 'TSRX2022',
	/** A `super` in a part of the template that's lowered into a generator function. */
	TARGET_SUPER_UNSUPPORTED: 'TSRX2023',
	/** A `for await…of` in a template on a target without it. */
	TARGET_FOR_AWAIT_UNSUPPORTED: 'TSRX2024',
	/** A top-level `await` in a TSRX function without a module-level `"use server"`. */
	TOP_LEVEL_AWAIT_USE_SERVER: 'TSRX2025',
	/** An `@catch` reset parameter on a target whose error boundary has none. */
	TARGET_CATCH_RESET_UNSUPPORTED: 'TSRX2026',

	/** `<style apply>` carries no expression value. */
	STYLE_APPLY_VALUE: 'TSRX3001',
	/** An `apply` entry is not an identifier, member, or array of those, or does not resolve to a style block. */
	STYLE_APPLY_TARGET: 'TSRX3002',
	/** An `apply` target is declared after the applying block in source order. */
	STYLE_APPLY_BEFORE_DECLARATION: 'TSRX3003',
	/** Two `apply` attributes on one `<style>` block. */
	STYLE_APPLY_DUPLICATE: 'TSRX3004',
	/** `apply` on a `<head>` style or a resource (`href`) style. */
	STYLE_APPLY_UNSUPPORTED_HOST: 'TSRX3005',
	/** An assigned style block authors a `.$class` class selector. */
	STYLE_RESERVED_CLASS_KEY: 'TSRX3006',
	/** A standalone `<style>` block at module scope. */
	STYLE_STANDALONE_AT_MODULE_SCOPE: 'TSRX3007',
	/** A standalone `<style>` block with CSS text outside any `@{ … }` or control-flow body. */
	STYLE_STANDALONE_OUTSIDE_TEMPLATE: 'TSRX3008',
	/** A standalone `<style>` block in a statement slot: the lone output of a `@{ … }` or control-flow body, or a statement. */
	STYLE_STANDALONE_NEEDS_FRAGMENT: 'TSRX3009',
	/** A `<style>` attribute other than `ref` and `apply`. */
	STYLE_UNKNOWN_ATTRIBUTE: 'TSRX3010',
	/** `:global` used where the scoping rules do not allow it. */
	CSS_GLOBAL_PLACEMENT: 'TSRX3011',
	/** An `@import` rule in a `<style>` block, whose rules would not be scoped. */
	CSS_IMPORT: 'TSRX3012',
	/** CSS in a `<style>` block that doesn't parse. */
	CSS_SYNTAX: 'TSRX3013',

	/** A recognized `import.meta.env.platform.*` flag is used without a selected platform. */
	PLATFORM_REQUIRED: 'TSRX4001',
	/** A name that starts with the prefix the compiler reserves for its own identifiers. */
	RESERVED_IDENTIFIER_PREFIX: 'TSRX4002',
	/** JavaScript syntax the parser rejects that TypeScript accepts (an escaped `import.meta`). */
	JAVASCRIPT_SYNTAX: 'TSRX4003',
};

const C = DIAGNOSTIC_CODES;

/**
 * The code of each error message, for the errors raised without one: TSRX's
 * own messages, and the mistakes TypeScript also reports, with TypeScript's
 * code. A TypeScript code is TypeScript's for the same mistake: the
 * diagnostic with the same wording, or, for acorn's and acorn-typescript's own
 * wording, the diagnostic TypeScript reports for the same input. A test checks
 * that every error the test suites raise has a code.
 * @type {Array<[string | RegExp, string]>}
 */
const MESSAGE_CODES = [
	// TSRX1xxx
	[/^Unclosed tag '<[^']*>'\. Expected '<\/[^']*>' before end of template\.$/, C.UNCLOSED_TAG],
	[/^Expected closing tag to match opening tag\. /, C.MISMATCHED_CLOSING_TAG],
	['Unexpected closing tag', C.UNEXPECTED_CLOSING_TAG],
	[/^'<\/script' can end a script in HTML, /i, C.SCRIPT_END_TAG_IN_BODY],
	[/^Namespaced elements are not supported in TSRX templates: /, C.NAMESPACED_ELEMENT],
	[/^Attribute values cannot be spread\. /, C.ATTRIBUTE_VALUE_SPREAD],
	[
		'TSRX expression containers do not use semicolons. Remove this semicolon.',
		C.TEMPLATE_EXPRESSION_TRAILING_SEMICOLON,
	],
	['Expected `{` after JSX control-flow directive.', C.DIRECTIVE_BODY_EXPECTED],
	[
		/^Expected `@(?:else|empty|pending|catch)` after `@(?:if|for|try)` block\.$/,
		C.DIRECTIVE_BRANCH_EXPECTED,
	],
	['Missing `@catch` or `@pending` after `@try` block.', C.TRY_HANDLER_MISSING],
	['Expected identifier after "index" keyword', C.FOR_CLAUSE],
	['"index" must come before "key" in for-of loop', C.FOR_CLAUSE],

	// TSRX2xxx
	[/^Return statements are not allowed inside TSRX templates\. /, C.TEMPLATE_RETURN_STATEMENT],
	[/^Return statements are not allowed inside TSRX template @if blocks\./, C.IF_RETURN_STATEMENT],
	[/^Break statements are not allowed inside TSRX template @if blocks\./, C.IF_BREAK_STATEMENT],
	[
		/^Continue statements are not allowed inside TSRX template @if blocks\./,
		C.IF_CONTINUE_STATEMENT,
	],
	[
		/^Return statements are not allowed inside TSRX template for\.\.\.of loops\./,
		C.FOR_RETURN_STATEMENT,
	],
	[
		/^Break statements are not allowed inside TSRX template for\.\.\.of loops\./,
		C.FOR_BREAK_STATEMENT,
	],
	[
		/^Continue statements are not allowed inside TSRX template for\.\.\.of loops\./,
		C.FOR_CONTINUE_STATEMENT,
	],
	['`break` is invalid inside `@switch` cases.', C.SWITCH_CASE_BREAK_STATEMENT],
	['`return` is invalid inside `@switch` cases.', C.SWITCH_CASE_RETURN_STATEMENT],
	[/^This TSRX template output is unused\. /, C.FORGOTTEN_STATEMENT_CONTAINER],
	[/^A code block renders a single node; /, C.CODE_BLOCK_SINGLE_OUTPUT],
	[/^Code must be at the top of '@\{ \}'; /, C.CODE_BLOCK_STATEMENT_AFTER_OUTPUT],
	[/^JSX spread children \(`\{\.\.\.items\}`\) are not supported\. /, C.JSX_SPREAD_CHILD],
	[/^A dynamic tag expression must be /, C.DYNAMIC_TAG_EXPRESSION],
	['TSRX `@for` currently supports `for...of` loops in template output.', C.FOR_OF_ONLY],
	[
		/^(?:For|For\.\.\.in|While|Do\.\.\.while) loops are not supported in TSRX templates\. /,
		C.FOR_OF_ONLY,
	],
	[/^Element has multiple `ref=\{\.\.\.\}` attributes; /, C.MULTIPLE_REFS],
	[/^Invalid HTML nesting: /, C.INVALID_HTML_NESTING],
	[/ TSRX does not support JavaScript `try\/finally` in TSRX templates\. /, C.TEMPLATE_TRY_FINALLY],
	['TSRX try statements must have a `pending` or `catch` block.', C.TEMPLATE_TRY_HANDLER],
	[/ does not support `@pending`/, C.TARGET_PENDING_UNSUPPORTED],
	[/ TSRX does not support `await` here: /, C.TARGET_AWAIT_UNSUPPORTED],
	[/^`await` is not (?:yet supported in|allowed inside) /, C.TARGET_AWAIT_UNSUPPORTED],
	[
		/ does not support (?:async components|top-level `await` in components)\. /,
		C.TARGET_AWAIT_UNSUPPORTED,
	],
	[/ TSRX does not support `yield` here: /, C.TARGET_YIELD_UNSUPPORTED],
	[/ TSRX does not support `super` here: /, C.TARGET_SUPER_UNSUPPORTED],
	[
		/ TSRX does not support `for await\.\.\.of` in TSRX templates\.$/,
		C.TARGET_FOR_AWAIT_UNSUPPORTED,
	],
	[
		/^Top-level `await` in TSRX functions requires a module-level `"use server"` directive\.$/,
		C.TOP_LEVEL_AWAIT_USE_SERVER,
	],
	[/ ErrorBoundary does not provide a reset callback\. /, C.TARGET_CATCH_RESET_UNSUPPORTED],

	// TSRX4xxx
	[/^Platform flag usage requires a configured TSRX platform\. /, C.PLATFORM_REQUIRED],
	[
		/^Cannot declare a variable named "[^"]*" as identifiers starting with "[^"]*" are reserved$/,
		C.RESERVED_IDENTIFIER_PREFIX,
	],

	// TypeScript's codes for the mistakes TypeScript also reports, in core's own
	// wording (most of it TypeScript's)
	[/^'[^']+' expected\.$/, 'TS1005'],
	['Identifier expected.', 'TS1003'],
	// The modifiers of a declaration, as TypeScript's checker words them
	// (`checkGrammarModifiers`)
	[/^'[^']+' modifier already seen\.$/, 'TS1030'],
	[/^'[^']+' modifier must precede '[^']+' modifier\.$/, 'TS1029'],
	[/^'[^']+' modifier cannot be used with '[^']+' modifier\.$/, 'TS1243'],
	[/^'[^']+' modifier cannot be used in an ambient context\.$/, 'TS1040'],
	[/^'[^']+' modifier cannot be used here\.$/, 'TS1042'],
	[/^'[^']+' modifier cannot appear on a module or namespace element\.$/, 'TS1044'],
	[/^'[^']+' modifier cannot appear on a 'using' declaration\.$/, 'TS1491'],
	[/^'[^']+' modifier cannot appear on an 'await using' declaration\.$/, 'TS1495'],
	['Modifiers cannot appear here.', 'TS1184'],
	// acorn's `'import' and 'export' may only appear at the top level`, as
	// TypeScript words it for each kind of import or export.
	['An import declaration can only be used at the top level of a namespace or module.', 'TS1232'],
	['An export declaration can only be used at the top level of a namespace or module.', 'TS1233'],
	['An export assignment must be at the top level of a file or module declaration.', 'TS1231'],
	['A default export must be at the top level of a file or module declaration.', 'TS1258'],
	['A namespace declaration is only allowed at the top level of a namespace or module.', 'TS1235'],
	['Global module exports may only appear at top level.', 'TS1316'],
	['Accessibility modifier already seen.', 'TS1028'],
	["'readonly' modifier can only appear on a property declaration or index signature.", 'TS1024'],
	["'accessor' modifier can only appear on a property declaration.", 'TS1275'],
	["A 'declare' modifier cannot be used in an already ambient context.", 'TS1038'],
	["A 'declare' modifier cannot be used with an import declaration.", 'TS1079'],
	[
		"'await using' statements are only allowed within async functions and at the top levels of modules.",
		'TS2852',
	],
	[
		"'await' expressions are only allowed within async functions and at the top levels of modules.",
		'TS1308',
	],
	[
		"'for await' loops are only allowed within async functions and at the top levels of modules.",
		'TS1103',
	],
	// TypeScript reports a deferred default import (TS18058) or named imports
	// (TS18059); core words both as one message
	['`import defer` only supports a namespace import from a string literal.', 'TS18059'],
	['Declaration expected.', 'TS1146'],
	['Declaration or statement expected.', 'TS1128'],
	['Line break not permitted here.', 'TS1142'],
	['Keywords cannot contain escape characters.', 'TS1260'],
	[/^Escape sequence in keyword /, 'TS1260'],
	['Variable declaration list cannot be empty.', 'TS1123'],
	[/^'(?:const|using|await using)' declarations must be initialized\.$/, 'TS1155'],
	['Comma is not permitted after the rest element', 'TS1013'],
	[
		'A parameter initializer is only allowed in a function or constructor implementation.',
		'TS2371',
	],
	['A parameter property may not be declared using a binding pattern.', 'TS1187'],
	['A parameter property cannot be declared using a rest parameter.', 'TS1317'],
	['A parameter property is only allowed in a constructor implementation.', 'TS2369'],
	['A rest parameter cannot have an initializer.', 'TS1048'],
	['A rest parameter cannot be optional.', 'TS1047'],
	['A binding pattern parameter cannot be optional in an implementation signature.', 'TS2463'],
	["'readonly' type modifier is only permitted on array and tuple literal types.", 'TS1354'],
	["'abstract' modifier can only appear on a class, method, or property declaration.", 'TS1242'],
	[
		"'export' modifier cannot be applied to ambient modules and module augmentations since they are always visible.",
		'TS2668',
	],
	[/^Identifier expected\. '[^']*' is a reserved word that cannot be used here\.$/, 'TS1359'],
	['Identifier or string literal expected.', 'TS1478'],
	['Argument in a type import must be a string literal.', 'TS1141'],
	['Leading decorators must be attached to a class declaration.', 'TS1206'],
	[/^Private field '#[^']*' must be declared in an enclosing class$/, 'TS1111'],
	['Argument name clash', 'TS2300'],
	[/^(?:Identifier|type) '#?[^']+' has already been declared\.?$/, 'TS2300'],
	[/^'[^']+' has already been declared in the current scope$/, 'TS2300'],
	['Await using cannot appear outside of async function', 'TS2852'],
	["The left-hand side of a 'for...in' statement cannot be a 'using' declaration.", 'TS1493'],
	[
		"The left-hand side of a 'for...in' statement cannot be an 'await using' declaration.",
		'TS1494',
	],
	['for-in loop variable declaration may not have an initializer', 'TS1189'],
	['for-of loop variable declaration may not have an initializer', 'TS1190'],
	['Missing catch or finally clause', 'TS1472'],
	['Multiple default clauses', 'TS1113'],
	['value should be either an expression or a quoted text', 'TS1145'],
	['Unterminated JSX contents', 'TS17008'],
];

/**
 * acorn's and acorn-typescript's messages, with TypeScript's code for the same
 * mistake: the diagnostic with the same wording, or the one TypeScript reports
 * for an input that raises the message (checked for each), and `TSRX4003`
 * where TypeScript accepts the code. Core's own entries come first and win.
 * @type {Array<[RegExp, string]>}
 */
const PARSER_MESSAGE_CODES = [
	// acorn: Unexpected token
	[/^Unexpected token$/, 'TS1012'],
	// acorn: Comma is not permitted after the rest element
	[/^Comma is not permitted after the rest element$/, 'TS1013'],
	// acorn: Assigning to rvalue
	[/^Assigning to rvalue$/, 'TS2364'],
	// acorn: Parenthesized pattern
	[/^Parenthesized pattern$/, 'TS1005'],
	// acorn: Shorthand property assignments are valid only in destructuring patterns
	[/^Shorthand property assignments are valid only in destructuring patterns$/, 'TS1312'],
	// acorn: Redefinition of __proto__ property
	[/^Redefinition of __proto__ property$/, 'TS1117'],
	// acorn: Yield expression cannot be a default value
	[/^Yield expression cannot be a default value$/, 'TS2523'],
	// acorn: Await expression cannot be a default value
	[/^Await expression cannot be a default value$/, 'TS2524'],
	// acorn: Export '{0}' is not defined
	[/^Export '[^']+' is not defined$/, 'TS2304'],
	// acorn: Using declaration cannot appear in the top level when source type is `script` or in the ba
	[
		/^Using declaration cannot appear in the top level when source type is `script` or in the bare case statement$/,
		'TSRX4003',
	],
	// acorn: Using declaration is not allowed in single-statement positions
	[/^Using declaration is not allowed in single-statement positions$/, 'TS1156'],
	// acorn: Await using cannot appear outside of async function
	[/^Await using cannot appear outside of async function$/, 'TS2852'],
	// acorn: Unsyntactic break
	[/^Unsyntactic break$/, 'TS1105'],
	// acorn: Unsyntactic continue
	[/^Unsyntactic continue$/, 'TS1104'],
	// acorn: The left-hand side of a for-of loop may not start with 'let'.
	[/^The left-hand side of a for-of loop may not start with 'let'\.$/, 'TS1134'],
	// acorn: Using declaration is not allowed in for-in loops
	[/^Using declaration is not allowed in for-in loops$/, 'TS1493'],
	// acorn: 'return' outside of function
	[/^'return' outside of function$/, 'TS1108'],
	// acorn: Multiple default clauses
	[/^Multiple default clauses$/, 'TS1113'],
	// acorn: Illegal newline after throw
	[/^Illegal newline after throw$/, 'TS1142'],
	// acorn: Missing catch or finally clause
	[/^Missing catch or finally clause$/, 'TS1472'],
	// acorn: 'with' in strict mode
	[/^'with' in strict mode$/, 'TS1101'],
	// acorn: Label '{0}' is already declared
	[/^Label '[^']+' is already declared$/, 'TS1114'],
	// acorn: for-in loop variable declaration may not have an initializer
	[/^for-in loop variable declaration may not have an initializer$/, 'TS1189'],
	// acorn: for-of loop variable declaration may not have an initializer
	[/^for-of loop variable declaration may not have an initializer$/, 'TS1190'],
	// acorn: Missing initializer in {0} declaration
	[/^Missing initializer in (?:const|using|await using) declaration$/, 'TS1155'],
	// acorn: Complex binding patterns require an initialization value
	[/^Complex binding patterns require an initialization value$/, 'TS1182'],
	// acorn: Duplicate constructor in the same class
	[/^Duplicate constructor in the same class$/, 'TS2392'],
	// acorn: Identifier '#{0}' has already been declared
	[/^Identifier '#[^']+' has already been declared$/, 'TS2300'],
	// acorn: Constructor can't have get/set modifier
	[/^Constructor can't have get\/set modifier$/, 'TS1341'],
	// acorn: Classes can't have an element named '#constructor'
	[/^Classes can't have an element named '#constructor'$/, 'TS18012'],
	// acorn: Constructor can't be a generator
	[/^Constructor can't be a generator$/, 'TS1368'],
	// acorn: Constructor can't be an async method
	[/^Constructor can't be an async method$/, 'TS1089'],
	// acorn: Classes may not have a static property named prototype
	[/^Classes may not have a static property named prototype$/, 'TS2699'],
	// acorn: getter should have no params
	[/^getter should have no params$/, 'TS1054'],
	// acorn: setter should have exactly one param
	[/^setter should have exactly one param$/, 'TS1049'],
	// acorn: Setter cannot use rest params
	[/^Setter cannot use rest params$/, 'TS1053'],
	// acorn: Classes can't have a field named 'constructor'
	[/^Classes can't have a field named 'constructor'$/, 'TS18006'],
	// acorn: Classes can't have a static field named 'prototype'
	[/^Classes can't have a static field named 'prototype'$/, 'TS2699'],
	// acorn: Private field '#{0}' must be declared in an enclosing class
	[/^Private field '#[^']+' must be declared in an enclosing class$/, 'TS18016'],
	// acorn: A string literal cannot be used as an exported binding without `from`.
	[/^A string literal cannot be used as an exported binding without `from`\.$/, 'TSRX4003'],
	// acorn: Duplicate export '{0}'
	[/^Duplicate export '[^']+'$/, 'TS2300'],
	// acorn: An export name cannot include a lone surrogate.
	[/^An export name cannot include a lone surrogate\.$/, 'TSRX4003'],
	// acorn: Cannot use 'await' as identifier inside an async function
	[/^Cannot use 'await' as identifier inside an async function$/, 'TS1359'],
	// acorn: Object pattern can't contain getter or setter
	[/^Object pattern can't contain getter or setter$/, 'TS1136'],
	// acorn: Rest elements cannot have a default value
	[/^Rest elements cannot have a default value$/, 'TS1186'],
	// acorn: Only '=' operator can be used for specifying default value.
	[/^Only '=' operator can be used for specifying default value\.$/, 'TS2364'],
	// acorn: Optional chaining cannot appear in left-hand side
	[/^Optional chaining cannot appear in left-hand side$/, 'TS2779'],
	// acorn: Binding {0} in strict mode
	[/^Binding (?:eval|arguments) in strict mode$/, 'TS1100'],
	// acorn: Assigning to {0} in strict mode
	[/^Assigning to (?:eval|arguments) in strict mode$/, 'TS1100'],
	// acorn: let is disallowed as a lexically bound name
	[/^let is disallowed as a lexically bound name$/, 'TS2480'],
	// acorn: Argument name clash
	[/^Argument name clash$/, 'TS2300'],
	// acorn: Binding member expression
	[/^Binding member expression$/, 'TS1005'],
	// acorn: Binding rvalue
	[/^Binding rvalue$/, 'TS2364'],
	// acorn: Redefinition of property
	[/^Redefinition of property$/, 'TS1117'],
	// acorn: Logical expressions and coalesce expressions cannot be mixed. Wrap either by parentheses
	[
		/^Logical expressions and coalesce expressions cannot be mixed\. Wrap either by parentheses$/,
		'TS5076',
	],
	// acorn: Private identifier can only be left side of binary expression
	[/^Private identifier can only be left side of binary expression$/, 'TS1451'],
	// acorn: Deleting local variable in strict mode
	[/^Deleting local variable in strict mode$/, 'TS1102'],
	// acorn: Private fields can not be deleted
	[/^Private fields can not be deleted$/, 'TS18011'],
	// acorn: Optional chaining cannot appear in the callee of new expressions
	[/^Optional chaining cannot appear in the callee of new expressions$/, 'TS1209'],
	// acorn: Optional chaining cannot appear in the tag of tagged template expressions
	[/^Optional chaining cannot appear in the tag of tagged template expressions$/, 'TS1358'],
	// acorn: 'super' keyword outside a method
	[/^'super' keyword outside a method$/, 'TS2660'],
	// acorn: super() call outside constructor of a subclass
	[/^super\(\) call outside constructor of a subclass$/, 'TS2337'],
	// acorn: Escape sequence in keyword {0}
	[/^Escape sequence in keyword \w+$/, 'TS1260'],
	// acorn: The only valid meta property for import is 'import.meta'
	[/^The only valid meta property for import is 'import\.meta'$/, 'TS17012'],
	// acorn: 'import.meta' must not contain escaped characters
	[/^'import\.meta' must not contain escaped characters$/, 'TSRX4003'],
	// acorn: The only valid meta property for new is 'new.target'
	[/^The only valid meta property for new is 'new\.target'$/, 'TS17012'],
	// acorn: 'new.target' must not contain escaped characters
	[/^'new\.target' must not contain escaped characters$/, 'TSRX4003'],
	// acorn: 'new.target' can only be used in functions and class static block
	[/^'new\.target' can only be used in functions and class static block$/, 'TS17013'],
	// acorn: Bad escape sequence in untagged template literal
	[/^Bad escape sequence in untagged template literal$/, 'TS1125'],
	// acorn: Unterminated template literal
	[/^Unterminated template literal$/, 'TS1160'],
	// acorn: Illegal 'use strict' directive in function with non-simple parameter list
	[/^Illegal 'use strict' directive in function with non-simple parameter list$/, 'TS1347'],
	// acorn: Cannot use 'yield' as identifier inside a generator
	[/^Cannot use 'yield' as identifier inside a generator$/, 'TS1212'],
	// acorn: Cannot use 'arguments' in class field initializer
	[/^Cannot use 'arguments' in class field initializer$/, 'TS2815'],
	// acorn: Cannot use arguments in class static initialization block
	[/^Cannot use arguments in class static initialization block$/, 'TS2815'],
	// acorn: Cannot use await in class static initialization block
	[/^Cannot use await in class static initialization block$/, 'TS18037'],
	// acorn: Unexpected keyword '{0}'
	[/^Unexpected keyword '[^']+'$/, 'TS1359'],
	// acorn: Cannot use keyword 'await' outside an async function
	[/^Cannot use keyword 'await' outside an async function$/, 'TS1262'],
	// acorn: The keyword '{0}' is reserved
	[/^The keyword '[^']+' is reserved$/, 'TS1212'],
	// acorn: Identifier '{0}' has already been declared
	[/^Identifier '[^'#][^']*' has already been declared$/, 'TS2451'],
	// acorn: Invalid regular expression flag
	[/^Invalid regular expression flag$/, 'TS1499'],
	// acorn: Duplicate regular expression flag
	[/^Duplicate regular expression flag$/, 'TS1500'],
	// acorn: Unterminated comment
	[/^Unterminated comment$/, 'TS1010'],
	// acorn: Unexpected character '{0}'
	[/^Unexpected character '.+'$/, 'TS1127'],
	// acorn: Unterminated regular expression
	[/^Unterminated regular expression$/, 'TS1161'],
	// acorn: Numeric separator is not allowed in legacy octal numeric literals
	[/^Numeric separator is not allowed in legacy octal numeric literals$/, 'TS6188'],
	// acorn: Numeric separator must be exactly one underscore
	[/^Numeric separator must be exactly one underscore$/, 'TS6189'],
	// acorn: Numeric separator is not allowed at the first of digits
	[/^Numeric separator is not allowed at the first of digits$/, 'TS6188'],
	// acorn: Numeric separator is not allowed at the last of digits
	[/^Numeric separator is not allowed at the last of digits$/, 'TS6188'],
	// acorn: Expected number in radix 16
	[/^Expected number in radix 16$/, 'TS1125'],
	// acorn: Expected number in radix 2
	[/^Expected number in radix 2$/, 'TS1177'],
	// acorn: Expected number in radix 8
	[/^Expected number in radix 8$/, 'TS1178'],
	// acorn: Identifier directly after number
	[/^Identifier directly after number$/, 'TS1351'],
	// acorn: Invalid number
	[/^Invalid number$/, 'TS1124'],
	// acorn: Unterminated string constant
	[/^Unterminated string constant$/, 'TS1002'],
	// acorn: Unterminated template
	[/^Unterminated template$/, 'TS1160'],
	// acorn: Code point out of bounds
	[/^Code point out of bounds$/, 'TS1198'],
	// acorn: Invalid escape sequence
	[/^Invalid escape sequence$/, 'TS1488'],
	// acorn: Invalid escape sequence in template string
	[/^Invalid escape sequence in template string$/, 'TS1488'],
	// acorn: Octal literal in template string
	[/^Octal literal in template string$/, 'TS1487'],
	// acorn: Octal literal in strict mode
	[/^Octal literal in strict mode$/, 'TS1487'],
	// acorn: Bad character escape sequence
	[/^Bad character escape sequence$/, 'TS1125'],
	// acorn: Expecting Unicode escape sequence \uXXXX
	[/^Expecting Unicode escape sequence \\uXXXX$/, 'TS1127'],
	// acorn: Invalid Unicode escape
	[/^Invalid Unicode escape$/, 'TS1127'],
	// acorn: Invalid regular expression: /{0}/: Unmatched ')'
	[/^Invalid regular expression: \/.*\/: Unmatched '\)'$/, 'TS1508'],
	// acorn: Invalid regular expression: /{0}/: Lone quantifier brackets
	[/^Invalid regular expression: \/.*\/: Lone quantifier brackets$/, 'TS1508'],
	// acorn: Invalid regular expression: /{0}/: Invalid escape
	[/^Invalid regular expression: \/.*\/: Invalid escape$/, 'TS1535'],
	// acorn: Invalid regular expression: /{0}/: Invalid named capture referenced
	[/^Invalid regular expression: \/.*\/: Invalid named capture referenced$/, 'TS1532'],
	// acorn: Invalid regular expression: /{0}/: Nothing to repeat
	[/^Invalid regular expression: \/.*\/: Nothing to repeat$/, 'TS1507'],
	// acorn: Invalid regular expression: /{0}/: Invalid quantifier
	[/^Invalid regular expression: \/.*\/: Invalid quantifier$/, 'TS1507'],
	// acorn: Invalid regular expression: /{0}/: Unterminated group
	[/^Invalid regular expression: \/.*\/: Unterminated group$/, 'TS1005'],
	// acorn: Invalid regular expression: /{0}/: numbers out of order in {} quantifier
	[/^Invalid regular expression: \/.*\/: numbers out of order in \{\} quantifier$/, 'TS1506'],
	// acorn: Invalid regular expression: /{0}/: Incomplete quantifier
	[/^Invalid regular expression: \/.*\/: Incomplete quantifier$/, 'TS1005'],
	// acorn: Invalid regular expression: /{0}/: Duplicate regular expression modifiers
	[/^Invalid regular expression: \/.*\/: Duplicate regular expression modifiers$/, 'TS1500'],
	// acorn: Invalid regular expression: /{0}/: Invalid regular expression modifiers
	[/^Invalid regular expression: \/.*\/: Invalid regular expression modifiers$/, 'TS1504'],
	// acorn: Invalid regular expression: /{0}/: Invalid group
	[/^Invalid regular expression: \/.*\/: Invalid group$/, 'TS1005'],
	// acorn: Invalid regular expression: /{0}/: Duplicate capture group name
	[/^Invalid regular expression: \/.*\/: Duplicate capture group name$/, 'TS1515'],
	// acorn: Invalid regular expression: /{0}/: Invalid capture group name
	[/^Invalid regular expression: \/.*\/: Invalid capture group name$/, 'TS1514'],
	// acorn: Invalid regular expression: /{0}/: Invalid unicode escape
	[/^Invalid regular expression: \/.*\/: Invalid unicode escape$/, 'TS1198'],
	// acorn: Invalid regular expression: /{0}/: Invalid named reference
	[/^Invalid regular expression: \/.*\/: Invalid named reference$/, 'TS1510'],
	// acorn: Invalid regular expression: /{0}/: Invalid property name
	[/^Invalid regular expression: \/.*\/: Invalid property name$/, 'TS1529'],
	// acorn: Invalid regular expression: /{0}/: Invalid property value
	[/^Invalid regular expression: \/.*\/: Invalid property value$/, 'TS1526'],
	// acorn: Invalid regular expression: /{0}/: Unterminated character class
	[/^Invalid regular expression: \/.*\/: Unterminated character class$/, 'TS1005'],
	// acorn: Invalid regular expression: /{0}/: Negated character class may contain strings
	[/^Invalid regular expression: \/.*\/: Negated character class may contain strings$/, 'TS1518'],
	// acorn: Invalid regular expression: /{0}/: Invalid character class
	[/^Invalid regular expression: \/.*\/: Invalid character class$/, 'TS1516'],
	// acorn: Invalid regular expression: /{0}/: Range out of order in character class
	[/^Invalid regular expression: \/.*\/: Range out of order in character class$/, 'TS1517'],
	// acorn: Invalid regular expression: /{0}/: Invalid class escape
	[/^Invalid regular expression: \/.*\/: Invalid class escape$/, 'TS1512'],
	// acorn: Invalid regular expression: /{0}/: Invalid character in character class
	[/^Invalid regular expression: \/.*\/: Invalid character in character class$/, 'TS1508'],
	// acorn-typescript: Unterminated JSX contents
	[/^Unterminated JSX contents$/, 'TS17008'],
	// acorn-typescript: Unexpected token `{0}`. Did you mean `{1}` or `{"{0}"}`?
	[/^Unexpected token `>`\. Did you mean `&gt;` or `\{">"\}`\?$/, 'TS1382'],
	[/^Unexpected token `\}`\. Did you mean `&rbrace;` or `\{"\}"\}`\?$/, 'TS1381'],
	// acorn-typescript: JSX attributes must only be assigned a non-empty expression
	[/^JSX attributes must only be assigned a non-empty expression$/, 'TS17000'],
	// acorn-typescript: JSX value should be either an expression or a quoted JSX text
	[/^JSX value should be either an expression or a quoted JSX text$/, 'TS1145'],
	// acorn-typescript: Expected corresponding JSX closing tag for <{0}>
	[/^Expected corresponding JSX closing tag for <[^>]*>$/, 'TS17002'],
	// acorn-typescript: Adjacent JSX elements must be wrapped in an enclosing tag
	[/^Adjacent JSX elements must be wrapped in an enclosing tag$/, 'TS2657'],
	// acorn-typescript: Duplicated key in attributes
	[/^Duplicated key in attributes$/, 'TSRX4003'],
	// acorn-typescript: Only string is supported as an attribute value
	[/^Only string is supported as an attribute value$/, 'TS2858'],
	// acorn-typescript: A 'get' accesor must not have any formal parameters.
	[/^A 'get' accesor must not have any formal parameters\.$/, 'TS1054'],
	// acorn-typescript: Cannot use new with import()
	[/^Cannot use new with import\(\)$/, 'TS1109'],
	// acorn-typescript: Tagged Template Literals are not allowed in optionalChain.
	[/^Tagged Template Literals are not allowed in optionalChain\.$/, 'TS1358'],
	// acorn-typescript: Identifier '{0}' has already been declared.
	[/^Identifier '[^']+' has already been declared\.$/, 'TS2300'],
	// acorn-typescript: type '{0}' has already been declared.
	[/^type '[^']+' has already been declared\.$/, 'TS2300'],
	// acorn-typescript: Method '{0}' cannot have an implementation because it is marked abstract.
	[/^Method '.+' cannot have an implementation because it is marked abstract\.$/, 'TS1245'],
	// acorn-typescript: Property '{0}' cannot have an initializer because it is marked abstract.
	[/^Property '.+' cannot have an initializer because it is marked abstract\.$/, 'TS1267'],
	// acorn-typescript: 'get' and 'set' accessors cannot declare 'this' parameters.
	[/^'get' and 'set' accessors cannot declare 'this' parameters\.$/, 'TS2784'],
	// acorn-typescript: An accessor cannot have type parameters.
	[/^An accessor cannot have type parameters\.$/, 'TS1094'],
	// acorn-typescript: Cannot find name '{0}'.
	[/^Cannot find name '[^']+'\.$/, 'TS2304'],
	// acorn-typescript: Class methods cannot have the 'declare' modifier.
	[/^Class methods cannot have the 'declare' modifier\.$/, 'TS1031'],
	// acorn-typescript: Class methods cannot have the 'readonly' modifier.
	[/^Class methods cannot have the 'readonly' modifier\.$/, 'TS1024'],
	// acorn-typescript: A 'const' initializer in an ambient context must be a string or numeric literal or literal
	[
		/^A 'const' initializer in an ambient context must be a string or numeric literal or literal enum reference\.$/,
		'TS1254',
	],
	// acorn-typescript: Type parameters cannot appear on a constructor declaration.
	[/^Type parameters cannot appear on a constructor declaration\.$/, 'TS1092'],
	// acorn-typescript: 'declare' is not allowed in {0}ters.
	[/^'declare' is not allowed in (?:get|set)ters\.$/, 'TS1031'],
	// acorn-typescript: Initializers are not allowed in ambient contexts.
	[/^Initializers are not allowed in ambient contexts\.$/, 'TS1039'],
	// acorn-typescript: An implementation cannot be declared in ambient contexts.
	[/^An implementation cannot be declared in ambient contexts\.$/, 'TS1183'],
	// acorn-typescript: Accessibility modifier already seen.
	[/^Accessibility modifier already seen\.$/, 'TS1028'],
	// acorn-typescript: Duplicate modifier: '{0}'.
	[/^Duplicate modifier: '\w+'\.$/, 'TS1030'],
	// acorn-typescript: '{0}' list cannot be empty.
	[/^'(?:extends|implements)' list cannot be empty\.$/, 'TS1097'],
	// acorn-typescript: Type argument list cannot be empty.
	[/^Type argument list cannot be empty\.$/, 'TS1099'],
	// acorn-typescript: Type parameter list cannot be empty.
	[/^Type parameter list cannot be empty\.$/, 'TS1098'],
	// acorn-typescript: 'export declare' must be followed by an ambient declaration.
	[/^'export declare' must be followed by an ambient declaration\.$/, 'TS1128'],
	// acorn-typescript: An import alias can not use 'import type'.
	[/^An import alias can not use 'import type'\.$/, 'TS1392'],
	// acorn-typescript: '{0}' modifier cannot be used with '{1}' modifier.
	[/^'\w+' modifier cannot be used with '\w+' modifier\.$/, 'TS1243'],
	// acorn-typescript: Index signatures cannot have the 'abstract' modifier.
	[/^Index signatures cannot have the 'abstract' modifier\.$/, 'TS1071'],
	// acorn-typescript: Index signatures cannot have an accessibility modifier ('{0}').
	[/^Index signatures cannot have an accessibility modifier \('\w+'\)\.$/, 'TS1071'],
	// acorn-typescript: Index signatures cannot have the 'declare' modifier.
	[/^Index signatures cannot have the 'declare' modifier\.$/, 'TS1071'],
	// acorn-typescript: 'override' modifier cannot appear on an index signature.
	[/^'override' modifier cannot appear on an index signature\.$/, 'TS1071'],
	// acorn-typescript: '{0}' modifier cannot appear on a type member.
	[/^'\w+' modifier cannot appear on a type member\.$/, 'TS1070'],
	// acorn-typescript: '{0}' modifier cannot appear on a type parameter.
	[/^'\w+' modifier cannot appear on a type parameter\.$/, 'TS1273'],
	// acorn-typescript: '{0}' modifier can only appear on a type parameter of a class, interface or type alias.
	[
		/^'\w+' modifier can only appear on a type parameter of a class, interface or type alias\.$/,
		'TS1274',
	],
	// acorn-typescript: '{0}' modifier must precede '{1}' modifier.
	[/^'\w+' modifier must precede '\w+' modifier\.$/, 'TS1029'],
	// acorn-typescript: Invalid property access after an instantiation expression. You can either wrap the instant
	[
		/^Invalid property access after an instantiation expression\. You can either wrap the instantiation expression in parentheses, or delete the type arguments\.$/,
		'TS1477',
	],
	// acorn-typescript: Tuple members must be labeled with a simple identifier.
	[/^Tuple members must be labeled with a simple identifier\.$/, 'TS1005'],
	// acorn-typescript: 'interface' declarations must be followed by an identifier.
	[/^'interface' declarations must be followed by an identifier\.$/, 'TS1438'],
	// acorn-typescript: Abstract methods can only appear within an abstract class.
	[/^Abstract methods can only appear within an abstract class\.$/, 'TS1244'],
	// acorn-typescript: 'abstract' modifier can only appear on a class, method, or property declaration.
	[/^'abstract' modifier can only appear on a class, method, or property declaration\.$/, 'TS1242'],
	// acorn-typescript: A required element cannot follow an optional element.
	[/^A required element cannot follow an optional element\.$/, 'TS1257'],
	// acorn-typescript: This member cannot have an 'override' modifier because its containing class does not exten
	[
		/^This member cannot have an 'override' modifier because its containing class does not extend another class\.$/,
		'TS4112',
	],
	// acorn-typescript: A binding pattern parameter cannot be optional in an implementation signature.
	[/^A binding pattern parameter cannot be optional in an implementation signature\.$/, 'TS2463'],
	// acorn-typescript: Private elements cannot have the 'abstract' modifier.
	[/^Private elements cannot have the 'abstract' modifier\.$/, 'TS18019'],
	// acorn-typescript: Private elements cannot have an accessibility modifier ('{0}').
	[/^Private elements cannot have an accessibility modifier \('\w+'\)\.$/, 'TS18010'],
	// acorn-typescript: Private methods cannot have an accessibility modifier ('{0}').
	[/^Private methods cannot have an accessibility modifier \('\w+'\)\.$/, 'TS18010'],
	// acorn-typescript: 'readonly' modifier can only appear on a property declaration or index signature.
	[
		/^'readonly' modifier can only appear on a property declaration or index signature\.$/,
		'TS1024',
	],
	// acorn-typescript: This syntax is reserved in files with the .mts or .cts extension. Add a trailing comma, as
	[
		/^This syntax is reserved in files with the \.mts or \.cts extension\. Add a trailing comma, as in `<T,>\(\) => \.\.\.`\.$/,
		'TS7060',
	],
	// acorn-typescript: This syntax is reserved in files with the .mts or .cts extension. Use an `as` expression i
	[
		/^This syntax is reserved in files with the \.mts or \.cts extension\. Use an `as` expression instead\.$/,
		'TS7059',
	],
	// acorn-typescript: A 'set' accessor cannot have an optional parameter.
	[/^A 'set' accessor cannot have an optional parameter\.$/, 'TS1051'],
	// acorn-typescript: A 'set' accessor cannot have rest parameter.
	[/^A 'set' accessor cannot have rest parameter\.$/, 'TS1053'],
	// acorn-typescript: A 'set' accessor cannot have a return type annotation.
	[/^A 'set' accessor cannot have a return type annotation\.$/, 'TS1095'],
	// acorn-typescript: Static class blocks cannot have any modifier.
	[/^Static class blocks cannot have any modifier\.$/, 'TS1184'],
	// acorn-typescript: Type annotations must come before default assignments, e.g. instead of `age = 25: number`
	[
		/^Type annotations must come before default assignments, e\.g\. instead of `age = 25: number` use `age: number = 25`\.$/,
		'TS1005',
	],
	// acorn-typescript: A type-only import can specify a default import or named bindings, but not both.
	[/^A type-only import can specify a default import or named bindings, but not both\.$/, 'TS1363'],
	// acorn-typescript: The 'type' modifier cannot be used on a named export when 'export type' is used on its exp
	[
		/^The 'type' modifier cannot be used on a named export when 'export type' is used on its export statement\.$/,
		'TS2207',
	],
	// acorn-typescript: The 'type' modifier cannot be used on a named import when 'import type' is used on its imp
	[
		/^The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement\.$/,
		'TS2206',
	],
	// acorn-typescript: A parameter property is only allowed in a constructor implementation.
	[/^A parameter property is only allowed in a constructor implementation\.$/, 'TS2369'],
	// acorn-typescript: 'readonly' type modifier is only permitted on array and tuple literal types.
	[/^'readonly' type modifier is only permitted on array and tuple literal types\.$/, 'TS1354'],
	// acorn-typescript: Trailing comma is not allowed at the end of generics.
	[/^Trailing comma is not allowed at the end of generics\.$/, 'TS1009'],
	// acorn-typescript: Did not expect a type annotation here.
	[/^Did not expect a type annotation here\.$/, 'TS1005'],
	// acorn-typescript: Unexpected type cast in parameter position.
	[/^Unexpected type cast in parameter position\.$/, 'TS1005'],
	// acorn-typescript: Argument in a type import must be a string literal.
	[/^Argument in a type import must be a string literal\.$/, 'TS1141'],
	// acorn-typescript: A parameter property may not be declared using a binding pattern.
	[/^A parameter property may not be declared using a binding pattern\.$/, 'TS1187'],
	// acorn-typescript: Name in a signature must be an Identifier, ObjectPattern or ArrayPattern, instead got {0}.
	[
		/^Name in a signature must be an Identifier, ObjectPattern or ArrayPattern, instead got \w+\.$/,
		'TS2371',
	],
	// acorn-typescript: 'let' is not allowed to be used as a name in 'let' or 'const' declarations.
	[/^'let' is not allowed to be used as a name in 'let' or 'const' declarations\.$/, 'TS2480'],
	// acorn-typescript: Leading decorators must be attached to a class declaration.
	[/^Leading decorators must be attached to a class declaration\.$/, 'TS1206'],
	// acorn-typescript: Decorators can't be used with a constructor. Did you mean '@dec class { ... }'?
	[
		/^Decorators can't be used with a constructor\. Did you mean '@dec class \{ \.\.\. \}'\?$/,
		'TS1206',
	],
	// acorn-typescript: Decorators must be attached to a class element.
	[/^Decorators must be attached to a class element\.$/, 'TS1146'],
	// acorn-typescript: Decorators can't be used with SpreadElement
	[/^Decorators can't be used with SpreadElement$/, 'TS1206'],
];

/**
 * The code of an error message: TSRX's own code, or TypeScript's for a
 * mistake TypeScript also reports (see {@link MESSAGE_CODES} and
 * {@link PARSER_MESSAGE_CODES}).
 * @param {string} message
 * @returns {string | undefined}
 */
export function get_error_code(message) {
	for (const [pattern, code] of MESSAGE_CODES) {
		if (typeof pattern === 'string' ? pattern === message : pattern.test(message)) {
			return code;
		}
	}
	for (const [pattern, code] of PARSER_MESSAGE_CODES) {
		if (pattern.test(message)) return code;
	}
	return undefined;
}
