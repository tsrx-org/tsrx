/**
 * DOM helpers for sibling-scoped `<style apply>` runtime tests.
 * Style tags are collected in document order so a theme module's sheet can be
 * compared against the applier that imported it.
 */

import { expect } from 'vitest';

export function collect_stylesheet_texts(): string[] {
	const texts: string[] = [];
	const seen = new Set<string>();

	function push_unique(text: string) {
		const trimmed = text.trim();
		if (!trimmed || seen.has(trimmed)) {
			return;
		}
		seen.add(trimmed);
		texts.push(trimmed);
	}

	for (const node of document.querySelectorAll('style')) {
		if (node.textContent) {
			push_unique(node.textContent);
		}
	}

	for (const sheet of document.styleSheets) {
		try {
			const rules: string[] = [];
			for (const rule of sheet.cssRules) {
				rules.push(rule.cssText);
			}
			if (rules.length > 0) {
				push_unique(rules.join('\n'));
			}
		} catch {
			// Ignore unreadable sheets; injected test CSS is same-origin.
		}
	}

	return texts;
}

export function mark_position(texts: string[], mark: string): { sheet: number; at: number } {
	for (let i = 0; i < texts.length; i += 1) {
		const at = texts[i].indexOf(mark);
		if (at !== -1) {
			return { sheet: i, at };
		}
	}
	return { sheet: -1, at: -1 };
}

export function expect_mark_before(texts: string[], earlier: string, later: string) {
	const first = mark_position(texts, earlier);
	const second = mark_position(texts, later);
	expect(first.sheet).toBeGreaterThan(-1);
	expect(second.sheet).toBeGreaterThan(-1);
	if (first.sheet === second.sheet) {
		expect(first.at).toBeLessThan(second.at);
		return;
	}
	expect(first.sheet).toBeLessThan(second.sheet);
}

/**
 * D13 layer 3: reading `theme.$class` while the imported theme is still
 * uninitialized. Native ESM throws ReferenceError (TDZ). Vite's transform
 * often binds the cycle as `undefined`, which throws TypeError instead.
 */
export function expect_cyclic_apply_error(error: unknown) {
	const is_tdz = error instanceof ReferenceError;
	const is_vite_cycle = error instanceof TypeError && String(error.message).includes('$class');
	expect(is_tdz || is_vite_cycle).toBe(true);
}
