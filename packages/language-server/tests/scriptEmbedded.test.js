import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createLanguage, forEachEmbeddedCode } from '@volar/language-core';
import { createUriMap } from '@volar/language-service';
import { URI } from 'vscode-uri';
import { beforeEach, describe, expect, it } from 'vitest';
import { getTsrxLanguagePlugin, _reset_for_test } from '@tsrx/typescript-plugin/src/language.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root_dir = path.resolve(dirname, '../../..');
const fixture_dir = path.join(root_dir, 'packages', 'language-server', 'tests', 'fixtures');

beforeEach(() => {
	_reset_for_test();
});

/**
 * Build a virtual code for a `.tsrx` source and return it alongside the language
 * plugin instance so tests can inspect the generated code, its mappings and the
 * embedded codes.
 * @param {string} source
 * @param {string} [fixture_name] `react/App.tsrx` selects the workspace `@tsrx/react` compiler
 *   through `tests/fixtures/react/tsconfig.json`.
 */
function create_virtual_code(source, fixture_name = 'App.tsrx') {
	const uri = URI.file(path.join(fixture_dir, fixture_name));
	const scripts = createUriMap();
	const plugin = getTsrxLanguagePlugin();
	const language = createLanguage([plugin], scripts, () => {});
	language.scripts.set(uri, ts.ScriptSnapshot.fromString(source), 'tsrx');
	const root = language.scripts.get(uri)?.generated?.root;
	return { plugin, root, fileName: uri.fsPath };
}

/**
 * @param {import('@volar/language-core').VirtualCode | undefined} root
 * @param {string} languageId
 */
function embedded_of(root, languageId) {
	const out = [];
	for (const code of forEachEmbeddedCode(/** @type {any} */ (root))) {
		if (code.languageId === languageId) out.push(code);
	}
	return out;
}

/** @param {import('@volar/language-core').VirtualCode | undefined} root */
function generated(root) {
	return root ? root.snapshot.getText(0, root.snapshot.getLength()) : '';
}

/**
 * The mapping of a script body: the one whose `customData.embeddedId` names it.
 * @param {import('@volar/language-core').VirtualCode | undefined} root
 * @param {string} id
 */
function script_mapping(root, id) {
	return root?.mappings.find((mapping) => mapping.data.customData?.embeddedId === id);
}

