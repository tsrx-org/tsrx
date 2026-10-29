import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { create_tsrx_content_mapper, to_diagnostic, validate_options } from '../src/mapper.js';
import { DiagnosticDirectivePolicy, SpanMapKind } from '../src/protocol.js';
import { blank_script_bodies } from '@tsrx/typescript-plugin/src/transform.js';
import { MAPPER_CODES, TS_ERRORS, TSRX_ERRORS } from '@tsrx/core/diagnostics';
import { fileURLToPath } from 'node:url';
import {
	consumer_fixture_dir,
	consumer_fixture_files,
	create_native_workspace,
	mapper_server_path,
	parse_tsc_output,
	run_native_tsc,
	typescript_mapper_code,
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
			validate_options({
				compiler: '@tsrx/react',
				platform: 'ios',
				languageFeatures: false,
				verificationMappings: true,
			}),
		).toEqual({
			options: {
				compiler: '@tsrx/react',
				platform: 'ios',
				languageFeatures: false,
				verificationMappings: true,
			},
			optionDiagnostics: [],
		});
		expect(validate_options(undefined).optionDiagnostics).toEqual([]);
	});

	it('reports invalid and unknown options with their path', () => {
		const { options, optionDiagnostics } = validate_options({
			compiler: './local.js',
			platform: 'tv',
			languageFeatures: 'yes',
			verificationMappings: 1,
			bogus: 1,
		});
		expect(options).toEqual({});
		expect(optionDiagnostics.map((d) => d.path)).toEqual([
			['compiler'],
			['platform'],
			['languageFeatures'],
			['verificationMappings'],
			['bogus'],
		]);
		expect(optionDiagnostics[3].messageText).toBe('"verificationMappings" must be a boolean.');
		expect(optionDiagnostics.every((d) => d.code === MAPPER_CODES.INVALID_CONFIG)).toBe(true);
		expect(validate_options([]).optionDiagnostics[0].path).toEqual([]);
	});
});

describe('to_diagnostic', () => {
	it('keeps positions, clamps to the content and sends a TSRX code as its number', () => {
		const unclosed = TSRX_ERRORS.UNCLOSED_TAG('div');
		const error = /** @type {any} */ (new Error(unclosed.message));
		error.pos = 10;
		error.end = 14;
		error.code = unclosed.code;
		// TypeScript shows it as `TSRX1001`, so the message doesn't repeat the code.
		expect(to_diagnostic(error, 100, MAPPER_CODES.USAGE_ERROR)).toEqual({
			start: 10,
			length: 4,
			code: Number(unclosed.code.slice('TSRX'.length)),
			messageText: unclosed.message,
		});
		// An error without a code, as a compiler outside this repository may throw.
		const uncoded = /** @type {any} */ (new Error(TS_ERRORS.UNEXPECTED_TOKEN.message));
		uncoded.pos = 12;
		expect(to_diagnostic(uncoded, 12, MAPPER_CODES.COMPILE_ERROR)).toEqual({
			start: 12,
			length: 0,
			code: MAPPER_CODES.COMPILE_ERROR,
			messageText: TS_ERRORS.UNEXPECTED_TOKEN.message,
		});
	});

	it('sends a TypeScript code with its prefix and keeps it in the message', () => {
		const { code, message } = TS_ERRORS.UNEXPECTED_TOKEN;
		const error = /** @type {any} */ (new Error(message));
		error.pos = 3;
		error.code = code;
		expect(to_diagnostic(error, 100, MAPPER_CODES.COMPILE_ERROR)).toEqual({
			start: 3,
			length: 1,
			code: typescript_mapper_code(code),
			messageText: `${message} [${code}]`,
		});
	});

	it("gives TSRX codes, TypeScript codes and the mapper's own codes separate numbers", () => {
		const tsrx = Object.values(TSRX_ERRORS).map(({ code }) => Number(code.slice('TSRX'.length)));
		const typescript = Object.values(TS_ERRORS).map(({ code }) => typescript_mapper_code(code));
		const mapper = Object.values(MAPPER_CODES);
		const all = [...new Set(tsrx), ...new Set(typescript), ...mapper];
		expect(new Set(all).size).toBe(all.length);
		expect(mapper).toEqual([771000, 771001, 771002, 771003]);
		expect(typescript_mapper_code(TS_ERRORS.REST_ELEMENT_INITIALIZER.code)).toBe(111186);
	});
});

