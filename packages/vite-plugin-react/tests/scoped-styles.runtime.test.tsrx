import {
	collect_stylesheet_texts,
	expect_cyclic_apply_error,
	expect_mark_before,
} from '@tsrx/core/test-harness/runtime/scoped-styles-dom';
import { useState } from 'react';
import { ThemeApplyApp } from './fixtures/scoped-styles/applier.tsrx';

const THEME_MARK = '--tsrx-theme-mark';
const APPLIER_MARK = '--tsrx-applier-mark';
const SCOPE_HASH = expect.stringMatching(/^tsrx-[0-9a-f]+$/);

type SpreadBag = Record<string, unknown> | null | undefined;

function SpreadClassApp({ bag }: { bag?: SpreadBag }) @{
	<>
		<style>
			span {
				color: rgb(0, 128, 0);
			}
		</style>
		<span data-probe="spread" {...bag} />
		<span data-probe="class-before" className="base" {...bag} />
		<span data-probe="class-after" {...bag} className="last" />
	</>
}

const reactive_bags: SpreadBag[] = [{ className: 'one' }, { className: 'two' }, { id: 'none' }];

function ReactiveSpreadClassApp() @{
	const [index, setIndex] = useState(0);

	<>
		<style>
			span {
				color: rgb(0, 128, 0);
			}
		</style>
		<span data-probe="spread" {...reactive_bags[index]} />
		<button data-probe="next" onClick={() => setIndex(index + 1)} />
	</>
}

function classes(probe: string): string[] {
	const element = container.querySelector(`[data-probe="${probe}"]`) as HTMLElement;
	return element.className.split(' ');
}

describe('sibling-scoped apply runtime (react)', function () {
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
		await render(SpreadClassApp, { bag: { className: 'from-spread', id: 'spread-id' } });

		expect(classes('spread')).toEqual(['from-spread', SCOPE_HASH]);
		expect(classes('class-before')).toEqual(['from-spread', SCOPE_HASH]);
		expect(classes('class-after')).toEqual(['last', SCOPE_HASH]);
		expect(container.querySelector('[data-probe="spread"]')?.id).toBe('spread-id');
	});

	for (const [label, bag] of [
		['without a class', { id: 'spread-id' }],
		['with an undefined class', { className: undefined }],
		['of an omitted bag', undefined],
	] as const) {
		it(`keeps the scope hash beside a host spread ${label}`, async function () {
			await render(SpreadClassApp, { bag });

			expect(classes('spread')).toEqual([SCOPE_HASH]);
			expect(classes('class-before')).toEqual(
				bag && 'className' in bag ? [SCOPE_HASH] : ['base', SCOPE_HASH],
			);
			expect(classes('class-after')).toEqual(['last', SCOPE_HASH]);
		});
	}

	it('updates the class a host spread supplies', async function () {
		await render(ReactiveSpreadClassApp);
		const next = container.querySelector('[data-probe="next"]') as HTMLButtonElement;

		expect(classes('spread')).toEqual(['one', SCOPE_HASH]);
		await act(async () => next.click());
		expect(classes('spread')).toEqual(['two', SCOPE_HASH]);
		await act(async () => next.click());
		expect(classes('spread')).toEqual([SCOPE_HASH]);
	});

	it('throws when an applier evaluates before its imported theme', async function () {
		try {
			await import('./fixtures/scoped-styles/cycle-theme.tsrx');
			throw new Error('expected the cyclic apply import to throw');
		} catch (error) {
			if (error instanceof Error && error.message === 'expected the cyclic apply import to throw') {
				throw error;
			}
			expect_cyclic_apply_error(error);
		}
	});
});
