/**
 * For the local editor tests of the Neovim and Zed integrations: this repository's
 * `@tsrx/language-server`, built, packed and installed with npm outside the repository,
 * as an editor installs it, and a test project around it.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repo_root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Build, pack and install `@tsrx/language-server` into `<dir>/server`, with this
 * repository's `@tsrx/typescript-plugin` (a dependency of the server, released together
 * with it) packed and installed beside it, so npm uses both as the next release ships
 * them. Needs network access for the other npm dependencies.
 * @param {string} dir
 * @returns {{ bin: string, typescript_next_to_server: boolean }}
 */
export function install_packed_language_server(dir) {
	const pack = path.join(dir, 'pack');
	/** @type {string[]} */
	const tarballs = [];
	for (const name of ['@tsrx/typescript-plugin', '@tsrx/language-server']) {
		execFileSync('pnpm', ['--filter', name, 'build'], { cwd: repo_root, stdio: 'ignore' });
		const before = new Set(fs.existsSync(pack) ? fs.readdirSync(pack) : []);
		execFileSync('pnpm', ['--filter', name, 'pack', '--pack-destination', pack], {
			cwd: repo_root,
			stdio: 'ignore',
		});
		const packed = fs.readdirSync(pack).filter((file) => !before.has(file));
		tarballs.push(path.join(pack, packed[0]));
	}
	const install = path.join(dir, 'server');
	fs.mkdirSync(install);
	execFileSync(
		'npm',
		['install', '--prefix', install, ...tarballs, '--no-audit', '--no-fund', '--loglevel=error'],
		{ stdio: 'ignore' },
	);
	return {
		bin: path.join(install, 'node_modules/@tsrx/language-server/dist/language-server.js'),
		typescript_next_to_server: fs.existsSync(path.join(install, 'node_modules/typescript')),
	};
}

/**
 * A test project: the content mapper's consumer fixture in `app/`, its compiler
 * dependencies in `node_modules`, `node_modules/.bin/tsrx-language-server` linked to
 * `server_bin`, and the given `typescript`: this repository's TypeScript 5.9, a
 * `typescript` package of another version (only its manifest), or none.
 * @param {{
 * 	dir: string,
 * 	server_bin: string,
 * 	typescript?: 'repository' | { version: string },
 * 	package_json?: Record<string, unknown>,
 * }} options `package_json`: written at the project root when given.
 * @returns {{ app: string, file: string }}
 */
export function create_test_project({ dir, server_bin, typescript, package_json }) {
	const app = path.join(dir, 'app');
	fs.mkdirSync(app, { recursive: true });
	const fixture = path.join(repo_root, 'packages/content-mapper/tests/fixtures/consumer');
	for (const name of ['Panel.tsrx', 'Button.tsrx', 'main.ts', 'tsconfig.json']) {
		fs.copyFileSync(path.join(fixture, name), path.join(app, name));
	}
	if (package_json) {
		fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(package_json, null, 2));
	}
	const node_modules = path.join(dir, 'node_modules');
	const content_mapper_modules = path.join(repo_root, 'packages/content-mapper/node_modules');
	for (const dependency of ['@tsrx/react', 'react', '@types/react']) {
		const link = path.join(node_modules, dependency);
		fs.mkdirSync(path.dirname(link), { recursive: true });
		fs.symlinkSync(
			fs.realpathSync(path.join(content_mapper_modules, dependency)),
			link,
			'junction',
		);
	}
	fs.mkdirSync(path.join(node_modules, '.bin'));
	fs.symlinkSync(server_bin, path.join(node_modules, '.bin', 'tsrx-language-server'));
	if (typescript === 'repository') {
		fs.symlinkSync(
			fs.realpathSync(path.join(repo_root, 'packages/language-server/node_modules/typescript')),
			path.join(node_modules, 'typescript'),
			'junction',
		);
	} else if (typescript) {
		fs.mkdirSync(path.join(node_modules, 'typescript'));
		fs.writeFileSync(
			path.join(node_modules, 'typescript', 'package.json'),
			JSON.stringify({ name: 'typescript', version: typescript.version }),
		);
	}
	return { app, file: path.join(app, 'Panel.tsrx') };
}
