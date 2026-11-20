import { createVaporApp, ref } from 'vue';
import * as Vue from 'vue';
import { TsrxErrorBoundary } from '@tsrx/vue/error-boundary';

// TsrxErrorBoundary used directly, not through `@try`: its content's inline
// code belongs to the boundary itself, as in compiled output.
const direct_broken = ref(false);

function fail_outer(): never {
	throw new Error('outer');
}

function direct_label(): string {
	if (direct_broken.value) throw new Error('inner');
	return 'ok';
}

function DirectNested() {
	return (
		<TsrxErrorBoundary
			content={() => fail_outer()}
			fallback={() => (
				<TsrxErrorBoundary
					content={() => <p class="direct-body">{direct_label()}</p>}
					fallback={(error: unknown) => <b class="direct-caught">{String(error)}</b>}
				/>
			)}
		/>
	);
}

const plain_broken = ref(false);
let plain_owner: { ec?: unknown[] | null } | null = null;

function plain_label(): string {
	if (plain_broken.value) throw new Error('abandoned inline');
	return 'abandoned';
}

function fail_render(): never {
	throw new Error('failed render');
}

// A @try body calls TsrxErrorBoundary as a plain function, whose content
// creates a boundary component, then throws as it renders.
function PlainCallThenFails() @{
	@try {
		plain_owner = (Vue as unknown as { currentInstance: { ec?: unknown[] | null } })
			.currentInstance;
		const block = TsrxErrorBoundary({
			content: () => (
				<TsrxErrorBoundary
					content={() => <p>{plain_label()}</p>}
					fallback={(error: unknown) => <b>{String(error)}</b>}
				/>
			),
			fallback: (error: unknown) => <i>{String(error)}</i>,
		});
		<>
			{block}
			<span>{fail_render()}</span>
		</>
	} @catch (err) {
		<p class="plain-caught">{String(err)}</p>
	}
}

describe('tsrx-vue TsrxErrorBoundary used directly', () => {
	it('removes the hook of a boundary a plain call created when the render around it throws', async () => {
		plain_broken.value = false;
		const handled: string[] = [];
		const app = createVaporApp(PlainCallThenFails as never);
		app.config.errorHandler = (error) => {
			handled.push(String(error));
		};
		app.mount(container);
		await flush();
		expect(container.querySelector('.plain-caught')?.textContent).toBe('Error: failed render');
		expect(plain_owner?.ec?.length).toBe(1);
		plain_broken.value = true;
		await flush();
		expect(container.querySelector('.plain-caught')?.textContent).toBe('Error: abandoned inline');
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('shows an inline update error of a boundary its fallback renders in that boundary', async () => {
		direct_broken.value = false;
		const handled: string[] = [];
		const app = createVaporApp(DirectNested as never);
		app.config.errorHandler = (error) => {
			handled.push(String(error));
		};
		app.mount(container);
		await flush();
		expect(container.querySelector('.direct-body')?.textContent).toBe('ok');
		direct_broken.value = true;
		await flush();
		expect(container.querySelector('.direct-caught')?.textContent).toBe('Error: inner');
		expect(handled).toEqual([]);
		app.unmount();
	});
});
