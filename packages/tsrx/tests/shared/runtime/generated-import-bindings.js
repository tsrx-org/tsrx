import { describe, expect, it } from 'vitest';
import {
	LocalSuspenseNameApp,
	LoopVariableFragmentNameApp,
	ModuleErrorBoundaryNameApp,
} from './generated-import-bindings-components.tsrx';

/**
 * Shared runtime suite for the components the compiler imports itself
 * (`Suspense`, `Fragment`, `TsrxErrorBoundary`). An authored binding with one
 * of those names neither breaks the build nor replaces the generated element.
 */
export function runGeneratedImportBindingsRuntimeTests() {
	async function settle() {
		const flush = globalThis.flush;
		if (flush) {
			await flush();
		}
	}

	/** @param {unknown} Component */
	async function mount(Component) {
		await globalThis.render(Component, {});
		await settle();
	}

	/** @param {string} selector */
	function texts(selector) {
		return [...globalThis.container.querySelectorAll(selector)].map((node) => node.textContent);
	}

	describe('generated imports beside authored bindings', () => {
		it('renders the generated error boundary beside a module binding of its name', async () => {
			await mount(ModuleErrorBoundaryNameApp);

			expect(texts('.authored-error-boundary .authored-error-boundary-child')).toEqual([
				'authored',
			]);
			expect(texts('.generated-error-boundary-child')).toEqual(['ready']);
			expect(texts('.authored-error-boundary .generated-error-boundary-child')).toEqual([]);
		});

		it('renders the generated Suspense when setup declares a local Suspense', async () => {
			await mount(LocalSuspenseNameApp);

			expect(texts('.local-suspense .authored-suspense-child')).toEqual(['authored']);
			expect(texts('.generated-suspense-child')).toEqual(['ready']);
			expect(texts('.local-suspense .generated-suspense-child')).toEqual([]);
		});

		it('renders keyed fragment rows when the loop variable is named Fragment', async () => {
			await mount(LoopVariableFragmentNameApp);

			expect(texts('.fragment-rows > li')).toEqual(['a', 'A', 'b', 'B']);
		});
	});
}
