import { createVaporSSRApp, ref } from 'vue';

// In its own file: vue-jsx-vapor caches the component proxies it makes with
// the instance of the first app that renders them, so a client app that
// later renders the same components from this file, with the interop the test
// setup adds, would mount them as VDOM ones.

const hydrated_broken = ref(false);

function hydrated_label(): string {
	if (hydrated_broken.value) throw new Error('updated');
	return 'ok';
}

function HydratedInline() @{
	<div>
		@try {
			<p class="inline-body">{hydrated_label()}</p>
		} @catch (err) {
			<b class="inline-caught">{String(err)}</b>
		}
		<button class="after">{'after'}</button>
	</div>
}

function text(selector: string): string | null | undefined {
	return container.querySelector(selector)?.textContent;
}

describe("tsrx-vue a @try body's inline code, after hydration", () => {
	it('shows an error it throws on an update after hydration, and keeps what follows', async () => {
		hydrated_broken.value = false;
		container.innerHTML =
			'<div><p class="inline-body">ok</p><button class="after">after</button></div>';
		const after = container.querySelector('.after');
		const handled: string[] = [];
		const app = createVaporSSRApp(HydratedInline);
		app.config.errorHandler = (error) => {
			handled.push(String(error));
		};
		try {
			app.mount(container);
			await flush();
			expect(container.querySelector('.inline-body')?.textContent).toBe('ok');
			hydrated_broken.value = true;
			await flush();
			expect(text('.inline-caught')).toBe('Error: updated');
			expect(container.querySelector('.inline-body')).toBeNull();
			expect(container.querySelector('.after')).toBe(after);
			expect(handled).toEqual([]);
		} finally {
			app.unmount();
		}
	});
});