describe('<script> bodies embedded in the generated TSX', () => {
	// `<script>` bodies are not embedded codes: the transform appends each one to
	// the generated TSX as an async IIFE with a mapping back to the source, so
	// TypeScript checks them in the same file on every path (language server,
	// tsserver plugin, content mapper) with no extra service scripts.
	it('appends a <script type="text/typescript"> body as a mapped async IIFE', () => {
		const source = `function App() @{
	<head>
		<script type="text/typescript">const n: number = 1 < 2 ? 3 : 4;</script>
	</head>
}`;
		const body = 'const n: number = 1 < 2 ? 3 : 4;';
		const { root } = create_virtual_code(source);
		expect(embedded_of(root, 'typescript')).toHaveLength(0);
		const text = generated(root);
		expect(text).toMatch(
			/;void \(async \(\) => \{\nconst n: number = 1 < 2 \? 3 : 4;\n\}\)\(\);\n$/,
		);
		// The copy inside the JSX <script> element is blanked, so `<` never parses as a tag.
		expect(text).toMatch(/<script type="text\/typescript">\s*<\/script>/);
		const mapping = script_mapping(root, 'script_0');
		expect(mapping).toBeDefined();
		expect(mapping?.sourceOffsets).toEqual([source.indexOf(body)]);
		expect(mapping?.lengths).toEqual([body.length]);
		expect(
			text.slice(mapping?.generatedOffsets[0], mapping?.generatedOffsets[0] + body.length),
		).toBe(body);
		expect(mapping?.data).toMatchObject({
			verification: true,
			completion: true,
			semantic: true,
			navigation: true,
			format: false,
		});
	});

	it('treats a plain <script> body as TypeScript too (TS is a superset of JS)', () => {
		const { root } = create_virtual_code(
			`function App() @{
	<head>
		<script>console.log(1 < 2);</script>
	</head>
}`,
		);
		expect(generated(root)).toContain(';void (async () => {\nconsole.log(1 < 2);\n})();\n');
		expect(script_mapping(root, 'script_0')).toBeDefined();
	});

	it('keeps <style> CSS embedded codes beside an embedded <script> body', () => {
		const { root } = create_virtual_code(
			`function App() @{
	<head>
		<script type="text/typescript">const a: number = 1;</script>
	</head>
	<div>
		<style>
			.card { color: red; }
		</style>
	</div>
}`,
		);
		expect(embedded_of(root, 'css')).toHaveLength(1);
		expect(embedded_of(root, 'typescript')).toHaveLength(0);
		expect(generated(root)).toContain(';void (async () => {\nconst a: number = 1;\n})();\n');
	});

	it('gives each <script> body its own wrapper, so their declarations never collide', () => {
		const { root } = create_virtual_code(
			`function App() @{
	<head>
		<script type="text/typescript">const a: number = 1;</script>
		<script>const a = 2;</script>
	</head>
}`,
		);
		const text = generated(root);
		expect(text).toContain(';void (async () => {\nconst a: number = 1;\n})();\n');
		expect(text).toContain(';void (async () => {\nconst a = 2;\n})();\n');
		expect(script_mapping(root, 'script_0')).toBeDefined();
		expect(script_mapping(root, 'script_1')).toBeDefined();
	});

	it('hoists import declarations of a <script type="module"> body to module level, mapped', () => {
		const source = `function App() @{
	<head>
		<script type="module">import { helper } from './helper.js';
const value: number = helper();</script>
	</head>
}`;
		const { root } = create_virtual_code(source);
		const text = generated(root);
		const wrap = text.indexOf(';void (async () => {\n');
		expect(text.indexOf("import { helper } from './helper.js';")).toBeGreaterThan(-1);
		expect(text.indexOf("import { helper } from './helper.js';")).toBeLessThan(wrap);
		// Its place in the wrapper is blanked; the statement after it keeps its column.
		expect(text.slice(wrap)).toMatch(
			/;void \(async \(\) => \{\n {37}\nconst value: number = helper\(\);\n\}\)\(\);\n/,
		);
		const mapping = script_mapping(root, 'script_0');
		const import_index = mapping?.sourceOffsets.indexOf(source.indexOf('import { helper }'));
		expect(import_index).toBeGreaterThanOrEqual(0);
		expect(
			text.slice(
				mapping?.generatedOffsets[import_index ?? 0],
				(mapping?.generatedOffsets[import_index ?? 0] ?? 0) +
					(mapping?.lengths[import_index ?? 0] ?? 0),
			),
		).toBe("import { helper } from './helper.js';");
	});

	it('wraps a module-script body in an async IIFE so top-level await is legal', () => {
		const source = `function App() @{
	<head>
		<script type="module">const data = await fetch('/api');</script>
	</head>
}`;
		const body = "const data = await fetch('/api');";
		const { root } = create_virtual_code(source);
		const text = generated(root);
		expect(text).toContain(";void (async () => {\nconst data = await fetch('/api');\n})();\n");
		const mapping = script_mapping(root, 'script_0');
		expect(mapping?.sourceOffsets).toEqual([source.indexOf(body)]);
		expect(mapping?.lengths).toEqual([body.length]);
		expect(
			text.slice(mapping?.generatedOffsets[0], (mapping?.generatedOffsets[0] ?? 0) + body.length),
		).toBe(body);
	});

	it('blanks export modifiers so a module-script export stays isolated in the wrapper', () => {
		const source = `function App() @{
	<head>
		<script type="module">export const answer: number = 42;</script>
	</head>
}`;
		const { root } = create_virtual_code(source);
		const text = generated(root);
		expect(text).toMatch(/;void \(async \(\) => \{\n {7}const answer: number = 42;\n\}\)\(\);\n/);
		const mapping = script_mapping(root, 'script_0');
		const declaration = 'const answer: number = 42;';
		const index = mapping?.sourceOffsets.indexOf(source.indexOf(declaration));
		expect(index).toBeGreaterThanOrEqual(0);
		expect(
			text.slice(
				mapping?.generatedOffsets[index ?? 0],
				(mapping?.generatedOffsets[index ?? 0] ?? 0) + (mapping?.lengths[index ?? 0] ?? 0),
			),
		).toBe(declaration);
	});

	it('hoists export-from of a <script type="module"> body to module level, mapped', () => {
		const source = `function App() @{
	<head>
		<script type="module">export { helper } from './helper.js';
const value: number = 1;</script>
	</head>
}`;
		const { root } = create_virtual_code(source);
		const text = generated(root);
		const wrap = text.indexOf(';void (async () => {\n');
		expect(text.indexOf("export { helper } from './helper.js';")).toBeGreaterThan(-1);
		expect(text.indexOf("export { helper } from './helper.js';")).toBeLessThan(wrap);
		expect(text.slice(wrap)).toMatch(
			/;void \(async \(\) => \{\n {37}\nconst value: number = 1;\n\}\)\(\);\n/,
		);
		const mapping = script_mapping(root, 'script_0');
		const export_index = mapping?.sourceOffsets.indexOf(source.indexOf('export { helper }'));
		expect(export_index).toBeGreaterThanOrEqual(0);
		expect(
			text.slice(
				mapping?.generatedOffsets[export_index ?? 0],
				(mapping?.generatedOffsets[export_index ?? 0] ?? 0) +
					(mapping?.lengths[export_index ?? 0] ?? 0),
			),
		).toBe("export { helper } from './helper.js';");
	});

	it('emits nothing for a self-closing <script src=... />', () => {
		const { root } = create_virtual_code(
			`function App() @{
	<head>
		<script src="/a.js" />
	</head>
}`,
		);
		expect(generated(root)).not.toContain(';void (async () => {');
		expect(root?.mappings.some((mapping) => mapping.data.customData?.embeddedId)).toBe(false);
	});
});

