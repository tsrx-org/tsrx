import { execFileSync, spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspace = mkdtempSync(join(tmpdir(), 'tsrx-hono-packages-'));
const packs_dir = join(workspace, 'packs');
const consumer_dir = join(workspace, 'consumer');
const hono_version = process.env.HONO_VERSION ?? '4.13.7';
const allow_unsupported_hono = process.env.ALLOW_UNSUPPORTED_HONO === '1';
const pnpm_command = process.env.npm_execpath
	? { file: process.execPath, prefix: [process.env.npm_execpath] }
	: { file: 'pnpm', prefix: [] };

const package_dirs = [
	'packages/tsrx-runtime',
	'packages/tsrx',
	'packages/tsrx-hono',
	'packages/vite-plugin-hono',
	'packages/bun-plugin-hono',
];

function run_pnpm(args) {
	return execFileSync(pnpm_command.file, [...pnpm_command.prefix, ...args], {
		cwd: root,
		encoding: 'utf8',
		stdio: 'inherit',
	});
}

function package_json(path) {
	return JSON.parse(readFileSync(path, 'utf8'));
}

function tarball_name(name, version) {
	return `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;
}

function write_json(path, value) {
	writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

function installed_version(package_dir, name) {
	return package_json(join(root, package_dir, 'node_modules', name, 'package.json')).version;
}

function install_consumer(directory, dependencies, strict = true) {
	mkdirSync(directory, { recursive: true });
	const overrides = Object.fromEntries(
		Object.entries(dependencies).filter(
			([name, version]) => name.startsWith('@tsrx/') && version.startsWith('file:'),
		),
	);
	write_json(join(directory, 'package.json'), {
		name: 'tsrx-hono-package-check',
		private: true,
		type: 'module',
		dependencies,
		pnpm: { onlyBuiltDependencies: ['bun'], overrides },
	});
	writeFileSync(
		join(directory, '.npmrc'),
		`auto-install-peers=false\nstrict-peer-dependencies=${strict}\n`,
	);
	run_pnpm(['--dir', directory, 'install']);
}

function expect_peer_rejection(label, compiler_tarball, core_tarball, runtime_tarball, version) {
	const directory = join(workspace, `reject-${label}`);
	mkdirSync(directory, { recursive: true });
	write_json(join(directory, 'package.json'), {
		name: `tsrx-hono-reject-${label}`,
		private: true,
		dependencies: {
			'@tsrx/runtime': `file:${runtime_tarball}`,
			'@tsrx/core': `file:${core_tarball}`,
			'@tsrx/hono': `file:${compiler_tarball}`,
			hono: version,
		},
		pnpm: {
			overrides: {
				'@tsrx/runtime': `file:${runtime_tarball}`,
				'@tsrx/core': `file:${core_tarball}`,
				'@tsrx/hono': `file:${compiler_tarball}`,
			},
		},
	});
	writeFileSync(
		join(directory, '.npmrc'),
		'auto-install-peers=false\nstrict-peer-dependencies=true\n',
	);

	const result = spawnSync(
		pnpm_command.file,
		[...pnpm_command.prefix, '--dir', directory, 'install', '--ignore-scripts'],
		{
			cwd: root,
			encoding: 'utf8',
		},
	);
	if (result.status === 0) {
		throw new Error(`Expected strict peer installation to reject Hono ${version}.`);
	}
	const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
	if (
		!/ERR_PNPM_PEER_DEP_ISSUES|unmet peer|peer dependenc/i.test(output) ||
		!/hono/i.test(output)
	) {
		throw new Error(`Hono ${version} failed for an unexpected reason:\n${output}`);
	}
}

try {
	mkdirSync(packs_dir, { recursive: true });

	const tarballs = new Map();
	for (const package_dir of package_dirs) {
		const manifest = package_json(join(root, package_dir, 'package.json'));
		run_pnpm(['--dir', join(root, package_dir), 'pack', '--pack-destination', packs_dir]);
		const tarball = join(packs_dir, tarball_name(manifest.name, manifest.version));
		if (!existsSync(tarball)) throw new Error(`pnpm pack did not create ${tarball}.`);
		tarballs.set(manifest.name, tarball);
	}

	const compiler_tarball = tarballs.get('@tsrx/hono');
	const core_tarball = tarballs.get('@tsrx/core');
	const runtime_tarball = tarballs.get('@tsrx/runtime');
	if (!compiler_tarball || !core_tarball || !runtime_tarball) {
		throw new Error('Missing a required Hono package-check tarball.');
	}

	const dependencies = Object.fromEntries(
		[...tarballs].map(([name, path]) => [name, `file:${path}`]),
	);
	Object.assign(dependencies, {
		bun: installed_version('packages/bun-plugin-hono', 'bun'),
		hono: hono_version,
		typescript: installed_version('packages/tsrx-hono', 'typescript'),
		vite: installed_version('packages/vite-plugin-hono', 'vite'),
	});
	install_consumer(consumer_dir, dependencies, !allow_unsupported_hono);

	const public_packages = [
		['@tsrx/hono', 'packages/tsrx-hono'],
		['@tsrx/vite-plugin-hono', 'packages/vite-plugin-hono'],
		['@tsrx/bun-plugin-hono', 'packages/bun-plugin-hono'],
	];
	for (const [name, repository_directory] of public_packages) {
		const manifest = package_json(join(consumer_dir, `node_modules/${name}/package.json`));
		if (manifest.name !== name) throw new Error(`Packed package identity mismatch for ${name}.`);
		if (manifest.publishConfig?.access !== 'public') {
			throw new Error(`${name} is not configured for public publication.`);
		}
		if (manifest.repository?.directory !== repository_directory) {
			throw new Error(`${name} has the wrong repository directory.`);
		}
		if (!manifest.exports?.['.'] || !manifest.files?.includes('src')) {
			throw new Error(`${name} is missing its public root export or source files list.`);
		}
	}

	const compiler_manifest = package_json(
		join(consumer_dir, 'node_modules/@tsrx/hono/package.json'),
	);
	if (compiler_manifest.peerDependencies?.hono !== '>=4.13.7 <4.14') {
		throw new Error('The packed @tsrx/hono peer range is not >=4.13.7 <4.14.');
	}
	for (const entry of ['.', './dom', './target']) {
		if (!compiler_manifest.exports?.[entry]) {
			throw new Error(`The packed @tsrx/hono package is missing export ${entry}.`);
		}
	}

	writeFileSync(
		join(consumer_dir, 'imports.mjs'),
		`import assert from 'node:assert/strict';
import { compile as compileServer } from '@tsrx/hono';
import { compile as compileDom } from '@tsrx/hono/dom';
import { resolveHonoTarget } from '@tsrx/hono/target';
import { tsrxHono as viteHono } from '@tsrx/vite-plugin-hono';
import { tsrxHono as bunHono } from '@tsrx/bun-plugin-hono';

const source = 'export function App() { return <main>packed</main>; }';
assert.match(compileServer(source, 'App.tsrx').code, /<main>packed<\\/main>/);
assert.match(compileDom(source, 'App.tsrx').code, /<main>packed<\\/main>/);
assert.doesNotMatch(compileServer(source, 'App.tsrx').code, /react|preact|solid-js/);
assert.equal(resolveHonoTarget().compiler, '@tsrx/hono');
assert.equal(resolveHonoTarget().jsxImportSource, 'hono/jsx');
assert.equal(resolveHonoTarget('dom').compiler, '@tsrx/hono/dom');
assert.equal(resolveHonoTarget('dom').jsxImportSource, 'hono/jsx/dom');
assert.equal(viteHono().name, '@tsrx/vite-plugin-hono');
assert.equal(bunHono().name, '@tsrx/bun-plugin-hono');
`,
	);
	run_pnpm(['--dir', consumer_dir, 'exec', 'node', 'imports.mjs']);

	writeFileSync(
		join(consumer_dir, 'consumer.ts'),
		`import { compile as compileServer } from '@tsrx/hono';
import { compile as compileDom } from '@tsrx/hono/dom';
import { resolveHonoTarget, type HonoTargetMode } from '@tsrx/hono/target';
import { tsrxHono as viteHono } from '@tsrx/vite-plugin-hono';
import { tsrxHono as bunHono } from '@tsrx/bun-plugin-hono';

const mode: HonoTargetMode = 'dom';
compileServer('export const value = 1');
compileDom('export const value = 1');
resolveHonoTarget(mode);
viteHono({ mode });
bunHono({ mode });
`,
	);
	write_json(join(consumer_dir, 'tsconfig.json'), {
		compilerOptions: {
			strict: true,
			noEmit: true,
			target: 'ES2022',
			module: 'NodeNext',
			moduleResolution: 'NodeNext',
			skipLibCheck: true,
		},
		include: ['consumer.ts'],
	});
	run_pnpm(['--dir', consumer_dir, 'exec', 'tsc', '-p', 'tsconfig.json']);

	mkdirSync(join(consumer_dir, 'src'), { recursive: true });
	writeFileSync(
		join(consumer_dir, 'vite.config.js'),
		`import { defineConfig } from 'vite';
import { tsrxHono } from '@tsrx/vite-plugin-hono';
export default defineConfig({ plugins: [tsrxHono({ mode: 'dom' })] });
`,
	);
	writeFileSync(
		join(consumer_dir, 'index.html'),
		'<main id="app"></main><script type="module" src="/src/main.js"></script>\n',
	);
	writeFileSync(
		join(consumer_dir, 'src/main.js'),
		`import { render } from 'hono/jsx/dom';
import { App } from './App.tsrx';
render(App({}), document.querySelector('#app'));
`,
	);
	writeFileSync(
		join(consumer_dir, 'src/App.tsrx'),
		`export function App() @{
	<main class="vite-packed">Vite packed consumer</main>
}
`,
	);
	run_pnpm(['--dir', consumer_dir, 'exec', 'vite', 'build']);

	writeFileSync(
		join(consumer_dir, 'src/server.tsrx'),
		`export function App() @{
	<main class="bun-packed">Bun packed consumer</main>
}
`,
	);
	writeFileSync(
		join(consumer_dir, 'bun-build.mjs'),
		`import assert from 'node:assert/strict';
import { tsrxHono } from '@tsrx/bun-plugin-hono';

const result = await Bun.build({
  entrypoints: ['./src/server.tsrx'],
  outdir: './dist-bun',
  target: 'bun',
  format: 'esm',
  plugins: [tsrxHono()],
});
assert.equal(result.success, true, result.logs.join('\\n'));
assert.ok(result.outputs.some((output) => output.kind === 'entry-point'));
`,
	);
	run_pnpm(['--dir', consumer_dir, 'exec', 'bun', 'run', 'bun-build.mjs']);

	if (!allow_unsupported_hono) {
		expect_peer_rejection(
			'security-floor',
			compiler_tarball,
			core_tarball,
			runtime_tarball,
			'4.13.6',
		);
		expect_peer_rejection(
			'unsupported-minor',
			compiler_tarball,
			core_tarball,
			runtime_tarball,
			'4.12.4',
		);
	}

	const packed_names = readdirSync(packs_dir).sort().join(', ');
	console.log(`Hono ${hono_version} packed consumer passed (${packed_names}).`);
} finally {
	rmSync(workspace, { recursive: true, force: true });
}
