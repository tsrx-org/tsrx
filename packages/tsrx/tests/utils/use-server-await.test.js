/** @import * as AST from 'estree' */
/** @import { CompileError, JsxPlatform } from '../../types/index' */

import { describe, expect, it } from 'vitest';
import { createJsxTransform, parseModule, TSRX_ERRORS } from '../../src/index.js';

/** @type {JsxPlatform} */
const PLATFORM = {
	name: 'use-server-test',
	imports: {
		fragment: 'test-platform',
		suspense: 'test-platform',
		dynamic: 'test-platform/dynamic',
		errorBoundary: 'test-platform/error-boundary',
	},
	jsx: { rewriteClassAttr: false, classAttrName: 'class' },
	validation: { requireUseServerForAwait: true },
};

/**
 * @param {string} source
 * @param {{ collect?: boolean, typeOnly?: boolean, platform?: JsxPlatform }} [options]
 */
function compile(source, { collect = false, typeOnly = false, platform = PLATFORM } = {}) {
	/** @type {CompileError[]} */
	const errors = [];
	/** @type {AST.CommentWithLocation[]} */
	const comments = [];
	const ast = parseModule(source, 'App.tsrx', { collect, errors, comments });
	const { code } = createJsxTransform(platform)(ast, source, 'App.tsrx', {
		collect,
		typeOnly,
		errors,
		comments,
	});
	return { code, errors };
}

const COMPONENT = `export async function App() @{
	const value = await load();
	<p>{value}</p>
}`;

describe('requireUseServerForAwait checks for a module-level "use server" directive (#887)', () => {
	it.each([
		["'use server'", `'use server';\n\n${COMPONENT}`],
		['"use server"', `"use server";\n\n${COMPONENT}`],
		['"use server" after another directive', `'use client';\n'use server';\n\n${COMPONENT}`],
	])('allows a top-level await with %s', (_label, source) => {
		expect(compile(source).code).toContain('export async function App()');
		expect(compile(source, { collect: true }).errors).toEqual([]);
		expect(compile(source, { collect: true, typeOnly: true }).errors).toEqual([]);
	});

	it.each([
		['no directive', COMPONENT],
		[
			"'use server' after an import, where it isn't a directive",
			`import { load } from './load';\n'use server';\n\n${COMPONENT}`,
		],
		["a parenthesized 'use server', which isn't a directive", `('use server');\n\n${COMPONENT}`],
		['"use client"', `'use client';\n\n${COMPONENT}`],
	])('reports a top-level await with %s', (_label, source) => {
		const error = expect.objectContaining({
			...TSRX_ERRORS.TOP_LEVEL_AWAIT_USE_SERVER,
			pos: source.indexOf('await'),
		});
		expect(() => compile(source)).toThrow(error);
		expect(compile(source, { collect: true }).errors).toEqual([error]);
		expect(compile(source, { collect: true, typeOnly: true }).errors).toEqual([error]);
	});

	it.each([
		['with the directive', `'use server';\n\n${COMPONENT}`, true],
		['without it', COMPONENT, false],
	])(
		"tells a target's await validator whether the module has it, %s",
		(_label, source, expected) => {
			/** @type {boolean[]} */
			const seen = [];
			/** @type {JsxPlatform} */
			const platform = {
				...PLATFORM,
				hooks: {
					validateComponentAwait(_await_node, _component, _ctx, module_uses_server_directive) {
						seen.push(module_uses_server_directive);
					},
				},
			};
			compile(source, { platform });
			expect(seen).toEqual([expected]);

			seen.length = 0;
			compile(source, {
				platform: {
					...platform,
					validation: {
						...platform.validation,
						scanUseServerDirectiveForAwaitWithCustomValidator: false,
					},
				},
			});
			expect(seen).toEqual([false]);
		},
	);
});
