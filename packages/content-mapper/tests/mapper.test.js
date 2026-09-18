import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	create_tsrx_content_mapper,
	numeric_code,
	to_diagnostic,
	validate_options,
} from '../src/mapper.js';
import {
	DIAGNOSTIC_CODE_COMPILE_ERROR,
	DIAGNOSTIC_CODE_INVALID_CONFIG,
	DIAGNOSTIC_CODE_NO_COMPILER,
	DIAGNOSTIC_CODE_USAGE_ERROR,
	SpanMapKind,
} from '../src/protocol.js';
import {
	consumer_fixture_dir,
	consumer_fixture_files,
	create_native_workspace,
} from './fixture-utils.js';

/** @type {Array<() => void>} */
const cleanups = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

/** @param {string} name */
function fixture(name) {
	return fs.readFileSync(path.join(consumer_fixture_dir, name), 'utf8');
}

describe('validate_options', () => {
	it('accepts the documented options', () => {
		expect(
			validate_options({ compiler: '@tsrx/react', platform: 'ios', languageFeatures: false }),
		).toEqual({
			options: { compiler: '@tsrx/react', platform: 'ios', languageFeatures: false },
			optionDiagnostics: [],
		});
		expect(validate_options(undefined).optionDiagnostics).toEqual([]);
	});

	it('reports invalid and unknown options with their path', () => {
		const { options, optionDiagnostics } = validate_options({
			compiler: './local.js',
			platform: 'tv',
			languageFeatures: 'yes',
			bogus: 1,
		});
		expect(options).toEqual({});
		expect(optionDiagnostics.map((d) => d.path)).toEqual([
			['compiler'],
			['platform'],
			['languageFeatures'],
			['bogus'],
		]);
		expect(optionDiagnostics.every((d) => d.code === DIAGNOSTIC_CODE_INVALID_CONFIG)).toBe(true);
		expect(validate_options([]).optionDiagnostics[0].path).toEqual([]);
	});
});

describe('to_diagnostic', () => {
	it('keeps positions, clamps to the content and derives numeric codes', () => {
		const error = /** @type {any} */ (new Error('Unclosed tag'));
		error.pos = 10;
		error.end = 14;
		error.code = 'tsrx-unclosed-tag';
		expect(to_diagnostic(error, 100, DIAGNOSTIC_CODE_USAGE_ERROR)).toEqual({
			start: 10,
			length: 4,
			code: numeric_code('tsrx-unclosed-tag'),
			messageText: 'Unclosed tag [tsrx-unclosed-tag]',
		});
		const uncoded = /** @type {any} */ (new Error('Unexpected token'));
		uncoded.pos = 12;
		expect(to_diagnostic(uncoded, 12, DIAGNOSTIC_CODE_COMPILE_ERROR)).toEqual({
			start: 12,
			length: 0,
			code: DIAGNOSTIC_CODE_COMPILE_ERROR,
			messageText: 'Unexpected token',
		});
	});

	it('produces stable codes in the 10000..99999 range', () => {
		expect(numeric_code('tsrx-unclosed-tag')).toBe(numeric_code('tsrx-unclosed-tag'));
		expect(numeric_code('tsrx-unclosed-tag')).not.toBe(numeric_code('tsrx-jsx-expression-value'));
		expect(numeric_code('x')).toBeGreaterThanOrEqual(10000);
		expect(numeric_code('x')).toBeLessThan(100000);
	});
});

