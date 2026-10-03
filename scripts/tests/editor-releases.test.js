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
});
