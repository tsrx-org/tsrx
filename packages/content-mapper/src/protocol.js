/**
 * Constants of the TypeScript 7 content-mapper protocol, kept in sync with
 * `tsc/internal/contentmapper` and `tsc/internal/spanmap` in microsoft/TypeScript.
 */

/** Span kinds. */
export const SpanMapKind = /** @type {const} */ ({
	/** Same length and identical text; the only kind that supports text edits. */
	Verbatim: 0,
	/** Same entity, different text or length. */
	Atom: 1,
	/** Different text; diagnostics covering the whole span exactly show the original text. */
	Alias: 2,
});

/** Feature bits a span opts into. Diagnostics ignore them. */
export const SpanMapFeature = /** @type {const} */ ({
	Hover: 1 << 0,
	SignatureHelp: 1 << 1,
	Completion: 1 << 2,
	Definition: 1 << 3,
	TypeDefinition: 1 << 4,
	Implementation: 1 << 5,
	References: 1 << 6,
	DocumentHighlights: 1 << 7,
	Rename: 1 << 8,
	CallHierarchy: 1 << 9,
	CodeActions: 1 << 10,
	Formatting: 1 << 11,
	InlayHints: 1 << 12,
	SemanticTokens: 1 << 13,
	FoldingRanges: 1 << 14,
	SelectionRanges: 1 << 15,
	LinkedEditing: 1 << 16,
	AutoInsert: 1 << 17,
	DocumentSymbols: 1 << 18,
	CodeLens: 1 << 19,
	None: 0,
	All: (1 << 20) - 1,
});

/** Diagnostic-directive policies (unused by TSRX today; kept for completeness). */
export const DiagnosticDirectivePolicy = /** @type {const} */ ({ Ignore: 0, Expect: 1 });

/** Prefix for mapper-authored diagnostics: `error tsrx(1000): ...`. */
export const DIAGNOSTIC_SOURCE = 'tsrx';

/** Numeric code for a fatal compile error (the file could not be transformed). */
export const DIAGNOSTIC_CODE_COMPILE_ERROR = 1000;
/** Numeric code for a usage error that carries no string code. */
export const DIAGNOSTIC_CODE_USAGE_ERROR = 1001;
/** Numeric code when no TSRX compiler can be resolved for a file. */
export const DIAGNOSTIC_CODE_NO_COMPILER = 1002;
/** Numeric code when the project's TSRX configuration is invalid. */
export const DIAGNOSTIC_CODE_INVALID_CONFIG = 1003;

/**
 * @typedef {[
 * 	generatedStart: number,
 * 	generatedLength: number,
 * 	originalStart: number,
 * 	originalLength: number,
 * 	kind: 0 | 1 | 2,
 * 	features: number,
 * ]} SpanMapping
 */

/**
 * @typedef {object} MapperDiagnostic
 * @property {number} start Offset into the original text (UTF-16 code units).
 * @property {number} length
 * @property {number} code
 * @property {string} messageText
 */

/**
 * @typedef {object} MappedOutput
 * @property {string} text
 * @property {'.js' | '.jsx' | '.mjs' | '.cjs' | '.ts' | '.tsx' | '.mts' | '.cts' | '.json'} extension
 * @property {SpanMapping[]} mappings
 */

/**
 * @typedef {MappedOutput & {
 * 	diagnostics?: MapperDiagnostic[],
 * 	supplemental?: MappedOutput[],
 * }} TransformResult
 */

/**
 * @typedef {object} InitializeParams
 * @property {string} [locale]
 * @property {Array<'utf-8' | 'utf-16'>} positionEncodings
 */

/**
 * @typedef {object} InitializeResult
 * @property {'utf-8' | 'utf-16'} positionEncoding
 * @property {string} diagnosticSource
 */

/**
 * @typedef {object} OpenProjectParams
 * @property {string} configFileName Empty for inferred projects.
 * @property {string} projectHandle
 * @property {Record<string, unknown>} [options] The mapper entry's `options` object.
 * @property {Record<string, unknown>} compilerOptions Effective compiler options (wire format).
 */

/**
 * @typedef {object} OpenProjectResult
 * @property {string} configIdentity
 * @property {string[]} [watchedFiles]
 * @property {Array<{ path: Array<string | number>, messageText: string, code: number }>} [optionDiagnostics]
 */

/**
 * @typedef {object} TransformParams
 * @property {string} fileName
 * @property {string} content
 * @property {string} [projectHandle]
 */
