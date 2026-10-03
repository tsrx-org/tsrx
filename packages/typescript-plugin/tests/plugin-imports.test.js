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
	'src/lib.ts': `export interface Model {
	id: string;
}
export interface Other {
	name: string;
}
export function helperA() {
	return 'a';
}
export function helperB() {
	return 'b';
}
export function helperC() {
	return 'c';
}
export function helperD() {}
`,
	'src/def.ts': `export default 'def';
export function helperD() {}
`,
	'src/label.ts': `export const label = 'label';
`,
	'src/App.tsrx': `export function App() {
	return <p>App</p>;
}
`,
	// Organize Imports
	'src/Semicolons.tsrx': imports_file(';'),
	'src/NoSemicolons.tsrx': imports_file(''),
	'src/Comment.tsrx': imports_file(';', ' // keep this'),
	// Unused imports
	'src/Unused.tsrx': `import { helperA } from './lib';
import { helperB } from './lib'
import {
	helperC,
	helperD,
} from './lib';
import def from './def';
import * as all from './lib';

export function Unused() @{
	<p />
}
`,
	'src/Mixed.tsrx': `import { type Model, helperA } from './lib';
import { helperA as first, type Model as M, helperB } from './lib';
import { helperA as a1, helperB as b1, helperC } from './lib';
import { helperA as a2, helperB as b2, helperC as c2 } from './lib';
import { type Model as M2, type Other } from './lib';
import type { Model as M3, Other as O3 } from './lib';
import { type Other as O4 } from './lib';
import def, { helperD } from './def';

export function Mixed(props: { value: M | O3 }) @{
	<p>{String([first, b1, def])}{String(props.value)}</p>
}
`,
	// Auto-import
	'src/Extend.tsrx': `import { helperA } from './lib';

export function Extend() @{
	<p>{helperA()}{helperB()}</p>
}
`,
	'src/NewLine.tsrx': `import { label } from './label';

export function NewLine() @{
	<p>{label}{helperB()}</p>
}
`,
	'src/NoImports.tsrx': `export function NoImports() @{
	<p>{helperB()}</p>
}
`,
};

/** @typedef {keyof typeof FILES} FileName */

