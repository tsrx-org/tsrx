#!/usr/bin/env node
/**
 * Classic (`tsrx-tsc`, Volar on TypeScript 5) versus native (`tsc
 * --runExternalCode` on TypeScript 7 through `@tsrx/content-mapper`) on the
 * same project and hardware. Reports, per backend and with repeated runs:
 *
 * - cold check: `tsc --noEmit -p <config>` from a fresh process, no tsbuildinfo
 * - warm check: the same with `--incremental`, tsbuildinfo already present
 * - single-edit latency: didChange → diagnostics in the language server
 *   (pull diagnostics on the native server, push on the classic one)
 * - peak memory: maximum resident set size summed over the process tree,
 *   sampled while the command or session runs
 * - process count: maximum number of processes in that tree, and how many of
 *   them are content-mapper processes
 *
 * Usage:
 *   node bench/bench.js [--project <dir>] [--tsconfig <name>] [--edit <file>]
 *                       [--runs <n>] [--edits <n>] [--scale <n>] [--json <out>]
 *                       [--skip-lsp] [--skip-check]
 *
 * Without `--project` the consumer fixture is copied to a temporary
 * workspace (`--scale <n>` copies its two components n times). With
 * `--project` (for example the Ripple playground) the project's tsconfig gets
 * a `contentMappers` entry for the duration of the run (classic TypeScript
 * ignores the key, and the language servers discover `tsconfig.json`, not a
 * sidecar) and, when the project cannot resolve `@tsrx/content-mapper`, a
 * manifest under `node_modules/@tsrx/content-mapper` that runs `src/server.js`
 * is written; both are restored on exit. Both backends check the same
 * tsconfig with the same transform code from this checkout, so the numbers
 * isolate the host (Volar on TypeScript 5 versus native TypeScript 7).
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyEdits, modify } from 'jsonc-parser';
import { parse_jsonc } from '@tsrx/typescript-plugin/src/jsonc.js';
import {
	consumer_fixture_dir,
	create_native_workspace,
	mapper_server_path,
	native_tsc_path,
	parse_tsc_output,
	repo_root,
} from '../tests/fixture-utils.js';
import { NativeLspClient } from '../tests/lsp-client.js';

/**
 * @typedef {{ peak_rss_mib: number, peak_processes: number, peak_mappers: number }} TreeStats
 * @typedef {TreeStats & { wall_ms: number, exit_code: number | null, diagnostics: number }} CheckSample
 * @typedef {TreeStats & { initialize_ms: number, open_ms: number, edit_ms: number[] }} LspSample
 * @typedef {{ command: string, args: string[], initialize: Record<string, unknown>, pull: boolean }} LspServer
 */

const package_dir = fileURLToPath(new URL('../', import.meta.url));
const classic_tsc = path.join(repo_root, 'packages', 'typescript-plugin', 'src', 'tsc.js');
const classic_language_server = path.join(
	repo_root,
	'packages',
	'language-server',
	'dist',
	'language-server.js',
);

const args = parse_args(process.argv.slice(2));
const runs = Number(args.runs ?? 5);
const edit_count = Number(args.edits ?? 5);
const scale = Number(args.scale ?? 1);

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

