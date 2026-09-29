/**
 * TSRX's own error codes, one per mistake only TSRX reports. The TSRX
 * specification lists each with its message and an example (its appendix,
 * "Error codes"). A mistake TypeScript also reports has TypeScript's code
 * instead (`TS1005`), from {@link TS_ERRORS}.
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

/**
 * An error TSRX reports: its code, TSRX's own or TypeScript's for a mistake
 * TypeScript also reports, and its message.
 * @typedef {{ code: string, message: string }} Diagnostic
 */

/**
 * An error whose message takes values, such as a name from the source. Called
 * with them, it gives the {@link Diagnostic}; its `code` is the code of every
 * message it gives.
 * @typedef {((...values: string[]) => Diagnostic) & { code: string }} DiagnosticWithValues
 */

/**
 * @param {string} code
 * @param {(...values: string[]) => string} message
 * @returns {DiagnosticWithValues}
 */
function with_values(code, message) {
	return Object.assign(
		(/** @type {string[]} */ ...values) => ({ code, message: message(...values) }),
		{
			code,
		},
	);
}

const C = DIAGNOSTIC_CODES;

/**
 * The errors only TSRX reports, each with its code from
 * {@link DIAGNOSTIC_CODES}. A code can have several messages, one for each form
 * of the mistake.
 */