describe('create_tsrx_content_mapper', () => {
	it('negotiates UTF-16 and refuses hosts that cannot speak it', () => {
		const mapper = create_tsrx_content_mapper();
		expect(mapper.initialize({ positionEncodings: ['utf-8', 'utf-16'] })).toEqual({
			positionEncoding: 'utf-16',
			diagnosticSource: 'TSRX',
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
		// The `<script>` body is checked as a block appended to the main TSX, mapped
		// verbatim back to the source; there is no supplemental output. Compilers
		// that copy it into the main TSX (Ripple does; React leaves the element
		// empty) get it blanked there, so its `<` cannot parse as a JSX tag and
		// raise a syntax error in synthesized code.
		expect(result.supplemental).toBeUndefined();
		const body = 'const analyticsEnabled: boolean = 1 < 2;';
		expect(result.text.indexOf(';{\n')).toBeGreaterThan(-1);
		expect(result.text.indexOf(body)).toBeGreaterThan(result.text.indexOf(';{\n'));
		expect(result.text.trimEnd().endsWith('}')).toBe(true);
		expect(result.text).toMatch(/<script type="text\/typescript">\s*<\/script>/);
		const body_span = result.mappings.find((span) =>
			result.text.slice(span[0], span[0] + span[1]).includes(body),
		);
		expect(body_span?.[4]).toBe(SpanMapKind.Verbatim);
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
		expect(result.diagnostics?.[0].code).toBe(
			typescript_mapper_code(TS_ERRORS.UNEXPECTED_TOKEN.code),
		);
		expect(result.diagnostics?.[0].start).toBeGreaterThanOrEqual(broken.indexOf('{{{'));
		expect(result.diagnostics?.[0].start).toBeLessThanOrEqual(broken.indexOf('{{{') + 3);

		// Without a previous success the stub is an empty module.
		const fresh = create_tsrx_content_mapper();
		const first = fresh.transform({ fileName: file, content: broken });
		expect(first.text).toBe('export {};\n');
	});

	it('sends every error, with a directive over the generated code that holds each', () => {
		const mapper = create_tsrx_content_mapper();
		mapper.openProject({
			configFileName: path.join(consumer_fixture_dir, 'tsconfig.json'),
			projectHandle: 'p1',
			compilerOptions: {},
		});
		const content = `${fixture('Panel.tsrx').replace('{label}', '{label;}')}
const [...rest = [1]] = [1];
export { rest };
`;
		const result = mapper.transform({
			fileName: path.join(consumer_fixture_dir, 'Panel.tsrx'),
			content,
			projectHandle: 'p1',
		});
		// The rest element's default (TS1186) stays in the generated code, where
		// TypeScript reports it too.
		expect(result.text).toContain('...rest = [1]');
		const semicolon = TSRX_ERRORS.TEMPLATE_EXPRESSION_TRAILING_SEMICOLON;
		const rest_default = TS_ERRORS.REST_ELEMENT_INITIALIZER;
		expect(result.diagnostics).toEqual([
			{
				start: content.indexOf('{label;}') + '{label'.length,
				length: 1,
				code: Number(semicolon.code.slice('TSRX'.length)),
				messageText: semicolon.message,
			},
			{
				start: content.indexOf('= [1]]'),
				length: 1,
				code: typescript_mapper_code(rest_default.code),
				messageText: `${rest_default.message} [${rest_default.code}]`,
			},
		]);
		// Each error's element or statement hides TypeScript's errors in its
		// generated code, TypeScript's TS1186 at the default's `=` among them.
		const directives = result.diagnosticDirectives?.directives ?? [];
		const statement = 'const [...rest = [1]] = [1];';
		expect(directives.map(([start, length]) => content.slice(start, start + length))).toEqual([
			'<h2 className="heading">{label;}</h2>',
			statement,
		]);
		const [, , generated_start, generated_end, policy] = directives[1];
		expect(policy).toBe(DiagnosticDirectivePolicy.Ignore);
		const default_at = result.text.indexOf('= [1]]');
		expect(generated_start <= default_at && default_at < generated_end).toBe(true);
	});

	it("never hides another component's errors when an error's element holds a <script> body", () => {
		// The body is checked as a block at the end of the generated file, and the
		// React target hoists the static <script> element above the component, so
		// the fragment's generated code comes in three pieces with B in between.
		const mapper = create_tsrx_content_mapper();
		mapper.openProject({
			configFileName: path.join(consumer_fixture_dir, 'tsconfig.json'),
			projectHandle: 'p1',
			compilerOptions: {},
		});
		const content = `export function A() @{
	<>
		{'x';}
		<script>const s = 1;</script>
	</>
}

export function B() {
	const wrong: string = 1;
	return <div>{wrong}</div>;
}
`;
		const result = mapper.transform({
			fileName: path.join(consumer_fixture_dir, 'Script.tsrx'),
			content,
			projectHandle: 'p1',
		});
		const directives = result.diagnosticDirectives?.directives ?? [];
		expect(
			directives.map(([start, length, generated_start, generated_end]) => [
				content.slice(start, start + length),
				result.text.slice(generated_start, generated_end),
			]),
		).toEqual([
			[content.slice(content.indexOf('<>'), content.indexOf('</>') + 3), '<script></script>;'],
			[content.slice(content.indexOf('<>'), content.indexOf('</>') + 3), "{'x'}"],
			[content.slice(content.indexOf('<>'), content.indexOf('</>') + 3), 'const s = 1;'],
		]);
		const wrong_at = result.text.indexOf('wrong: string');
		expect(directives.some(([, , start, end]) => start <= wrong_at && wrong_at < end)).toBe(false);
	});

	it('keeps the export stub across a project reopen while the file still fails', () => {
		// TypeScript reopens a project (with the same or a new handle) when its
		// identity or a watched file changes; the last good AST must survive that.
		const mapper = create_tsrx_content_mapper();
		const config = path.join(consumer_fixture_dir, 'tsconfig.json');
		const file = path.join(consumer_fixture_dir, 'Panel.tsrx');
		const broken = fixture('Panel.tsrx').replace('{label}', '{{{label}');
		mapper.openProject({ configFileName: config, projectHandle: 'p1', compilerOptions: {} });
		mapper.transform({ fileName: file, content: fixture('Panel.tsrx'), projectHandle: 'p1' });

		mapper.openProject({ configFileName: config, projectHandle: 'p1', compilerOptions: {} });
		const same_handle = mapper.transform({ fileName: file, content: broken, projectHandle: 'p1' });
		expect(same_handle.text).toContain('export declare const PanelProps: any;');
		expect(same_handle.text).toContain('export default _default;');

		mapper.closeProject({ projectHandle: 'p1' });
		mapper.openProject({ configFileName: config, projectHandle: 'p2', compilerOptions: {} });
		const new_handle = mapper.transform({ fileName: file, content: broken, projectHandle: 'p2' });
		expect(new_handle.text).toBe(same_handle.text);
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
		expect(result.diagnostics?.[0].code).toBe(MAPPER_CODES.INVALID_CONFIG);
		expect(result.diagnostics?.[0].messageText).toContain('@tsrx/does-not-exist');
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

describe('blank_script_bodies', () => {
	it('blanks each script body in place, keeping length and line breaks', () => {
		const body = `const value = 1 < 2;
	let x = "<b>";`;
		const text = `<head><script>${body}</script><script>${body}</script></head>`;
		const regions = [
			{ id: 'script_0', start: 0, length: body.length, content: body },
			{ id: 'script_1', start: 0, length: body.length, content: body },
		];
		const blanked = blank_script_bodies(text, regions);
		expect(blanked.length).toBe(text.length);
		expect(blanked).not.toContain('value');
		expect(blanked.split('\n').length).toBe(text.split('\n').length);
		expect(blanked).toBe(
			`<head><script>${body.replace(/[^\n]/g, ' ')}</script><script>${body.replace(/[^\n]/g, ' ')}</script></head>`,
		);
	});

	it('leaves the text alone when a body is empty or not copied into the output', () => {
		const text = '<script></script><div>{"const a = 1;"}</div>';
		expect(blank_script_bodies(text, [{ id: 's', start: 0, length: 0, content: '' }])).toBe(text);
		expect(
			blank_script_bodies(text, [{ id: 's', start: 0, length: 12, content: 'const a = 1;' }]),
		).toBe(text);
	});
});

describe('without TypeScript', () => {
	it('checks a project through native tsc while the mapper process cannot load the typescript package', () => {
		// A project on `typescript@7` has no JavaScript TypeScript at all; the
		// preload makes any attempt to load one fail inside the mapper process.
		const created = create_native_workspace(consumer_fixture_files(), {
			exec: [
				process.execPath,
				'--require',
				fileURLToPath(new URL('./forbid-typescript.cjs', import.meta.url)),
				mapper_server_path,
			],
		});
		cleanups.push(created.cleanup);
		const result = run_native_tsc(created.dir, [
			'--noEmit',
			'-p',
			'tsconfig.native.json',
			'--pretty',
			'false',
		]);
		expect(parse_tsc_output(result.output).map((d) => [d.file, d.line, d.code])).toEqual([
			['main.ts', 7, 'TS2322'],
		]);
		expect(result.status).toBe(2);
	}, 30_000);

	it('does the same through the built dist/server.js (what the package ships)', () => {
		// Built by the package's `prepare` script on install and by `pnpm build`;
		// bundling must not leave any TypeScript or unresolvable requires behind.
		const dist_server = fileURLToPath(new URL('../dist/server.js', import.meta.url));
		if (!fs.existsSync(dist_server)) {
			throw new Error(`${dist_server} is missing; run "pnpm --filter @tsrx/content-mapper build".`);
		}
		const created = create_native_workspace(consumer_fixture_files(), {
			exec: [
				process.execPath,
				'--require',
				fileURLToPath(new URL('./forbid-typescript.cjs', import.meta.url)),
				dist_server,
			],
		});
		cleanups.push(created.cleanup);
		const result = run_native_tsc(created.dir, [
			'--noEmit',
			'-p',
			'tsconfig.native.json',
			'--pretty',
			'false',
		]);
		expect(parse_tsc_output(result.output).map((d) => [d.file, d.line, d.code])).toEqual([
			['main.ts', 7, 'TS2322'],
		]);
		expect(result.status).toBe(2);
	}, 30_000);
});
