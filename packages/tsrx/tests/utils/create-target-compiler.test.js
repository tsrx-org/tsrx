/** @import { JsxPlatform } from '../../types/index' */

import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '../../src/diagnostics.js';
import { createTargetCompiler } from '../../src/index.js';

/**
 * `createTargetCompiler` owns the pipeline every target package ships:
 * parse → specialize platform → analyze → transform, plus the type-only
 * Volar variant. These tests exercise that seam through a synthetic platform
 * descriptor; per-target behavior stays covered by the shared harness in
 * `tests/shared/compile.js`.
 */

/** @type {JsxPlatform} */
const PLATFORM = {
	name: 'create-target-compiler-test',
	imports: {
		fragment: 'test-platform',
		suspense: 'test-platform',
		dynamic: 'test-platform/dynamic',
		errorBoundary: 'test-platform/error-boundary',
		refProp: 'test-platform/ref',
		forOfIterableHelper: 'test-platform/iterable',
	},
	jsx: { rewriteClassAttr: false, classAttrName: 'class' },
	validation: { requireUseServerForAwait: false },
	hooks: { moduleScopedHookComponents: true },
};

const { compile, compile_to_volar_mappings } = createTargetCompiler(PLATFORM);

// A `@switch` case body with a hook call triggers the hook-isolation helper
// machinery — the one place `moduleScopedHookComponents` changes output.
const HOOK_BEARING_SWITCH = `export function App({ status }: { status: string }) @{
	@switch (status) {
		@case "idle": {
			const idle_label = useMemo(() => 'Online', [status]);
			<span>{idle_label}</span>
		}
		@default: {
			<span>{'Offline'}</span>
		}
	}
}`;

describe('createTargetCompiler', () => {
	it('aggregates diagnostics from every stage under collect', () => {
		// `import.meta.env.platform.*` without a `platform` option is a
		// specialize-stage diagnostic; `<div />` without a statement container
		// is an analysis-stage one. Both must land in the same `errors` array.
		const source = `if (import.meta.env.platform.web) { consume(); }
function Test() { <div /> }`;

		expect(() => compile(source, 'App.tsrx')).toThrow();
		const { errors } = compile(source, 'App.tsrx', { collect: true });
		const codes = errors.map((error) => error.code);
		expect(codes).toContain(DIAGNOSTIC_CODES.PLATFORM_REQUIRED);
		expect(errors.length).toBeGreaterThanOrEqual(2);
	});

	it('strips `ast` from ordinary compile results', () => {
		const result = compile('export function App() @{ <div /> }', 'App.tsrx');

		expect('ast' in result).toBe(false);
		expect(result.code).toContain('App');
		expect(result.errors).toEqual([]);
	});

	it('keeps module-scoped hook helpers for compile, forces them off for Volar', () => {
		const client = compile(HOOK_BEARING_SWITCH, 'App.tsrx', { collect: true });
		expect(client.code).toMatch(/^function App__StatementBodyHook\d+\(/m);
		expect(client.code).not.toContain('let App__StatementBodyHook');

		const volar = compile_to_volar_mappings(HOOK_BEARING_SWITCH, 'App.tsrx', {
			loose: true,
		});
		expect(volar.code).toContain('let App__StatementBodyHook');
		expect(volar.code).not.toMatch(/^function App__StatementBodyHook\d+\(/m);
	});

	it('specializes platform branches through the `platform` option', () => {
		const source = `if (import.meta.env.platform.web) {
	const selected_web = 'web';
} else {
	const selected_ios = 'ios';
}`;
		const web = compile(source, 'App.tsrx', { platform: 'web' });
		const ios = compile(source, 'App.tsrx', { platform: 'ios' });

		expect(web.code).toContain('selected_web');
		expect(web.code).not.toContain('selected_ios');
		expect(ios.code).toContain('selected_ios');
		expect(ios.code).not.toContain('selected_web');
	});
});