export const TSRX_ERRORS = {
	// TSRX1xxx
	UNCLOSED_TAG: with_values(
		C.UNCLOSED_TAG,
		(tag) => `Unclosed tag '<${tag}>'. Expected '</${tag}>' before end of template.`,
	),
	MISMATCHED_CLOSING_TAG: with_values(
		C.MISMATCHED_CLOSING_TAG,
		(opening, closing) =>
			`Expected closing tag to match opening tag. Expected '</${opening}>' but found '</${closing}>'`,
	),
	UNEXPECTED_CLOSING_TAG: { code: C.UNEXPECTED_CLOSING_TAG, message: 'Unexpected closing tag' },
	/** `written` is the `</script` as written, in any case. */
	SCRIPT_END_TAG_IN_BODY: with_values(
		C.SCRIPT_END_TAG_IN_BODY,
		(written) =>
			`'${written}' can end a script in HTML, so a '<script>' body can't contain it. Write '<\\/${written.slice(2)}' instead.`,
	),
	NAMESPACED_ELEMENT: with_values(
		C.NAMESPACED_ELEMENT,
		(tag) => `Namespaced elements are not supported in TSRX templates: <${tag}>.`,
	),
	ATTRIBUTE_VALUE_SPREAD: {
		code: C.ATTRIBUTE_VALUE_SPREAD,
		message: 'Attribute values cannot be spread. Use a spread attribute (`{...props}`) instead.',
	},
	TEMPLATE_EXPRESSION_TRAILING_SEMICOLON: {
		code: C.TEMPLATE_EXPRESSION_TRAILING_SEMICOLON,
		message: 'TSRX expression containers do not use semicolons. Remove this semicolon.',
	},
	DIRECTIVE_BODY_EXPECTED: {
		code: C.DIRECTIVE_BODY_EXPECTED,
		message: 'Expected `{` after JSX control-flow directive.',
	},
	/** `branch` is the branch written without its `@`, and `directive` the directive it belongs to. */
	DIRECTIVE_BRANCH_EXPECTED: with_values(
		C.DIRECTIVE_BRANCH_EXPECTED,
		(branch, directive) => `Expected \`@${branch}\` after \`@${directive}\` block.`,
	),
	TRY_HANDLER_MISSING: {
		code: C.TRY_HANDLER_MISSING,
		message: 'Missing `@catch` or `@pending` after `@try` block.',
	},
	FOR_INDEX_NAME_EXPECTED: {
		code: C.FOR_CLAUSE,
		message: 'Expected identifier after "index" keyword',
	},
	FOR_INDEX_AFTER_KEY: {
		code: C.FOR_CLAUSE,
		message: '"index" must come before "key" in for-of loop',
	},

	// TSRX2xxx
	TEMPLATE_RETURN_STATEMENT: {
		code: C.TEMPLATE_RETURN_STATEMENT,
		message:
			'Return statements are not allowed inside TSRX templates. Move the return before the TSRX return value, or use conditional rendering instead.',
	},
	IF_RETURN_STATEMENT: {
		code: C.IF_RETURN_STATEMENT,
		message:
			'Return statements are not allowed inside TSRX template @if blocks. Move the return before the template output or render conditionally instead.',
	},
	IF_BREAK_STATEMENT: {
		code: C.IF_BREAK_STATEMENT,
		message: 'Break statements are not allowed inside TSRX template @if blocks.',
	},
	IF_CONTINUE_STATEMENT: {
		code: C.IF_CONTINUE_STATEMENT,
		message:
			'Continue statements are not allowed inside TSRX template @if blocks. Filter before rendering or use conditional output instead.',
	},
	FOR_RETURN_STATEMENT: {
		code: C.FOR_RETURN_STATEMENT,
		message:
			'Return statements are not allowed inside TSRX template for...of loops. Filter the iterable before rendering or use an @empty fallback for empty lists.',
	},
	FOR_BREAK_STATEMENT: {
		code: C.FOR_BREAK_STATEMENT,
		message: 'Break statements are not allowed inside TSRX template for...of loops.',
	},
	FOR_CONTINUE_STATEMENT: {
		code: C.FOR_CONTINUE_STATEMENT,
		message:
			'Continue statements are not allowed inside TSRX template for...of loops. Filter the iterable before rendering.',
	},
	SWITCH_CASE_BREAK_STATEMENT: {
		code: C.SWITCH_CASE_BREAK_STATEMENT,
		message: '`break` is invalid inside `@switch` cases.',
	},
	SWITCH_CASE_RETURN_STATEMENT: {
		code: C.SWITCH_CASE_RETURN_STATEMENT,
		message: '`return` is invalid inside `@switch` cases.',
	},
	FORGOTTEN_STATEMENT_CONTAINER: {
		code: C.FORGOTTEN_STATEMENT_CONTAINER,
		message:
			"This TSRX template output is unused. Return it, assign it to a value that is rendered, or make it part of the rendered output of a function '@{...}' body.",
	},
	CODE_BLOCK_SINGLE_OUTPUT: {
		code: C.CODE_BLOCK_SINGLE_OUTPUT,
		message:
			"A code block renders a single node; wrap multiple nodes or text in a fragment '<>…</>'.",
	},
	CODE_BLOCK_STATEMENT_AFTER_OUTPUT: {
		code: C.CODE_BLOCK_STATEMENT_AFTER_OUTPUT,
		message: "Code must be at the top of '@{ }'; statements cannot follow the rendered output.",
	},
	JSX_SPREAD_CHILD: {
		code: C.JSX_SPREAD_CHILD,
		message:
			'JSX spread children (`{...items}`) are not supported. Render the array as an expression child instead: `{items}`.',
	},
	DYNAMIC_TAG_EXPRESSION: {
		code: C.DYNAMIC_TAG_EXPRESSION,
		message:
			'A dynamic tag expression must be an identifier, a member access such as `props.as` or `registry[name]`, or a string literal. Compute anything else before the element: `const Tag = c ? Child : Fallback;`, then `<{Tag} />`.',
	},
	FOR_OF_ONLY: {
		code: C.FOR_OF_ONLY,
		message: 'TSRX `@for` currently supports `for...of` loops in template output.',
	},
	FOR_STATEMENT: {
		code: C.FOR_OF_ONLY,
		message: 'For loops are not supported in TSRX templates. Use for...of instead.',
	},
	FOR_IN_STATEMENT: {
		code: C.FOR_OF_ONLY,
		message: 'For...in loops are not supported in TSRX templates. Use for...of instead.',
	},
	WHILE_STATEMENT: {
		code: C.FOR_OF_ONLY,
		message:
			'While loops are not supported in TSRX templates. Move the while loop into a function.',
	},
	DO_WHILE_STATEMENT: {
		code: C.FOR_OF_ONLY,
		message:
			'Do...while loops are not supported in TSRX templates. Move the do...while loop into a function.',
	},
	MULTIPLE_REFS: {
		code: C.MULTIPLE_REFS,
		message:
			'Element has multiple `ref={...}` attributes; an element may have at most one. Use a single array-valued ref such as `ref={[a, b]}` where the target framework supports multiple refs.',
	},
	INVALID_HTML_NESTING: with_values(
		C.INVALID_HTML_NESTING,
		(tag, parent) => `Invalid HTML nesting: <${tag}> cannot be a descendant of <${parent}>.`,
	),
	/** `target` is the target's name. */
	TEMPLATE_TRY_FINALLY: with_values(
		C.TEMPLATE_TRY_FINALLY,
		(target) =>
			`${target} TSRX does not support JavaScript \`try/finally\` in TSRX templates. \`finally\` is not part of TSRX control flow; move the try/finally into a function if you need cleanup logic.`,
	),
	TEMPLATE_TRY_HANDLER: {
		code: C.TEMPLATE_TRY_HANDLER,
		message: 'TSRX try statements must have a `pending` or `catch` block.',
	},
	/** `target` is the target's name. */
	TARGET_AWAIT_UNSUPPORTED: with_values(
		C.TARGET_AWAIT_UNSUPPORTED,
		(target) =>
			`${target} TSRX does not support \`await\` here: this part of the template renders through a callback the target calls, so its result cannot be awaited. Await the value in the component body, or move it into an async child component.`,
	),
	/** `target` is the target's name. */
	TARGET_YIELD_UNSUPPORTED: with_values(
		C.TARGET_YIELD_UNSUPPORTED,
		(target) =>
			`${target} TSRX does not support \`yield\` here: this part of the template runs in a callback, which cannot yield from the enclosing generator. Yield the value in the function body first.`,
	),
	/** `target` is the target's name. */
	TARGET_SUPER_UNSUPPORTED: with_values(
		C.TARGET_SUPER_UNSUPPORTED,
		(target) =>
			`${target} TSRX does not support \`super\` here: this part of the template also yields, so it is lowered into a generator function, where \`super\` is unavailable. Read the value into a variable in the method body first.`,
	),
	/** `target` is the target's name. */
	TARGET_FOR_AWAIT_UNSUPPORTED: with_values(
		C.TARGET_FOR_AWAIT_UNSUPPORTED,
		(target) => `${target} TSRX does not support \`for await...of\` in TSRX templates.`,
	),
	TOP_LEVEL_AWAIT_USE_SERVER: {
		code: C.TOP_LEVEL_AWAIT_USE_SERVER,
		message:
			'Top-level `await` in TSRX functions requires a module-level `"use server"` directive.',
	},

	// TSRX3xxx
	STYLE_APPLY_VALUE: {
		code: C.STYLE_APPLY_VALUE,
		message:
			"The 'apply' attribute of a <style> block requires an expression value: apply={theme} or apply={[a, b]}.",
	},
	STYLE_APPLY_TARGET: with_values(
		C.STYLE_APPLY_TARGET,
		(name) =>
			`'${name}' is not a style block. An 'apply' target must be a variable, import, or member holding an assigned <style> block.`,
	),
	STYLE_APPLY_BEFORE_DECLARATION: with_values(
		C.STYLE_APPLY_BEFORE_DECLARATION,
		(name) =>
			`'${name}' is applied before its declaration. Declare the style block before the block that applies it.`,
	),
	STYLE_APPLY_DUPLICATE: {
		code: C.STYLE_APPLY_DUPLICATE,
		message:
			"A <style> block accepts a single 'apply' attribute; pass several themes as an array: apply={[a, b]}.",
	},
	STYLE_APPLY_UNSUPPORTED_HOST: {
		code: C.STYLE_APPLY_UNSUPPORTED_HOST,
		message:
			"The 'apply' attribute is only supported on scoped <style> blocks, not on <head> styles or resource styles.",
	},
	STYLE_RESERVED_CLASS_KEY: {
		code: C.STYLE_RESERVED_CLASS_KEY,
		message:
			"'$class' is reserved on assigned <style> blocks for the block's scope hash; rename the '.$class' selector.",
	},
	STYLE_STANDALONE_AT_MODULE_SCOPE: {
		code: C.STYLE_STANDALONE_AT_MODULE_SCOPE,
		message:
			'A standalone <style> block is only allowed inside a template scope. At module scope assign it: const theme = <style>…</style>.',
	},
	STYLE_STANDALONE_OUTSIDE_TEMPLATE: {
		code: C.STYLE_STANDALONE_OUTSIDE_TEMPLATE,
		message:
			'A standalone <style> block with CSS text is TSRX template syntax and needs an enclosing @{ … } body or an @if/@for/@switch/@try body. In plain TSX give <style> an expression child instead: <style>{css}</style>. To declare a reusable block here, assign it: const theme = <style>…</style>.',
	},
	STYLE_STANDALONE_NEEDS_FRAGMENT: {
		code: C.STYLE_STANDALONE_NEEDS_FRAGMENT,
		message:
			'A standalone <style> block must be a child of an element or a fragment. Wrap it with the output it styles in a fragment: <><style>…</style><div>…</div></>.',
	},
	STYLE_UNKNOWN_ATTRIBUTE: with_values(
		C.STYLE_UNKNOWN_ATTRIBUTE,
		(name) => `Unknown <style> attribute '${name}'. Scoped style blocks accept 'ref' and 'apply'.`,
	),
	CSS_GLOBAL_IN_PSEUDOCLASS: {
		code: C.CSS_GLOBAL_PLACEMENT,
		message: 'A :global selector cannot be inside a pseudoclass.',
	},
	CSS_GLOBAL_IN_MIDDLE: {
		code: C.CSS_GLOBAL_PLACEMENT,
		message:
			':global(...) can be at the start or end of a selector sequence, but not in the middle.',
	},
	CSS_IMPORT: {
		code: C.CSS_IMPORT,
		message:
			"@import is not supported in <style> blocks: the imported rules would not be scoped. Share scoped styles with an assigned block (const theme = <style>…</style>) and apply={theme}. For global CSS, use :global in the block, or import the stylesheet in JavaScript: import './global.css'.",
	},

	// TSRX4xxx
	PLATFORM_REQUIRED: {
		code: C.PLATFORM_REQUIRED,
		message:
			'Platform flag usage requires a configured TSRX platform. Set `tsrx.platform` in tsconfig.json and pass the same `platform` to the build integration ("web", "ios", or "android").',
	},
	RESERVED_IDENTIFIER_PREFIX: with_values(
		C.RESERVED_IDENTIFIER_PREFIX,
		(name, prefix) =>
			`Cannot declare a variable named "${name}" as identifiers starting with "${prefix}" are reserved`,
	),
	// acorn-typescript's wording, for `with { type: 'json', type: 'json' }`: an
	// ECMAScript early error that TypeScript doesn't report.
	DUPLICATED_ATTRIBUTE_KEY: { code: C.JAVASCRIPT_SYNTAX, message: 'Duplicated key in attributes' },
};

/**
 * The errors TSRX reports for mistakes TypeScript also reports, each with
 * TypeScript's code for the same mistake. Most have TypeScript's wording too;
 * the ones in acorn's or acorn-typescript's wording are the upstream errors
 * TSRX raises itself where it reads the code in their place. A test checks the
 * wording of each against TypeScript's.
 */