describe('<script> bodies while the file has a fatal compile error', () => {
	// `import { from 'x';` makes compilation throw fatally: the generated code is
	// the raw source, CSS keeps its embedded codes from the regex fallback, and
	// script bodies are left to the compile error (no wrapper, no embedded code).
	it('embeds no script code and keeps CSS intellisense alive', () => {
		const { root } = create_virtual_code(
			`import { from 'x';
function App() @{
	<head>
		<script type="text/typescript">const n: number = 1;</script>
		<style>.a { color: red; }</style>
	</head>
}`,
		);
		expect(embedded_of(root, 'typescript')).toHaveLength(0);
		expect(embedded_of(root, 'css')).toHaveLength(1);
		expect(generated(root)).not.toContain(';void (async () => {');
	});
});

describe('embedded <style> virtual codes (sibling-scoped style blocks)', () => {
	// These compile through the workspace `@tsrx/react` compiler (see `tests/fixtures/react/`):
	// the installed `@tsrx/ripple` package predates scoped style blocks and `apply`.
	const REACT = 'react/App.tsrx';

	/** @param {import('@volar/language-core').VirtualCode[]} codes */
	const css_texts = (codes) =>
		codes.map((code) => code.snapshot.getText(0, code.snapshot.getLength()));

	it('creates one CSS embedded code per block with distinct scope-hash ids for two blocks in one scope', () => {
		const { root } = create_virtual_code(
			`export function App() @{
	<>
		<style>.a { color: red; }</style>
		<div class="a">{'a'}</div>
		<style>.b { margin: 0; }</style>
	</>
}`,
			REACT,
		);
		expect(root?.fatalErrors).toEqual([]);
		const css_codes = embedded_of(root, 'css');
		expect(css_texts(css_codes)).toEqual(['.a { color: red; }', '.b { margin: 0; }']);
		for (const code of css_codes) {
			expect(code.id).toMatch(/^style-tsrx-[0-9a-f]+$/);
		}
		expect(new Set(css_codes.map((code) => code.id)).size).toBe(2);
	});

	it('adds a third CSS embedded code for a block nested in a @{ } code block', () => {
		const { root } = create_virtual_code(
			`export function App() @{
	<>
		<style>.a { color: red; }</style>
		<div class="a">{'a'}</div>
		<style>.b { margin: 0; }</style>
		@{
			<>
				<style>.c { padding: 0; }</style>
				<p class="c">{'c'}</p>
			</>
		}
	</>
}`,
			REACT,
		);
		expect(root?.fatalErrors).toEqual([]);
		const css_codes = embedded_of(root, 'css');
		expect(css_texts(css_codes)).toEqual([
			'.a { color: red; }',
			'.b { margin: 0; }',
			'.c { padding: 0; }',
		]);
		expect(new Set(css_codes.map((code) => code.id)).size).toBe(3);
	});

	it('emits no CSS embedded code for a self-closed <style apply={…} /> and does not swallow a later block', () => {
		const { root } = create_virtual_code(
			`const theme = <style>.a { color: red; }</style>;
export function App() @{
	<>
		<style apply={theme} />
		<div class="b">{'b'}</div>
		<style>.b { margin: 0; }</style>
	</>
}`,
			REACT,
		);
		expect(root?.fatalErrors).toEqual([]);
		expect(root?.usageErrors).toEqual([]);
		const css_codes = embedded_of(root, 'css');
		// One for the assigned block, one for the later bodied block, none for the self-closed apply.
		expect(css_texts(css_codes)).toEqual(['.a { color: red; }', '.b { margin: 0; }']);
		expect(new Set(css_codes.map((code) => code.id)).size).toBe(2);
		// Each embedded CSS region points at its own body in the source.
		const source_offsets = css_codes.map((code) => code.mappings[0].sourceOffsets[0]);
		expect(source_offsets[0]).toBeLessThan(source_offsets[1]);
	});

	it('emits exactly one CSS embedded code for a scoped apply block with a body', () => {
		const { root } = create_virtual_code(
			`const theme = <style>.a { color: red; }</style>;
export function App() @{
	<>
		<style apply={theme}>.b { margin: 0; }</style>
		<div class="b">{'b'}</div>
	</>
}`,
			REACT,
		);
		expect(root?.fatalErrors).toEqual([]);
		expect(root?.usageErrors).toEqual([]);
		expect(css_texts(embedded_of(root, 'css'))).toEqual([
			'.a { color: red; }',
			'.b { margin: 0; }',
		]);
	});
});
