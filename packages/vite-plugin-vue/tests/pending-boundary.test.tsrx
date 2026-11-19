import { createVaporApp, defineComponent, defineVaporAsyncComponent, h, nextTick, ref } from 'vue';
import { TsrxErrorBoundary } from '@tsrx/vue/error-boundary';

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
