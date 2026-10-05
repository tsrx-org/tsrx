import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repository_dir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('editor releases', () => {
	// Changesets releases a package when a package in its `dependencies` is released
	// (devDependencies do not count). These extensions ship or install one exact
	// server version, so each server release must release them too.
	it.each(['vscode-plugin', 'zed-plugin', 'intellij-plugin'])(
		'releases %s with each @tsrx/language-server release',
		(name) => {
			const package_json = JSON.parse(
				readFileSync(resolve(repository_dir, 'packages', name, 'package.json'), 'utf8'),
			);
			expect(package_json.dependencies?.['@tsrx/language-server']).toBe('workspace:*');
		},
	);

	// Changesets versions these and writes their changelogs; the Publish workflow
	// tags them and creates their GitHub releases. Private packages are never
	// published to npm.
	it.each(['nvim-plugin', 'sublime-text-plugin'])(
		'versions %s with Changesets without publishing it to npm',
		(name) => {
			const package_json = JSON.parse(
				readFileSync(resolve(repository_dir, 'packages', name, 'package.json'), 'utf8'),
			);
			const config = JSON.parse(
				readFileSync(resolve(repository_dir, '.changeset/config.json'), 'utf8'),
			);
			expect(package_json.private).toBe(true);
			expect(config.ignore).not.toContain(package_json.name);
			expect(config.privatePackages).toEqual({ version: true, tag: false });
		},
	);
});
