/**
 * Which `typescript` package the classic backend runs: the `typescript.tsdk`
 * initialization option, then the project's (each workspace folder and its parent
 * folders), then the one next to the server; the notice when it skipped the
 * `typescript.tsdk` option; and the notice when it found none it can run (nothing,
 * or TypeScript 7).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	find_typescript,
	find_typescript_package,
	is_usable_typescript,
	tsdk_notice,
	typescript_notice,
} from '../src/find-typescript.js';

/** @type {string} */
let root;

/**
 * A `typescript` package (only its manifest: the search reads no more).
 * @param {string} dir relative to `root`
 * @param {string} version
 */
function typescript_package(dir, version) {
	fs.mkdirSync(path.join(root, dir, 'lib'), { recursive: true });
	fs.writeFileSync(
		path.join(root, dir, 'package.json'),
		JSON.stringify({ name: 'typescript', version }),
	);
}

/** @param {string} dir relative to `root` */
const at = (dir) => fs.realpathSync(path.join(root, dir));

// A monorepo with typescript 6.0.3 at its root, a sub-package `apps/web`, a project
// on TypeScript 7 (`ts7`), a project without TypeScript (`plain`), a folder whose
// node_modules/typescript is not a typescript package, and a server install with
// typescript 5.9.3 next to it.
beforeAll(() => {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-find-typescript-')));
	typescript_package('monorepo/node_modules/typescript', '6.0.3');
	fs.mkdirSync(path.join(root, 'monorepo/apps/web'), { recursive: true });
	typescript_package('ts7/node_modules/typescript', '7.1.0-dev.20261002.1');
	fs.mkdirSync(path.join(root, 'plain'), { recursive: true });
	fs.mkdirSync(path.join(root, 'other/node_modules/typescript'), { recursive: true });
	fs.writeFileSync(
		path.join(root, 'other/node_modules/typescript/package.json'),
		JSON.stringify({ name: 'not-typescript', version: '1.0.0' }),
	);
	typescript_package('server/node_modules/typescript', '5.9.3');
	fs.mkdirSync(path.join(root, 'server/node_modules/@tsrx/language-server/dist'), {
		recursive: true,
	});
	typescript_package('tools/typescript', '6.0.2');
});

