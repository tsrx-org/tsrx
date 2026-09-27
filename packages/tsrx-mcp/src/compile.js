import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { DIAGNOSTIC_CODES } from '@tsrx/core';
import { detect_target, TARGET_CANDIDATES } from './target.js';

const VALID_TARGETS = new Set(TARGET_CANDIDATES.map((candidate) => candidate.target));

/**
 * @typedef {{
 *   message: string,
 *   code: string | null,
 *   type: string | null,
 *   fileName: string | null,
 *   pos: number | null,
 *   end: number | null,
 *   raisedAt: number | null,
 *   loc: unknown
 * }} NormalizedCompileError
 */

/**
 * @param {string | null | undefined} target
 */
function get_target_candidate(target) {
	if (!target) return null;
	return TARGET_CANDIDATES.find((candidate) => candidate.target === target) ?? null;
}

/**
 * The codes of `@tsrx/core` before 0.5.0 (tsrx-org/tsrx#843), which a target's
 * compiler built on an older core still reports, with today's code for each.
 * @type {Record<string, string>}
 */
const LEGACY_CODES = {
	'tsrx-platform-required': DIAGNOSTIC_CODES.PLATFORM_REQUIRED,
	'tsrx-unclosed-tag': DIAGNOSTIC_CODES.UNCLOSED_TAG,
	'tsrx-mismatched-closing-tag': DIAGNOSTIC_CODES.MISMATCHED_CLOSING_TAG,
	'tsrx-template-expression-trailing-semicolon':
		DIAGNOSTIC_CODES.TEMPLATE_EXPRESSION_TRAILING_SEMICOLON,
	'tsrx-template-return-statement': DIAGNOSTIC_CODES.TEMPLATE_RETURN_STATEMENT,
	'tsrx-forgotten-statement-container': DIAGNOSTIC_CODES.FORGOTTEN_STATEMENT_CONTAINER,
	'tsrx-jsx-spread-child': DIAGNOSTIC_CODES.JSX_SPREAD_CHILD,
	'tsrx-dynamic-tag-expression': DIAGNOSTIC_CODES.DYNAMIC_TAG_EXPRESSION,
	'tsrx-style-apply-value': DIAGNOSTIC_CODES.STYLE_APPLY_VALUE,
	'tsrx-style-apply-target': DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
	'tsrx-style-apply-before-declaration': DIAGNOSTIC_CODES.STYLE_APPLY_BEFORE_DECLARATION,
	'tsrx-style-apply-duplicate': DIAGNOSTIC_CODES.STYLE_APPLY_DUPLICATE,
	'tsrx-style-apply-unsupported-host': DIAGNOSTIC_CODES.STYLE_APPLY_UNSUPPORTED_HOST,
	'tsrx-style-reserved-class-key': DIAGNOSTIC_CODES.STYLE_RESERVED_CLASS_KEY,
	'tsrx-style-standalone-at-module-scope': DIAGNOSTIC_CODES.STYLE_STANDALONE_AT_MODULE_SCOPE,
	'tsrx-style-standalone-outside-template': DIAGNOSTIC_CODES.STYLE_STANDALONE_OUTSIDE_TEMPLATE,
	'tsrx-style-standalone-needs-fragment': DIAGNOSTIC_CODES.STYLE_STANDALONE_NEEDS_FRAGMENT,
	'tsrx-style-unknown-attribute': DIAGNOSTIC_CODES.STYLE_UNKNOWN_ATTRIBUTE,
	'tsrx-css-global-placement': DIAGNOSTIC_CODES.CSS_GLOBAL_PLACEMENT,
	'tsrx-css-import': DIAGNOSTIC_CODES.CSS_IMPORT,
	'tsrx-script-end-tag-in-body': DIAGNOSTIC_CODES.SCRIPT_END_TAG_IN_BODY,
};

/**
 * @param {unknown} error
 * @param {string} filename
 * @returns {NormalizedCompileError}
 */
