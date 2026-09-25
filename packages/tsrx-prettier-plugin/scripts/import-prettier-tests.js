// Imports Prettier's own JavaScript, JSX, and TypeScript format tests as TSRX
// test cases.
//
//   pnpm --filter tsrx-prettier-plugin import-prettier-tests [--source <prettier checkout>]
//
// Without `--source`, it clones the Prettier release that is installed. A case
// is imported when Prettier's `typescript` parser formats its input exactly as
// the snapshot records, so the expected output is what Prettier prints for
// TypeScript, and the input is TSRX: valid TSX in a strict-mode module. Every
// other case is counted, with the reason, in `tests/prettier/manifest.json`,
// which also lists the imported cases that the TSRX parser rejects.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import * as prettier from 'prettier';
import { parse } from '../src/parse.js';
import {
	readFormatCase,
	readSnapshotEntries,
	writeSnapshotEntries,
} from '../tests/snapshot-format.js';

const AREAS = ['js', 'jsx', 'typescript'];
const PACKAGE_DIR = path.resolve(import.meta.dirname, '..');
const OUTPUT_DIR = path.join(PACKAGE_DIR, 'tests/prettier');
/** Parse errors that a `.tsrx` file, a strict-mode ES module, rightly raises. */
const STRICT_MODULE_ERROR =
	/The keyword '\w+' is reserved|in strict mode|Argument name clash|Cannot use keyword 'await' outside an async function/u;

const { values } = parseArgs({ options: { source: { type: 'string' } } });
const version = prettier.version;
const source = values.source ?? cloneTests(version);

/** @type {Record<string, number>} */
const excluded = {};
/** @type {Record<string, string>} */
const tsrxParseErrors = {};
let imported = 0;

fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });

for (const area of AREAS) {
	for (const snapshotFile of findSnapshots(path.join(source, 'tests/format', area))) {
		// `tests/format/typescript/as/__snapshots__/format.test.js.snap` → `typescript/as`
		const dir = path
			.relative(path.join(source, 'tests/format'), path.dirname(path.dirname(snapshotFile)))
			.split(path.sep)
			.join('/');
		const entries = [];
		for (const entry of readSnapshotEntries(fs.readFileSync(snapshotFile, 'utf8'))) {
			const reason = await exclusionReason(dir, entry);
			if (reason) {
				excluded[reason] = (excluded[reason] ?? 0) + 1;
				continue;
			}
			entries.push(entry);
		}
		if (entries.length === 0) continue;
		imported += entries.length;
		const file = path.join(OUTPUT_DIR, `${dir}.snap`);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, writeSnapshotEntries(entries));
	}
}

const manifest = {
	prettier: version,
	source: `https://github.com/prettier/prettier/tree/${version}/tests/format`,
	areas: AREAS,
	imported,
	excluded: Object.fromEntries(Object.entries(excluded).sort(([a], [b]) => a.localeCompare(b))),
	rejectedByTsrxParser: Object.fromEntries(
		Object.entries(tsrxParseErrors).sort(([a], [b]) => a.localeCompare(b)),
	),
};
const manifestFile = path.join(OUTPUT_DIR, 'manifest.json');
fs.writeFileSync(
	manifestFile,
	await prettier.format(JSON.stringify(manifest), {
		...(await prettier.resolveConfig(manifestFile)),
		filepath: manifestFile,
	}),
);
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(OUTPUT_DIR, 'LICENSE'));

console.log(`Imported ${imported} cases from Prettier ${version}.`);
console.log(JSON.stringify(manifest.excluded, null, 2));
console.log(`Rejected by the TSRX parser: ${Object.keys(tsrxParseErrors).length}`);

/**
 * @param {string} dir
 * @param {import('../tests/snapshot-format.js').SnapshotEntry} entry
 * @returns {Promise<string | null>}
 */
async function exclusionReason(dir, entry) {
	if (dir.split('/').includes('_errors_')) {
		return 'error test';
	}
	const formatCase = readFormatCase(entry);
	if (!formatCase) {
		return 'records an error, not an output';
	}
	const { options, input, output, filename } = formatCase;
	if (
		'cursorOffset' in options ||
		'rangeStart' in options ||
		'rangeEnd' in options ||
		'endOfLine' in options ||
		input.includes('<|>')
	) {
		return 'cursor, range, or end-of-line test';
	}

	try {
		const formatted = await prettier.format(input, {
			...options,
			parser: 'typescript',
			filepath: filename && `${dir}/${filename}`,
		});
		if (formatted !== output) {
			return 'formatted differently by the typescript parser';
		}
	} catch {
		return 'rejected by the typescript parser';
	}

	// TSRX is a superset of TSX, so TypeScript that isn't valid TSX (such as a
	// `<T>value` type assertion) isn't TSRX either.
	if (!(await isValidTsx(input, options))) {
		return 'not valid TSX';
	}

	try {
		parse(input, /** @type {import('prettier').ParserOptions} */ ({ filepath: 'Fixture.tsrx' }));
	} catch (error) {
		const message = String(/** @type {Error} */ (error).message).split('\n')[0];
		// A `.tsrx` file is a strict-mode ES module.
		if (STRICT_MODULE_ERROR.test(message)) {
			return 'not valid in a strict-mode module';
		}
		if (message.startsWith('Namespaced elements are not supported in TSRX templates')) {
			return 'namespaced JSX element';
		}
		// Valid TSX that the TSRX parser rejects: imported, and failing until the
		// parser accepts it.
		tsrxParseErrors[`${dir}/${entry.title}`] = message;
	}

	return null;
}

/**
 * @param {string} input
 * @param {Record<string, unknown>} options
 * @returns {Promise<boolean>}
 */
async function isValidTsx(input, options) {
	try {
		await prettier.format(input, { ...options, parser: 'typescript', filepath: 'Fixture.tsx' });
		return true;
	} catch {
		return false;
	}
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function findSnapshots(dir) {
	return fs
		.readdirSync(dir, { recursive: true })
		.map(String)
		.filter((file) => file.endsWith(`__snapshots__${path.sep}format.test.js.snap`))
		.map((file) => path.join(dir, file))
		.sort();
}

/**
 * Sparse-clone the format tests of a Prettier release.
 * @param {string} tag
 * @returns {string}
 */
function cloneTests(tag) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), `prettier-${tag}-`));
	const git = (/** @type {string[]} */ ...args) =>
		execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'] });
	git(
		'clone',
		'--quiet',
		'--depth=1',
		`--branch=${tag}`,
		'--filter=blob:none',
		'--sparse',
		'https://github.com/prettier/prettier.git',
		'.',
	);
	git('sparse-checkout', 'set', ...AREAS.map((area) => `tests/format/${area}`));
	return dir;
}
