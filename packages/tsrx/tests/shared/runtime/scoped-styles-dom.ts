/**
 * DOM helpers for sibling-scoped `<style apply>` runtime tests.
 * Style tags are collected in document order so a theme module's sheet can be
 * compared against the applier that imported it.
 */

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

export function index_of_mark(texts: string[], mark: string): number {
	return texts.findIndex(function has_mark(text: string) {
		return text.includes(mark);
	});
}