export const TS_ERRORS = {
	// Tokens and names
	/** `token` is the token expected, such as `}`. */
	TOKEN_EXPECTED: with_values('TS1005', (token) => `'${token}' expected.`),
	IDENTIFIER_EXPECTED: { code: 'TS1003', message: 'Identifier expected.' },
	RESERVED_WORD_AS_IDENTIFIER: with_values(
		'TS1359',
		(word) => `Identifier expected. '${word}' is a reserved word that cannot be used here.`,
	),
	IDENTIFIER_OR_STRING_EXPECTED: {
		code: 'TS1478',
		message: 'Identifier or string literal expected.',
	},
	DECLARATION_EXPECTED: { code: 'TS1146', message: 'Declaration expected.' },
	DECLARATION_OR_STATEMENT_EXPECTED: {
		code: 'TS1128',
		message: 'Declaration or statement expected.',
	},
	LINE_BREAK_NOT_PERMITTED: { code: 'TS1142', message: 'Line break not permitted here.' },
	KEYWORD_ESCAPE: { code: 'TS1260', message: 'Keywords cannot contain escape characters.' },
	// A private name outside any class (see `parsePrivateIdent` in `plugin.js`)
	PRIVATE_IDENTIFIER_OUTSIDE_CLASS: {
		code: 'TS18016',
		message: 'Private identifiers are not allowed outside class bodies.',
	},

	// The modifiers of a declaration, as TypeScript's checker words them
	// (`checkGrammarModifiers`)
	MODIFIER_ALREADY_SEEN: with_values(
		'TS1030',
		(modifier) => `'${modifier}' modifier already seen.`,
	),
	MODIFIER_MUST_PRECEDE: with_values(
		'TS1029',
		(modifier, other) => `'${modifier}' modifier must precede '${other}' modifier.`,
	),
	MODIFIER_CANNOT_BE_USED_WITH: with_values(
		'TS1243',
		(modifier, other) => `'${modifier}' modifier cannot be used with '${other}' modifier.`,
	),
	MODIFIER_IN_AMBIENT_CONTEXT: with_values(
		'TS1040',
		(modifier) => `'${modifier}' modifier cannot be used in an ambient context.`,
	),
	MODIFIER_CANNOT_BE_USED_HERE: with_values(
		'TS1042',
		(modifier) => `'${modifier}' modifier cannot be used here.`,
	),
	MODIFIER_ON_MODULE_ELEMENT: with_values(
		'TS1044',
		(modifier) => `'${modifier}' modifier cannot appear on a module or namespace element.`,
	),
	MODIFIER_ON_USING: with_values(
		'TS1491',
		(modifier) => `'${modifier}' modifier cannot appear on a 'using' declaration.`,
	),
	MODIFIER_ON_AWAIT_USING: with_values(
		'TS1495',
		(modifier) => `'${modifier}' modifier cannot appear on an 'await using' declaration.`,
	),
	MODIFIERS_CANNOT_APPEAR_HERE: { code: 'TS1184', message: 'Modifiers cannot appear here.' },
	ACCESSIBILITY_MODIFIER_ALREADY_SEEN: {
		code: 'TS1028',
		message: 'Accessibility modifier already seen.',
	},
	READONLY_MODIFIER_NOT_ALLOWED: {
		code: 'TS1024',
		message: "'readonly' modifier can only appear on a property declaration or index signature.",
	},
	ACCESSOR_MODIFIER_NOT_ALLOWED: {
		code: 'TS1275',
		message: "'accessor' modifier can only appear on a property declaration.",
	},
	ABSTRACT_MODIFIER_NOT_ALLOWED: {
		code: 'TS1242',
		message: "'abstract' modifier can only appear on a class, method, or property declaration.",
	},
	DECLARE_MODIFIER_IN_AMBIENT_CONTEXT: {
		code: 'TS1038',
		message: "A 'declare' modifier cannot be used in an already ambient context.",
	},
	MODIFIER_ON_IMPORT: with_values(
		'TS1079',
		(modifier) => `A '${modifier}' modifier cannot be used with an import declaration.`,
	),
	EXPORT_MODIFIER_ON_AUGMENTATION: {
		code: 'TS2668',
		message:
			"'export' modifier cannot be applied to ambient modules and module augmentations since they are always visible.",
	},
	READONLY_TYPE_MODIFIER: {
		code: 'TS1354',
		message: "'readonly' type modifier is only permitted on array and tuple literal types.",
	},

	// An import or export inside a block, which acorn reports as `'import' and
	// 'export' may only appear at the top level`, as TypeScript words it for each
	// kind of import or export
	NESTED_IMPORT: {
		code: 'TS1232',
		message: 'An import declaration can only be used at the top level of a namespace or module.',
	},
	NESTED_EXPORT: {
		code: 'TS1233',
		message: 'An export declaration can only be used at the top level of a namespace or module.',
	},
	NESTED_EXPORT_ASSIGNMENT: {
		code: 'TS1231',
		message: 'An export assignment must be at the top level of a file or module declaration.',
	},
	NESTED_DEFAULT_EXPORT: {
		code: 'TS1258',
		message: 'A default export must be at the top level of a file or module declaration.',
	},
	NESTED_NAMESPACE: {
		code: 'TS1235',
		message: 'A namespace declaration is only allowed at the top level of a namespace or module.',
	},
	NESTED_GLOBAL_EXPORT: {
		code: 'TS1316',
		message: 'Global module exports may only appear at top level.',
	},

	// `await` outside an async function, where only a namespace makes it parse
	AWAIT_EXPRESSION_NOT_ALLOWED: {
		code: 'TS1308',
		message:
			"'await' expressions are only allowed within async functions and at the top levels of modules.",
	},
	FOR_AWAIT_NOT_ALLOWED: {
		code: 'TS1103',
		message:
			"'for await' loops are only allowed within async functions and at the top levels of modules.",
	},
	AWAIT_USING_NOT_ALLOWED: {
		code: 'TS2852',
		message:
			"'await using' statements are only allowed within async functions and at the top levels of modules.",
	},
	// TypeScript reports a deferred default import (TS18058) or named imports
	// (TS18059); TSRX words both as one message
	IMPORT_DEFER_NAMESPACE: {
		code: 'TS18059',
		message: '`import defer` only supports a namespace import from a string literal.',
	},

	// Declarations
	VARIABLE_DECLARATION_LIST_EMPTY: {
		code: 'TS1123',
		message: 'Variable declaration list cannot be empty.',
	},
	/** `kind` is `const`, `using`, or `await using`. */
	DECLARATION_NOT_INITIALIZED: with_values(
		'TS1155',
		(kind) => `'${kind}' declarations must be initialized.`,
	),
	FOR_IN_USING: {
		code: 'TS1493',
		message: "The left-hand side of a 'for...in' statement cannot be a 'using' declaration.",
	},
	FOR_IN_AWAIT_USING: {
		code: 'TS1494',
		message: "The left-hand side of a 'for...in' statement cannot be an 'await using' declaration.",
	},
	// A `let`, `const` or `using` declaration's name declared again in the same
	// scope (see `declareName` in `plugin.js`)
	BLOCK_SCOPED_VARIABLE_REDECLARED: with_values(
		'TS2451',
		(name) => `Cannot redeclare block-scoped variable '${name}'.`,
	),
	// A `var` in a block below one that declares its name with `let`, `const`, or
	// `using` (see `declareName` in `plugin.js`). TypeScript gives the name for
	// both values.
	OUTER_SCOPED_VARIABLE_INITIALIZED: with_values(
		'TS2481',
		(name, declaration) =>
			`Cannot initialize outer scoped variable '${name}' in the same scope as block scoped declaration '${declaration}'.`,
	),
	// A `let`, `const`, or `using` declaration of a `catch` clause's parameter in
	// its block
	CATCH_PARAMETER_REDECLARED: with_values(
		'TS2492',
		(name) => `Cannot redeclare identifier '${name}' in catch clause.`,
	),
	// An enum and another declaration of its name but an enum or a namespace
	ENUM_REDECLARED: {
		code: 'TS2567',
		message: 'Enum declarations can only merge with namespace or other enum declarations.',
	},
	// TSRX's wording of a name redeclared in a module's or function's scope
	DECLARED_IN_SCOPE: with_values(
		'TS2300',
		(name) => `'${name}' has already been declared in the current scope`,
	),

	// Parameters
	SIGNATURE_PARAMETER_INITIALIZER: {
		code: 'TS2371',
		message: 'A parameter initializer is only allowed in a function or constructor implementation.',
	},
	PATTERN_PARAMETER_PROPERTY: {
		code: 'TS1187',
		message: 'A parameter property may not be declared using a binding pattern.',
	},
	REST_PARAMETER_PROPERTY: {
		code: 'TS1317',
		message: 'A parameter property cannot be declared using a rest parameter.',
	},
	PARAMETER_PROPERTY_OUTSIDE_CONSTRUCTOR: {
		code: 'TS2369',
		message: 'A parameter property is only allowed in a constructor implementation.',
	},
	REST_PARAMETER_INITIALIZER: {
		code: 'TS1048',
		message: 'A rest parameter cannot have an initializer.',
	},
	REST_ELEMENT_INITIALIZER: {
		code: 'TS1186',
		message: 'A rest element cannot have an initializer.',
	},
	OPTIONAL_REST_PARAMETER: { code: 'TS1047', message: 'A rest parameter cannot be optional.' },
	OPTIONAL_BINDING_PATTERN_PARAMETER: {
		code: 'TS2463',
		message: 'A binding pattern parameter cannot be optional in an implementation signature.',
	},

	// acorn's wording, for the code TSRX reads in acorn's place
	UNEXPECTED_TOKEN: { code: 'TS1012', message: 'Unexpected token' },
	REST_ELEMENT_TRAILING_COMMA: {
		code: 'TS1013',
		message: 'Comma is not permitted after the rest element',
	},
	ARGUMENT_NAME_CLASH: { code: 'TS2300', message: 'Argument name clash' },
	KEYWORD_ESCAPE_SEQUENCE: with_values(
		'TS1260',
		(keyword) => `Escape sequence in keyword ${keyword}`,
	),
	AWAIT_USING_OUTSIDE_ASYNC: {
		code: 'TS2852',
		message: 'Await using cannot appear outside of async function',
	},
	FOR_OF_LET: {
		code: 'TS1134',
		message: "The left-hand side of a for-of loop may not start with 'let'.",
	},
	FOR_IN_INITIALIZER: {
		code: 'TS1189',
		message: 'for-in loop variable declaration may not have an initializer',
	},
	FOR_OF_INITIALIZER: {
		code: 'TS1190',
		message: 'for-of loop variable declaration may not have an initializer',
	},
	MISSING_CATCH_OR_FINALLY: { code: 'TS1472', message: 'Missing catch or finally clause' },
	MULTIPLE_DEFAULT_CLAUSES: { code: 'TS1113', message: 'Multiple default clauses' },
	USE_STRICT_NON_SIMPLE_PARAMETERS: {
		code: 'TS1347',
		message: "Illegal 'use strict' directive in function with non-simple parameter list",
	},

	// acorn-typescript's wording, for the code TSRX reads in acorn-typescript's
	// place
	UNTERMINATED_JSX_CONTENTS: { code: 'TS17008', message: 'Unterminated JSX contents' },
	JSX_UNESCAPED_GREATER_THAN: {
		code: 'TS1382',
		message: 'Unexpected token `>`. Did you mean `&gt;` or `{">"}`?',
	},
	JSX_UNESCAPED_CLOSING_BRACE: {
		code: 'TS1381',
		message: 'Unexpected token `}`. Did you mean `&rbrace;` or `{"}"}`?',
	},
	// TSRX's shorter wording of acorn-typescript's `JSX value should be either
	// an expression or a quoted JSX text`
	JSX_ATTRIBUTE_VALUE: {
		code: 'TS1145',
		message: 'value should be either an expression or a quoted text',
	},
	ONLY_STRING_ATTRIBUTE_VALUE: {
		code: 'TS2858',
		message: 'Only string is supported as an attribute value',
	},
	TYPE_IMPORT_ARGUMENT: {
		code: 'TS1141',
		message: 'Argument in a type import must be a string literal.',
	},
	UNEXPECTED_LEADING_DECORATOR: {
		code: 'TS1206',
		message: 'Leading decorators must be attached to a class declaration.',
	},
	TYPE_CAST_IN_PARAMETER: {
		code: 'TS1005',
		message: 'Unexpected type cast in parameter position.',
	},
	UNEXPECTED_TYPE_ANNOTATION: { code: 'TS1005', message: 'Did not expect a type annotation here.' },
	/** `type` is the type of the node read as the parameter. */
	SIGNATURE_PARAMETER_NAME: with_values(
		'TS2371',
		(type) =>
			`Name in a signature must be an Identifier, ObjectPattern or ArrayPattern, instead got ${type}.`,
	),
	RESERVED_ARROW_TYPE_PARAMETER: {
		code: 'TS7060',
		message:
			'This syntax is reserved in files with the .mts or .cts extension. Add a trailing comma, as in `<T,>() => ...`.',
	},
};