async function main() {
	if (!fs.existsSync(classic_language_server) && !args['skip-lsp']) {
		throw new Error(
			`${classic_language_server} is missing; run \`pnpm --filter @tsrx/language-server build\` first.`,
		);
	}
	const project = prepare_project();
	try {
		/**
		 * @type {Record<string, {
		 * 	check: (extra: string[]) => [command: string, argv: string[]],
		 * 	lsp: () => LspServer,
		 * }>}
		 */
		const backends = {
			classic: {
				check: (extra) => [
					process.execPath,
					[classic_tsc, '--noEmit', '-p', project.tsconfig, '--pretty', 'false', ...extra],
				],
				lsp: () => ({
					command: process.execPath,
					args: [classic_language_server, '--stdio', '--typescript-backend=classic'],
					initialize: { initializationOptions: { typescriptBackend: 'classic' } },
					pull: false,
				}),
			},
			native: {
				check: (extra) => [
					native_tsc_path(),
					['--runExternalCode', '--noEmit', '-p', project.tsconfig, '--pretty', 'false', ...extra],
				],
				lsp: () => ({
					command: native_tsc_path(),
					args: ['--lsp', '--stdio'],
					initialize: { runExternalCode: true },
					pull: true,
				}),
			},
		};

		/** @type {Record<string, any>} */
		const report = {
			date: new Date().toISOString(),
			project: project.label,
			project_dir: project.dir,
			files: project.file_stats,
			runs,
			edits: edit_count,
			environment: environment(),
			results: {},
		};

		for (const [name, backend] of Object.entries(backends)) {
			/** @type {Record<string, any>} */
			const result = {};
			report.results[name] = result;
			if (!args['skip-check']) {
				result.cold_check = [];
				for (let run = 0; run < runs; run++) {
					fs.rmSync(project.buildinfo(name), { force: true });
					result.cold_check.push(await measure_command(...backend.check([]), project.dir));
					log(name, 'cold check', result.cold_check.at(-1));
				}
				const incremental = ['--incremental', '--tsBuildInfoFile', project.buildinfo(name)];
				fs.rmSync(project.buildinfo(name), { force: true });
				await measure_command(...backend.check(incremental), project.dir); // priming run
				result.warm_check = [];
				for (let run = 0; run < runs; run++) {
					result.warm_check.push(await measure_command(...backend.check(incremental), project.dir));
					log(name, 'warm check', result.warm_check.at(-1));
				}
				fs.rmSync(project.buildinfo(name), { force: true });
			}
			if (!args['skip-lsp']) {
				result.lsp = [];
				for (let run = 0; run < runs; run++) {
					result.lsp.push(await measure_lsp_session(backend.lsp(), project));
					log(name, 'lsp', result.lsp.at(-1));
				}
			}
		}

		const summary = summarize(report);
		report.summary = summary;
		console.log('\n' + render_markdown(report));
		if (typeof args.json === 'string') {
			fs.writeFileSync(args.json, JSON.stringify(report, null, '\t') + '\n');
			console.log(`\nWrote ${args.json}`);
		}
	} finally {
		project.cleanup();
	}
}

/** @param {string[]} argv */
function parse_args(argv) {
	/** @type {Record<string, string | true>} */
	const parsed = {};
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (!arg.startsWith('--')) continue;
		const name = arg.slice(2);
		const next = argv[index + 1];
		if (next !== undefined && !next.startsWith('--')) {
			parsed[name] = next;
			index++;
		} else {
			parsed[name] = true;
		}
	}
	return parsed;
}

/**
 * @returns {{
 * 	label: string,
 * 	dir: string,
 * 	tsconfig: string,
 * 	edit_file: string,
 * 	file_stats: { tsrx: number, ts: number, tsrx_lines: number },
 * 	buildinfo: (backend: string) => string,
 * 	cleanup: () => void,
 * }}
 */
function prepare_project() {
	/** @type {Array<() => void>} */
	const cleanups = [];
	let dir;
	let label;
	const tsconfig = typeof args.tsconfig === 'string' ? args.tsconfig : 'tsconfig.json';
	const mapper_entry = { package: '@tsrx/content-mapper', extensions: ['.tsrx'] };
	if (typeof args.project === 'string') {
		dir = path.resolve(args.project);
		label = path.basename(dir);
		const manifest_dir = path.join(dir, 'node_modules', '@tsrx', 'content-mapper');
		if (!fs.existsSync(path.join(manifest_dir, 'package.json'))) {
			fs.mkdirSync(manifest_dir, { recursive: true });
			fs.writeFileSync(
				path.join(manifest_dir, 'package.json'),
				JSON.stringify(
					{
						name: '@tsrx/content-mapper',
						version: '0.0.0-bench',
						type: 'module',
						typescript: {
							contentMapper: {
								exec: [process.execPath, mapper_server_path],
								dynamicConfig: true,
							},
						},
					},
					null,
					'\t',
				),
			);
			cleanups.push(() => fs.rmSync(manifest_dir, { recursive: true, force: true }));
		}
		const tsconfig_path = path.join(dir, tsconfig);
		const original = fs.readFileSync(tsconfig_path, 'utf8');
		cleanups.push(() => fs.writeFileSync(tsconfig_path, original));
		// The tsconfig is JSONC (comments and trailing commas, as TypeScript
		// allows): read it with the mapper's reader and splice the entry in as an
		// edit, which keeps the comments.
		const { value, error } = parse_jsonc(original);
		if (error) fail(`${tsconfig_path}: ${error.message}`);
		const parsed = /** @type {{ contentMappers?: unknown }} */ (value);
		if (!Array.isArray(parsed.contentMappers)) {
			const edits = modify(original, ['contentMappers'], [mapper_entry], {
				formattingOptions: { insertSpaces: false, tabSize: 1 },
			});
			fs.writeFileSync(tsconfig_path, applyEdits(original, edits));
		}
	} else {
		const files = scaled_consumer_fixture(scale, mapper_entry);
		const workspace = create_native_workspace(files);
		cleanups.push(workspace.cleanup);
		dir = workspace.dir;
		label = scale === 1 ? 'consumer fixture' : `consumer fixture ×${scale}`;
	}
	const cleanup = () => {
		for (const entry of cleanups.splice(0).reverse()) entry();
	};
	process.on('SIGINT', () => {
		cleanup();
		process.exit(130);
	});

	const edit_file =
		typeof args.edit === 'string'
			? args.edit
			: (find_files(dir, '.tsrx')[0] ?? fail('no .tsrx file to edit'));
	const tsrx_files = find_files(dir, '.tsrx');
	const file_stats = {
		tsrx: tsrx_files.length,
		ts: find_files(dir, '.ts').length,
		tsrx_lines: tsrx_files.reduce(
			(sum, file) => sum + fs.readFileSync(path.join(dir, file), 'utf8').split('\n').length,
			0,
		),
	};
	const buildinfo_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-bench-buildinfo-'));
	cleanups.push(() => fs.rmSync(buildinfo_dir, { recursive: true, force: true }));
	return {
		label,
		dir,
		tsconfig,
		edit_file,
		file_stats,
		buildinfo: (backend) => path.join(buildinfo_dir, `${backend}.tsbuildinfo`),
		cleanup,
	};
}

