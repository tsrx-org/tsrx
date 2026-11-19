import {
	createVaporApp,
	defineComponent,
	defineVaporAsyncComponent,
	h,
	nextTick,
	onMounted,
	ref,
	shallowRef,
	Suspense,
} from 'vue';
import { TsrxErrorBoundary, TsrxPendingBody } from '@tsrx/vue/error-boundary';

// A `@pending` body runs only while the `@try` body suspends, and a throw in
// it reaches the nearest `@catch`: the same `@try`'s, or an enclosing one.

let pending_runs = 0;

function pending_label() {
	pending_runs++;
	return 'loading';
}

function boom_label(): string {
	pending_runs++;
	throw new Error('pending boom');
}

function Resolved(props: { value: string }) @{
	<p class="resolved">{props.value}</p>
}

type Loader = Promise<typeof Resolved>;

function never(): Loader {
	return new Promise(() => {});
}

function deferred() {
	let resolve!: (component: typeof Resolved) => void;
	const promise: Loader = new Promise((r) => (resolve = r));
	return { promise, resolve };
}

function NoSuspendApp() @{
	const n = ref(0);
	<>
		<button class="bump" onClick={() => n.value++}>
			{'bump'}
		</button>
		@try {
			<p class="ready">{'ready ' + n.value}</p>
		} @pending {
			const label = pending_label();
			<p class="pending">{label}</p>
		}
	</>
}

function SuspendApp(props: { promise: Loader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<AsyncChild value="hello" />
	} @pending {
		const label = pending_label();
		<p class="pending">{label}</p>
	}
}

function ThrowingPendingNoSuspendApp() @{
	@try {
		<p class="ready">{'ready'}</p>
	} @pending {
		const label = boom_label();
		<p class="pending">{label}</p>
	} @catch (err) {
		<p class="caught">{(err as Error).message}</p>
	}
}

function ThrowingPendingApp(props: { promise: Loader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<AsyncChild value="hello" />
	} @pending {
		const label = boom_label();
		<p class="pending">{label}</p>
	} @catch (err) {
		<p class="caught">{(err as Error).message}</p>
	}
}

function OuterCatchApp(props: { promise: Loader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		@try {
			<AsyncChild value="hello" />
		} @pending {
			const label = boom_label();
			<p class="pending">{label}</p>
		}
	} @catch (err) {
		<p class="outer-caught">{(err as Error).message}</p>
	}
}

function OuterCatchElementApp(props: { promise: Loader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<div class="outer">
			@try {
				<AsyncChild value="hello" />
			} @pending {
				const label = boom_label();
				<p class="pending">{label}</p>
			}
		</div>
	} @catch (err) {
		<p class="outer-caught">{(err as Error).message}</p>
	}
}

function BoomBody() @{
	const label = boom_label();
	<p class="pending">{label}</p>
}

function ThrowingPendingComponentApp(props: { promise: Loader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<AsyncChild value="hello" />
	} @pending {
		<BoomBody />
	} @catch (err) {
		<p class="caught">{(err as Error).message}</p>
	}
}

function UncaughtPendingApp(props: { promise: Loader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<AsyncChild value="hello" />
	} @pending {
		const label = boom_label();
		<p class="pending">{label}</p>
	}
}

const reset_state = { fail: true };

function ResetPendingApp(props: { promise: Loader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<AsyncChild value="hello" />
	} @pending {
		const label = reset_state.fail ? boom_label() : pending_label();
		<p class="pending">{label}</p>
	} @catch (err, reset) {
		<button
			class="reset"
			onClick={() => {
				reset_state.fail = false;
				reset();
			}}
		>
			{(err as Error).message}
		</button>
	}
}

function RetryPendingApp(props: { promise: Loader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<AsyncChild value="hello" />
	} @pending {
		const label = boom_label();
		<p class="pending">{label}</p>
	} @catch (err, reset) {
		<button class="retry" onClick={reset}>
			{(err as Error).message}
		</button>
	}
}

function RejectApp(props: { promise: Loader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<AsyncChild value="hello" />
	} @pending {
		<p class="pending">{'loading'}</p>
	} @catch (err) {
		<p class="caught">{(err as Error).message}</p>
	}
}

// Renders a text node, then an array, which borrows the text node as its
// anchor, then the same text node again, alone or in an array.
function TextReuseApp() @{
	const mode = ref(0);
	const text = document.createTextNode('ready');
	const content = () => {
		if (mode.value % 2 === 1) return [document.createElement('p')];
		text.data = 'ready';
		return mode.value === 4 ? [text] : text;
	};
	<>
		<button class="step" onClick={() => mode.value++}>
			{'step'}
		</button>
		<TsrxErrorBoundary content={content} fallback={() => null} />
	</>
}

