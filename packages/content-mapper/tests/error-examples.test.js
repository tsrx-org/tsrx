/** @import { CompileError } from '@tsrx/core/types' */
/** @import { ErrorEntry, ErrorExample } from './error-examples.js' */

import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	DIAGNOSTIC_SOURCE,
	TS_ERRORS,
	TSRX_ERRORS,
	TYPESCRIPT_CODE_PREFIX,
	UPSTREAM_ERRORS,
} from '@tsrx/core/diagnostics';
import * as react from '@tsrx/react';
import * as solid from '@tsrx/solid';
import * as vue from '@tsrx/vue';
import { transform_tsrx } from '@tsrx/typescript-plugin/src/transform.js';
import { ERROR_EXAMPLES, KNOWN_PROBLEMS, WITHOUT_EXAMPLE } from './error-examples.js';
import { create_native_workspace, repo_root } from './fixture-utils.js';
import { NativeLspClient } from './lsp-client.js';

/** Every entry of `@tsrx/core/diagnostics`, with its name. */
const ENTRIES = /** @type {Map<ErrorEntry, string>} */ (
	new Map(
		Object.entries({ TSRX_ERRORS, TS_ERRORS, UPSTREAM_ERRORS }).flatMap(([table, entries]) =>
			Object.entries(entries).map(([key, entry]) => [entry, `${table}.${key}`]),
		),
	)
);

/** The compilers the examples name, loaded up front: loading one takes seconds under load. */
const COMPILERS = /** @type {Record<string, any>} */ ({
	'@tsrx/react': react,
	'@tsrx/solid': solid,
	'@tsrx/vue': vue,
});

/** The workspace directory of each compiler's examples, under its own tsconfig.json. */
const COMPILER_DIRECTORIES = /** @type {Record<string, string>} */ ({
	'@tsrx/solid': 'solid/',
	'@tsrx/vue': 'vue/',
});

/** @param {ErrorEntry} entry */
function name_of(entry) {
	return ENTRIES.get(entry) ?? '(not an entry of @tsrx/core/diagnostics)';
}

const CASES = ERROR_EXAMPLES.map((example) => {
	const name = name_of(example.error);
	const directory = COMPILER_DIRECTORIES[example.compiler ?? ''] ?? '';
	return { name, example, file: `${directory}${name}.tsrx` };
});

describe('error examples', () => {
	it('has an example, or the reason for none, for every error', () => {
		const examples = new Set(ERROR_EXAMPLES.map((example) => example.error));
		const missing = [...ENTRIES]
			.filter(([entry]) => !examples.has(entry) && !WITHOUT_EXAMPLE.has(entry))
			.map(([, name]) => name);
		expect(
			missing,
			'Add an example of each to error-examples.js, or the reason there is none to WITHOUT_EXAMPLE',
		).toEqual([]);
		expect([...WITHOUT_EXAMPLE.keys()].filter((entry) => examples.has(entry)).map(name_of)).toEqual(
			[],
		);
		expect(ERROR_EXAMPLES.length).toBe(examples.size);
	});

	it('records only entries of @tsrx/core/diagnostics, and a known problem only for an example', () => {
		const examples = new Set(ERROR_EXAMPLES.map((example) => example.error));
		const entries = [
			...examples,
			...WITHOUT_EXAMPLE.keys(),
			...KNOWN_PROBLEMS.keys(),
			...ERROR_EXAMPLES.flatMap((example) => example.also ?? []),
		];
		expect(entries.filter((entry) => !ENTRIES.has(entry))).toEqual([]);
		expect([...KNOWN_PROBLEMS.keys()].filter((entry) => !examples.has(entry)).map(name_of)).toEqual(
			[],
		);
	});

	it.for(CASES)('$name: the compiler reports it', ({ name, example }) => {
		const compiler = COMPILERS[example.compiler ?? '@tsrx/react'];
		expect(compiler, `add ${example.compiler} to COMPILERS`).toBeDefined();
		const result = transform_tsrx(compiler, `${name}.tsrx`, example.source);
		const reported = result.fatalError ? [result.fatalError] : result.errors;
		if (KNOWN_PROBLEMS.get(example.error)?.problem === 'lost') {
			expect(reported, 'Reported now: remove its record from KNOWN_PROBLEMS').toEqual([]);
			return;
		}
		const allowed = new Set([example.error, ...(example.also ?? [])]);
		const names = reported.map((error) => entries_of(error).map(name_of).join(' | '));
		expect(
			reported.some((error) => entries_of(error).includes(example.error)),
			`reported: ${names.join(', ') || 'nothing'}`,
		).toBe(true);
		expect(
			reported.filter((error) => !entries_of(error).some((entry) => allowed.has(entry))),
			`reported: ${names.join(', ')}`,
		).toEqual([]);
	});
});