/** @param {string} message @returns {never} */
function fail(message) {
	throw new Error(message);
}

/**
 * The consumer fixture, its two components copied `scale` times (each copy
 * keeps the cross-file import and the intentional error), with the mapper
 * declared in `tsconfig.json` so both CLIs and both language servers read
 * the same project.
 * @param {number} scale
 * @param {{ package: string, extensions: string[] }} mapper_entry
 */
function scaled_consumer_fixture(scale, mapper_entry) {
	/** @type {Record<string, string>} */
	const files = {};
	const read = (/** @type {string} */ name) =>
		fs.readFileSync(path.join(consumer_fixture_dir, name), 'utf8');
	const tsconfig = JSON.parse(read('tsconfig.json'));
	tsconfig.contentMappers = [mapper_entry];
	// The fixture lists `main.ts` explicitly; every copy's importer is a root here.
	tsconfig.include = ['*.ts'];
	files['tsconfig.json'] = JSON.stringify(tsconfig, null, '\t') + '\n';
	const panel = read('Panel.tsrx');
	const button = read('Button.tsrx');
	const main = read('main.ts');
	for (let index = 0; index < scale; index++) {
		const suffix = index === 0 ? '' : String(index);
		files[`Panel${suffix}.tsrx`] = panel.replace(/\.\/Button\.tsrx/g, `./Button${suffix}.tsrx`);
		files[`Button${suffix}.tsrx`] = button.replace(/\.\/Panel\.tsrx/g, `./Panel${suffix}.tsrx`);
		files[`main${suffix}.ts`] = main
			.replace(/\.\/Panel\.tsrx/g, `./Panel${suffix}.tsrx`)
			.replace(/\.\/Button\.tsrx/g, `./Button${suffix}.tsrx`);
	}
	return files;
}

/**
 * @param {string} dir
 * @param {string} extension
 * @returns {string[]} Relative paths, excluding node_modules and dist.
 */
function find_files(dir, extension) {
	/** @type {string[]} */
	const found = [];
	const walk = (/** @type {string} */ current) => {
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
				continue;
			}
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.name.endsWith(extension)) found.push(path.relative(dir, full));
		}
	};
	walk(dir);
	return found.sort();
}

/**
 * Sample the process tree under `root_pid` until `stop()` is called: peak
 * summed RSS in MiB, peak process count and peak mapper-process count.
 * @param {number} root_pid
 */
function start_tree_sampler(root_pid) {
	let peak_rss_mib = 0;
	let peak_processes = 0;
	let peak_mappers = 0;
	const sample = () => {
		const ps = spawnSync('ps', ['-axo', 'pid=,ppid=,rss=,args='], { encoding: 'utf8' });
		if (ps.status !== 0) return;
		/** @type {Map<number, { ppid: number, rss: number, args: string }>} */
		const table = new Map();
		for (const line of ps.stdout.split('\n')) {
			const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
			if (match) {
				table.set(Number(match[1]), {
					ppid: Number(match[2]),
					rss: Number(match[3]),
					args: match[4],
				});
			}
		}
		let rss = 0;
		let processes = 0;
		let mappers = 0;
		const visit = (/** @type {number} */ pid) => {
			const entry = table.get(pid);
			if (!entry) return;
			processes++;
			rss += entry.rss;
			if (entry.args.includes('content-mapper')) mappers++;
			for (const [child, child_entry] of table) {
				if (child_entry.ppid === pid) visit(child);
			}
		};
		visit(root_pid);
		peak_rss_mib = Math.max(peak_rss_mib, rss / 1024);
		peak_processes = Math.max(peak_processes, processes);
		peak_mappers = Math.max(peak_mappers, mappers);
	};
	sample();
	const timer = setInterval(sample, 50);
	return {
		stop() {
			clearInterval(timer);
			sample();
			return {
				peak_rss_mib: Math.round(peak_rss_mib),
				peak_processes,
				peak_mappers,
			};
		},
	};
}

