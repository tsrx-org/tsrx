// @vitest-environment jsdom

import { EditorView } from '@codemirror/view';
import { afterEach, expect, it, vi } from 'vitest';
import { shiki_highlight } from '../src/lib/shiki-codemirror.ts';

// Shiki loads its grammars and themes asynchronously. While the rest of the suite
// competes for workers that can take far longer than `vi.waitFor`'s 1s default.
const highlight_timeout = 20_000;
vi.setConfig({ testTimeout: highlight_timeout + 10_000 });

const editors: EditorView[] = [];

afterEach(() => {
	for (const editor of editors.splice(0)) editor.destroy();
	document.body.replaceChildren();
});

it.each([
	['tsrx', 'function App() @{ @if (ready) { <div /> } }', '@'],
	['tsx', 'const view = <div />;', 'div'],
	['javascript', 'const answer = 42;', 'const'],
	['css', '.card { color: red; }', 'color'],
])('renders %s syntax highlighting in CodeMirror', async (language, source, token) => {
	const parent = document.createElement('div');
	document.body.appendChild(parent);
	editors.push(new EditorView({ doc: source, extensions: [shiki_highlight(language)], parent }));

	await vi.waitFor(() => {
		const highlighted = [...parent.querySelectorAll<HTMLElement>('.cm-line span[style]')];
		expect(highlighted.some((span) => span.style.color && span.textContent?.includes(token))).toBe(
			true,
		);
	}, highlight_timeout);
});
