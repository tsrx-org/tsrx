import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { create_tsserver_workspace, start_tsserver } from './tsserver.js';

/**
 * Three imports, two of them unused, ended by `end` (`;` or nothing), with
 * `comment` after the second one.
 * @param {string} end
 * @param {string} [comment]
 */
function imports_file(end, comment = '') {
	return `import { useState } from 'react'${end}
import { label } from './label'${end}${comment}
import { App } from './App.tsrx'${end}

export function Imports() @{
	const [count] = useState(0)${end}
	<p>{count}</p>
}
`;
}

const FILES = {
	'tsconfig.json': JSON.stringify({
		compilerOptions: {
			jsx: 'preserve',
			module: 'esnext',
			moduleResolution: 'bundler',
			allowImportingTsExtensions: true,
			noEmit: true,
			types: [],
		},
		tsrx: { compiler: '@tsrx/react' },
		include: ['src'],
	}),
	'node_modules/react/package.json': JSON.stringify({ name: 'react', types: 'index.d.ts' }),
	'node_modules/react/index.d.ts': `export declare function useState<T>(value: T): [T, (value: T) => void];
`,
	'src/label.ts': `export const label = 'label';
`,
	'src/App.tsrx': `export function App() {
	return <p>App</p>;
}
`,
	'src/Semicolons.tsrx': imports_file(';'),
	'src/NoSemicolons.tsrx': imports_file(''),
	'src/Comment.tsrx': imports_file(';', ' // keep this'),
};

describe('tsserver plugin: Organize Imports in .tsrx files', () => {
	/** @type {string} */
	let workspace;
	/** @type {ReturnType<typeof start_tsserver>} */
	let server;

	beforeAll(async () => {
		const created = create_tsserver_workspace('tsrx-organize-imports-', FILES);
		workspace = created.workspace;
		server = start_tsserver(workspace, created.probe_location);
		for (const file of ['src/Semicolons.tsrx', 'src/NoSemicolons.tsrx', 'src/Comment.tsrx']) {
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
	 * The imports of `file` after applying the edits Organize Imports returns in
	 * `mode` (`SortAndCombine` is Sort Imports, `RemoveUnused` is Remove Unused
	 * Imports, `All` is Organize Imports), or `null` when it returns none.
	 * @param {keyof typeof FILES} file
	 * @param {'SortAndCombine' | 'RemoveUnused' | 'All'} mode
	 */
	async function organized_imports(file, mode) {
		const full = path.join(workspace, file);
		const response = await server.request('organizeImports', {
			scope: { type: 'file', args: { file: full } },
			mode,
		});
		expect(response.success).toBe(true);
		const edits = response.body.flatMap((/** @type {any} */ changes) => changes.textChanges);
		if (edits.length === 0) return null;
		const text = FILES[file];
		const lines = text.split('\n');
		/** @param {{ line: number, offset: number }} location */
		const offset = ({ line, offset }) =>
			lines.slice(0, line - 1).reduce((sum, previous) => sum + previous.length + 1, 0) + offset - 1;
		let result = text;
		for (const edit of edits.toSorted(
			(/** @type {any} */ a, /** @type {any} */ b) => offset(b.start) - offset(a.start),
		)) {
			result = result.slice(0, offset(edit.start)) + edit.newText + result.slice(offset(edit.end));
		}
		return result.slice(0, result.indexOf('export function'));
	}

	it.each(/** @type {const} */ (['src/Semicolons.tsrx', 'src/NoSemicolons.tsrx']))(
		'sorts the imports of %s',
		async (file) => {
			// TypeScript prints the sorted block with semicolons, as in a `.ts` file.
			expect(await organized_imports(file, 'SortAndCombine')).toBe(
				`import { useState } from 'react';
import { App } from './App.tsrx';
import { label } from './label';

`,
			);
		},
		60_000,
	);

	it.each(
		/** @type {const} */ ([
			['src/Semicolons.tsrx', 'RemoveUnused', ';'],
			['src/Semicolons.tsrx', 'All', ';'],
			['src/NoSemicolons.tsrx', 'RemoveUnused', ''],
			['src/NoSemicolons.tsrx', 'All', ''],
		]),
	)(
		'removes the unused imports of %s (%s)',
		async (file, mode, end) => {
			expect(await organized_imports(file, mode)).toBe(`import { useState } from 'react'${end}

`);
		},
		60_000,
	);

	it.each(/** @type {const} */ (['SortAndCombine', 'RemoveUnused', 'All']))(
		'leaves the imports alone when an import has a comment after it (%s)',
		async (mode) => {
			// The comment is not in the generated code, so the edit that deletes its line
			// does not map. Applying only the other edits would leave a duplicate import.
			expect(await organized_imports('src/Comment.tsrx', mode)).toBeNull();
		},
		60_000,
	);

	it.each(/** @type {const} */ (['src/Semicolons.tsrx', 'src/NoSemicolons.tsrx']))(
		'reports each unused import on the whole import in %s',
		async (file) => {
			const response = await server.request('suggestionDiagnosticsSync', {
				file: path.join(workspace, file),
			});
			const lines = FILES[file].split('\n');
			expect(
				response.body
					.filter((/** @type {any} */ diagnostic) => diagnostic.reportsUnnecessary)
					.map((/** @type {any} */ diagnostic) =>
						lines[diagnostic.start.line - 1].slice(
							diagnostic.start.offset - 1,
							diagnostic.end.offset - 1,
						),
					),
			).toEqual([lines[1], lines[2]]);
		},
		60_000,
	);
});
