import {
	createVaporApp,
	defineVaporAsyncComponent,
	onBeforeUnmount,
	onErrorCaptured,
	ref,
	Suspense,
} from 'vue';
import * as Vue from 'vue';

// A @try body's own inline code: what it throws after the first render is
// the @try's to show. More cases are in runtime.test.tsrx.

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

const in_catch_broken = ref(false);

function in_catch_label(): string {
	if (in_catch_broken.value) throw new Error('in catch');
	return 'ok';
}

// The @catch renders a @try whose inline code throws on an update.
function TryInCatch() @{
	@try {
		<p>{always_throws()}</p>
	} @catch (_err) {
		@try {
			<p class="in-catch-body">{in_catch_label()}</p>
		} @catch (err) {
			<b class="in-catch-caught">{String(err)}</b>
		}
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

const pending_broken = ref(false);
let finish_pending: () => void = () => {};

function pending_label(): string {
	if (pending_broken.value) throw new Error('inline');
	return 'ok';
}

function PendingDone() @{
	<small class="pending-done">{'done'}</small>
}

// A plain @try whose inline code throws beside a loading component inside an
// element, in an authored Suspense.
function PendingBody() @{
	const AsyncChild = defineVaporAsyncComponent(
		() => new Promise<any>((resolve) => (finish_pending = () => resolve(PendingDone))),
	);
	@try {
		<div>
			<AsyncChild />
			<p class="pending-body">{pending_label()}</p>
		</div>
	} @catch (err) {
		<b class="pending-caught">{String(err)}</b>
	}
}

function PendingSuspended() @{
	<Suspense
		v-slots={{
			default: () => <PendingBody />,
			fallback: () => <i class="pending-loading">{'loading'}</i>,
		}}
	/>
}

function outer_fails(): string {
	throw new Error('outer');
}

function PendingInCatch() @{
	@try {
		<p>{outer_fails()}</p>
	} @catch (_err) {
		<PendingSuspended />
	}
}

let discard_owner: { ec?: unknown[] | null } | null = null;

function remember_owner() {
	discard_owner = (Vue as unknown as { currentInstance: { ec?: unknown[] | null } })
		.currentInstance;
}

// The outer body creates an inner @try, then throws as it renders, so the
// inner one is dropped before it mounts.
function DiscardedInner() @{
	@try {
		remember_owner();
		<>
			@try {
				<p>{'inner'}</p>
			} @catch (err) {
				<b>{String(err)}</b>
			}
			<span>{outer_fails()}</span>
		</>
	} @catch (err, reset) {
		<button class="discard-reset" onClick={reset}>
			{String(err)}
		</button>
	}
}

const dropped_rows = ref<number[]>([]);
let rows_owner: { ec?: unknown[] | null } | null = null;

function remember_rows_owner(): string {
	rows_owner = (Vue as unknown as { currentInstance: { ec?: unknown[] | null } }).currentInstance;
	return '';
}

// Each row renders a @try, then throws, so Vue drops the row before the @try
// mounts.
function DroppedRows() @{
	<div>
		@for (const row of dropped_rows.value; key row) {
			<>
				<span>{remember_rows_owner()}</span>
				@try {
					<p>{'inner'}</p>
				} @catch (err) {
					<b>{String(err)}</b>
				}
				<span>{outer_fails()}</span>
			</>
		}
	</div>
}

// The same from an expression that renders again.
function DroppedExpression() @{
	<div>
		{(() => {
			void dropped_rows.value;
			return (
				<>
					<span>{remember_rows_owner()}</span>
					@try {
						<p>{'inner'}</p>
					} @catch (err) {
						<b>{String(err)}</b>
					}
					<span>{outer_fails()}</span>
				</>
			);
		})()}
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

	it('shows an error a @try in a @catch throws on an update in its own @catch', async () => {
		in_catch_broken.value = false;
		const { app, handled } = await mount(TryInCatch);
		expect(text('.in-catch-body')).toBe('ok');
		in_catch_broken.value = true;
		await flush();
		expect(text('.in-catch-caught')).toBe('Error: in catch');
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

	it.each([
		['', PendingSuspended],
		[' in a @catch', PendingInCatch],
	])(
		'lets an error it throws while its Suspense is pending go on, so the Suspense resolves%s',
		async (_name, component) => {
			pending_broken.value = false;
			const { app, handled } = await mount(component);
			expect(text('.pending-loading')).toBe('loading');
			pending_broken.value = true;
			await flush();
			finish_pending();
			await flush();
			await new Promise((resolve) => setTimeout(resolve, 0));
			await flush();
			expect(container.querySelector('.pending-loading')).toBeNull();
			expect(text('.pending-done')).toBe('done');
			expect(handled).toEqual(['Error: inline']);
			app.unmount();
		},
	);

	it('removes the hook of a @try that a failed render dropped before it mounted', async () => {
		const { app, handled } = await mount(DiscardedInner);
		expect(text('.discard-reset')).toBe('Error: outer');
		const counts: number[] = [];
		for (let i = 0; i < 4; i++) {
			counts.push(discard_owner?.ec?.length ?? 0);
			(container.querySelector('.discard-reset') as HTMLElement).click();
			await flush();
		}
		expect(counts).toEqual([1, 1, 1, 1]);
		expect(handled).toEqual([]);
		app.unmount();
	});

	// The expression's scope keeps the @try it rendered last until it renders
	// again, and the hook goes with it then; a @for row is disposed of at once.
	it.each([
		['a @for row', DroppedRows, 0],
		['an expression', DroppedExpression, 1],
	])(
		'removes the hook of a @try that %s dropped before it mounted',
		async (_name, component, kept) => {
			dropped_rows.value = [];
			const { app } = await mount(component);
			const counts: number[] = [];
			for (let i = 0; i < 4; i++) {
				dropped_rows.value = [i];
				await flush();
				counts.push(rows_owner?.ec?.length ?? 0);
			}
			expect(counts).toEqual([kept, kept, kept, kept]);
			app.unmount();
		},
	);

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
