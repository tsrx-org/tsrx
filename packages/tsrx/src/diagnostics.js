export const DIAGNOSTIC_CODES = {
	JSX_EXPRESSION_VALUE: 'tsrx-jsx-expression-value',
	UNCLOSED_TAG: 'tsrx-unclosed-tag',
	MISMATCHED_CLOSING_TAG: 'tsrx-mismatched-closing-tag',
	TEMPLATE_EXPRESSION_TRAILING_SEMICOLON: 'tsrx-template-expression-trailing-semicolon',
	TEMPLATE_RETURN_STATEMENT: 'tsrx-template-return-statement',
	FORGOTTEN_STATEMENT_CONTAINER: 'tsrx-forgotten-statement-container',
	UNSUPPORTED_LAZY_ASSIGNMENT_POSITION: 'tsrx-unsupported-lazy-assignment-position',
	/** `<style apply>` carries no expression value. */
	STYLE_APPLY_VALUE: 'tsrx-style-apply-value',
	/** An `apply` entry is not an identifier, member, or array of those, or does not resolve to a style block. */
	STYLE_APPLY_TARGET: 'tsrx-style-apply-target',
	/** An `apply` target is declared after the applying block in source order. */
	STYLE_APPLY_BEFORE_DECLARATION: 'tsrx-style-apply-before-declaration',
	/** Two `apply` attributes on one `<style>` block. */
	STYLE_APPLY_DUPLICATE: 'tsrx-style-apply-duplicate',
	/** `apply` on a `<head>` style or a resource (`href`) style. */
	STYLE_APPLY_UNSUPPORTED_HOST: 'tsrx-style-apply-unsupported-host',
	/** An assigned style block authors a `.$class` class selector. */
	STYLE_RESERVED_CLASS_KEY: 'tsrx-style-reserved-class-key',
	/** A standalone `<style>` block at module scope. */
	STYLE_STANDALONE_AT_MODULE_SCOPE: 'tsrx-style-standalone-at-module-scope',
	/** A standalone `<style>` block with CSS text outside any `@{ … }` or control-flow body. */
	STYLE_STANDALONE_OUTSIDE_TEMPLATE: 'tsrx-style-standalone-outside-template',
	/** A standalone `<style>` block in a statement slot: the lone output of a `@{ … }` or control-flow body, or a statement. */
	STYLE_STANDALONE_NEEDS_FRAGMENT: 'tsrx-style-standalone-needs-fragment',
	/** A `<style>` attribute other than `ref` and `apply`. */
	STYLE_UNKNOWN_ATTRIBUTE: 'tsrx-style-unknown-attribute',
	/** `:global` used where the scoping rules do not allow it. */
	CSS_GLOBAL_PLACEMENT: 'tsrx-css-global-placement',
};
