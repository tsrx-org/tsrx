import { createVaporApp } from 'vue';

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
});
