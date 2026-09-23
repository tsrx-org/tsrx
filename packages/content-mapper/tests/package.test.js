import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const package_dir = fileURLToPath(new URL('../', import.meta.url));
const package_json = JSON.parse(
	fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

/** The `exports` entries other than `./package.json` itself. */
const module_exports = Object.entries(package_json.exports).filter(
	([subpath]) => subpath !== './package.json',
);

describe('@tsrx/content-mapper package contract', () => {
	it('ships every export and the executable from dist, where they are bundled', () => {
		// `src/mapper.js` imports `@tsrx/typescript-plugin/src/*`, which that package
		// does not publish and which is only a devDependency here, so an export that
		// resolved to `src/` would fail to import from the installed tarball.
		expect(package_json.dependencies).not.toHaveProperty('@tsrx/typescript-plugin');
		expect(package_json.typescript.contentMapper.exec).toEqual(['node', 'dist/server.js']);
		expect(module_exports.length).toBeGreaterThan(0);
		for (const [subpath, target] of module_exports) {
			expect(target, subpath).toMatch(/^\.\/dist\/[^/]+\.js$/);
		}
	});

	it('bundles the exports so they import without the plugin or TypeScript installed', () => {
		// Built by the package's `prepare` script on install and by `pnpm build`.
		for (const [subpath, target] of module_exports) {
			const file = new URL(target, `file://${package_dir}`);
			if (!fs.existsSync(file)) {
				throw new Error(`${target} is missing; run "pnpm --filter @tsrx/content-mapper build".`);
			}
		}
		const dist_files = fs
			.readdirSync(new URL('../dist/', import.meta.url))
			.filter((name) => name.endsWith('.js'));
		for (const name of dist_files) {
			// Block comments carry JSDoc `import('@tsrx/typescript-plugin/...')` types.
			const text = fs
				.readFileSync(new URL(`../dist/${name}`, import.meta.url), 'utf8')
				.replace(/\/\*[\s\S]*?\*\//g, '');
			expect(text, name).not.toMatch(/["']@tsrx\/typescript-plugin(?:\/|["'])/);
		}
		// Import each export in a process that has no access to the workspace's
		// `node_modules` (the working directory is the system temp dir and the
		// bundles only reach their own `dist/` siblings) and that forbids
		// `typescript`. Externals (`jsonc-parser`, `@tsrx/core`) resolve from the
		// bundle's own location, as they do from the installed package.
		const specifiers = module_exports.map(
			([, target]) => new URL(target, `file://${package_dir}`).href,
		);
		const result = spawnSync(
			process.execPath,
			[
				'--require',
				fileURLToPath(new URL('./forbid-typescript.cjs', import.meta.url)),
				'--input-type=module',
				'-e',
				`for (const specifier of ${JSON.stringify(specifiers)}) {
					const module = await import(specifier);
					console.log(specifier.split('/').pop(), Object.keys(module).sort().join(','));
				}`,
			],
			{ encoding: 'utf8' },
		);
		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);
		expect(result.stdout).toContain('mapper.js create_tsrx_content_mapper');
		expect(result.stdout).toContain('rpc.js redirect_console_to_stderr,run_mapper_server');
		expect(result.stdout).toContain('protocol.js ');
	});
});
