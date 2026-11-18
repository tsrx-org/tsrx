import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { create_tsserver_workspace, start_tsserver } from './tsserver.js';

const DECLARATION = `    function missing() {
        throw new Error("Function not implemented.");
    }

`;

const FILES = {
	'tsconfig.json': JSON.stringify({
		compilerOptions: { jsx: 'preserve', module: 'esnext', moduleResolution: 'bundler', types: [] },
		tsrx: { compiler: '@tsrx/react' },
		include: ['src'],
	}),
	'src/Output.tsx': `export function App() {
	return <p>{missing()}</p>;
}
`,
	'src/Output.tsrx': `export function App() @{
	<p>{missing()}</p>
}
`,
	'src/Spaces.tsrx': `export function App() @{
  <p>{missing()}</p>
}
`,
};

/** @typedef {keyof typeof FILES} FileName */

describe('tsserver plugin: quick fixes in .tsrx files', () => {
	/** @type {string} */
	let workspace;
	/** @type {ReturnType<typeof start_tsserver>} */
	let server;

	beforeAll(async () => {
		const created = create_tsserver_workspace('tsrx-code-fixes-', FILES);
		workspace = created.workspace;
		server = start_tsserver(workspace, created.probe_location);
		for (const file of Object.keys(FILES).filter((name) => name.startsWith('src/'))) {
			const full = path.join(workspace, file);
			await server.request('open', {
				file: full,
				fileContent: fs.readFileSync(full, 'utf8'),
				projectRootPath: workspace,
			});
		}
	}, 60_000);

	afterAll(() => {
		server?.stop();
		fs.rmSync(workspace, { recursive: true, force: true });
	});

	/**
	 * `file` after the quick fix whose description starts with `description` for
	 * error `code` on `needle`, or `null` when the fix gives no edits.
	 * @param {FileName} file
	 * @param {string} needle
	 * @param {number} code
	 * @param {string} description
	 */
	async function after_quick_fix(file, needle, code, description) {
		const text = FILES[file];
		const lines = text.split('\n');
		const before = text.slice(0, text.indexOf(needle)).split('\n');
		const line = before.length;
		const offset = before[before.length - 1].length + 1;
		const response = await server.request('getCodeFixes', {
			file: path.join(workspace, file),
			startLine: line,
			startOffset: offset,
			endLine: line,
			endOffset: offset + needle.length,
			errorCodes: [code],
		});
		const fix = response.body.find((/** @type {any} */ candidate) =>
			candidate.description.startsWith(description),
		);
		expect(fix, `quick fix "${description}"`).toBeDefined();
		/** @param {{ line: number, offset: number }} location */
		const offset_of = (location) =>
			lines.slice(0, location.line - 1).reduce((sum, previous) => sum + previous.length + 1, 0) +
			location.offset -
			1;
		const edits = fix.changes.flatMap((/** @type {any} */ change) => change.textChanges);
		if (edits.length === 0) return null;
		let result = text;
		for (const edit of edits.toSorted(
			(/** @type {any} */ a, /** @type {any} */ b) => offset_of(b.start) - offset_of(a.start),
		)) {
			result =
				result.slice(0, offset_of(edit.start)) + edit.newText + result.slice(offset_of(edit.end));
		}
		return result;
	}

	it.each(/** @type {const} */ (['src/Output.tsx', 'src/Output.tsrx', 'src/Spaces.tsrx']))(
		'adds a missing function called in the output before the output in %s (#1027)',
		async (file) => {
			// TypeScript inserts the function at the start of the line of the `return`,
			// which the compiler adds around a template's output.
			const result = await after_quick_fix(file, 'missing', 2304, 'Add missing function');
			const line_start = FILES[file].indexOf('\n') + 1;
			expect(result).toBe(
				FILES[file].slice(0, line_start) + DECLARATION + FILES[file].slice(line_start),
			);
		},
		60_000,
	);
});
