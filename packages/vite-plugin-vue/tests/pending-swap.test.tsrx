import {
	createApp,
	createVaporApp,
	defineComponent,
	defineVaporAsyncComponent,
	defineVaporComponent as makeVaporComponent,
	h,
	onScopeDispose,
	ref,
	Suspense,
	vaporInteropPlugin,
	watch,
} from 'vue';

const active_broken = ref(false);

function active_label(): string {
	if (active_broken.value) throw new Error('active body');
	return 'ok';
}

function ActiveThrower() @{
	<p class="active-body">{active_label()}</p>
}

function ActiveTry() @{
	@try {
		<ActiveThrower />
	} @catch (err) {
		<b class="active-caught">{String(err)}</b>
	}
}

const late_shown = ref(false);
let finish_late: (component: unknown) => void = () => {};

function LateFine() @{
	<p class="late-ready">{'late ready'}</p>
}

// After the Suspense has resolved, the @try's body shows an async component
// that the Suspense doesn't wait for.
function ActiveTryWithLate() @{
	const Late = defineVaporAsyncComponent(
		() => new Promise<any>((resolve) => (finish_late = resolve)),
	);
	@try {
		<>
			@if (late_shown.value) {
				<Late />
			}
			<ActiveThrower />
		</>
	} @catch (err) {
		<b class="active-caught">{String(err)}</b>
	}
}

/**
 * Mounts `component` as the first branch of a keyed `Suspense` that keeps it
 * on screen while a second branch loads, and switches to that branch.
 */
async function mount_kept(component: unknown, before_switch?: () => Promise<void>) {
	const key = ref('old');
	let finish_new: () => void = () => {};
	const New = defineComponent({
		async setup() {
			await new Promise<void>((resolve) => (finish_new = resolve));
			return () => h('p', 'new');
		},
	});
	const Root = defineComponent({
		setup() {
			return () =>
				h(
					Suspense,
					{ timeout: -1 },
					{
						default: () =>
							key.value === 'old' ? h(component as never, { key: 'old' }) : h(New, { key: 'new' }),
						fallback: () => h('i', 'loading'),
					},
				);
		},
	});
	const handled: string[] = [];
	const app = createApp(Root).use(vaporInteropPlugin);
	app.config.errorHandler = (error) => {
		handled.push(String(error));
	};
	app.mount(container);
	await flush();
	await before_switch?.();
	key.value = 'new';
	await flush();
	return { app, handled, key, finish: () => finish_new() };
}

// A Suspense keeps showing a @try while a new branch loads: the @try isn't in
// the branch the Suspense waits for, so its @catch shows at once.
describe('tsrx-vue a @try in the branch a pending Suspense still shows', () => {
	it('shows its @catch at once, also beside an async component the Suspense does not wait for', async () => {
		active_broken.value = false;
		late_shown.value = false;
		const { app, handled, key, finish } = await mount_kept(ActiveTryWithLate, async () => {
			late_shown.value = true;
			await flush();
		});
		active_broken.value = true;
		await flush();
		expect(container.querySelector('.active-caught')?.textContent).toBe('Error: active body');
		key.value = 'old';
		await flush();
		expect(container.querySelector('.active-caught')?.textContent).toBe('Error: active body');
		expect(handled).toEqual([]);
		finish_late(LateFine);
		finish();
		app.unmount();
	});

	it('shows its @catch at once, and keeps it when that branch comes back', async () => {
		active_broken.value = false;
		const key = ref('old');
		let finish_new: () => void = () => {};
		const New = defineComponent({
			async setup() {
				await new Promise<void>((resolve) => (finish_new = resolve));
				return () => h('p', 'new');
			},
		});
		const Root = defineComponent({
			setup() {
				return () =>
					h(
						Suspense,
						{ timeout: -1 },
						{
							default: () =>
								key.value === 'old'
									? h(ActiveTry as never, { key: 'old' })
									: h(New, { key: 'new' }),
							fallback: () => h('i', 'loading'),
						},
					);
			},
		});
		const handled: string[] = [];
		const app = createApp(Root).use(vaporInteropPlugin);
		app.config.errorHandler = (error) => {
			handled.push(String(error));
		};
		app.mount(container);
		await flush();
		key.value = 'new';
		await flush();
		active_broken.value = true;
		await flush();
		expect(container.querySelector('.active-caught')?.textContent).toBe('Error: active body');
		key.value = 'old';
		await flush();
		expect(container.querySelector('.active-caught')?.textContent).toBe('Error: active body');
		expect(handled).toEqual([]);
		finish_new();
		app.unmount();
	});
});