describe('tsserver plugin: imports in .tsrx files', () => {
	/** @type {string} */
	let workspace;
	/** @type {ReturnType<typeof start_tsserver>} */
	let server;

	beforeAll(async () => {
		const created = create_tsserver_workspace('tsrx-imports-', FILES);
		workspace = created.workspace;
		server = start_tsserver(workspace, created.probe_location);
		// Auto-import completions are off unless the editor turns them on.
		await server.request('configure', {
			preferences: { includeCompletionsForModuleExports: true },
		});
		for (const file of Object.keys(FILES).filter((name) => name.endsWith('.tsrx'))) {
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
	 * The offset of a tsserver `{ line, offset }` location in `text`.
	 * @param {string} text
	 * @param {{ line: number, offset: number }} location
	 */
	function offset_of(text, { line, offset }) {
		const lines = text.split('\n');
		return (
			lines.slice(0, line - 1).reduce((sum, previous) => sum + previous.length + 1, 0) + offset - 1
		);
	}

	/**
	 * `file` after applying the edits for it in `changes` (tsserver's
	 * `FileCodeEdits`), or `null` when there are none.
	 * @param {FileName} file
	 * @param {any[]} changes
	 */
	function apply(file, changes) {
		const full = path.join(workspace, file);
		const edits = changes
			.filter((change) => change.fileName === full)
			.flatMap((change) => change.textChanges);
		if (edits.length === 0) return null;
		const text = FILES[file];
		let result = text;
		for (const edit of edits.toSorted(
			(/** @type {any} */ a, /** @type {any} */ b) =>
				offset_of(text, b.start) - offset_of(text, a.start),
		)) {
			result =
				result.slice(0, offset_of(text, edit.start)) +
				edit.newText +
				result.slice(offset_of(text, edit.end));
		}
		return result;
	}

	/**
	 * The `{ line, offset }` of the last `needle` in `file`.
	 * @param {FileName} file
	 * @param {string} needle
	 */
	function location_of(file, needle) {
		const before = FILES[file].slice(0, FILES[file].lastIndexOf(needle)).split('\n');
		return { line: before.length, offset: before[before.length - 1].length + 1 };
	}

	/**
	 * The code and source text of each warning that marks code as unused.
	 * @param {FileName} file
	 */
	async function unused_warnings(file) {
		const response = await server.request('suggestionDiagnosticsSync', {
			file: path.join(workspace, file),
		});
		return response.body
			.filter((/** @type {any} */ diagnostic) => diagnostic.reportsUnnecessary)
			.map((/** @type {any} */ diagnostic) => ({
				code: diagnostic.code,
				text: FILES[file].slice(
					offset_of(FILES[file], diagnostic.start),
					offset_of(FILES[file], diagnostic.end),
				),
			}));
	}

	/**
	 * `file` after the quick fix for error `code` on the last `needle`, the fix whose
	 * description starts with `description`, or `null` when the fix gives no edits.
	 * @param {FileName} file
	 * @param {string} needle
	 * @param {number} code
	 * @param {string} description
	 */
	async function after_quick_fix(file, needle, code, description) {
		const start = location_of(file, needle);
		const response = await server.request('getCodeFixes', {
			file: path.join(workspace, file),
			startLine: start.line,
			startOffset: start.offset,
			endLine: start.line,
			endOffset: start.offset + needle.length,
			errorCodes: [code],
		});
		const fix = response.body.find((/** @type {any} */ candidate) =>
			candidate.description.startsWith(description),
		);
		expect(fix, `quick fix "${description}"`).toBeDefined();
		return apply(file, fix.changes);
	}

	/**
	 * `file` after accepting the auto-import completion for `name`, typed at its
	 * last occurrence, or `null` when the completion gives no edits.
	 * @param {FileName} file
	 * @param {string} name
	 */
	async function after_completion(file, name) {
		const { line, offset } = location_of(file, name);
		const position = { file: path.join(workspace, file), line, offset: offset + name.length };
		const completions = await server.request('completionInfo', position);
		const entry = completions.body.entries.find(
			(/** @type {any} */ candidate) => candidate.name === name && candidate.hasAction,
		);
		expect(entry, `auto-import completion for ${name}`).toBeDefined();
		const details = await server.request('completionEntryDetails', {
			...position,
			entryNames: [{ name, source: entry.source, data: entry.data }],
		});
		return apply(
			file,
			details.body[0].codeActions.flatMap((/** @type {any} */ action) => action.changes),
		);
	}

	/**
	 * `file` after the first quick fix for the unused-code warning on `text`, or
	 * `null` when the fix gives no edits.
	 * @param {FileName} file
	 * @param {string} text
	 */
	async function after_unused_fix(file, text) {
		const full = path.join(workspace, file);
		const response = await server.request('suggestionDiagnosticsSync', { file: full });
		const diagnostic = response.body.find(
			(/** @type {any} */ candidate) =>
				candidate.reportsUnnecessary &&
				FILES[file].slice(
					offset_of(FILES[file], candidate.start),
					offset_of(FILES[file], candidate.end),
				) === text,
		);
		expect(diagnostic, `warning on ${text}`).toBeDefined();
		const fixes = await server.request('getCodeFixes', {
			file: full,
			startLine: diagnostic.start.line,
			startOffset: diagnostic.start.offset,
			endLine: diagnostic.end.line,
			endOffset: diagnostic.end.offset,
			errorCodes: [diagnostic.code],
		});
		return apply(file, fixes.body[0].changes);
	}

	/**
	 * The imports of `text`: everything before the component.
	 * @param {string | null} text
	 */
	function imports_of(text) {
		return text === null ? null : text.slice(0, text.indexOf('export function'));
	}

	/**
	 * The imports of `file` after Organize Imports in `mode` (`SortAndCombine` is
	 * Sort Imports, `RemoveUnused` is Remove Unused Imports, `All` is Organize
	 * Imports), or `null` when it returns no edits.
	 * @param {FileName} file
	 * @param {'SortAndCombine' | 'RemoveUnused' | 'All'} mode
	 */
	async function organized_imports(file, mode) {
		const response = await server.request('organizeImports', {
			scope: { type: 'file', args: { file: path.join(workspace, file) } },
			mode,
		});
		expect(response.success).toBe(true);
		return imports_of(apply(file, response.body));
	}

	describe('unused imports', () => {
		it('reports an import whose names are all unused on the whole import', async () => {
			expect(await unused_warnings('src/Unused.tsrx')).toEqual([
				{ code: 6133, text: "import { helperA } from './lib';" },
				{ code: 6133, text: "import { helperB } from './lib'" },
				{ code: 6192, text: "import {\n\thelperC,\n\thelperD,\n} from './lib';" },
				{ code: 6133, text: "import def from './def';" },
				{ code: 6133, text: "import * as all from './lib';" },
			]);
		}, 60_000);

		it('reports the unused names of imports with several names and type names', async () => {
			// An import whose names are all unused is reported as a whole, any other
			// unused name on the name, as in a `.tsx` file.
			expect(await unused_warnings('src/Mixed.tsrx')).toEqual([
				{ code: 6192, text: "import { type Model, helperA } from './lib';" },
				{ code: 6133, text: 'helperB' },
				{ code: 6133, text: 'a1' },
				{ code: 6133, text: 'helperC' },
				{
					code: 6192,
					text: "import { helperA as a2, helperB as b2, helperC as c2 } from './lib';",
				},
				{ code: 6192, text: "import { type Model as M2, type Other } from './lib';" },
				{ code: 6196, text: 'M3' },
				{ code: 6133, text: "import { type Other as O4 } from './lib';" },
				{ code: 6133, text: 'helperD' },
			]);
		}, 60_000);

		it.each(
			/** @type {const} */ ([
				['src/Unused.tsrx', "import { helperA } from './lib';"],
				['src/Unused.tsrx', "import { helperB } from './lib'"],
				['src/Unused.tsrx', "import def from './def';"],
				['src/Mixed.tsrx', "import { type Model, helperA } from './lib';"],
				['src/Mixed.tsrx', "import { type Model as M2, type Other } from './lib';"],
				['src/Mixed.tsrx', "import { type Other as O4 } from './lib';"],
			]),
		)(
			'removes an unused import with its quick fix (%s: %s)',
			async (file, statement) => {
				expect(await after_unused_fix(file, statement)).toBe(
					FILES[file].replace(`${statement}\n`, ''),
				);
			},
			60_000,
		);

		it.each(
			/** @type {const} */ ([
				[
					'helperB',
					"import { helperA as first, type Model as M, helperB } from './lib';",
					"import { helperA as first, type Model as M,  } from './lib';",
				],
				[
					'helperC',
					"import { helperA as a1, helperB as b1, helperC } from './lib';",
					"import { helperA as a1, helperB as b1,  } from './lib';",
				],
				['a1', '', null],
				['M3', '', null],
				['helperD', '', null],
			]),
		)(
			'removes the unused name %s only partly with its quick fix (#1025)',
			async (name, line, fixed) => {
				// In a `.tsx` file, TypeScript deletes the name with the comma before it (a last
				// name) or after it (any other name). The text between the names has no
				// mapping: for a last name only the edit that deletes the name maps, and the
				// edit for another name covers the comma and does not map at all.
				const result = await after_unused_fix('src/Mixed.tsrx', name);
				expect(result).toBe(fixed === null ? null : FILES['src/Mixed.tsrx'].replace(line, fixed));
			},
			60_000,
		);

		it('removes all unused imports with Fix All', async () => {
			const response = await server.request('getCombinedCodeFix', {
				scope: { type: 'file', args: { file: path.join(workspace, 'src/Unused.tsrx') } },
				fixId: 'unusedIdentifier_deleteImports',
			});
			expect(imports_of(apply('src/Unused.tsrx', response.body.changes))).toBe('\n');
		}, 60_000);

		it('removes the unused names of imports with several names and type names', async () => {
			expect(await organized_imports('src/Mixed.tsrx', 'RemoveUnused')).toBe(
				`import { helperA as first, type Model as M } from './lib';
import { helperB as b1 } from './lib';
import type { Other as O3 } from './lib';
import def from './def';

`,
			);
		}, 60_000);
	});

	describe('auto-import', () => {
		it('adds a name to an existing import, with the quick fix and the completion', async () => {
			const expected = "import { helperA, helperB } from './lib';\n\n";
			expect(
				imports_of(await after_quick_fix('src/Extend.tsrx', 'helperB', 2304, 'Update import')),
			).toBe(expected);
			expect(imports_of(await after_completion('src/Extend.tsrx', 'helperB'))).toBe(expected);
		}, 60_000);

		it('adds a new import line with the quick fix', async () => {
			expect(
				imports_of(await after_quick_fix('src/NewLine.tsrx', 'helperB', 2304, 'Add import')),
			).toBe("import { label } from './label';\nimport { helperB } from './lib';\n\n");
		}, 60_000);

		it('does not add a new import line with the completion (#1026)', async () => {
			// Volar maps a completion's edits only through mappings that enable
			// completions, and the start of the line after the imports has none.
			expect(await after_completion('src/NewLine.tsrx', 'helperB')).toBeNull();
		}, 60_000);

		it('does not add an import to a file without imports (#828)', async () => {
			expect(await after_quick_fix('src/NoImports.tsrx', 'helperB', 2304, 'Add import')).toBeNull();
			expect(await after_completion('src/NoImports.tsrx', 'helperB')).toBeNull();
		}, 60_000);
	});

	describe('Organize Imports', () => {
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
			'leaves the imports alone when an import has a comment after it (%s, #1024)',
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
				const lines = FILES[file].split('\n');
				expect(await unused_warnings(file)).toEqual([
					{ code: 6133, text: lines[1] },
					{ code: 6133, text: lines[2] },
				]);
			},
			60_000,
		);
	});
});