/**
 * @param {string} command
 * @param {string[]} argv
 * @param {string} cwd
 * @returns {Promise<CheckSample>}
 */
function measure_command(command, argv, cwd) {
	return new Promise((resolve, reject) => {
		const started = performance.now();
		const child = spawn(command, argv, { cwd, env: { ...process.env, TSRX_DEBUG: undefined } });
		const sampler = start_tree_sampler(/** @type {number} */ (child.pid));
		let output = '';
		child.stdout.on('data', (chunk) => (output += chunk));
		child.stderr.on('data', (chunk) => (output += chunk));
		child.on('error', reject);
		child.on('exit', (code) => {
			const wall_ms = Math.round(performance.now() - started);
			const tree = sampler.stop();
			resolve({
				wall_ms,
				exit_code: code,
				diagnostics: parse_tsc_output(output).length,
				...tree,
			});
		});
	});
}

/**
 * One language-server session: open the edit file, wait for its first
 * diagnostics, then apply `edit_count` semantic edits (a new top-level
 * declaration each time) and time didChange → diagnostics for each.
 * @param {LspServer} server
 * @param {ReturnType<typeof prepare_project>} project
 * @returns {Promise<LspSample>}
 */
async function measure_lsp_session(server, project) {
	const client = new NativeLspClient(project.dir, { command: server.command, args: server.args });
	const sampler = start_tree_sampler(/** @type {number} */ (client.pid));
	const uri = client.uri(project.edit_file);
	const original = fs.readFileSync(path.join(project.dir, project.edit_file), 'utf8');
	/**
	 * @param {() => void} send
	 * @returns {Promise<number>} milliseconds until diagnostics for the edit file arrived.
	 */
	const timed = async (send) => {
		const started = performance.now();
		if (server.pull) {
			send();
			// The native server registers `.tsrx` once the project (and its
			// mapper) has loaded; pulling before that answers with nothing.
			await client.wait_for_registration('content-mapper-did-open', 120_000);
			await client.diagnostics(project.edit_file);
		} else {
			const arrival = client.wait_for_notification(
				'textDocument/publishDiagnostics',
				(params) => params.uri === uri,
				60_000,
			);
			send();
			await arrival;
		}
		return Math.round(performance.now() - started);
	};
	try {
		const initialize_started = performance.now();
		await client.initialize(server.initialize);
		const initialize_ms = Math.round(performance.now() - initialize_started);
		const open_ms = await timed(() => client.open(project.edit_file, original));
		/** @type {number[]} */
		const edit_ms = [];
		for (let index = 0; index < edit_count; index++) {
			const edited = `const bench_edit_${index}: number = ${index};\n${original}`;
			edit_ms.push(await timed(() => client.change(project.edit_file, edited)));
		}
		await client.shutdown();
		return { initialize_ms, open_ms, edit_ms, ...sampler.stop() };
	} catch (error) {
		sampler.stop();
		await client.shutdown().catch(() => {});
		throw error;
	}
}

