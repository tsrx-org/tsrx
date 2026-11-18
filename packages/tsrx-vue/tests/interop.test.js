import { describe, expect, it } from 'vitest';
import { addVaporInteropToCreateVaporApp } from '../src/interop.js';

const real_import = "import { createVaporApp } from 'vue';\ncreateVaporApp(App).mount('#root');";
const rewritten_import = `import { createVaporApp as __tsrx_createVaporApp, vaporInteropPlugin } from 'vue';
const createVaporApp = (...args) => __tsrx_createVaporApp(...args).use(vaporInteropPlugin);`;

describe('addVaporInteropToCreateVaporApp', () => {
	it.each([
		`export const example = "import { createVaporApp } from 'vue';";`,
		'export const example = \'import { createVaporApp } from "vue";\';',
		"export const example = `import { createVaporApp } from 'vue';`;",
		"export const example = `${'a'} import { createVaporApp } from 'vue';`;",
		`// import { createVaporApp } from 'vue';\ncreateVaporApp();`,
		`/* import { createVaporApp } from 'vue'; */\ncreateVaporApp();`,
		`const pattern = /import { createVaporApp } from 'vue'/;`,
		`export function check(s) {\n\treturn /"/.test(s) && "import { createVaporApp } from 'vue';";\n}`,
		`let a = 1; const half = a++ / 2; const text = "/ import { createVaporApp } from 'vue';";`,
		`export function pattern() {\n\treturn /import { createVaporApp } from "vue"/;\n}`,
	])('leaves import-like text outside an import declaration alone: %s', (input) => {
		expect(addVaporInteropToCreateVaporApp(input)).toBe(input);
	});

	it.each([
		'function t(s) { return /`/.test(s) }',
		'function stars(s) { return /^\\/*$/.test(s) }',
		'const key = <kbd>`</kbd>;',
		'const glob = <p>src/*.ts</p>;',
		"if (ok) /'/.test(s);",
		"import { a } from './a';",
		'const text = "import { createVaporApp } from \'vue\';";',
	])('rewrites the real import after %s', (before) => {
		const output = addVaporInteropToCreateVaporApp(`${before}\n${real_import}`);

		expect(output).toBe(`${before}\n${rewritten_import}\ncreateVaporApp(App).mount('#root');`);
	});

	it('rewrites a real import on the same line as a regular expression', () => {
		const output = addVaporInteropToCreateVaporApp(`if (ok) /'/.test(s); ${real_import}`);

		expect(output).toBe(
			`if (ok) /'/.test(s); ${rewritten_import}\ncreateVaporApp(App).mount('#root');`,
		);
	});

	it('keeps other bindings of the rewritten declaration', () => {
		const output = addVaporInteropToCreateVaporApp(
			`import Vue, { type App, createVaporApp as create, ref } from "vue"\ncreate(Root);`,
		);

		expect(output)
			.toBe(`import Vue, { type App, createVaporApp as __tsrx_create, ref, vaporInteropPlugin } from "vue";
const create = (...args) => __tsrx_create(...args).use(vaporInteropPlugin);
create(Root);`);
	});

	it('falls back to matching the import text when the module does not parse', () => {
		const output = addVaporInteropToCreateVaporApp(`const count = <number>value;\n${real_import}`);

		expect(output).toContain(rewritten_import);
	});
});
