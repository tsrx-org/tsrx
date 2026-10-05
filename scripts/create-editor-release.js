import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Releases an editor integration that is not published to npm (Neovim, Sublime
 * Text): tags `<package name>@<version>` on the release commit and creates its
 * GitHub release, with that version's section of the package's CHANGELOG.md as
 * the notes and an optional asset, such as the built Sublime Text package. The
 * Publish workflow runs it when a Version Packages commit changes the package's
 * version. A rerun finds the tag and the release and only uploads the asset
 * again.
 *
 * Usage: node scripts/create-editor-release.js <package directory> [asset]
 */
export function createEditorRelease({ packageDir, asset, sha = git(['rev-parse', 'HEAD']) }) {
	const { name, version } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
	const tag = `${name}@${version}`;
	const notes = releaseNotes(readFileSync(join(packageDir, 'CHANGELOG.md'), 'utf8'), version);

	const tagged = run('git', ['rev-parse', '--quiet', '--verify', `refs/tags/${tag}^{commit}`]);
	if (tagged.status === 0) {
		const tagged_sha = tagged.stdout.trim();
		if (tagged_sha !== sha) {
			throw new Error(`${tag} already points to ${tagged_sha} instead of ${sha}.`);
		}
	} else {
		git(['tag', tag, sha]);
		git(['push', 'origin', `refs/tags/${tag}`]);
	}

	if (run('gh', ['release', 'view', tag]).status === 0) {
		if (asset) gh(['release', 'upload', tag, asset, '--clobber']);
		return tag;
	}
	gh(
		[
			'release',
			'create',
			tag,
			'--verify-tag',
			'--title',
			tag,
			'--notes-file',
			'-',
			// The npm packages' releases keep "Latest".
			'--latest=false',
			...(asset ? [asset] : []),
		],
		notes,
	);
	return tag;
}

/**
 * Returns the body of the `## <version>` section of a Changesets CHANGELOG.md.
 * @param {string} changelog
 * @param {string} version
 */
export function releaseNotes(changelog, version) {
	const lines = changelog.split(/\r?\n/);
	const start = lines.indexOf(`## ${version}`);
	if (start === -1) {
		throw new Error(`CHANGELOG.md has no "## ${version}" section.`);
	}
	const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
	return lines
		.slice(start + 1, end === -1 ? undefined : end)
		.join('\n')
		.trim();
}

function run(command, args, input) {
	const result = spawnSync(command, args, { encoding: 'utf8', input });
	if (result.error) throw result.error;
	return result;
}

function git(args) {
	return checked('git', args).stdout.trim();
}

function gh(args, input) {
	return checked('gh', args, input);
}

function checked(command, args, input) {
	const result = run(command, args, input);
	if (result.status !== 0) {
		throw new Error(
			`${command} ${args.join(' ')} failed with exit code ${result.status}:\n${result.stderr}${result.stdout}`,
		);
	}
	return result;
}

const invoked_path = process.argv[1] ? resolve(process.argv[1]) : null;
if (invoked_path === fileURLToPath(import.meta.url)) {
	const [packageDir, asset] = process.argv.slice(2);
	if (!packageDir) {
		throw new Error('Usage: node scripts/create-editor-release.js <package directory> [asset]');
	}
	console.log(`Released ${createEditorRelease({ packageDir, asset })}.`);
}