describe('error examples through TypeScript 7', () => {
	/** @type {ReturnType<typeof create_native_workspace>} */
	let workspace;
	/** @type {NativeLspClient} */
	let client;

	beforeAll(async () => {
		/**
		 * @param {string} compiler
		 * @param {Record<string, string>} [jsx]
		 */
		const tsconfig = (compiler, jsx = { jsx: 'react-jsx' }) =>
			JSON.stringify({
				tsrx: { compiler },
				compilerOptions: {
					strict: true,
					...jsx,
					module: 'esnext',
					target: 'esnext',
					moduleResolution: 'bundler',
					noEmit: true,
					skipLibCheck: true,
				},
				include: ['*.ts', '*.tsrx'],
				contentMappers: [{ package: '@tsrx/content-mapper', extensions: ['.tsrx'] }],
			});
		workspace = create_native_workspace(
			{
				'tsconfig.json': tsconfig('@tsrx/react'),
				'main.ts': 'export {};\n',
				'solid/tsconfig.json': tsconfig('@tsrx/solid'),
				'vue/tsconfig.json': tsconfig('@tsrx/vue', {
					jsx: 'preserve',
					jsxImportSource: 'vue-jsx-vapor',
				}),
			},
			{
				dependencies: [
					'@tsrx/react',
					'react',
					'@types/react',
					'@tsrx/solid',
					'solid-js',
					'@tsrx/vue',
					'vue',
					// Borrowed from the Vite Vue plugin's install, as in targets.test.js.
					['vue-jsx-vapor', path.join(repo_root, 'packages', 'vite-plugin-vue')],
				],
			},
		);
		client = new NativeLspClient(workspace.dir);
		await client.initialize({ runExternalCode: true });
		client.open('main.ts', 'export {};\n');
		await client.wait_for_registration('content-mapper-did-open');
	}, 60_000);

	afterAll(async () => {
		await client?.shutdown();
		workspace?.cleanup();
	});

	it.for(CASES)(
		'$name: shows once, with no TypeScript error on it',
		{ timeout: 30_000 },
		async ({ example, file }) => {
			client.open(file, example.source);
			const diagnostics = await client.diagnostics(file);
			client.close(file);
			const known = KNOWN_PROBLEMS.get(example.error);
			const shown = diagnostics
				.map((d) => `${d.source}${d.code} ${d.range.start.line}:${d.range.start.character}`)
				.join(', ');
			expect(
				problems_of(example, diagnostics),
				known
					? `Its #${known.issue} is fixed? Then remove its record from KNOWN_PROBLEMS. Shown: ${shown}`
					: `Shown: ${shown}`,
			).toEqual(known ? [known.problem] : []);
		},
	);
});

/**
 * What keeps an example's error from showing exactly once (see
 * `KnownProblem` in `error-examples.js`): nothing of the mapper's with its
 * code, a TypeScript error on it, or more of the mapper's errors than the one
 * mistake.
 * @param {ErrorExample} example
 * @param {Array<{ source?: string, code?: number | string, severity?: number, range: Range }>} diagnostics
 * @returns {Array<'lost' | 'typescript' | 'twice'>}
 */
function problems_of(example, diagnostics) {
	const code = example.error.code;
	const expected = code.startsWith('TSRX')
		? Number(code.slice('TSRX'.length))
		: Number(`${TYPESCRIPT_CODE_PREFIX}${code.slice('TS'.length)}`);
	const ours = diagnostics.filter((d) => d.source === DIAGNOSTIC_SOURCE);
	const typescript = diagnostics.filter((d) => d.source !== DIAGNOSTIC_SOURCE && d.severity === 1);
	const shown = ours.filter((d) => d.code === expected);
	/** @type {Array<'lost' | 'typescript' | 'twice'>} */
	const problems = [];
	if (shown.length === 0) {
		problems.push('lost');
	}
	if (typescript.some((t) => shown.some((d) => overlap(d.range, t.range)))) {
		problems.push('typescript');
	}
	if (
		ours.some((d) => d.code !== expected) ||
		ours.some((d, i) => ours.some((other, j) => i < j && overlap(d.range, other.range)))
	) {
		problems.push('twice');
	}
	return problems;
}

/**
 * @typedef {{ start: { line: number, character: number }, end: { line: number, character: number } }} Range
 */

/**
 * @param {Range} a
 * @param {Range} b
 */
function overlap(a, b) {
	/** @param {{ line: number, character: number }} p @param {{ line: number, character: number }} q */
	const before = (p, q) => p.line < q.line || (p.line === q.line && p.character < q.character);
	return before(a.start, b.end) && before(b.start, a.end);
}

/** Values no message has, standing in for the ones an entry's message takes. */
const PLACEHOLDERS = ['\u0000a', '\u0000b', '\u0000c'];

/**
 * The entries an error can come from: the only entry with its code, or those
 * whose message it matches. A thrown error's message ends with its position.
 * @param {CompileError} error
 * @returns {ErrorEntry[]}
 */
function entries_of(error) {
	const message = String(error.message).replace(/ \(\d+:\d+\)$/, '');
	const same_code = [...ENTRIES.keys()].filter((entry) => entry.code === error.code);
	return same_code.length === 1
		? same_code
		: same_code.filter((entry) => message_pattern(entry).test(message));
}

/**
 * @param {ErrorEntry} entry
 * @returns {RegExp}
 */
function message_pattern(entry) {
	if ('pattern' in entry) {
		return entry.pattern;
	}
	const message = typeof entry === 'function' ? entry(...PLACEHOLDERS).message : entry.message;
	const parts = message
		.split(/\u0000[abc]/)
		.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	return new RegExp(`^${parts.join('[^]*?')}$`);
}
