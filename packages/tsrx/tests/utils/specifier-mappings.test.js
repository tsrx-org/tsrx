/** @import * as AST from 'estree' */
/** @import { CompileError, JsxPlatform } from '../../types/index' */

import { describe, expect, it } from 'vitest';
import {
	analyzeTsrx,
	createJsxTransform,
	createVolarMappingsResult,
	parseModule,
} from '../../src/index.js';

/**
 * A platform's AST pass can rename an import's local name in place, keeping
 * its location (`import { missing }` printed as `missing as _$_missing`).
 * Both printed names are the one source name's: an error on the imported
 * name (TS2305) and the local's hover map to it.
 */

/** @type {JsxPlatform} */
const PLATFORM = {
	name: 'specifier-mapping-test',
	imports: {
		fragment: 'test-platform',
		suspense: 'test-platform',
		dynamic: 'test-platform/dynamic',
		errorBoundary: 'test-platform/error-boundary',
		forOfIterableHelper: 'test-platform/iterable',
	},
	jsx: { rewriteClassAttr: false, classAttrName: 'class' },
	validation: { requireUseServerForAwait: false },
};

/**
 * Compile for the editor after renaming the local name of each import
 * specifier to `_$_<name>`, with its location.
 * @param {string} source
 */
function compile_renamed(source) {
	/** @type {CompileError[]} */
	const errors = [];
	/** @type {AST.CommentWithLocation[]} */
	const comments = [];
	const ast = parseModule(source, 'App.tsrx', {
		collect: true,
		loose: true,
		preserveParens: true,
		keywordTokens: true,
		errors,
		comments,
	});
	analyzeTsrx(ast, 'App.tsrx', { collect: true, loose: true, typeOnly: true, errors, comments });
	for (const statement of ast.body) {
		if (statement.type !== 'ImportDeclaration') continue;
		for (const specifier of statement.specifiers) {
			if (specifier.type !== 'ImportSpecifier') continue;
			const local = /** @type {any} */ (specifier.local);
			specifier.local = /** @type {any} */ ({
				...local,
				name: `_$_${local.name}`,
				metadata: { ...local.metadata, source_name: local.name },
			});
		}
	}
	const transformed = createJsxTransform(PLATFORM)(ast, source, 'App.tsrx', {
		collect: true,
		loose: true,
		typeOnly: true,
		errors,
		comments,
	});
	const { mappings } = createVolarMappingsResult({
		ast: transformed.ast,
		ast_from_source: ast,
		source,
		generated_code: transformed.code,
		source_map: transformed.map,
		errors,
	});
	return { code: transformed.code, mappings };
}

describe('an import specifier whose local name a platform renames in place', () => {
	it('maps both printed names to the source name', () => {
		const source = "import { missing } from './lib';\n";
		const { code, mappings } = compile_renamed(source);
		expect(code).toContain('import { missing as _$_missing }');
		const offset = source.indexOf('missing');
		const printed = mappings
			.filter((mapping) => mapping.sourceOffsets[0] === offset && mapping.data.verification)
			.map((mapping) =>
				code.slice(
					mapping.generatedOffsets[0],
					mapping.generatedOffsets[0] + (mapping.generatedLengths ?? mapping.lengths)[0],
				),
			)
			.sort();
		expect(printed).toEqual(['_$_missing', 'missing']);
	});
});
