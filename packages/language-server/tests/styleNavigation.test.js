import { describe, expect, it } from 'vitest';
import { createDefinitionPlugin } from '../src/definitionPlugin.js';
import { createHoverPlugin } from '../src/hoverPlugin.js';
import { create_typescript_harness } from './setup.js';

// Assigned style blocks lower to `{ '$class': '<hash>', card: '<hash> card' }` in the generated
// TSX, so member access on them is ordinary TypeScript: hover and definition go through the
// generated code and its mappings.
const SOURCE = `const theme = <style>
	.card { color: red; }
</style>;

export function App() @{
	<style apply={theme} />
	<div class={theme.card} data-x={theme.$class}>{'hi'}</div>
}`;

/**
 * Position one character into `needle` (skipping `skip` characters first).
 * @param {string} needle
 * @param {number} [skip]
 */
function position_in(needle, skip = 0) {
	const index = SOURCE.indexOf(needle);
	expect(index).toBeGreaterThanOrEqual(0);
	const lines = SOURCE.slice(0, index + skip).split('\n');
	return { line: lines.length - 1, character: lines[lines.length - 1].length + 1 };
}

const THEME_DECLARATION = {
	start: { line: 0, character: 6 },
	end: { line: 0, character: 11 },
};

describe('hover and definition on assigned style block members', () => {
	it('hovers `theme.$class` as a string property', async () => {
		const { document, service, uri } = create_typescript_harness(SOURCE, [
			createHoverPlugin(),
			createDefinitionPlugin(),
		]);

		const position = position_in('theme.$class', 'theme.'.length);
		const hover = await service.getHover(uri, position);
		expect(hover?.contents).toMatchObject({ kind: 'markdown' });
		expect(/** @type {{ value: string }} */ (hover?.contents).value).toContain(
			"(property) '$class': string",
		);
		expect(hover?.range && document.getText(hover.range)).toBe('$class');

		// The `'$class'` key only exists in the generated object literal (no source mapping), so
		// there is no definition to jump to. Mapping it to the `<style>` block is a possible
		// future improvement in the compiler's type-only output.
		const definition = await service.getDefinition(uri, position);
		expect(definition ?? []).toEqual([]);
	});

	it('hovers `theme.card` as a string property', async () => {
		const { document, service, uri } = create_typescript_harness(SOURCE, [
			createHoverPlugin(),
			createDefinitionPlugin(),
		]);

		const position = position_in('theme.card', 'theme.'.length);
		const hover = await service.getHover(uri, position);
		expect(/** @type {{ value: string }} */ (hover?.contents).value).toContain(
			"(property) 'card': string",
		);
		expect(hover?.range && document.getText(hover.range)).toBe('card');
	});

	it('resolves `theme` in an element attribute to the assigned block declaration', async () => {
		const { document, service, uri } = create_typescript_harness(SOURCE, [
			createHoverPlugin(),
			createDefinitionPlugin(),
		]);

		const position = position_in('theme.card');
		const hover = await service.getHover(uri, position);
		expect(/** @type {{ value: string }} */ (hover?.contents).value).toContain('const theme: {');
		expect(/** @type {{ value: string }} */ (hover?.contents).value).toContain('$class: string');
		expect(hover?.range && document.getText(hover.range)).toBe('theme');

		const definition = await service.getDefinition(uri, position);
		expect(definition?.map((link) => link.targetSelectionRange)).toEqual([THEME_DECLARATION]);
	});

	it('resolves `theme` in `<style apply={theme} />` to the assigned block declaration', async () => {
		const { document, service, uri } = create_typescript_harness(SOURCE, [
			createHoverPlugin(),
			createDefinitionPlugin(),
		]);

		const position = position_in('apply={theme}', 'apply={'.length);
		const hover = await service.getHover(uri, position);
		expect(/** @type {{ value: string }} */ (hover?.contents).value).toContain('const theme: {');
		expect(hover?.range && document.getText(hover.range)).toBe('theme');

		const definition = await service.getDefinition(uri, position);
		expect(definition?.map((link) => link.targetSelectionRange)).toContainEqual(THEME_DECLARATION);
		expect(definition?.every((link) => link.targetUri === uri.toString())).toBe(true);
	});
});