/**
 * An error that acorn or acorn-typescript raises in its own words, which TSRX
 * doesn't write: the pattern of its message, and TypeScript's code for the
 * same mistake. The code is TypeScript's diagnostic with the same wording, or
 * the one TypeScript reports for an input that raises the message (checked for
 * each), and `TSRX4003` where TypeScript accepts the code.
 * @typedef {{ pattern: RegExp, code: string }} UpstreamError
 */

/**
 * The upstream errors that TSRX's parser handles itself, by kind: see
 * `CHECKER_LEVEL_ERRORS` and `raise` in `plugin.js`. A comment names the
 * upstream functions that raise each.
 */
export const UPSTREAM_ERRORS = {
	// A redeclared variable, import, type alias, or private name. Where
	// TypeScript reports another code, the parser reports it instead: TS2451,
	// TS2481, TS2492, or TS2567 (see `declareName` in `plugin.js`).
	// acorn: declareName, parseClass; acorn-typescript: declareName
	REDECLARED: {
		pattern: /^(?:Identifier|type) '#?[^']+' has already been declared\.?$/,
		code: 'TS2300',
	},
	// acorn: parseTopLevel
	EXPORT_NOT_DEFINED: { pattern: /^Export '[^']+' is not defined$/, code: 'TS2304' },
	// acorn: toAssignable, checkLValSimple
	OPTIONAL_CHAIN_ASSIGNMENT: {
		pattern: /^Optional chaining cannot appear in left-hand side$/,
		code: 'TS2779',
	},
	// acorn: parseImportMeta
	IMPORT_META_PROPERTY: {
		pattern: /^The only valid meta property for import is 'import\.meta'$/,
		code: 'TS17012',
	},
	// acorn: parseNew
	NEW_TARGET_OUTSIDE_FUNCTION: {
		pattern: /^'new\.target' can only be used in functions and class static block$/,
		code: 'TS17013',
	},
	// acorn: parseExprAtom
	SUPER_OUTSIDE_METHOD: { pattern: /^'super' keyword outside a method$/, code: 'TS2660' },
	// acorn: parseExprAtom
	SUPER_CALL_OUTSIDE_CONSTRUCTOR: {
		pattern: /^super\(\) call outside constructor of a subclass$/,
		code: 'TS2337',
	},
	// acorn: checkUnreserved
	LET_RESERVED: { pattern: /^The keyword 'let' is reserved$/, code: 'TS1212' },
	// `let` as a binding name or an assignment target, which acorn reports after
	// `LET_RESERVED` at the same position, so only that one is recorded.
	// acorn: checkLValSimple
	LET_BINDING: {
		pattern:
			/^(?:(?:Binding|Assigning to) let in strict mode|let is disallowed as a lexically bound name)$/,
		code: 'TS2480',
	},
	// acorn-typescript: callParseClassMemberWithIsStatic
	ABSTRACT_METHOD_IN_CLASS: {
		pattern: /^Abstract methods can only appear within an abstract class\.$/,
		code: 'TS1244',
	},
	// acorn-typescript: parseVarStatement, parseClassField
	AMBIENT_INITIALIZER: {
		pattern: /^Initializers are not allowed in ambient contexts\.$/,
		code: 'TS1039',
	},
	// acorn-typescript: tsParseModifiers
	DUPLICATE_MODIFIER: { pattern: /^Duplicate modifier: '\w+'\.$/, code: 'TS1030' },
	// acorn-typescript: tsParseModifiers
	TYPE_MEMBER_MODIFIER: {
		pattern: /^'\w+' modifier cannot appear on a type member\.$/,
		code: 'TS1070',
	},
	// acorn-typescript: tsParseModifiers
	TYPE_PARAMETER_MODIFIER: {
		pattern: /^'\w+' modifier cannot appear on a type parameter\.$/,
		code: 'TS1273',
	},
	// acorn-typescript: tsParseModifiers
	VARIANCE_MODIFIER: {
		pattern:
			/^'\w+' modifier can only appear on a type parameter of a class, interface or type alias\.$/,
		code: 'TS1274',
	},
	// acorn-typescript: parseClassField
	PRIVATE_ELEMENT_ACCESSIBILITY: {
		pattern: /^Private elements cannot have an accessibility modifier \('\w+'\)\.$/,
		code: 'TS18010',
	},
	// acorn-typescript: parseClassField
	PRIVATE_ELEMENT_ABSTRACT: {
		pattern: /^Private elements cannot have the 'abstract' modifier\.$/,
		code: 'TS18019',
	},
	// acorn-typescript: parseClass
	DECORATED_CONSTRUCTOR: {
		pattern:
			/^Decorators can't be used with a constructor\. Did you mean '@dec class \{ \.\.\. \}'\?$/,
		code: 'TS1206',
	},
};