const vdom_broken = ref(false);
let vdom_disposals = 0;

// A VDOM component whose async setup waits on work that its disposal
// releases, and whose watcher throws.
const CancelledOnDispose = defineComponent({
	async setup() {
		watch(vdom_broken, () => {
			throw new Error('watcher failed');
		});
		let release: () => void = () => {};
		const work = new Promise<void>((resolve) => (release = resolve));
		onScopeDispose(() => {
			vdom_disposals++;
			release();
		});
		await work;
		return () => null;
	},
});

function VdomTry() @{
	@try {
		<CancelledOnDispose />
	} @catch (err) {
		<b class="vdom-caught">{String(err)}</b>
	}
}

function VdomPending() @{
	<Suspense
		v-slots={{
			default: () => <VdomTry />,
			fallback: () => <i class="vdom-loading">{'loading'}</i>,
		}}
	/>
}

const first_error = ref(false);
const newer_error = ref(false);
let finish_work: (value: unknown) => void = () => {};
let work: Promise<unknown> = Promise.resolve();

// A Vapor component with an async setup and a watcher that throws.
const LoadingWithWatcher = makeVaporComponent(() => {
	watch(
		first_error,
		() => {
			throw new Error('first async');
		},
		{ flush: 'sync' },
	);
	work = new Promise((resolve) => (finish_work = resolve));
	return work as never;
});

function throw_newer() {
	watch(
		newer_error,
		() => {
			throw new Error('newer error');
		},
		{ flush: 'sync' },
	);
}

function NewerLocal() @{
	@try {
		throw_newer();
		<LoadingWithWatcher />
	} @catch (err) {
		<b class="newer-caught">{String(err)}</b>
	}
}

function NewerApp() @{
	@try {
		throw new Error('outer');
		<p />
	} @catch (_err) {
		<Suspense
			v-slots={{
				default: () => <NewerLocal />,
				fallback: () => <i class="newer-loading">{'loading'}</i>,
			}}
		/>
	}
}

describe('tsrx-vue a @try whose body throws while its Suspense is pending, again', () => {
	async function settle() {
		await flush();
		await new Promise((resolve) => setTimeout(resolve, 0));
		await flush();
	}

	it('swaps at once for a loading VDOM component, which Vue counts down as it unmounts', async () => {
		vdom_broken.value = false;
		vdom_disposals = 0;
		const handled: string[] = [];
		const app = createVaporApp(VdomPending);
		app.use(vaporInteropPlugin);
		app.config.errorHandler = (error) => {
			handled.push(String(error));
		};
		app.mount(container);
		await flush();
		expect(container.querySelector('.vdom-loading')?.textContent).toBe('loading');
		vdom_broken.value = true;
		await settle();
		expect(container.querySelector('.vdom-caught')?.textContent).toBe('Error: watcher failed');
		expect(vdom_disposals).toBe(1);
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('shows a newer error over one that waited for a loading component', async () => {
		first_error.value = false;
		newer_error.value = false;
		const handled: string[] = [];
		const app = createVaporApp(NewerApp);
		app.use(vaporInteropPlugin);
		app.config.errorHandler = (error) => {
			handled.push(String(error));
		};
		app.mount(container);
		await flush();
		expect(container.querySelector('.newer-loading')?.textContent).toBe('loading');
		work.then(() => queueMicrotask(() => (newer_error.value = true)));
		first_error.value = true;
		finish_work(document.createTextNode('loaded'));
		await settle();
		expect(container.querySelector('.newer-caught')?.textContent).toBe('Error: newer error');
		expect(handled).toEqual([]);
		app.unmount();
	});
});