describe('create_tsrx_content_mapper', () => {
	it('negotiates UTF-16 and refuses hosts that cannot speak it', () => {
		const mapper = create_tsrx_content_mapper();
		expect(mapper.initialize({ positionEncodings: ['utf-8', 'utf-16'] })).toEqual({
			positionEncoding: 'utf-16',
			diagnosticSource: 'tsrx',
		});
		expect(() => mapper.initialize({ positionEncodings: ['utf-8'] })).toThrow(/UTF-16/);
	});

	it('opens a project, watches its config chain and compiler manifest, and transforms files', () => {
		const mapper = create_tsrx_content_mapper();
		const config = path.join(consumer_fixture_dir, 'tsconfig.json');
		const opened = mapper.openProject({
			configFileName: config,
			projectHandle: 'p1',
			compilerOptions: {},
		});
		expect(opened.configIdentity).toMatch(/^[0-9a-f]{64}$/);
		expect(opened.watchedFiles).toContain(config);
		expect(
			opened.watchedFiles?.some((file) => file.endsWith(path.join('tsrx-react', 'package.json'))),
		).toBe(true);
		expect(opened.optionDiagnostics).toBeUndefined();

		const file = path.join(consumer_fixture_dir, 'Panel.tsrx');
		const result = mapper.transform({
			fileName: file,
			content: fixture('Panel.tsrx'),
			projectHandle: 'p1',
		});
		expect(result.extension).toBe('.tsx');
		expect(result.text).toContain('export default function Panel');
		expect(result.diagnostics).toBeUndefined();
		expect(result.mappings.length).toBeGreaterThan(10);
		expect(result.supplemental).toHaveLength(1);
		expect(result.supplemental?.[0].extension).toBe('.mts');
		expect(result.supplemental?.[0].mappings[0][4]).toBe(SpanMapKind.Verbatim);
		// Ordered and disjoint in generated space.
		for (let index = 1; index < result.mappings.length; index++) {
			const previous = result.mappings[index - 1];
			expect(result.mappings[index][0]).toBeGreaterThanOrEqual(previous[0] + previous[1]);
		}
		// Verbatim spans carry identical text.
		for (const [g_start, g_length, o_start, o_length, kind] of result.mappings) {
			if (kind === SpanMapKind.Verbatim) {
				expect(result.text.slice(g_start, g_start + g_length)).toBe(
					fixture('Panel.tsrx').slice(o_start, o_start + o_length),
				);
			}
		}

		mapper.closeProject({ projectHandle: 'p1' });
		expect(() => mapper.transform({ fileName: file, content: '', projectHandle: 'p1' })).toThrow(
			/Unknown .* project handle/,
		);
	});

	it('transforms without a project handle by locating the nearest tsconfig', () => {
		const mapper = create_tsrx_content_mapper();
		const file = path.join(consumer_fixture_dir, 'Button.tsrx');
		const result = mapper.transform({ fileName: file, content: fixture('Button.tsrx') });
		expect(result.extension).toBe('.tsx');
		expect(result.text).toContain('export default function Button');
	});

	it('answers a compile failure with an export stub and one diagnostic', () => {
		const mapper = create_tsrx_content_mapper();
		mapper.openProject({
			configFileName: path.join(consumer_fixture_dir, 'tsconfig.json'),
			projectHandle: 'p1',
			compilerOptions: {},
		});
		const file = path.join(consumer_fixture_dir, 'Panel.tsrx');
		mapper.transform({ fileName: file, content: fixture('Panel.tsrx'), projectHandle: 'p1' });
		const broken = fixture('Panel.tsrx').replace('{label}', '{{{label}');
		const result = mapper.transform({ fileName: file, content: broken, projectHandle: 'p1' });
		expect(result.extension).toBe('.ts');
		expect(result.mappings).toEqual([]);
		expect(result.text).toContain('export declare const PanelProps: any;');
		expect(result.text).toContain('export default _default;');
		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics?.[0].code).toBe(DIAGNOSTIC_CODE_COMPILE_ERROR);
		expect(result.diagnostics?.[0].start).toBeGreaterThanOrEqual(broken.indexOf('{{{'));
		expect(result.diagnostics?.[0].start).toBeLessThanOrEqual(broken.indexOf('{{{') + 3);

		// Without a previous success the stub is an empty module.
		const fresh = create_tsrx_content_mapper();
		const first = fresh.transform({ fileName: file, content: broken });
		expect(first.text).toBe('export {};\n');
	});

	it('reports an unresolvable declared compiler as a diagnostic instead of throwing', () => {
		// Inside this monorepo a packaged compiler is always discoverable, so the
		// "no compiler at all" branch cannot be reached here; an explicit but
		// missing declaration exercises the same failure path.
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-no-compiler-'));
		cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
		fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{ "compilerOptions": {} }');
		const mapper = create_tsrx_content_mapper();
		const opened = mapper.openProject({
			configFileName: path.join(dir, 'tsconfig.json'),
			projectHandle: 'p',
			compilerOptions: {},
			options: { compiler: '@tsrx/does-not-exist' },
		});
		expect(opened.optionDiagnostics).toBeUndefined();
		const result = mapper.transform({
			fileName: path.join(dir, 'A.tsrx'),
			content: 'export const a = 1;\n',
			projectHandle: 'p',
		});
		expect(result.text).toBe('export {};\n');
		expect(result.mappings).toEqual([]);
		expect(result.diagnostics?.[0].code).toBe(DIAGNOSTIC_CODE_INVALID_CONFIG);
		expect(result.diagnostics?.[0].messageText).toContain('@tsrx/does-not-exist');
		expect(DIAGNOSTIC_CODE_NO_COMPILER).not.toBe(DIAGNOSTIC_CODE_INVALID_CONFIG);
	});

	it('changes the config identity when a watched tsconfig changes', () => {
		const created = create_native_workspace(consumer_fixture_files());
		cleanups.push(created.cleanup);
		const config = path.join(created.dir, 'tsconfig.native.json');
		const mapper = create_tsrx_content_mapper();
		const open = () =>
			mapper.openProject({ configFileName: config, projectHandle: 'p', compilerOptions: {} });
		const before = open();
		expect(before.watchedFiles).toContain(config);
		expect(before.watchedFiles).toContain(path.join(created.dir, 'tsconfig.json'));
		expect(open().configIdentity).toBe(before.configIdentity);
		fs.appendFileSync(path.join(created.dir, 'tsconfig.json'), '\n');
		expect(open().configIdentity).not.toBe(before.configIdentity);
	});

	it('keeps project state isolated per handle', () => {
		const mapper = create_tsrx_content_mapper();
		const config = path.join(consumer_fixture_dir, 'tsconfig.json');
		mapper.openProject({ configFileName: config, projectHandle: 'a', compilerOptions: {} });
		mapper.openProject({
			configFileName: config,
			projectHandle: 'b',
			compilerOptions: {},
			options: { languageFeatures: false },
		});
		const file = path.join(consumer_fixture_dir, 'Button.tsrx');
		const content = fixture('Button.tsrx');
		const a = mapper.transform({ fileName: file, content, projectHandle: 'a' });
		const b = mapper.transform({ fileName: file, content, projectHandle: 'b' });
		expect(a.mappings.some((span) => span[5] !== 0)).toBe(true);
		expect(b.mappings.every((span) => span[5] === 0)).toBe(true);
	});
});
