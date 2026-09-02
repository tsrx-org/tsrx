import { describe, expect, it } from 'vitest';
import { createAutoInsertPlugin, matchOpeningTag } from '../src/autoInsertPlugin.js';
import { create_service_harness } from './setup.js';

/**
 * Emulate the editor having just typed `>` at the end of `before`: the document is
 * `before + '>' + after`, the cursor sits right after the `>`, and the change inserted `>`.
 * @param {string} before
 * @param {string} [after]
 */
async function auto_insert_after_gt(before, after = '') {
	const source = `${before}>${after}`;
	const { document, service, uri } = create_service_harness(
		source,
		[createAutoInsertPlugin()],
		'react/App.tsrx',
	);
	const gt_offset = before.length;
	const selection = document.positionAt(gt_offset + 1);
	return service.getAutoInsertSnippet(uri, selection, {
		rangeOffset: gt_offset,
		rangeLength: 0,
		text: '>',
	});
}

describe('auto-insert plugin — <style> tags', () => {
	it('closes a plain element tag', async () => {
		const snippet = await auto_insert_after_gt(
			'export function App() @{\n\t<>\n\t\t<div />\n\t\t<span',
			'\n\t</>\n}',
		);
		expect(snippet).toBe('$0</span>');
	});

	it('closes a plain <style> tag', async () => {
		const snippet = await auto_insert_after_gt(
			'export function App() @{\n\t<>\n\t\t<div />\n\t\t<style',
			'\n\t</>\n}',
		);
		expect(snippet).toBe('$0</style>');
	});

	it('closes <style apply={…}> when the expression contains `>`', async () => {
		const snippet = await auto_insert_after_gt(
			'const a = <style>.a { color: red; }</style>;\nconst b = <style>.b { color: red; }</style>;\nexport function App(props) @{\n\t<>\n\t\t<div />\n\t\t<style apply={props.x > 1 ? a : b}',
			'\n\t</>\n}',
		);
		expect(snippet).toBe('$0</style>');
	});

	it('closes <style apply={[a, b]}>', async () => {
		const snippet = await auto_insert_after_gt(
			'const a = <style>.a { color: red; }</style>;\nconst b = <style>.b { color: red; }</style>;\nexport function App() @{\n\t<>\n\t\t<div />\n\t\t<style apply={[a, b]}',
			'\n\t</>\n}',
		);
		expect(snippet).toBe('$0</style>');
	});

	it('does not close a self-closed <style apply={…} />', async () => {
		const snippet = await auto_insert_after_gt(
			'const theme = <style>.a { color: red; }</style>;\nexport function App() @{\n\t<>\n\t\t<div />\n\t\t<style apply={theme} /',
			'\n\t</>\n}',
		);
		expect(snippet).toBeFalsy();
	});

	it('does not close a tag when the `>` is typed inside an attribute expression', async () => {
		const snippet = await auto_insert_after_gt(
			'const a = <style>.a { color: red; }</style>;\nconst b = <style>.b { color: red; }</style>;\nexport function App(props) @{\n\t<>\n\t\t<div />\n\t\t<style apply={props.x ',
			' 1 ? a : b}>.c { margin: 0; }</style>\n\t</>\n}',
		);
		expect(snippet).toBeFalsy();
	});
});

describe('matchOpeningTag', () => {
	it('matches simple and attributed opening tags', () => {
		expect(matchOpeningTag('<div>')).toBe('div');
		expect(matchOpeningTag('<Component.Item>')).toBe('Component.Item');
		expect(matchOpeningTag('<div class="a > b" title=\'x>\'>')).toBe('div');
		expect(matchOpeningTag('<style apply={theme}>')).toBe('style');
	});

	it('tolerates `>` and braces inside attribute expressions', () => {
		expect(matchOpeningTag('<style apply={x > y ? a : b}>')).toBe('style');
		expect(matchOpeningTag('<style apply={[a, b]}>')).toBe('style');
		expect(matchOpeningTag('<div hidden={a > b} data={{ x: 1 }}>')).toBe('div');
		expect(matchOpeningTag("<div title={'}>' + x}>")).toBe('div');
	});

	it('rejects self-closing tags and a `>` that does not close the tag', () => {
		expect(matchOpeningTag('<style apply={theme} />')).toBeNull();
		expect(matchOpeningTag('<img/>')).toBeNull();
		expect(matchOpeningTag('<style apply={x >')).toBeNull();
		expect(matchOpeningTag('<div>text>')).toBeNull();
		expect(matchOpeningTag('</div>')).toBeNull();
	});
});
