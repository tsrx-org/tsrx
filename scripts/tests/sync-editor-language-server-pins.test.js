import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
	synchronizeEditorLanguageServerPins,
	updateSublimeLockfile,
} from '../sync-editor-language-server-pins.js';

const repository_dir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const nvim_path = 'packages/nvim-plugin/package.json';
const sublime_path = 'packages/sublime-text-plugin/src/language-server/package.json';
const lockfile_path = 'packages/sublime-text-plugin/src/language-server/package-lock.json';
const quiet = { log() {} };
const temporary_dirs = [];

afterEach(() => {
	for (const directory of temporary_dirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe('editor @tsrx/language-server pins', () => {
	it('pins one exact version for Neovim and Sublime Text in this repository', async () => {
		await expect(
			synchronizeEditorLanguageServerPins({ rootDir: repository_dir, check: true, logger: quiet }),
		).resolves.toMatchObject({ changed: false });
	});

	it('moves the pins in a pull request after npm publish', () => {
		const workflow = readFileSync(join(repository_dir, '.github/workflows/publish.yml'), 'utf8');
		const job = workflow.slice(workflow.indexOf('  move-editor-language-server-pins:'));

		expect(workflow).toContain(
			'language-server-version-changed: ${{ steps.language-server.outputs.changed }}',
		);
		expect(job).toContain('needs: publish');
		expect(job).toContain("needs.publish.result == 'success'");
		expect(job).toContain("needs.publish.outputs.language-server-version-changed == 'true'");
		expect(job).toContain('run: node scripts/sync-editor-language-server-pins.js');
		// The changeset the script adds is a new file, which `git commit --all` leaves out.
		expect(job).toContain('git add --all');
		expect(job).toContain('gh pr create --base main');
		expect(job).not.toContain('id-token');
	});

	it('moves both pins and the lockfile to the server version', async () => {
		const fixture = create_fixture({ server: '0.6.2', pinned: '0.6.1' });
		const calls = [];

		const result = await synchronizeEditorLanguageServerPins({
			rootDir: fixture,
			logger: quiet,
			updateLockfile: fake_npm(fixture, calls),
		});

		expect(result).toEqual({ changed: true, version: '0.6.2' });
		expect(calls).toEqual([{ directory: join(fixture, dirname(lockfile_path)), version: '0.6.2' }]);
		const nvim = read_json(join(fixture, nvim_path));
		expect(nvim.config).toEqual({ '@tsrx/language-server': '0.6.2' });
		expect(nvim.files).toEqual(['lua']);
		expect(read_json(join(fixture, sublime_path)).dependencies).toEqual({
			'@tsrx/language-server': '0.6.2',
		});
		await expect(
			synchronizeEditorLanguageServerPins({ rootDir: fixture, check: true, logger: quiet }),
		).resolves.toEqual({ changed: false, version: '0.6.2' });
	});

	it('adds a changeset that releases both editors with the new pin', async () => {
		const fixture = create_fixture({ server: '0.6.2', pinned: '0.6.1' });

		await synchronizeEditorLanguageServerPins({
			rootDir: fixture,
			logger: quiet,
			updateLockfile: fake_npm(fixture, []),
		});

		expect(readdirSync(join(fixture, '.changeset'))).toEqual(['editor-language-server-0-6-2.md']);
		expect(readFileSync(join(fixture, '.changeset/editor-language-server-0-6-2.md'), 'utf8')).toBe(
			[
				'---',
				"'@tsrx/nvim-plugin': patch",
				"'@tsrx/sublime-text-plugin': patch",
				'---',
				'',
				'Install `@tsrx/language-server` 0.6.2 when a project has no server of its own.',
				'',
			].join('\n'),
		);
	});

	it('does not run npm when the pins already match', async () => {
		const fixture = create_fixture({ server: '0.6.2', pinned: '0.6.2' });
		const calls = [];

		await expect(
			synchronizeEditorLanguageServerPins({
				rootDir: fixture,
				logger: quiet,
				updateLockfile: fake_npm(fixture, calls),
			}),
		).resolves.toEqual({ changed: false, version: '0.6.2' });
		expect(calls).toEqual([]);
		expect(existsSync(join(fixture, '.changeset'))).toBe(false);
	});

	it('fails when npm leaves the lockfile on another version', async () => {
		const fixture = create_fixture({ server: '0.6.2', pinned: '0.6.1' });

		await expect(
			synchronizeEditorLanguageServerPins({
				rootDir: fixture,
				logger: quiet,
				updateLockfile: async () => {},
			}),
		).rejects.toThrow(/did not move to 0\.6\.2.*installed version: 0\.6\.1/s);
	});

	it('reports pins that disagree', async () => {
		const fixture = create_fixture({ server: '0.6.2', pinned: '0.6.1' });
		const sublime = read_json(join(fixture, sublime_path));
		sublime.dependencies['@tsrx/language-server'] = '0.6.2';
		writeFileSync(join(fixture, sublime_path), JSON.stringify(sublime));

		await expect(
			synchronizeEditorLanguageServerPins({ rootDir: fixture, check: true, logger: quiet }),
		).rejects.toThrow(
			/one exact @tsrx\/language-server version.*nvim-plugin\/package\.json config: 0\.6\.1.*dependencies: 0\.6\.2/s,
		);
	});

	it('rejects pins that are not an exact version', async () => {
		const fixture = create_fixture({ server: '0.6.2', pinned: '^0.6.1' });

		await expect(
			synchronizeEditorLanguageServerPins({ rootDir: fixture, check: true, logger: quiet }),
		).rejects.toThrow(/one exact @tsrx\/language-server version/);
	});

	it('rejects a server version that Neovim cannot install', async () => {
		const fixture = create_fixture({ server: '0.7.0-next.1', pinned: '0.6.1' });

		await expect(
			synchronizeEditorLanguageServerPins({
				rootDir: fixture,
				logger: quiet,
				updateLockfile: fake_npm(fixture, []),
			}),
		).rejects.toThrow(/x\.y\.z version/);
	});

	// npm served @tsrx/language-server 0.7.1 before @tsrx/core 0.6.1, which it
	// depends on, so the release's lockfile install failed with ETARGET.
	it('installs again while npm does not serve a dependency of the server yet', async () => {
		const served = { status: 0, stdout: '1.2.3\n', stderr: '' };
		const not_served = {
			status: 1,
			stdout: '',
			stderr:
				'npm error code ETARGET\nnpm error notarget No matching version found for @tsrx/core@0.6.1.\n',
		};
		const installed = { status: 0, stdout: '', stderr: '' };
		const responses = [served, not_served, not_served, installed];
		const calls = [];
		const waits = [];

		await updateSublimeLockfile({
			directory: '/lockfile',
			version: '1.2.3',
			logger: quiet,
			runNpm: (args, cwd) => {
				calls.push([args, cwd]);
				return responses.shift();
			},
			wait: async (ms) => {
				waits.push(ms);
			},
		});

		const install = [
			'install',
			'--package-lock-only',
			'--prefer-online',
			'--ignore-scripts',
			'--no-audit',
			'--no-fund',
		];
		expect(calls).toEqual([
			[['view', '@tsrx/language-server@1.2.3', 'version', '--prefer-online'], '/lockfile'],
			[install, '/lockfile'],
			[install, '/lockfile'],
			[install, '/lockfile'],
		]);
		expect(waits).toEqual([30_000, 30_000]);
	});

	it('fails on any other install error at once, and on a package npm does not serve after ten attempts', async () => {
		const served = { status: 0, stdout: '1.2.3\n', stderr: '' };
		let installs = 0;
		const update = (failure) =>
			updateSublimeLockfile({
				directory: '/lockfile',
				version: '1.2.3',
				logger: quiet,
				runNpm: (args) => {
					if (args[0] === 'view') return served;
					installs++;
					return failure;
				},
				wait: async () => {},
			});

		await expect(
			update({ status: 1, stdout: '', stderr: 'npm error code EACCES\n' }),
		).rejects.toThrow(/failed with exit code 1:\nnpm error code EACCES/);
		expect(installs).toBe(1);

		installs = 0;
		await expect(
			update({ status: 1, stdout: '', stderr: 'npm error code E404\n' }),
		).rejects.toThrow(/failed with exit code 1:\nnpm error code E404/);
		expect(installs).toBe(10);
	});
});

function create_fixture({ server, pinned }) {
	const fixture = mkdtempSync(join(tmpdir(), 'tsrx-editor-pins-'));
	temporary_dirs.push(fixture);
	write_fixture_json(fixture, 'packages/language-server/package.json', {
		name: '@tsrx/language-server',
		version: server,
	});
	write_fixture_json(fixture, nvim_path, {
		name: '@tsrx/nvim-plugin',
		config: { '@tsrx/language-server': pinned },
		files: ['lua'],
	});
	write_fixture_json(fixture, sublime_path, {
		name: 'lsp-tsrx-language-server',
		dependencies: { '@tsrx/language-server': pinned },
	});
	write_fixture_json(fixture, lockfile_path, lockfile(pinned));
	return fixture;
}

/** Stands in for `npm install --package-lock-only`. */
function fake_npm(fixture, calls) {
	return async ({ directory, version }) => {
		calls.push({ directory, version });
		write_fixture_json(fixture, lockfile_path, lockfile(version));
	};
}

function lockfile(version) {
	return {
		name: 'lsp-tsrx-language-server',
		lockfileVersion: 3,
		packages: {
			'': { dependencies: { '@tsrx/language-server': version } },
			'node_modules/@tsrx/language-server': { version },
		},
	};
}

function write_fixture_json(fixture, path, value) {
	const file = join(fixture, path);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function read_json(path) {
	return JSON.parse(readFileSync(path, 'utf8'));
}
