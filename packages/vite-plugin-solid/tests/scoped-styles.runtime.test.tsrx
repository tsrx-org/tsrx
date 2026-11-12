import {
	collect_stylesheet_texts,
	expect_cyclic_apply_error,
	expect_mark_before,
} from '@tsrx/core/test-harness/runtime/scoped-styles-dom';
import { createSignal } from 'solid-js';
import { ThemeApplyApp } from '@tsrx/vite-plugin-solid-test/scoped-styles/applier.tsrx';

const THEME_MARK = '--tsrx-theme-mark';
const APPLIER_MARK = '--tsrx-applier-mark';
const SCOPE_HASH = expect.stringMatching(/^tsrx-[0-9a-f]+$/);

type SpreadBag = Record<string, unknown> | null | undefined;

function SpreadClassApp(props: { bag?: SpreadBag }) @{
	<>
		<style>
			span {
				color: rgb(0, 128, 0);
			}
		</style>
		<span data-probe="spread" {...props.bag} />
		<span data-probe="class-before" class="base" {...props.bag} />
		<span data-probe="class-after" {...props.bag} class="last" />
	</>
}

function ForwardedClass(props: Record<string, unknown>) @{
	<>
		<style>
			span {
				color: rgb(0, 128, 0);
			}
		</style>
		<span data-probe="forwarded" class="base" {...props} />
	</>
}

const [forwarded_class, set_forwarded_class] = createSignal<string | undefined>('one');
const [swapped_bag, set_swapped_bag] = createSignal<SpreadBag>({ class: 'one' });

function ReactiveSpreadClassApp() @{
	<>
		<style>
			span {
				color: rgb(0, 128, 0);
			}
		</style>
		<ForwardedClass class={forwarded_class()} />
		<span data-probe="swapped" {...swapped_bag()} />
	</>
}

function classes(probe: string): string[] {
	const element = container.querySelector(`[data-probe="${probe}"]`) as HTMLElement;
	return element.className.split(' ');
}

describe('sibling-scoped apply runtime (solid)', function () {
	it('mounts a theme module plus applier and keeps the local rule later in the cascade', async function () {
		await render(ThemeApplyApp);

		const applied = container.querySelector('[data-probe="applied"]') as HTMLElement;
		const opted_in = container.querySelector('[data-probe="opt-in"]') as HTMLElement;
		const untouched = container.querySelector('[data-probe="untouched"]') as HTMLElement;

		expect(applied).not.toBeNull();
		expect(opted_in).not.toBeNull();
		expect(untouched).not.toBeNull();
		expect(applied.className).toContain('probe');
		expect(opted_in.className).toMatch(/tsrx-[0-9a-f]+/);
		expect(untouched.className).not.toMatch(/tsrx-[0-9a-f]+/);

		expect_mark_before(collect_stylesheet_texts(), THEME_MARK, APPLIER_MARK);

		expect(getComputedStyle(applied).color).toBe('rgb(0, 0, 0)');
		expect(getComputedStyle(opted_in).color).toBe('rgb(0, 128, 0)');
	});

	it('keeps the class a host spread supplies beside the scope hash', async function () {
		await render(SpreadClassApp, { bag: { class: 'from-spread', id: 'spread-id' } });

		expect(classes('spread')).toEqual(['from-spread', SCOPE_HASH]);
		expect(classes('class-before')).toEqual(['from-spread', SCOPE_HASH]);
		expect(classes('class-after')).toEqual(['last', SCOPE_HASH]);
		expect(container.querySelector('[data-probe="spread"]')?.id).toBe('spread-id');
	});

	it('keeps an object class a host spread supplies beside the scope hash', async function () {
		await render(SpreadClassApp, { bag: { class: { active: true, inactive: false } } });

		expect(classes('spread')).toEqual(['active', SCOPE_HASH]);
		expect(classes('class-before')).toEqual(['active', SCOPE_HASH]);
	});

	for (const [label, bag] of [
		['without a class', { id: 'spread-id' }],
		['with an undefined class', { class: undefined }],
		['of an omitted bag', undefined],
	] as const) {
		it(`keeps the scope hash beside a host spread ${label}`, async function () {
			await render(SpreadClassApp, { bag });

			expect(classes('spread')).toEqual([SCOPE_HASH]);
			expect(classes('class-before')).toEqual(
				bag && 'class' in bag ? [SCOPE_HASH] : ['base', SCOPE_HASH],
			);
			expect(classes('class-after')).toEqual(['last', SCOPE_HASH]);
		});
	}

	it('updates the class a host spread supplies', async function () {
		set_forwarded_class('one');
		set_swapped_bag({ class: 'one' });
		await render(ReactiveSpreadClassApp);

		expect(classes('forwarded')).toEqual(['one', SCOPE_HASH]);
		expect(classes('swapped')).toEqual(['one', SCOPE_HASH]);

		set_forwarded_class('two');
		set_swapped_bag({ class: 'two' });
		await flush();
		expect(classes('forwarded')).toEqual(['two', SCOPE_HASH]);
		expect(classes('swapped')).toEqual(['two', SCOPE_HASH]);

		set_forwarded_class(undefined);
		set_swapped_bag({ id: 'none' });
		await flush();
		expect(classes('forwarded')).toEqual([SCOPE_HASH]);
		expect(classes('swapped')).toEqual([SCOPE_HASH]);
	});

	it('throws when an applier evaluates before its imported theme', async function () {
		try {
			await import('@tsrx/vite-plugin-solid-test/scoped-styles/cycle-theme.tsrx');
			throw new Error('expected the cyclic apply import to throw');
		} catch (error) {
			if (error instanceof Error && error.message === 'expected the cyclic apply import to throw') {
				throw error;
			}
			expect_cyclic_apply_error(error);
		}
	});
});
