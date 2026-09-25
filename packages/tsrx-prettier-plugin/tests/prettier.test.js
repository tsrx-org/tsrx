// Runs Prettier's own format tests (imported into `tests/prettier/` by
// `scripts/import-prettier-tests.js`) through the TSRX plugin. Each case
// expects exactly what Prettier prints with its `typescript` parser.
//
// Cases listed in `prettier-known-failures.json` are expected to fail until the
// plugin handles them; a listed case that passes fails the run, so the list
// only shrinks. After a change, refresh the list with:
//
//   UPDATE_KNOWN_FAILURES=1 pnpm test --project tsrx-prettier-plugin
//
// `prettier-overrides.js` holds the cases whose TSRX output deliberately
// differs from Prettier's, with the reason.

import fs from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';
import { afterAll, describe, expect, test } from 'vitest';
import plugin from '../src/index.js';
import overrides from './prettier-overrides.js';
import { readFormatCase, readSnapshotEntries } from './snapshot-format.js';

const FIXTURES_DIR = path.join(import.meta.dirname, 'prettier');
const KNOWN_FAILURES_FILE = path.join(import.meta.dirname, 'prettier-known-failures.json');
const updateKnownFailures = Boolean(process.env.UPDATE_KNOWN_FAILURES);

/** @type {Set<string>} */
const knownFailures = new Set(JSON.parse(fs.readFileSync(KNOWN_FAILURES_FILE, 'utf8')));
/** @type {Set<string>} */
const failures = new Set();
/** @type {Set<string>} */
const importedCases = new Set();

const snapshotFiles = fs
	.readdirSync(FIXTURES_DIR, { recursive: true })
	.map(String)
	.filter((file) => file.endsWith('.snap'))
	.sort();

for (const snapshotFile of snapshotFiles) {
	const dir = snapshotFile.slice(0, -'.snap'.length).split(path.sep).join('/');
	const entries = readSnapshotEntries(
		fs.readFileSync(path.join(FIXTURES_DIR, snapshotFile), 'utf8'),
	);

	describe(dir, () => {
		for (const entry of entries) {
			const formatCase = readFormatCase(entry);
			if (!formatCase) throw new Error(`${dir}: ${entry.title} records no output`);
			const key = `${dir}/${entry.title}`;
			importedCases.add(key);
			const override = overrides[key];
			if (override?.skip) {
				test.skip(entry.title, () => {});
				continue;
			}
			const input = override?.input ?? formatCase.input;
			const run = !updateKnownFailures && knownFailures.has(key) ? test.fails : test;

			run(entry.title, async () => {
				try {
					const output = override?.tsx
						? await prettier.format(input, {
								...formatCase.options,
								parser: 'typescript',
								filepath: 'Fixture.tsx',
							})
						: (override?.output ?? formatCase.output);
					const formatted = await prettier.format(input, {
						...formatCase.options,
						parser: 'tsrx',
						plugins: [plugin],
						filepath: 'Fixture.tsrx',
					});
					expect(formatted).toBe(output);
				} catch (error) {
					failures.add(key);
					if (!updateKnownFailures) throw error;
				}
			});
		}
	});
}

test('overrides and known failures name imported cases', () => {
	// The known failures are being rewritten in update mode.
	const listed = [...Object.keys(overrides), ...(updateKnownFailures ? [] : knownFailures)];
	const stale = listed.filter((key) => !importedCases.has(key));
	expect(stale).toEqual([]);
});

afterAll(() => {
	if (!updateKnownFailures) return;
	fs.writeFileSync(KNOWN_FAILURES_FILE, `${JSON.stringify([...failures].sort(), null, 2)}\n`);
});
