import * as Vue from 'vue';
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

function DirectPending() @{
	<div class="direct">
		<TsrxPendingBody content={() => <i class="direct-wait">{'wait ' + count.value}</i>} />
	</div>
}

async function mount_in(create: typeof createVaporApp, selector: string) {
	count.value = 0;
	const host = document.createElement('div');
	document.body.append(host);
	const app = create(DirectPending);
	app.config.warnHandler = () => {};
	try {
		app.mount(host);
		await flush();
		const before = host.querySelector(selector)?.textContent;
		count.value = 1;
		await flush();
		return [before, host.querySelector(selector)?.textContent, host.textContent];
	} finally {
		app.unmount();
		host.remove();
	}
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
	it('renders a @pending body in an app with interop after one without rendered it', async () => {
		// \`Vue.createVaporApp\` through the namespace gets no \`vaporInteropPlugin\`
		// from the plugin, unlike the named import.
		await mount_in(Vue.createVaporApp, '.direct-wait');
		const [before, after, text] = await mount_in(createVaporApp, '.direct-wait');
		expect([before, after]).toEqual(['wait 0', 'wait 1']);
		expect(text).not.toContain('[object');
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
	// Last: the tests above rendered both through Vapor.
	it('marks the boundaries Vapor components once Vapor renders them', () => {
		expect(TsrxErrorBoundary.__vapor).toBe(true);
		expect(TsrxPendingBody.__vapor).toBe(true);
	});
});
