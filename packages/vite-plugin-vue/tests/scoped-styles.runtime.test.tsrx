import {
	collect_stylesheet_texts,
	index_of_mark,
} from '@tsrx/core/test-harness/runtime/scoped-styles-dom';
import { ThemeApplyApp } from './fixtures/scoped-styles/applier.tsrx';

const THEME_MARK = '--tsrx-theme-mark';
const APPLIER_MARK = '--tsrx-applier-mark';

describe('sibling-scoped apply runtime (vue)', function () {
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

			const sheets = collect_stylesheet_texts();
			const theme_index = index_of_mark(sheets, THEME_MARK);
			const applier_index = index_of_mark(sheets, APPLIER_MARK);
			expect(theme_index).toBeGreaterThan(-1);
			expect(applier_index).toBeGreaterThan(-1);
			expect(theme_index).toBeLessThan(applier_index);

			expect(getComputedStyle(applied).color).toBe('rgb(0, 0, 0)');
			expect(getComputedStyle(opted_in).color).toBe('rgb(0, 128, 0)');
		},
	);

	it('throws ReferenceError when an applier evaluates before its imported theme', async function () {
		await expect(import('./fixtures/scoped-styles/cycle-theme.tsrx')).rejects.toThrow(
			ReferenceError,
		);
	});
});
