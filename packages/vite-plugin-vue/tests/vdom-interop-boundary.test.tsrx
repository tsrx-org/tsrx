import { createApp, h, vaporInteropPlugin } from 'vue';
import { TsrxErrorBoundary, TsrxPendingBody } from '@tsrx/vue/error-boundary';

// In its own file, so no Vapor app has rendered the boundaries yet: a realm
// that can render Vapor flags them as Vapor components when it loads them, so
// a VDOM app with the interop mounts them through the interop.
describe('tsrx-vue a boundary a VDOM app renders', () => {
	it.each([
		[
			'TsrxErrorBoundary',
			() =>
				h(TsrxErrorBoundary as never, {
					content: () => document.createElement('button'),
					fallback: () => document.createElement('b'),
				}),
		],
		[
			'TsrxPendingBody',
			() => h(TsrxPendingBody as never, { content: () => document.createElement('button') }),
		],
	])('mounts %s as a Vapor component with the interop', async (_name, render) => {
		const host = document.createElement('div');
		document.body.append(host);
		const app = createApp({ render }).use(vaporInteropPlugin);
		try {
			app.mount(host);
			await flush();
			expect(host.innerHTML).toBe('<button></button>');
		} finally {
			app.unmount();
			host.remove();
		}
	});

	it('keeps the flag on a copy, and takes a value written over it', () => {
		const copy = Object.assign((...args: unknown[]) => args, TsrxErrorBoundary);
		expect(copy.__vapor).toBe(true);
		expect({ ...TsrxPendingBody }.__vapor).toBe(true);
		const written = (() => {}) as unknown as { __vapor: boolean };
		Object.defineProperty(
			written,
			'__vapor',
			Object.getOwnPropertyDescriptor(TsrxErrorBoundary, '__vapor') as PropertyDescriptor,
		);
		Object.assign(written, { __vapor: false });
		expect(written.__vapor).toBe(false);
	});
});
