import { createVaporApp, defineVaporAsyncComponent, nextTick, ref } from 'vue';

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
