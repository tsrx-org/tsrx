import { createVaporApp, createVaporSSRApp, defineVaporAsyncComponent, ref } from 'vue';
import { TsrxErrorBoundary, TsrxPendingBody } from '@tsrx/vue/error-boundary';

// In its own file, so the first app that renders the boundary hydrates.
// vue-jsx-vapor renders a function component, such as `TsrxErrorBoundary`,
// through one proxy per function, and the app that first makes the proxy
// decides whether it says the component is a Vapor one. A hydrating app here
// has no `vaporInteropPlugin`; the test setup's `createVaporApp` installs it,
// and with it a component the proxy doesn't call a Vapor one mounts as a VDOM
// component.

const count = ref(0);

function TryInElement() @{
	<div>
		<h1>{'title'}</h1>
		@try {
			<button class="inc" onClick={() => count.value++}>
				{'count ' + count.value}
			</button>
		} @catch (err) {
			<b class="caught">{String(err)}</b>
		}
		<p>{'after'}</p>
	</div>
}

function never(): Promise<typeof Loaded> {
	return new Promise(() => {});
}

function Loaded() @{
	<p>{'loaded'}</p>
}

function PendingWithCatch() @{
	const AsyncChild = defineVaporAsyncComponent(never);
	<div>
		@try {
			<AsyncChild />
		} @pending {
			<i class="wait">{'wait ' + count.value}</i>
		} @catch (err) {
			<b class="caught">{String(err)}</b>
		}
	</div>
}

async function hydrate(component: unknown, markup: string) {
	container.innerHTML = markup;
	const errors: unknown[] = [];
	const app = createVaporSSRApp(component as Parameters<typeof createVaporSSRApp>[0]);
	app.config.errorHandler = (error) => {
		errors.push(error);
	};
	app.config.warnHandler = () => {};
	app.mount(container);
	await flush();
	app.unmount();
	return errors;
}

describe('tsrx-vue a page that hydrates, then mounts another app', () => {
	it('marks the boundaries Vapor components', () => {
		expect(TsrxErrorBoundary.__vapor).toBe(true);
		expect(TsrxPendingBody.__vapor).toBe(true);
	});

	it('renders @try bodies as elements in an app mounted after hydrating a @try', async () => {
		count.value = 0;
		expect(
			await hydrate(
				TryInElement,
				'<div><h1>title</h1><button class="inc">count 0</button><p>after</p></div>',
			),
		).toEqual([]);

		for (const [component, selector] of [
			[TryInElement, '.inc'],
			[PendingWithCatch, '.wait'],
		] as const) {
			count.value = 0;
			const host = document.createElement('div');
			document.body.append(host);
			const app = createVaporApp(component);
			try {
				app.mount(host);
				await flush();
				expect(host.querySelector(selector)?.textContent).toMatch(/ 0$/);
				expect(host.textContent).not.toContain('[object');
				count.value = 1;
				await flush();
				expect(host.querySelector(selector)?.textContent).toMatch(/ 1$/);
			} finally {
				app.unmount();
				host.remove();
			}
		}
	});
});
