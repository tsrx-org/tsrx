import {
	createVaporApp,
	createVaporSSRApp,
	onBeforeUnmount,
	onErrorCaptured,
	ref,
	vaporInteropPlugin,
} from 'vue';
import * as Vue from 'vue';

// A @try body's own inline code: what it throws after the first render is
// the @try's to show. More cases are in runtime.test.tsrx.

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

const catch_broken = ref(false);
let catch_threw = false;

function catch_label(err: unknown): string {
	if (catch_broken.value && !catch_threw) {
		catch_threw = true;
		throw new Error('catch update');
	}
	return String(err);
}

function always_throws(): string {
	throw new Error('body');
}

// The inner @catch's inline code throws once on an update: that goes to the
// next @try out, not to the inner @catch.
function CatchInlineThrows() @{
	@try {
		<section>
			@try {
				<p>{always_throws()}</p>
			} @catch (err) {
				<b class="inner-caught">{catch_label(err)}</b>
			}
		</section>
	} @catch (err) {
		<i class="outer-caught">{String(err)}</i>
	}
}

const toggled_shown = ref(true);
let toggled_owner: { ec?: unknown[] | null } | null = null;

function Toggled() @{
	// Vapor's current instance, which `getCurrentInstance` doesn't return.
	toggled_owner = (Vue as unknown as { currentInstance: { ec?: unknown[] | null } })
		.currentInstance;
	<div>
		@if (toggled_shown.value) {
			@try {
				<p class="toggled">{'shown'}</p>
			} @catch (err) {
				<b>{String(err)}</b>
			}
		}
	</div>
}

const teardown_shown = ref(true);

// The @try body registers a hook that throws as the @try unmounts.
function TeardownThrows() @{
	<div>
		@if (teardown_shown.value) {
			@try {
				onBeforeUnmount(() => {
					throw new Error('teardown');
				});
				<p class="teardown-body">{'shown'}</p>
			} @catch (err) {
				<b class="teardown-caught">{String(err)}</b>
			}
		}
	</div>
}

const hooked_broken = ref(false);
const hooked_seen: string[] = [];

function hooked_label(): string {
	if (hooked_broken.value) throw new Error('hooked');
	return 'ok';
}

// The component around the @try has an error hook of its own.
function HookedParent() @{
	onErrorCaptured((err) => {
		hooked_seen.push(String(err));
	});
	<div>
		@try {
			<p class="inline-body">{hooked_label()}</p>
		} @catch (err) {
			<b class="inline-caught">{String(err)}</b>
		}
	</div>
}

function text(selector: string): string | null | undefined {
	return container.querySelector(selector)?.textContent;
}

describe("tsrx-vue a @try body's inline code, more cases", () => {
	async function mount(component: unknown) {
		const handled: string[] = [];
		const app = createVaporApp(component as Parameters<typeof createVaporApp>[0]);
		app.config.errorHandler = (error) => {
			handled.push(String(error));
		};
		app.mount(container);
		await flush();
		return { app, handled };
	}

	it('shows an error it throws on an update after hydration, and keeps what follows', async () => {
		hydrated_broken.value = false;
		container.innerHTML =
			'<div><p class="inline-body">ok</p><button class="after">after</button></div>';
		const after = container.querySelector('.after');
		const handled: string[] = [];
		const app = createVaporSSRApp(HydratedInline);
		// As the test setup does for `createVaporApp`. Without it, the
		// components vue-jsx-vapor wraps here first would mount as VDOM ones
		// in the later tests' apps.
		app.use(vaporInteropPlugin);
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

	it('lets an error the @catch inline code throws go to the next @try out', async () => {
		catch_broken.value = false;
		catch_threw = false;
		const { app, handled } = await mount(CatchInlineThrows);
		expect(text('.inner-caught')).toBe('Error: body');
		catch_broken.value = true;
		await flush();
		expect(text('.outer-caught')).toBe('Error: catch update');
		expect(container.querySelector('.inner-caught')).toBeNull();
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('takes such an error before an error hook of the component around it', async () => {
		hooked_broken.value = false;
		hooked_seen.length = 0;
		const { app, handled } = await mount(HookedParent);
		hooked_broken.value = true;
		await flush();
		expect(text('.inline-caught')).toBe('Error: hooked');
		expect(hooked_seen).toEqual([]);
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('lets an error it throws while the @try unmounts go on, as before', async () => {
		teardown_shown.value = true;
		const { app, handled } = await mount(TeardownThrows);
		expect(text('.teardown-body')).toBe('shown');
		teardown_shown.value = false;
		await flush();
		expect(container.querySelector('.teardown-body')).toBeNull();
		expect(container.querySelector('.teardown-caught')).toBeNull();
		expect(handled).toEqual(['Error: teardown']);
		app.unmount();
	});

	it('removes its hook from the component around it when it unmounts', async () => {
		toggled_shown.value = true;
		const { app } = await mount(Toggled);
		const hooks = () => toggled_owner?.ec?.length ?? 0;
		const shown = hooks();
		expect(shown).toBe(1);
		for (let i = 0; i < 5; i++) {
			toggled_shown.value = false;
			await flush();
			expect(hooks()).toBe(0);
			toggled_shown.value = true;
			await flush();
		}
		expect(hooks()).toBe(shown);
		app.unmount();
	});
});
