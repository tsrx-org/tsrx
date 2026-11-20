import { createVaporApp, ref } from 'vue';
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

describe('tsrx-vue TsrxErrorBoundary used directly', () => {
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