afterAll(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

const server_dir = () => path.join(root, 'server/node_modules/@tsrx/language-server/dist');

describe("finding the classic backend's typescript", () => {
	it("finds the project's typescript in a parent folder of the workspace folder", () => {
		expect(find_typescript_package(path.join(root, 'monorepo/apps/web'))).toEqual({
			dir: at('monorepo/node_modules/typescript'),
			lib: path.join(at('monorepo/node_modules/typescript'), 'lib'),
			version: '6.0.3',
		});
		expect(
			find_typescript({
				workspace_dirs: [path.join(root, 'monorepo/apps/web')],
				server_dir: server_dir(),
			}),
		).toMatchObject({ dir: at('monorepo/node_modules/typescript'), source: 'workspace' });
	});

	it('takes the first workspace folder that has one', () => {
		expect(
			find_typescript({
				workspace_dirs: [
					path.join(root, 'plain'),
					path.join(root, 'ts7'),
					path.join(root, 'monorepo'),
				],
				server_dir: server_dir(),
			}),
		).toMatchObject({ version: '7.1.0-dev.20261002.1', source: 'workspace' });
	});

	it('prefers the typescript.tsdk initialization option, the lib folder or the package folder', () => {
		for (const tsdk of ['tools/typescript/lib', 'tools/typescript']) {
			expect(
				find_typescript({
					tsdk: path.join(root, tsdk),
					workspace_dirs: [path.join(root, 'monorepo')],
					server_dir: server_dir(),
				}),
			).toEqual({
				dir: at('tools/typescript'),
				lib: path.join(root, 'tools/typescript/lib'),
				version: '6.0.2',
				source: 'tsdk',
			});
		}
	});

	it('skips a typescript.tsdk folder with no typescript package', () => {
		for (const tsdk of ['tools/typo/lib', 'tools']) {
			expect(
				find_typescript({
					tsdk: path.join(root, tsdk),
					workspace_dirs: [path.join(root, 'monorepo')],
					server_dir: server_dir(),
				}),
			).toMatchObject({ version: '6.0.3', source: 'workspace' });
		}
	});

	it('falls back to the typescript next to the server, then to none', () => {
		expect(
			find_typescript({ workspace_dirs: [path.join(root, 'plain')], server_dir: server_dir() }),
		).toMatchObject({ version: '5.9.3', source: 'server' });
		expect(
			find_typescript({
				workspace_dirs: [path.join(root, 'plain')],
				server_dir: path.join(root, 'plain'),
			}),
		).toBeUndefined();
	});

	it('skips a node_modules/typescript that is not the typescript package', () => {
		expect(find_typescript_package(path.join(root, 'other'))).toBeUndefined();
	});

	it('runs any version below 7', () => {
		for (const version of ['4.9.5', '5.4.5', '5.9.3', '6.0.3', '6.1.0-beta']) {
			expect(is_usable_typescript(version)).toBe(true);
		}
		for (const version of ['7.0.2', '7.1.0-dev.20261002.1', '8.0.0']) {
			expect(is_usable_typescript(version)).toBe(false);
		}
	});
});

describe('the notice when the typescript.tsdk option is skipped', () => {
	const typo = () => path.join(root, 'tools/typo/lib');

	it("names the folder, then the project's typescript the server uses", () => {
		const notice = tsdk_notice(
			typo(),
			find_typescript({ workspace_dirs: [path.join(root, 'monorepo')], server_dir: server_dir() }),
		);
		expect(notice).toBe(
			`The TSRX language server found no TypeScript in ${typo()}, the folder in the typescript.tsdk startup option. ` +
				`So the server uses the project's TypeScript 6.0.3, from ${at('monorepo/node_modules/typescript')}. ` +
				`Set typescript.tsdk to the lib folder of a TypeScript install, such as /path/to/node_modules/typescript/lib.`,
		);
	});

	it('says when the typescript the server uses is the one next to the server', () => {
		const notice = tsdk_notice(
			typo(),
			find_typescript({ workspace_dirs: [path.join(root, 'plain')], server_dir: server_dir() }),
		);
		expect(notice).toContain(
			`So the server uses the TypeScript 5.9.3 installed next to the server, from ${at('server/node_modules/typescript')}.`,
		);
	});

	it('names no other typescript when the server found none it can run', () => {
		for (const workspace_dir of ['plain', 'ts7']) {
			const notice = tsdk_notice(
				typo(),
				find_typescript({
					workspace_dirs: [path.join(root, workspace_dir)],
					server_dir: path.join(root, 'plain'),
				}),
			);
			expect(notice).toBe(
				`The TSRX language server found no TypeScript in ${typo()}, the folder in the typescript.tsdk startup option. ` +
					`Set typescript.tsdk to the lib folder of a TypeScript install, such as /path/to/node_modules/typescript/lib.`,
			);
		}
	});
});

describe('the notice when no usable typescript is found', () => {
	it('names the TypeScript 7 version and where it was found', () => {
		const notice = typescript_notice(
			{
				dir: '/project/node_modules/typescript',
				lib: '/project/node_modules/typescript/lib',
				version: '7.1.0-dev.20261002.1',
				source: 'workspace',
			},
			['/project'],
		);
		expect(notice).toContain(
			'found typescript 7.1.0-dev.20261002.1 at /project/node_modules/typescript',
		);
		expect(notice).toContain('cannot run TypeScript 7 or newer');
		expect(notice).toContain('tsc --lsp');
		expect(notice).toContain('typescript.tsdk');
	});

	it('says where it looked and how to install typescript', () => {
		const notice = typescript_notice(undefined, ['/project/a', '/project/b']);
		expect(notice).toContain('found no typescript package in /project/a, /project/b');
		expect(notice).toContain('npm install -D typescript, or pnpm add -D typescript');
	});
});

describe('@tsrx/language-server package', () => {
	it('declares typescript as an optional peer dependency, which npm and pnpm do not install', () => {
		const manifest = JSON.parse(
			fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
		);
		expect(manifest.peerDependencies.typescript).toBeDefined();
		expect(manifest.peerDependenciesMeta?.typescript?.optional).toBe(true);
	});
});
