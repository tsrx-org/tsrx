import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { releaseNotes } from '../create-editor-release.js';

const repository_dir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(join(repository_dir, '.github/workflows/publish.yml'), 'utf8');

/** @param {string} name */
function job(name) {
	const start = workflow.indexOf(`  ${name}:\n`);
	const next = workflow.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
	return workflow.slice(start, next === -1 ? undefined : start + 1 + next);
}

describe('editor release notes', () => {
	const changelog = [
		'# @tsrx/sublime-text-plugin',
		'',
		'## 0.0.84',
		'',
		'### Patch Changes',
		'',
		'- Install `@tsrx/language-server` 0.6.4 when a project has no server of its own.',
		'',
		'## 0.0.83',
		'',
		'### Patch Changes',
		'',
		'- The grammar closes `<style>` blocks.',
		'',
	].join('\n');

	it("returns the version's section without its heading", () => {
		expect(releaseNotes(changelog, '0.0.83')).toBe(
			'### Patch Changes\n\n- The grammar closes `<style>` blocks.',
		);
		expect(releaseNotes(changelog, '0.0.84')).toBe(
			'### Patch Changes\n\n- Install `@tsrx/language-server` 0.6.4 when a project has no server of its own.',
		);
	});

	it('fails for a version the changelog does not have', () => {
		expect(() => releaseNotes(changelog, '0.0.85')).toThrow(/no "## 0\.0\.85" section/);
	});
});

describe('editor releases in the Publish workflow', () => {
	it.each([
		['release-nvim-plugin', 'nvim', 'packages/nvim-plugin'],
		['release-sublime-text-plugin', 'sublime', 'packages/sublime-text-plugin'],
	])('%s runs when a Version Packages commit changes the version', (name, step, directory) => {
		expect(workflow).toContain(`${step}-version-changed: \${{ steps.${step}.outputs.changed }}`);
		expect(workflow).toContain(`git show "\${BEFORE_SHA}:${directory}/package.json"`);

		const release = job(name);
		expect(release).toContain('needs: publish');
		expect(release).toContain(`needs.publish.outputs.${step}-version-changed == 'true'`);
		expect(release).toContain('contents: write');
		expect(release).toContain(`node scripts/create-editor-release.js ${directory}`);
		expect(release).not.toContain('id-token');
	});

	it('attaches the Sublime Text package built from the committed lockfile', () => {
		const release = job('release-sublime-text-plugin');
		expect(release).toContain('run: node scripts/build.js');
		expect(release).not.toContain('pnpm --filter @tsrx/sublime-text-plugin build');
		expect(release).toContain('packages/sublime-text-plugin/TSRX.sublime-package');
	});
});
