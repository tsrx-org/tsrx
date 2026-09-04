import {
	collect_stylesheet_texts,
	expect_cyclic_apply_error,
	expect_mark_before,
} from '@tsrx/core/test-harness/runtime/scoped-styles-dom';
import { ThemeApplyApp } from './fixtures/scoped-styles/applier.tsrx';

const THEME_MARK = '--tsrx-theme-mark';
const APPLIER_MARK = '--tsrx-applier-mark';

describe('sibling-scoped apply runtime (preact)', function () {
	it(
		'mounts a theme module plus applier and keeps the local rule later in the cascade',
		async function () {
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
		},
	);

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