let retry_empty_catch: () => void = () => {};

function ThrowingButton() @{
	<button
		class="fail"
		onClick={() => {
			throw new Error('click boom');
		}}
	>
		{'fail'}
	</button>
}

function EmptyCatchApp() @{
	const visible = ref(true);
	@try {
		<ThrowingButton v-if={visible.value} />
	} @catch (error, reset) {
		retry_empty_catch = reset;
	}
}

function EmptyPendingApp(props: { promise: Loader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<AsyncChild value="hello" />
	} @pending {
		@if (pending_runs < 0) {
			<p class="pending">{'loading'}</p>
		}
	}
}

// A VDOM component with its own state, rendered by the same block on every
// render of the boundary.
const Counter = defineComponent({
	setup() {
		const count = ref(0);
		return () => h('button', { class: 'count', onClick: () => count.value++ }, String(count.value));
	},
});
const refresh = ref(0);

function CachedBlockApp() @{
	const cached = <Counter />;
	<TsrxErrorBoundary
		content={() => {
			void refresh.value;
			return cached;
		}}
		fallback={() => null}
	/>
}

function PrimitivePendingApp(props: { value: unknown }) @{
	<TsrxPendingBody content={() => props.value} />
}

const live_pending = shallowRef<unknown>('loading');

function LivePendingApp(props: { promise: Loader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<AsyncChild value="hello" />
	} @pending {
		<>{live_pending.value}</>
	}
}

function AsyncContentApp() @{
	<Suspense
		v-slots={{
			default: () => <TsrxPendingBody content={async () => document.createTextNode('ready')} />,
			fallback: () => <span>{'waiting'}</span>,
		}}
	/>
}

// Both @try's have a @catch: the inner one's @pending throws while an outer
// boundary is still rendering, so the inner @catch must take it.
function NestedCatchElementApp(props: { promise: Loader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<div class="outer">
			@try {
				<AsyncChild value="hello" />
			} @pending {
				const label = boom_label();
				<p class="pending">{label}</p>
			} @catch (err) {
				<p class="inner-caught">{(err as Error).message}</p>
			}
		</div>
	} @catch (err) {
		<p class="outer-caught">{(err as Error).message}</p>
	}
}