/**
 * acorn's and acorn-typescript's errors, which they raise as bare messages:
 * the lookup that gives each its code. A row is an {@link UpstreamError}, a
 * `[pattern, code]` pair, or the entry of a message TSRX raises too in the same
 * words, whose pattern is the entry's message with any value in it. A comment
 * names the upstream functions that raise each. The first row that matches
 * wins.
 * @type {Array<UpstreamError | [RegExp, string] | Diagnostic | DiagnosticWithValues>}
 */
const UPSTREAM_LOOKUP_ROWS = [
	// acorn: unexpected, toAssignable
	TS_ERRORS.UNEXPECTED_TOKEN,
	// acorn: parseBindingList, checkPatternErrors, parseParenAndDistinguishExpression, parseProperty
	TS_ERRORS.REST_ELEMENT_TRAILING_COMMA,
	// acorn: checkPatternErrors, toAssignable
	[/^Assigning to rvalue$/, 'TS2364'],
	// acorn: checkPatternErrors
	[/^Parenthesized pattern$/, 'TS1005'],
	// acorn: checkExpressionErrors
	[/^Shorthand property assignments are valid only in destructuring patterns$/, 'TS1312'],
	// acorn: checkExpressionErrors, checkPropClash
	[/^Redefinition of __proto__ property$/, 'TS1117'],
	// acorn: checkYieldAwaitInDefaultParams
	[/^Yield expression cannot be a default value$/, 'TS2523'],
	// acorn: checkYieldAwaitInDefaultParams
	[/^Await expression cannot be a default value$/, 'TS2524'],
	// acorn: parseTopLevel
	UPSTREAM_ERRORS.EXPORT_NOT_DEFINED,
	// acorn: parseStatement
	[
		/^Using declaration cannot appear in the top level when source type is `script` or in the bare case statement$/,
		'TSRX4003',
	],
	// acorn: parseStatement
	[/^Using declaration is not allowed in single-statement positions$/, 'TS1156'],
	// acorn: parseStatement, parseForStatement
	TS_ERRORS.AWAIT_USING_OUTSIDE_ASYNC,
	// acorn: parseBreakContinueStatement
	[/^Unsyntactic break$/, 'TS1105'],
	// acorn: parseBreakContinueStatement
	[/^Unsyntactic continue$/, 'TS1104'],
	// acorn: parseForStatement
	TS_ERRORS.FOR_OF_LET,
	// acorn: parseForAfterInit
	[/^Using declaration is not allowed in for-in loops$/, 'TS1493'],
	// acorn: parseReturnStatement
	[/^'return' outside of function$/, 'TS1108'],
	// acorn: parseSwitchStatement
	TS_ERRORS.MULTIPLE_DEFAULT_CLAUSES,
	// acorn: parseThrowStatement
	[/^Illegal newline after throw$/, 'TS1142'],
	// acorn: parseTryStatement
	TS_ERRORS.MISSING_CATCH_OR_FINALLY,
	// acorn: parseWithStatement
	[/^'with' in strict mode$/, 'TS1101'],
	// acorn: parseLabeledStatement
	[/^Label '[^']+' is already declared$/, 'TS1114'],
	// acorn: parseForIn
	TS_ERRORS.FOR_IN_INITIALIZER,
	// acorn: parseForIn
	TS_ERRORS.FOR_OF_INITIALIZER,
	// acorn: parseVar
	[/^Missing initializer in (?:const|using|await using) declaration$/, 'TS1155'],
	// acorn: parseVar
	[/^Complex binding patterns require an initialization value$/, 'TS1182'],
	// acorn: parseClass
	[/^Duplicate constructor in the same class$/, 'TS2392'],
	// acorn: declareName, parseClass; acorn-typescript: declareName
	UPSTREAM_ERRORS.REDECLARED,
	// acorn: parseClassElement
	[/^Constructor can't have get\/set modifier$/, 'TS1341'],
	// acorn: parseClassElementName
	[/^Classes can't have an element named '#constructor'$/, 'TS18012'],
	// acorn: parseClassMethod
	[/^Constructor can't be a generator$/, 'TS1368'],
	// acorn: parseClassMethod
	[/^Constructor can't be an async method$/, 'TS1089'],
	// acorn: parseClassMethod
	[/^Classes may not have a static property named prototype$/, 'TS2699'],
	// acorn: parseClassMethod, parseGetterSetter
	[/^getter should have no params$/, 'TS1054'],
	// acorn: parseClassMethod, parseGetterSetter
	[/^setter should have exactly one param$/, 'TS1049'],
	// acorn: parseClassMethod, parseGetterSetter
	[/^Setter cannot use rest params$/, 'TS1053'],
	// acorn: parseClassField
	[/^Classes can't have a field named 'constructor'$/, 'TS18006'],
	// acorn: parseClassField
	[/^Classes can't have a static field named 'prototype'$/, 'TS2699'],
	// acorn: exitClassBody (a class uses a private name it doesn't declare). The
	// parser reports acorn's error for one outside any class, from
	// `parsePrivateIdent`, as TypeScript's TS18016 instead.
	[/^Private field '#.+' must be declared in an enclosing class$/, 'TS1111'],
	// acorn: parseExport
	[/^A string literal cannot be used as an exported binding without `from`\.$/, 'TSRX4003'],
	// acorn: checkExport
	[/^Duplicate export '[^']+'$/, 'TS2300'],
	// acorn: parseModuleExportName
	[/^An export name cannot include a lone surrogate\.$/, 'TSRX4003'],
	// acorn: toAssignable, parseSubscript, checkUnreserved
	[/^Cannot use 'await' as identifier inside an async function$/, 'TS1359'],
	// acorn: toAssignable
	[/^Object pattern can't contain getter or setter$/, 'TS1136'],
	// acorn: toAssignable
	[/^Rest elements cannot have a default value$/, 'TS1186'],
	// acorn: toAssignable
	[/^Only '=' operator can be used for specifying default value\.$/, 'TS2364'],
	// acorn: toAssignable, checkLValSimple
	UPSTREAM_ERRORS.OPTIONAL_CHAIN_ASSIGNMENT,
	// acorn: checkLValSimple
	[/^Binding (?:eval|arguments) in strict mode$/, 'TS1100'],
	// acorn: checkLValSimple
	[/^Assigning to (?:eval|arguments) in strict mode$/, 'TS1100'],
	// acorn: checkLValSimple
	UPSTREAM_ERRORS.LET_BINDING,
	// acorn: checkLValSimple
	TS_ERRORS.ARGUMENT_NAME_CLASH,
	// acorn: checkLValSimple
	[/^Binding member expression$/, 'TS1005'],
	// acorn: checkLValSimple
	[/^Binding rvalue$/, 'TS2364'],
	// acorn: checkPropClash
	[/^Redefinition of property$/, 'TS1117'],
	// acorn: parseExprOp
	[
		/^Logical expressions and coalesce expressions cannot be mixed\. Wrap either by parentheses$/,
		'TS5076',
	],
	// acorn: buildBinary
	[/^Private identifier can only be left side of binary expression$/, 'TS1451'],
	// acorn: parseMaybeUnary
	[/^Deleting local variable in strict mode$/, 'TS1102'],
	// acorn: parseMaybeUnary
	[/^Private fields can not be deleted$/, 'TS18011'],
	// acorn: parseSubscript
	[/^Optional chaining cannot appear in the callee of new expressions$/, 'TS1209'],
	// acorn: parseSubscript
	[/^Optional chaining cannot appear in the tag of tagged template expressions$/, 'TS1358'],
	// acorn: parseExprAtom
	UPSTREAM_ERRORS.SUPER_OUTSIDE_METHOD,
	// acorn: parseExprAtom
	UPSTREAM_ERRORS.SUPER_CALL_OUTSIDE_CONSTRUCTOR,
	// acorn: parseExprImport, parseNew, next
	TS_ERRORS.KEYWORD_ESCAPE_SEQUENCE,
	// acorn: parseImportMeta
	UPSTREAM_ERRORS.IMPORT_META_PROPERTY,
	// acorn: parseImportMeta
	[/^'import\.meta' must not contain escaped characters$/, 'TSRX4003'],
	// acorn: parseNew
	[/^The only valid meta property for new is 'new\.target'$/, 'TS17012'],
	// acorn: parseNew
	[/^'new\.target' must not contain escaped characters$/, 'TSRX4003'],
	// acorn: parseNew
	UPSTREAM_ERRORS.NEW_TARGET_OUTSIDE_FUNCTION,
	// acorn: parseTemplateElement
	[/^Bad escape sequence in untagged template literal$/, 'TS1125'],
	// acorn: parseTemplate
	[/^Unterminated template literal$/, 'TS1160'],
	// acorn: parseFunctionBody
	TS_ERRORS.USE_STRICT_NON_SIMPLE_PARAMETERS,
	// acorn: checkUnreserved
	[/^Cannot use 'yield' as identifier inside a generator$/, 'TS1212'],
	// acorn: checkUnreserved
	[/^Cannot use 'arguments' in class field initializer$/, 'TS2815'],
	// acorn: checkUnreserved
	[/^Cannot use arguments in class static initialization block$/, 'TS2815'],
	// acorn: checkUnreserved
	[/^Cannot use await in class static initialization block$/, 'TS18037'],
	// acorn: checkUnreserved
	[/^Unexpected keyword '[^']+'$/, 'TS1359'],
	// acorn: checkUnreserved
	[/^Cannot use keyword 'await' outside an async function$/, 'TS1262'],
	// acorn: checkUnreserved
	UPSTREAM_ERRORS.LET_RESERVED,
	// acorn: checkUnreserved
	[/^The keyword '[^']+' is reserved$/, 'TS1212'],
	// acorn: validateRegExpFlags
	[/^Invalid regular expression flag$/, 'TS1499'],
	// acorn: validateRegExpFlags
	[/^Duplicate regular expression flag$/, 'TS1500'],
	// acorn: skipBlockComment
	[/^Unterminated comment$/, 'TS1010'],
	// acorn: readToken_numberSign, getTokenFromCode
	[/^Unexpected character '.+'$/, 'TS1127'],
	// acorn: readRegexp
	[/^Unterminated regular expression$/, 'TS1161'],
	// acorn: readInt
	[/^Numeric separator is not allowed in legacy octal numeric literals$/, 'TS6188'],
	// acorn: readInt
	[/^Numeric separator must be exactly one underscore$/, 'TS6189'],
	// acorn: readInt
	[/^Numeric separator is not allowed at the first of digits$/, 'TS6188'],
	// acorn: readInt
	[/^Numeric separator is not allowed at the last of digits$/, 'TS6188'],
	// acorn: readRadixNumber
	[/^Expected number in radix 16$/, 'TS1125'],
	// acorn: readRadixNumber
	[/^Expected number in radix 2$/, 'TS1177'],
	// acorn: readRadixNumber
	[/^Expected number in radix 8$/, 'TS1178'],
	// acorn: readRadixNumber, readNumber
	[/^Identifier directly after number$/, 'TS1351'],
	// acorn: readNumber
	[/^Invalid number$/, 'TS1124'],
	// acorn: readString
	[/^Unterminated string constant$/, 'TS1002'],
	// acorn: parseTemplate, readTmplToken, readInvalidTemplateToken
	[/^Unterminated template$/, 'TS1160'],
	// acorn: readCodePoint
	[/^Code point out of bounds$/, 'TS1198'],
	// acorn: readEscapedChar
	[/^Invalid escape sequence$/, 'TS1488'],
	// acorn: readEscapedChar
	[/^Invalid escape sequence in template string$/, 'TS1488'],
	// acorn: readEscapedChar
	[/^Octal literal in template string$/, 'TS1487'],
	// acorn: readEscapedChar
	[/^Octal literal in strict mode$/, 'TS1487'],
	// acorn: readHexChar
	[/^Bad character escape sequence$/, 'TS1125'],
	// acorn: readWord1
	[/^Expecting Unicode escape sequence \\uXXXX$/, 'TS1127'],
	// acorn: readWord1
	[/^Invalid Unicode escape$/, 'TS1127'],
	// acorn's regular expression validator, as `Invalid regular expression:
	// /{0}/: {1}`
	// acorn: regexp_pattern
	[/^Invalid regular expression: \/.*\/: Unmatched '\)'$/, 'TS1508'],
	// acorn: regexp_pattern, regexp_disjunction
	[/^Invalid regular expression: \/.*\/: Lone quantifier brackets$/, 'TS1508'],
	// acorn: regexp_pattern, regexp_eatAtomEscape, regexp_eatClassAtom, regexp_eatClassStringDisjunction, regexp_eatHexEscapeSequence
	[/^Invalid regular expression: \/.*\/: Invalid escape$/, 'TS1535'],
	// acorn: regexp_pattern
	[/^Invalid regular expression: \/.*\/: Invalid named capture referenced$/, 'TS1532'],
	// acorn: regexp_disjunction, regexp_eatInvalidBracedQuantifier
	[/^Invalid regular expression: \/.*\/: Nothing to repeat$/, 'TS1507'],
	// acorn: regexp_eatTerm
	[/^Invalid regular expression: \/.*\/: Invalid quantifier$/, 'TS1507'],
	// acorn: regexp_eatAssertion, regexp_eatCapturingGroup, regexp_eatUncapturingGroup
	[/^Invalid regular expression: \/.*\/: Unterminated group$/, 'TS1005'],
	// acorn: regexp_eatBracedQuantifier
	[/^Invalid regular expression: \/.*\/: numbers out of order in \{\} quantifier$/, 'TS1506'],
	// acorn: regexp_eatBracedQuantifier
	[/^Invalid regular expression: \/.*\/: Incomplete quantifier$/, 'TS1005'],
	// acorn: regexp_eatUncapturingGroup
	[/^Invalid regular expression: \/.*\/: Duplicate regular expression modifiers$/, 'TS1500'],
	// acorn: regexp_eatUncapturingGroup
	[/^Invalid regular expression: \/.*\/: Invalid regular expression modifiers$/, 'TS1504'],
	// acorn: regexp_eatCapturingGroup, regexp_groupSpecifier
	[/^Invalid regular expression: \/.*\/: Invalid group$/, 'TS1005'],
	// acorn: regexp_groupSpecifier
	[/^Invalid regular expression: \/.*\/: Duplicate capture group name$/, 'TS1515'],
	// acorn: regexp_eatGroupName
	[/^Invalid regular expression: \/.*\/: Invalid capture group name$/, 'TS1514'],
	// acorn: regexp_eatAtomEscape, regexp_eatRegExpUnicodeEscapeSequence
	[/^Invalid regular expression: \/.*\/: Invalid unicode escape$/, 'TS1198'],
	// acorn: regexp_eatKGroupName
	[/^Invalid regular expression: \/.*\/: Invalid named reference$/, 'TS1510'],
	// acorn: regexp_eatCharacterClassEscape, regexp_validateUnicodePropertyNameAndValue, regexp_validateUnicodePropertyNameOrValue
	[/^Invalid regular expression: \/.*\/: Invalid property name$/, 'TS1529'],
	// acorn: regexp_validateUnicodePropertyNameAndValue
	[/^Invalid regular expression: \/.*\/: Invalid property value$/, 'TS1526'],
	// acorn: regexp_eatCharacterClass
	[/^Invalid regular expression: \/.*\/: Unterminated character class$/, 'TS1005'],
	// acorn: regexp_eatCharacterClass, regexp_eatNestedClass
	[/^Invalid regular expression: \/.*\/: Negated character class may contain strings$/, 'TS1518'],
	// acorn: regexp_nonEmptyClassRanges
	[/^Invalid regular expression: \/.*\/: Invalid character class$/, 'TS1516'],
	// acorn: regexp_nonEmptyClassRanges, regexp_eatClassSetRange
	[/^Invalid regular expression: \/.*\/: Range out of order in character class$/, 'TS1517'],
	// acorn: regexp_eatClassAtom
	[/^Invalid regular expression: \/.*\/: Invalid class escape$/, 'TS1512'],
	// acorn: regexp_classSetExpression
	[/^Invalid regular expression: \/.*\/: Invalid character in character class$/, 'TS1508'],
	// acorn-typescript: jsx_readToken
	TS_ERRORS.UNTERMINATED_JSX_CONTENTS,
	// acorn-typescript: jsx_readToken
	TS_ERRORS.JSX_UNESCAPED_GREATER_THAN,
	// acorn-typescript: jsx_readToken
	TS_ERRORS.JSX_UNESCAPED_CLOSING_BRACE,
	// acorn-typescript: jsx_parseAttributeValue
	[/^JSX attributes must only be assigned a non-empty expression$/, 'TS17000'],
	// acorn-typescript: jsx_parseAttributeValue
	[/^JSX value should be either an expression or a quoted JSX text$/, 'TS1145'],
	// acorn-typescript: jsx_parseElementAt
	[/^Expected corresponding JSX closing tag for <[^>]*>$/, 'TS17002'],
	// acorn-typescript: jsx_parseElementAt
	[/^Adjacent JSX elements must be wrapped in an enclosing tag$/, 'TS2657'],
	// acorn-typescript: parseWithEntries
	TSRX_ERRORS.DUPLICATED_ATTRIBUTE_KEY,
	// acorn-typescript: parseWithEntries
	TS_ERRORS.ONLY_STRING_ATTRIBUTE_VALUE,
	// acorn-typescript: tsParsePropertyOrMethodSignature
	[/^A 'get' accesor must not have any formal parameters\.$/, 'TS1054'],
	// acorn-typescript: parseNew
	[/^Cannot use new with import\(\)$/, 'TS1109'],
	// acorn-typescript: parseTaggedTemplateExpression
	[/^Tagged Template Literals are not allowed in optionalChain\.$/, 'TS1358'],
	// acorn-typescript: parseMethod
	[/^Method '.+' cannot have an implementation because it is marked abstract\.$/, 'TS1245'],
	// acorn-typescript: parseClassField
	[/^Property '.+' cannot have an initializer because it is marked abstract\.$/, 'TS1267'],
	// acorn-typescript: tsParsePropertyOrMethodSignature
	[/^'get' and 'set' accessors cannot declare 'this' parameters\.$/, 'TS2784'],
	// acorn-typescript: tsParsePropertyOrMethodSignature
	[/^An accessor cannot have type parameters\.$/, 'TS1094'],
	// acorn-typescript: tsTryNextParseConstantContext
	[/^Cannot find name '[^']+'\.$/, 'TS2304'],
	// acorn-typescript: parsePostMemberNameModifiers
	[/^Class methods cannot have the 'declare' modifier\.$/, 'TS1031'],
	// acorn-typescript: parsePostMemberNameModifiers
	[/^Class methods cannot have the 'readonly' modifier\.$/, 'TS1024'],
	// acorn-typescript: parseVarStatement
	[
		/^A 'const' initializer in an ambient context must be a string or numeric literal or literal enum reference\.$/,
		'TS1254',
	],
	// acorn-typescript: parseClassMethod
	[/^Type parameters cannot appear on a constructor declaration\.$/, 'TS1092'],
	// acorn-typescript: parseClassMethod
	[/^'declare' is not allowed in (?:get|set)ters\.$/, 'TS1031'],
	// acorn-typescript: parseVarStatement, parseClassField
	UPSTREAM_ERRORS.AMBIENT_INITIALIZER,
	// acorn-typescript: parseFunctionBody
	[/^An implementation cannot be declared in ambient contexts\.$/, 'TS1183'],
	// acorn-typescript: tsParseModifiers
	TS_ERRORS.ACCESSIBILITY_MODIFIER_ALREADY_SEEN,
	// acorn-typescript: tsParseModifiers
	UPSTREAM_ERRORS.DUPLICATE_MODIFIER,
	// acorn-typescript: tsParseHeritageClause
	[/^'(?:extends|implements)' list cannot be empty\.$/, 'TS1097'],
	// acorn-typescript: tsParseTypeArguments
	[/^Type argument list cannot be empty\.$/, 'TS1099'],
	// acorn-typescript: tsParseTypeParameters
	[/^Type parameter list cannot be empty\.$/, 'TS1098'],
	// acorn-typescript: parseExportDeclaration
	[/^'export declare' must be followed by an ambient declaration\.$/, 'TS1128'],
	// acorn-typescript: tsParseImportEqualsDeclaration
	[/^An import alias can not use 'import type'\.$/, 'TS1392'],
	// acorn-typescript: tsParseModifiers (incompatible)
	TS_ERRORS.MODIFIER_CANNOT_BE_USED_WITH,
	// acorn-typescript: callParseClassMemberWithIsStatic
	[/^Index signatures cannot have the 'abstract' modifier\.$/, 'TS1071'],
	// acorn-typescript: callParseClassMemberWithIsStatic
	[/^Index signatures cannot have an accessibility modifier \('\w+'\)\.$/, 'TS1071'],
	// acorn-typescript: callParseClassMemberWithIsStatic
	[/^Index signatures cannot have the 'declare' modifier\.$/, 'TS1071'],
	// acorn-typescript: callParseClassMemberWithIsStatic
	[/^'override' modifier cannot appear on an index signature\.$/, 'TS1071'],
	// acorn-typescript: tsParseModifiers
	UPSTREAM_ERRORS.TYPE_MEMBER_MODIFIER,
	// acorn-typescript: tsParseModifiers
	UPSTREAM_ERRORS.TYPE_PARAMETER_MODIFIER,
	// acorn-typescript: tsParseModifiers
	UPSTREAM_ERRORS.VARIANCE_MODIFIER,
	// acorn-typescript: tsParseModifiers (enforceOrder)
	TS_ERRORS.MODIFIER_MUST_PRECEDE,
	// acorn-typescript: parseSubscript
	[
		/^Invalid property access after an instantiation expression\. You can either wrap the instantiation expression in parentheses, or delete the type arguments\.$/,
		'TS1477',
	],
	// acorn-typescript: tsParseTupleElementType
	[/^Tuple members must be labeled with a simple identifier\.$/, 'TS1005'],
	// acorn-typescript: tsParseInterfaceDeclaration
	[/^'interface' declarations must be followed by an identifier\.$/, 'TS1438'],
	// acorn-typescript: callParseClassMemberWithIsStatic
	UPSTREAM_ERRORS.ABSTRACT_METHOD_IN_CLASS,
	// acorn-typescript: tsParseTupleType
	[/^A required element cannot follow an optional element\.$/, 'TS1257'],
	// acorn-typescript: callParseClassMemberWithIsStatic
	[
		/^This member cannot have an 'override' modifier because its containing class does not extend another class\.$/,
		'TS4112',
	],
	// acorn-typescript: parseBindingListItem
	TS_ERRORS.OPTIONAL_BINDING_PATTERN_PARAMETER,
	// acorn-typescript: parseClassField
	UPSTREAM_ERRORS.PRIVATE_ELEMENT_ABSTRACT,
	// acorn-typescript: parseClassField
	UPSTREAM_ERRORS.PRIVATE_ELEMENT_ACCESSIBILITY,
	// acorn-typescript: parseClassMethod
	[/^Private methods cannot have an accessibility modifier \('\w+'\)\.$/, 'TS18010'],
	// acorn-typescript: tsParsePropertyOrMethodSignature
	TS_ERRORS.READONLY_MODIFIER_NOT_ALLOWED,
	// acorn-typescript: tsParseTypeAssertion
	TS_ERRORS.RESERVED_ARROW_TYPE_PARAMETER,
	// acorn-typescript: tsParseTypeAssertion
	[
		/^This syntax is reserved in files with the \.mts or \.cts extension\. Use an `as` expression instead\.$/,
		'TS7059',
	],
	// acorn-typescript: tsParsePropertyOrMethodSignature
	[/^A 'set' accessor cannot have an optional parameter\.$/, 'TS1051'],
	// acorn-typescript: tsParsePropertyOrMethodSignature
	[/^A 'set' accessor cannot have rest parameter\.$/, 'TS1053'],
	// acorn-typescript: tsParsePropertyOrMethodSignature
	[/^A 'set' accessor cannot have a return type annotation\.$/, 'TS1095'],
	// acorn-typescript: callParseClassMemberWithIsStatic
	[/^Static class blocks cannot have any modifier\.$/, 'TS1184'],
	// acorn-typescript: parseMaybeDefault
	[
		/^Type annotations must come before default assignments, e\.g\. instead of `age = 25: number` use `age: number = 25`\.$/,
		'TS1005',
	],
	// acorn-typescript: parseImport
	[/^A type-only import can specify a default import or named bindings, but not both\.$/, 'TS1363'],
	// acorn-typescript: parseTypeOnlyImportExportSpecifier
	[
		/^The 'type' modifier cannot be used on a named export when 'export type' is used on its export statement\.$/,
		'TS2207',
	],
	// acorn-typescript: parseTypeOnlyImportExportSpecifier
	[
		/^The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement\.$/,
		'TS2206',
	],
	// acorn-typescript: parseAssignableListItem
	TS_ERRORS.PARAMETER_PROPERTY_OUTSIDE_CONSTRUCTOR,
	// acorn-typescript: tsCheckTypeAnnotationForReadOnly
	TS_ERRORS.READONLY_TYPE_MODIFIER,
	// acorn-typescript: tsCheckForInvalidTypeCasts
	TS_ERRORS.UNEXPECTED_TYPE_ANNOTATION,
	// acorn-typescript: toAssignable
	TS_ERRORS.TYPE_CAST_IN_PARAMETER,
	// acorn-typescript: tsParseImportType
	TS_ERRORS.TYPE_IMPORT_ARGUMENT,
	// acorn-typescript: parseAssignableListItem
	TS_ERRORS.PATTERN_PARAMETER_PROPERTY,
	// acorn-typescript: tsParseBindingListForSignature
	TS_ERRORS.SIGNATURE_PARAMETER_NAME,
	// acorn-typescript: parseDecorators
	TS_ERRORS.UNEXPECTED_LEADING_DECORATOR,
	// acorn-typescript: parseClass
	UPSTREAM_ERRORS.DECORATED_CONSTRUCTOR,
	// acorn-typescript: parseClass
	[/^Decorators must be attached to a class element\.$/, 'TS1146'],
	// acorn-typescript: parseProperty
	[/^Decorators can't be used with SpreadElement$/, 'TS1206'],
];

/**
 * The pattern of an entry's message, with any value in it.
 * @param {Diagnostic | DiagnosticWithValues} entry
 * @returns {RegExp}
 */
function message_pattern(entry) {
	const placeholder = '\0';
	const message =
		typeof entry === 'function'
			? entry(placeholder, placeholder, placeholder).message
			: entry.message;
	const source = message
		.split(placeholder)
		.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
		.join('.+');
	return new RegExp(`^${source}$`);
}

/**
 * {@link UPSTREAM_LOOKUP_ROWS}, as the pattern of each row and the kind of
 * error it is: the entry, or the {@link UpstreamError}.
 * @type {Array<{ pattern: RegExp, error: UpstreamError | Diagnostic | DiagnosticWithValues }>}
 */
const UPSTREAM_LOOKUP = UPSTREAM_LOOKUP_ROWS.map((row) => {
	if (Array.isArray(row)) return { pattern: row[0], error: { pattern: row[0], code: row[1] } };
	if ('pattern' in row) return { pattern: row.pattern, error: row };
	return { pattern: message_pattern(row), error: row };
});

/**
 * The kind of error an acorn or acorn-typescript `message` is, with its code:
 * the entry TSRX raises in the same words, or the {@link UpstreamError}.
 * @param {string} message
 * @returns {Diagnostic | DiagnosticWithValues | UpstreamError | undefined}
 */
export function get_upstream_error(message) {
	return UPSTREAM_LOOKUP.find((row) => row.pattern.test(message))?.error;
}

/**
 * The {@link Diagnostic} for an error acorn or acorn-typescript raises, with
 * its code from the lookup, if the lookup has it.
 * @param {string} message
 * @returns {{ code: string | undefined, message: string }}
 */
export function upstream_diagnostic(message) {
	return { code: get_upstream_error(message)?.code, message };
}
