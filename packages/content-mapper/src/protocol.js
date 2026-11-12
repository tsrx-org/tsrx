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

/**
 * Diagnostic-directive policies: `Ignore` hides TypeScript's errors in a
 * generated range; `Expect` also reports a diagnostic of the mapper's when
 * there are none there.
 */
export const DiagnosticDirectivePolicy = /** @type {const} */ ({ Ignore: 0, Expect: 1 });

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
 * Not part of the TypeScript 7 protocol: what the `verificationMappings` mapper
 * option adds to a transform result for command-line checkers. Every compiler
 * mapping marked for diagnostics, in Volar's `CodeMapping` shape and in the
 * transform's order, so `new SourceMap(verificationMappings).toSourceRange(start,
 * end, true)` from `@volar/source-map` maps a diagnostic as `tsrx-tsc` does.
 * Points (offsets with zero length) belong to the mapping they are listed in.
 * Empty when the transform has a mapping whose verification is a `shouldReport`
 * callback, which can't be serialized.
 * @typedef {object} VerificationMapping
 * @property {number[]} sourceOffsets
 * @property {number[]} generatedOffsets
 * @property {number[]} lengths
 * @property {number[]} generatedLengths
 * @property {{ verification: true }} data
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
 * @typedef {[
 * 	originalStart: number,
 * 	originalLength: number,
 * 	generatedStart: number,
 * 	generatedEnd: number,
 * 	policy: 0 | 1,
 * 	unusedExpectDirectiveIndex?: number,
 * ]} DiagnosticDirective
 */

/**
 * @typedef {object} DiagnosticDirectives
 * @property {Array<{ code: number, messageText: string }>} unusedExpectDirectiveDiagnostics What an `Expect` directive reports when TypeScript has no error in its range.
 * @property {DiagnosticDirective[]} directives
 */

/**
 * @typedef {MappedOutput & {
 * 	diagnostics?: MapperDiagnostic[],
 * 	diagnosticDirectives?: DiagnosticDirectives,
 * 	supplemental?: MappedOutput[],
 * 	verificationMappings?: VerificationMapping[],
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
