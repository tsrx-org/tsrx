import { createVaporApp, onScopeDispose, ref, Suspense, watch } from 'vue';

// A Vue without the `nextUid` Vapor internal. The boundary can't tell its
// @catch's components from its body's there, and routes errors as it did
// before it could.
vi.mock('vue', async (importOriginal) => {
	const vue = await importOriginal<Record<PropertyKey, unknown>>();
	// A proxy, not a copy, so live bindings such as `currentInstance` stay live.
	return new Proxy(vue, {
		get: (target, key) => (key === 'nextUid' ? undefined : target[key]),
	});
});

let catch_runs = 0;

function ThrowsInSetup() @{
	throw new Error('body');
	<p />
}

function CatchThrows(props: { error: unknown }) @{
	catch_runs++;
	throw new Error('catch after ' + (props.error as Error).message);
	<p />
}

function CatchThrowsInsideOuterTry() @{
	@try {
		@try {
			<ThrowsInSetup />
		} @catch (err) {
			<CatchThrows error={err} />
		}
	} @catch (err) {
		<p class="outer-caught">{(err as Error).message}</p>
	}
}

// The @catch holds, in a Suspense, a component whose scope dispose callback
// sets off a watcher in the content a reset renders, which throws.
const signal = ref(0);
let reset_fails = true;

function BumpsOnDispose() @{
	onScopeDispose(() => {
		signal.value++;
	});
	<span>{'old'}</span>
}

function WatchesSignal() @{
	watch(
		signal,
		() => {
			throw new Error('new content watcher');
		},
		{ flush: 'sync' },
	);
	<p class="reset-body">{'ok'}</p>
}

function ResetWatcher() @{
	@try {
		if (reset_fails) throw new Error('first');
		<WatchesSignal />
	} @catch (err, reset) {
		<>
			<Suspense
				v-slots={{
					default: () => <BumpsOnDispose />,
					fallback: () => <i>{'wait'}</i>,
				}}
			/>
			<button class="reset" onClick={reset}>
				{(err as Error).message}
			</button>
		</>
	}
}

describe('tsrx-vue a @catch that throws, on a Vue without nextUid', () => {
	it('passes what it throws as it first renders to the @try rendering around it, once', async () => {
		catch_runs = 0;
		const handled: string[] = [];
		const warnings: string[] = [];
		const app = createVaporApp(CatchThrowsInsideOuterTry);
		app.config.errorHandler = (error) => {
			handled.push(String(error));
		};
		app.config.warnHandler = (message) => {
			warnings.push(message);
		};
		app.mount(container);
		await flush();
		expect(container.querySelector('.outer-caught')?.textContent).toBe('catch after body');
		expect(catch_runs).toBe(1);
		expect(handled).toEqual([]);
		expect(warnings.filter((warning) => warning.includes('nextUid'))).toHaveLength(1);
		app.unmount();
	});

	it('shows in its @catch what the content a reset renders throws as the @catch is torn down', async () => {
		reset_fails = true;
		signal.value = 0;
		const handled: string[] = [];
		const app = createVaporApp(ResetWatcher);
		app.config.errorHandler = (error) => {
			handled.push(String(error));
		};
		app.config.warnHandler = () => {};
		app.mount(container);
		await flush();
		expect(container.querySelector('.reset')?.textContent).toBe('first');
		reset_fails = false;
		(container.querySelector('.reset') as HTMLElement).click();
		await flush();
		expect(container.querySelector('.reset')?.textContent).toBe('new content watcher');
		expect(handled).toEqual([]);
		app.unmount();
	});
});
