import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	findPackageDir,
	resolveExternalPackages,
	workspacePackageDirs,
} from '../../../scripts/collect-external-deps.js';

/** @type {string} */
let root;

/**
 * @param {string} dir relative to `root`
 * @param {Record<string, unknown>} manifest
 */
function writePackage(dir, manifest) {
	fs.mkdirSync(path.join(root, dir), { recursive: true });
	fs.writeFileSync(path.join(root, dir, 'package.json'), JSON.stringify(manifest));
}

/**
 * @param {string} link relative to `root`
 * @param {string} target relative to `root`
 */
function link(link, target) {
	fs.mkdirSync(path.dirname(path.join(root, link)), { recursive: true });
	fs.symlinkSync(path.join(root, target), path.join(root, link), 'junction');
}

/** @param {string} dir relative to `root` */
const real = (dir) => fs.realpathSync(path.join(root, dir));

/** The `.pnpm` folder of `name@version`, relative to `root`. */
const store = (/** @type {string} */ name, /** @type {string} */ version) =>
	`node_modules/.pnpm/${name}@${version}/node_modules/${name}`;

// A pnpm layout: `dep` in two versions, whose folders sort 1.0.0 first. `lib` depends on
// dep 2.0.0; the workspace package `helper` on dep 1.0.0; `app` on lib and on helper.
beforeAll(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-external-packages-'));
	writePackage(store('dep', '1.0.0'), { name: 'dep', version: '1.0.0' });
	writePackage(store('dep', '2.0.0'), { name: 'dep', version: '2.0.0' });
	writePackage(store('lib', '1.0.0'), {
		name: 'lib',
		version: '1.0.0',
		dependencies: { dep: '^2.0.0' },
	});
	link('node_modules/.pnpm/lib@1.0.0/node_modules/dep', store('dep', '2.0.0'));
	writePackage(store('broken', '1.0.0'), {
		name: 'broken',
		version: '1.0.0',
		dependencies: { gone: '^1.0.0' },
	});
	writePackage('packages/helper', {
		name: 'helper',
		version: '0.0.0',
		dependencies: { dep: '1.0.0' },
	});
	link('packages/helper/node_modules/dep', store('dep', '1.0.0'));
	writePackage('packages/app', {
		name: 'app',
		version: '0.0.0',
		dependencies: { lib: '^1.0.0', broken: '^1.0.0', helper: 'workspace:*' },
	});
	link('packages/app/node_modules/lib', store('lib', '1.0.0'));
	link('packages/app/node_modules/broken', store('broken', '1.0.0'));
	link('packages/app/node_modules/helper', 'packages/helper');
	// A build's CommonJS marker, which has no name.
	writePackage('packages/app/dist', { type: 'commonjs' });
});

afterAll(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

describe('external packages of the VS Code extension', () => {
	it('resolves each package from the package that depends on it, not by folder order', () => {
		const packages = resolveExternalPackages({ roots: ['lib'], importers: [real('packages/app')] });
		expect(packages).toEqual(
			new Map([
				['dep', real(store('dep', '2.0.0'))],
				['lib', real(store('lib', '1.0.0'))],
			]),
		);
	});

	it('fails when bundled code and an external package need different versions', () => {
		expect(() =>
			resolveExternalPackages({
				roots: ['lib'],
				importers: [real('packages/app'), real('packages/helper')],
			}),
		).toThrow(
			[
				'dep resolves to more than one version:',
				'  1.0.0 for helper@0.0.0',
				'  2.0.0 for lib@1.0.0',
			].join('\n'),
		);
	});

	it('fails when a package cannot be resolved', () => {
		expect(() =>
			resolveExternalPackages({ roots: ['broken', 'missing'], importers: [real('packages/app')] }),
		).toThrow('Cannot resolve: gone (for broken@1.0.0), missing (no bundled package declares it).');
	});

	it('lists a package and its workspace dependencies', () => {
		expect(workspacePackageDirs(path.join(root, 'packages/app'))).toEqual([
			real('packages/app'),
			real('packages/helper'),
		]);
	});

	it('finds the package of a file, skipping a nameless package.json', () => {
		expect(findPackageDir(path.join(root, 'packages/app/dist/server.js'))).toBe(
			path.join(root, 'packages/app'),
		);
	});
});