function Section(props: { promise: Loader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	<section>
		@try {
			<AsyncChild value="hello" />
		} @pending {
			const label = boom_label();
			<p class="pending">{label}</p>
		} @catch (err) {
			<p class="inner-caught">{(err as Error).message}</p>
		}
	</section>
}

function NestedCatchComponentApp(props: { promise: Loader }) @{
	@try {
		<Section promise={props.promise} />
	} @catch (err) {
		<p class="outer-caught">{(err as Error).message}</p>
	}
}

// Keyed rows, each with its own @try, inside an outer @try. Row 2's @pending
// throws.
const row_loaders = new Map<number, ReturnType<typeof deferred>>();

function row_loader(id: number) {
	let entry = row_loaders.get(id);
	if (!entry) {
		entry = deferred();
		row_loaders.set(id, entry);
	}
	return entry.promise;
}

function row_label(id: number) {
	if (id === 2) throw new Error('row boom ' + id);
	return 'loading ' + id;
}

function PendingRow(props: { id: number }) @{
	const AsyncChild = defineVaporAsyncComponent(() => row_loader(props.id));
	<li class={'row-' + props.id}>
		@try {
			<AsyncChild value={'row ' + props.id} />
		} @pending {
			const label = row_label(props.id);
			<span class="pending">{label}</span>
		} @catch (err) {
			<span class="row-caught">{(err as Error).message}</span>
		}
	</li>
}

function RowComponentsApp(props: { ids: number[] }) @{
	@try {
		<ul>
			@for (const id of props.ids; key id) {
				<PendingRow id={id} />
			}
		</ul>
	} @catch (err) {
		<p class="outer-caught">{(err as Error).message}</p>
	}
}

function InlineRowsApp(props: { ids: number[] }) @{
	@try {
		<ul>
			@for (const id of props.ids; key id) {
				const AsyncChild = defineVaporAsyncComponent(() => row_loader(id));
				<li class={'row-' + id}>
					@try {
						<AsyncChild value={'row ' + id} />
					} @pending {
						const label = row_label(id);
						<span class="pending">{label}</span>
					} @catch (err) {
						<span class="row-caught">{(err as Error).message}</span>
					}
				</li>
			}
		</ul>
	} @catch (err) {
		<p class="outer-caught">{(err as Error).message}</p>
	}
}

// Errors a showing @pending body raises after its render: a reactive
// expression on an update, an event handler, and onMounted.
const reactive_n = ref(0);

function check_n(n: number) {
	if (n === 1) throw new Error('reactive boom');
	return 'n=' + n;
}

function ReactivePendingApp(props: { promise: Loader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<AsyncChild value="hello" />
	} @pending {
		<p class="pending">{check_n(reactive_n.value)}</p>
	} @catch (err) {
		<p class="caught">{(err as Error).message}</p>
	}
}

function HandlerPendingApp(props: { promise: Loader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<AsyncChild value="hello" />
	} @pending {
		<button
			class="pending-btn"
			onClick={() => {
				throw new Error('handler boom');
			}}
		>
			{'x'}
		</button>
	} @catch (err) {
		<p class="caught">{(err as Error).message}</p>
	}
}

function MountedBoom() @{
	onMounted(() => {
		throw new Error('mounted boom');
	});
	<p class="pending">{'loading'}</p>
}

function MountedPendingApp(props: { promise: Loader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<AsyncChild value="hello" />
	} @pending {
		<MountedBoom />
	} @catch (err) {
		<p class="caught">{(err as Error).message}</p>
	}
}

// A @try whose body is only a keyed @for, with a row that throws on click.
function ThrowOnClick(props: { id: number }) @{
	<button
		class={'b' + props.id}
		onClick={() => {
			throw new Error('click ' + props.id);
		}}
	>
		{String(props.id)}
	</button>
}

function BareForApp(props: { ids: number[] }) @{
	@try {
		@for (const id of props.ids; key id) {
			<ThrowOnClick id={id} />
		}
	} @catch (err) {
		<p class="caught">{(err as Error).message}</p>
	}
}

async function mount_and_unmount(
	App: unknown,
	props: Record<string, unknown>,
	steps: () => Promise<void>,
) {
	const app = createVaporApp(App as typeof BareForApp, props as { ids: number[] });
	try {
		app.mount(container);
		await flush();
		await steps();
	} finally {
		app.unmount();
		await nextTick();
	}
	expect(container.childNodes.length).toBe(0);
}

// An inner @try without @pending inside an element: its @catch renders a
// component that throws, which the outer @catch shows.
function ThrowingBody() @{
	throw new Error('body boom');
	<p>{'unreachable'}</p>
}

function ThrowingFallback() @{
	throw new Error('fallback boom');
	<p>{'unreachable'}</p>
}

function ThrowingCatchInElementApp() @{
	@try {
		<div class="outer">
			@try {
				<ThrowingBody />
			} @catch (err) {
				<ThrowingFallback />
			}
		</div>
	} @catch (err) {
		<p class="outer-caught">{(err as Error).message}</p>
	}
}

function row_texts() {
	return Array.from(
		container.querySelectorAll('li'),
		(row) => `${row.className}: ${row.textContent}`,
	);
}

function html() {
	return container.innerHTML;
}

describe('tsrx-vue @pending', () => {
	beforeEach(() => {
		pending_runs = 0;
	});

	it('does not run the @pending body when nothing suspends, also after an update', async () => {
		await render(NoSuspendApp);
		expect(pending_runs).toBe(0);
		expect(html()).toBe('<button class="bump">bump</button><p class="ready">ready 0</p>');

		(container.querySelector('.bump') as HTMLElement).click();
		await flush();
		expect(pending_runs).toBe(0);
		expect(html()).toBe('<button class="bump">bump</button><p class="ready">ready 1</p>');
	});

	it('runs the @pending body once while the body suspends, then shows the body', async () => {
		const { promise, resolve } = deferred();
		await render(SuspendApp, { promise });
		expect(pending_runs).toBe(1);
		expect(html()).toBe('<p class="pending">loading</p>');

		resolve(Resolved);
		await flush();
		expect(pending_runs).toBe(1);
		expect(container.querySelector('.pending')).toBeNull();
		expect(container.querySelector('.resolved')?.textContent).toBe('hello');
	});

	it('renders the body when the @pending body would throw but nothing suspends', async () => {
		await render(ThrowingPendingNoSuspendApp);
		expect(pending_runs).toBe(0);
		expect(html()).toBe('<p class="ready">ready</p>');
	});

	it('shows the same @try’s @catch when the @pending body throws while suspended', async () => {
		const { promise, resolve } = deferred();
		await render(ThrowingPendingApp, { promise });
		await flush();
		expect(pending_runs).toBe(1);
		expect(html()).toBe('<p class="caught">pending boom</p>');

		// The @catch stays after the body's async child resolves.
		resolve(Resolved);
		await flush();
		expect(html()).toBe('<p class="caught">pending boom</p>');
	});

	it('shows an enclosing @catch when the @try has none', async () => {
		await render(OuterCatchApp, { promise: never() });
		await flush();
		expect(pending_runs).toBe(1);
		expect(html()).toBe('<p class="outer-caught">pending boom</p>');
	});

	it('shows an enclosing @catch when the @try has none, inside an element', async () => {
		await render(OuterCatchElementApp, { promise: never() });
		await flush();
		expect(pending_runs).toBe(1);
		expect(html()).toBe('<p class="outer-caught">pending boom</p>');
	});

	it('shows the inner @catch, not the outer one, when the inner @try is inside an element', async () => {
		await render(NestedCatchElementApp, { promise: never() });
		await flush();
		expect(html()).toBe('<div class="outer"><p class="inner-caught">pending boom</p></div>');
	});

	it('shows the inner @catch when the inner @try is inside a child component', async () => {
		await render(NestedCatchComponentApp, { promise: never() });
		await flush();
		expect(html()).toBe('<section><p class="inner-caught">pending boom</p></section>');
	});

	it('shows the outer @catch when an inner @catch inside an element throws', async () => {
		await render(ThrowingCatchInElementApp);
		await flush();
		expect(html()).toBe('<p class="outer-caught">fallback boom</p>');
	});

	it.each([
		['row components', RowComponentsApp],
		['inline rows', InlineRowsApp],
	])('keeps the list when one keyed row’s @pending throws (%s)', async (_name, App) => {
		row_loaders.clear();
		await render(App as typeof RowComponentsApp, { ids: [1, 2, 3] });
		await flush();
		expect(container.querySelector('.outer-caught')).toBeNull();
		expect(row_texts()).toEqual(['row-1: loading 1', 'row-2: row boom 2', 'row-3: loading 3']);

		row_loaders.get(1)!.resolve(Resolved);
		await flush();
		expect(row_texts()).toEqual(['row-1: row 1', 'row-2: row boom 2', 'row-3: loading 3']);
	});

	it('shows the @catch when a reactive expression in the @pending body throws on an update', async () => {
		reactive_n.value = 0;
		await mount_and_unmount(ReactivePendingApp, { promise: never() }, async () => {
			expect(html()).toBe('<p class="pending">n=0</p>');
			reactive_n.value = 1;
			await flush();
			expect(html()).toBe('<p class="caught">reactive boom</p>');
		});
	});

	it('shows the @catch when an event handler in the @pending body throws', async () => {
		await mount_and_unmount(HandlerPendingApp, { promise: never() }, async () => {
			(container.querySelector('.pending-btn') as HTMLElement).click();
			await flush();
			expect(html()).toBe('<p class="caught">handler boom</p>');
		});
	});

	it('shows the @catch when onMounted throws in a component in the @pending body', async () => {
		await mount_and_unmount(MountedPendingApp, { promise: never() }, async () => {
			expect(html()).toBe('<p class="caught">mounted boom</p>');
		});
	});

	it('leaves no DOM nodes behind after a row of a bare keyed @for throws and unmounts', async () => {
		await mount_and_unmount(BareForApp, { ids: [1, 2, 3] }, async () => {
			(container.querySelector('.b2') as HTMLElement).click();
			await flush();
			expect(html()).toBe('<p class="caught">click 2</p>');
		});
	});

	it('shows the @catch when a component in the @pending body throws in setup', async () => {
		await render(ThrowingPendingComponentApp, { promise: never() });
		await flush();
		expect(pending_runs).toBe(1);
		expect(html()).toBe('<p class="caught">pending boom</p>');
	});

	it('hands a @pending throw with no @catch to the app error handler', async () => {
		const handled: unknown[] = [];
		const app = createVaporApp(UncaughtPendingApp, { promise: never() });
		app.config.errorHandler = (error) => {
			handled.push(error);
		};
		try {
			app.mount(container);
			await flush();
			expect(handled.map((error) => (error as Error).message)).toEqual(['pending boom']);
			expect(container.querySelector('.pending')).toBeNull();
		} finally {
			app.unmount();
			await nextTick();
		}
	});

	it('leaves no extra DOM nodes behind after each reset, nor after unmount', async () => {
		const app = createVaporApp(RetryPendingApp, { promise: never() });
		try {
			app.mount(container);
			await flush();
			expect(html()).toBe('<button class="retry">pending boom</button>');
			const nodes = container.childNodes.length;

			for (let i = 0; i < 3; i++) {
				(container.querySelector('.retry') as HTMLElement).click();
				await flush();
				expect(html()).toBe('<button class="retry">pending boom</button>');
			}
			expect(pending_runs).toBe(4);
			expect(container.childNodes.length).toBe(nodes);
		} finally {
			app.unmount();
			await nextTick();
		}
		expect(container.childNodes.length).toBe(0);
	});

	it('leaves no DOM nodes behind after a rejected async component is caught and unmounted', async () => {
		let reject!: (error: Error) => void;
		const promise: Loader = new Promise((_resolve, r) => (reject = r));
		const app = createVaporApp(RejectApp, { promise });
		try {
			app.mount(container);
			await flush();
			reject(new Error('async reject boom'));
			await flush();
			expect(html()).toBe('<p class="caught">async reject boom</p>');
		} finally {
			app.unmount();
			await nextTick();
		}
		expect(container.childNodes.length).toBe(0);
	});

	it('keeps a text node that the content renders again after an array borrowed it', async () => {
		await render(TextReuseApp);
		expect(container.textContent).toBe('stepready');
		for (let step = 1; step <= 4; step++) {
			(container.querySelector('.step') as HTMLElement).click();
			await flush();
			expect(container.textContent).toBe(step % 2 === 1 ? 'step' : 'stepready');
		}
	});

	it('leaves no DOM nodes behind after resetting an empty @catch to a v-if root', async () => {
		const app = createVaporApp(EmptyCatchApp);
		try {
			app.mount(container);
			await flush();
			for (let i = 0; i < 3; i++) {
				(container.querySelector('.fail') as HTMLElement).click();
				await flush();
				retry_empty_catch();
				await flush();
			}
			expect(container.querySelector('.fail')).not.toBeNull();
		} finally {
			app.unmount();
			await nextTick();
		}
		expect(container.childNodes.length).toBe(0);
	});

	it('renders an empty @pending body without a Vue warning', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			await render(EmptyPendingApp, { promise: never() });
			expect(html()).toBe('');
			expect(warn.mock.calls.map((args) => String(args[0]))).toEqual([]);
		} finally {
			warn.mockRestore();
		}
	});

	it.each([
		['loading', 'loading'],
		[42, '42'],
	])('renders %j from TsrxPendingBody as text, without a Vue warning', async (value, text) => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			await render(PrimitivePendingApp, { value });
			expect(html()).toBe(text);
			expect(warn.mock.calls.map((args) => String(args[0]))).toEqual([]);
		} finally {
			warn.mockRestore();
		}
	});

	it('removes a @pending body that changed while it showed', async () => {
		live_pending.value = 'loading';
		const { promise, resolve } = deferred();
		const app = createVaporApp(LivePendingApp, { promise });
		try {
			app.mount(container);
			await flush();
			expect(html()).toBe('loading');

			live_pending.value = Object.assign(document.createElement('b'), { textContent: 'updated' });
			await flush();
			expect(html()).toBe('<b>updated</b>');

			resolve(Resolved);
			await flush();
			expect(container.querySelector('b')).toBeNull();
			expect(container.querySelector('.resolved')?.textContent).toBe('hello');
		} finally {
			app.unmount();
			await nextTick();
		}
		expect(container.childNodes.length).toBe(0);
	});

	it('lets Vue wait for a promise that TsrxPendingBody content returns', async () => {
		await render(AsyncContentApp);
		await flush();
		expect(html()).toBe('ready');
	});

	it('keeps a block the content renders again in place, with its state', async () => {
		const app = createVaporApp(CachedBlockApp);
		try {
			app.mount(container);
			await flush();
			(container.querySelector('.count') as HTMLElement).click();
			await flush();
			expect(html()).toBe('<button class="count">1</button>');

			refresh.value++;
			await flush();
			expect(html()).toBe('<button class="count">1</button>');
		} finally {
			app.unmount();
			await nextTick();
		}
		expect(container.childNodes.length).toBe(0);
	});

	it('renders the @try again on reset, with the @pending body while it suspends', async () => {
		reset_state.fail = true;
		const { promise, resolve } = deferred();
		await render(ResetPendingApp, { promise });
		await flush();
		expect(html()).toBe('<button class="reset">pending boom</button>');

		(container.querySelector('.reset') as HTMLElement).click();
		await flush();
		expect(html()).toBe('<p class="pending">loading</p>');

		resolve(Resolved);
		await flush();
		expect(container.querySelector('.pending')).toBeNull();
		expect(container.querySelector('.resolved')?.textContent).toBe('hello');
	});
});