function normalize_error(error, filename) {
	if (error && typeof error === 'object') {
		const candidate = /** @type {Record<string, unknown>} */ (error);
		return {
			message: candidate.message ? String(candidate.message) : String(error),
			code: candidate.code
				? (LEGACY_CODES[String(candidate.code)] ?? String(candidate.code))
				: null,
			type: candidate.type ? String(candidate.type) : null,
			fileName: candidate.fileName ? String(candidate.fileName) : filename,
			pos: typeof candidate.pos === 'number' ? candidate.pos : null,
			end: typeof candidate.end === 'number' ? candidate.end : null,
			raisedAt: typeof candidate.raisedAt === 'number' ? candidate.raisedAt : null,
			loc: candidate.loc ?? null,
		};
	}
	return {
		message: String(error),
		code: null,
		type: null,
		fileName: filename,
		pos: null,
		end: null,
		raisedAt: null,
		loc: null,
	};
}

/**
 * @param {unknown} errors
 * @param {string} filename
 */
function normalize_errors(errors, filename) {
	return Array.isArray(errors) ? errors.map((error) => normalize_error(error, filename)) : [];
}

/**
 * @param {string} cwd
 * @param {string | null} package_json_path
 */
function create_project_require(cwd, package_json_path) {
	return createRequire(package_json_path ?? path.join(path.resolve(cwd), 'package.json'));
}

/**
 * @param {string} compiler_package
 * @param {string} cwd
 * @param {string | null} package_json_path
 */
async function import_compiler(compiler_package, cwd, package_json_path) {
	const project_require = create_project_require(cwd, package_json_path);
	const resolved = project_require.resolve(compiler_package);
	return import(pathToFileURL(resolved).href);
}

/**
 * @param {{ code: string }} result
 */
function get_generated_code(result) {
	if (!result || typeof result !== 'object') return null;
	return result.code || null;
}

/**
 * @param {{ css: string }} result
 */
function get_generated_css(result) {
	if (!result || typeof result !== 'object') return null;
	return result.css || null;
}

/**
 * @param {{
 *   code: string,
 *   filename?: string,
 *   target?: string,
 *   cwd?: string,
 *   collect?: boolean,
 *   loose?: boolean,
 *   includeCode?: boolean,
 *   mode?: 'client' | 'server'
 * }} input
 */
export async function compile_tsrx(input) {
	const filename = input.filename ?? 'Component.tsrx';
	const detection = detect_target(input.cwd);
	const cwd = detection.cwd;
	const target = input.target ?? detection.detectedTarget;

	if (!target) {
		return {
			ok: false,
			target: null,
			compilerPackage: null,
			filename,
			cwd,
			errors: [
				{
					message:
						detection.confidence === 'ambiguous'
							? detection.message
							: `Could not infer a TSRX target. Pass target explicitly. ${detection.message}`,
					code: null,
					type: null,
					fileName: filename,
					pos: null,
					end: null,
					raisedAt: null,
					loc: null,
				},
			],
			code: null,
			css: null,
		};
	}

	if (!VALID_TARGETS.has(target)) {
		return {
			ok: false,
			target,
			compilerPackage: null,
			filename,
			cwd,
			errors: [
				{
					message: `Unknown TSRX target "${target}".`,
					code: null,
					type: null,
					fileName: filename,
					pos: null,
					end: null,
					raisedAt: null,
					loc: null,
				},
			],
			code: null,
			css: null,
		};
	}

	const candidate = get_target_candidate(target);
	if (!candidate) {
		throw new Error(`Missing compiler candidate for target "${target}".`);
	}
	const compiler_package =
		target === 'hono' && input.mode === 'client' ? '@tsrx/hono/dom' : candidate.compilerPackage;

	try {
		const compiler = await import_compiler(compiler_package, cwd, detection.packageJsonPath);
		if (typeof compiler.compile !== 'function') {
			throw new Error(`${compiler_package} does not export a compile() function.`);
		}

		const result = compiler.compile(input.code, filename, {
			collect: input.collect ?? true,
			loose: input.loose,
			mode: input.mode,
		});
		const errors = normalize_errors(result?.errors, filename);
		const code = get_generated_code(result);
		const css = get_generated_css(result);

		return {
			ok: errors.length === 0,
			target,
			compilerPackage: compiler_package,
			filename,
			cwd,
			errors,
			code: input.includeCode ? code : null,
			css: input.includeCode ? css : null,
		};
	} catch (error) {
		return {
			ok: false,
			target,
			compilerPackage: compiler_package,
			filename,
			cwd,
			errors: [normalize_error(error, filename)],
			code: null,
			css: null,
		};
	}
}