/** @param {number[]} values */
function stats(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const median =
		sorted.length % 2 === 1
			? sorted[(sorted.length - 1) / 2]
			: (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
	return { median: Math.round(median), min: sorted[0], max: sorted[sorted.length - 1] };
}

/** @param {Record<string, any>} report */
function summarize(report) {
	/** @type {Record<string, any>} */
	const summary = {};
	for (const [backend, result] of Object.entries(report.results)) {
		/** @type {Record<string, any>} */
		const entry = {};
		summary[backend] = entry;
		for (const kind of ['cold_check', 'warm_check']) {
			/** @type {CheckSample[] | undefined} */
			const samples = result[kind];
			if (!samples) continue;
			entry[kind] = {
				wall_ms: stats(samples.map((s) => s.wall_ms)),
				peak_rss_mib: stats(samples.map((s) => s.peak_rss_mib)),
				peak_processes: Math.max(...samples.map((s) => s.peak_processes)),
				peak_mappers: Math.max(...samples.map((s) => s.peak_mappers)),
				exit_codes: [...new Set(samples.map((s) => s.exit_code))],
				diagnostics: [...new Set(samples.map((s) => s.diagnostics))],
			};
		}
		/** @type {LspSample[] | undefined} */
		const sessions = result.lsp;
		if (sessions) {
			entry.lsp = {
				initialize_ms: stats(sessions.map((s) => s.initialize_ms)),
				open_ms: stats(sessions.map((s) => s.open_ms)),
				edit_ms: stats(sessions.flatMap((s) => s.edit_ms)),
				peak_rss_mib: stats(sessions.map((s) => s.peak_rss_mib)),
				peak_processes: Math.max(...sessions.map((s) => s.peak_processes)),
				peak_mappers: Math.max(...sessions.map((s) => s.peak_mappers)),
			};
		}
	}
	return summary;
}

/** @param {{ median: number, min: number, max: number }} s */
function fmt(s) {
	return `${s.median} (${s.min}–${s.max})`;
}

/** @param {Record<string, any>} report */
function render_markdown(report) {
	const { summary } = report;
	const backends = Object.keys(summary);
	const lines = [
		`Project: ${report.project} (${report.files.tsrx} .tsrx files, ${report.files.tsrx_lines} lines; ${report.files.ts} .ts files); ${report.runs} runs, ${report.edits} edits per session; median (min–max).`,
		'',
		`| Measurement | ${backends.join(' | ')} |`,
		`| --- | ${backends.map(() => '---:').join(' | ')} |`,
	];
	const row = (/** @type {string} */ label, /** @type {(entry: any) => string} */ pick) =>
		lines.push(
			`| ${label} | ${backends.map((b) => pick(summary[b]) ?? 'n/a').join(' | ')} |`.replace(
				/\| undefined \|/g,
				'| n/a |',
			),
		);
	row('Cold check, wall ms', (e) => e.cold_check && fmt(e.cold_check.wall_ms));
	row('Cold check, peak RSS MiB', (e) => e.cold_check && fmt(e.cold_check.peak_rss_mib));
	row(
		'Cold check, processes (mappers)',
		(e) => e.cold_check && `${e.cold_check.peak_processes} (${e.cold_check.peak_mappers})`,
	);
	row(
		'Cold check, diagnostics / exit',
		(e) =>
			e.cold_check &&
			`${e.cold_check.diagnostics.join('/')} / ${e.cold_check.exit_codes.join('/')}`,
	);
	row('Warm check (incremental), wall ms', (e) => e.warm_check && fmt(e.warm_check.wall_ms));
	row('Warm check, peak RSS MiB', (e) => e.warm_check && fmt(e.warm_check.peak_rss_mib));
	row(
		'Warm check, diagnostics / exit',
		(e) =>
			e.warm_check &&
			`${e.warm_check.diagnostics.join('/')} / ${e.warm_check.exit_codes.join('/')}`,
	);
	row('LSP initialize, ms', (e) => e.lsp && fmt(e.lsp.initialize_ms));
	row('LSP open → first diagnostics, ms', (e) => e.lsp && fmt(e.lsp.open_ms));
	row('LSP single edit → diagnostics, ms', (e) => e.lsp && fmt(e.lsp.edit_ms));
	row('LSP session, peak RSS MiB', (e) => e.lsp && fmt(e.lsp.peak_rss_mib));
	row(
		'LSP session, processes (mappers)',
		(e) => e.lsp && `${e.lsp.peak_processes} (${e.lsp.peak_mappers})`,
	);
	return lines.join('\n');
}

function environment() {
	const cpu = os.cpus()[0]?.model ?? 'unknown';
	const native_version = JSON.parse(
		fs.readFileSync(
			path.join(path.dirname(path.dirname(native_tsc_path())), 'package.json'),
			'utf8',
		),
	).version;
	const classic_version = JSON.parse(
		fs.readFileSync(path.join(package_dir, 'node_modules', 'typescript', 'package.json'), 'utf8'),
	).version;
	return {
		platform: `${process.platform} ${os.release()} ${process.arch}`,
		cpu,
		memory_gib: Math.round(os.totalmem() / 1024 ** 3),
		node: process.version,
		typescript_native: native_version,
		typescript_classic: classic_version,
	};
}

/** @param {unknown[]} parts */
function log(...parts) {
	if (args.quiet) return;
	console.error(
		parts.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' '),
	);
}
