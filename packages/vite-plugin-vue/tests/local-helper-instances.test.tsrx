import type { MockInstance } from 'vitest';
import { defineVaporComponent } from 'vue-jsx-vapor';
import {
	TwoCaptureFree,
	TwoCapturing,
} from '@tsrx/core/test-harness/runtime/local-helper-instances-components.tsrx';

// Count the components the compiled fixtures define, by name.
vi.mock('vue-jsx-vapor', async (import_original) => {
	const original = await import_original<typeof import('vue-jsx-vapor')>();
	return { ...original, defineVaporComponent: vi.fn(original.defineVaporComponent) };
});

function definitions_of(prefix: string) {
	return vi
		.mocked(defineVaporComponent)
		.mock.calls.filter((call) => String((call[0] as { name?: string })?.name).startsWith(prefix))
		.length;
}

function texts(selector: string) {
	return Array.from(container.querySelectorAll(selector), (node) => node.textContent);
}

let console_error_spy: MockInstance | undefined;

beforeEach(() => {
	const original_console_error = console.error;
	console_error_spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
		if (
			args.some((arg) =>
				String(arg instanceof Error ? arg.message : arg).includes('local helper boom'),
			)
		) {
			return;
		}
		original_console_error(...args);
	});
});

afterEach(() => {
	console_error_spy?.mockRestore();
});

describe('local helper components', () => {
	it('defines a helper that captures nothing once for every instance of its component', async () => {
		await render(TwoCaptureFree);
		await flush();

		expect(texts('.capture-free-caught')).toEqual([
			'caught: local helper boom',
			'caught: local helper boom',
		]);
		expect(definitions_of('CaptureFree__StatementBodyHook')).toBe(1);
	});

	it('defines a helper that reads a setup binding in each instance', async () => {
		await render(TwoCapturing);
		await flush();

		expect(texts('.capturing-caught')).toEqual(['local helper boom!', 'local helper boom!']);
		expect(definitions_of('Capturing__StatementBodyHook')).toBe(2);
	});
});
