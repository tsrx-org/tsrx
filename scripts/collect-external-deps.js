import fs from 'fs';
import path from 'path';

/**
 * The packages the VS Code extension ships unbundled, in its flat `node_modules`, at the
 * versions the code that loads them resolves. Code in the extension's bundles loads them
 * from that top level, and so do the shipped packages themselves, so a package can ship
 * in one version only. Each package is resolved from the package that depends on it, as
 * Node resolves it: never by name alone, which took whichever version's folder came first
 * in `node_modules/.pnpm` (#1002).
 */

/**
 * @param {string} dir
 * @returns {{ name?: string, version?: string, dependencies?: Record<string, string>, peerDependencies?: Record<string, string>, peerDependenciesMeta?: Record<string, { optional?: boolean }> }}
 */
function readManifest(dir) {
	return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
}

/**
 * `name@version` of the package in `dir`, for messages.
 * @param {string} dir
 */
function packageLabel(dir) {
	const manifest = readManifest(dir);
	return `${manifest.name}@${manifest.version}`;
}

/**
 * The dependencies a package needs at run time: `dependencies` and the peer dependencies
 * that are not optional.
 * @param {string} dir
 * @returns {string[]}
 */
function runtimeDependencies(dir) {
	const manifest = readManifest(dir);
	const names = new Set(Object.keys(manifest.dependencies ?? {}));
	for (const name of Object.keys(manifest.peerDependencies ?? {})) {
		if (!manifest.peerDependenciesMeta?.[name]?.optional) {
			names.add(name);
		}
	}
	return [...names];
}

/**
 * Node's lookup of a package: `<dir>/node_modules/<name>` from `fromDir` up to the file
 * system root.
 * @param {string} name
 * @param {string} fromDir
 * @returns {string | null} the package's real path
 */
export function resolvePackageFrom(name, fromDir) {
	for (let dir = fromDir; ; dir = path.dirname(dir)) {
		if (path.basename(dir) !== 'node_modules') {
			const candidate = path.join(dir, 'node_modules', name);
			if (fs.existsSync(path.join(candidate, 'package.json'))) {
				return fs.realpathSync(candidate);
			}
		}
		if (path.dirname(dir) === dir) {
			return null;
		}
	}
}

/**
 * The directory of the package a file belongs to: the nearest one up with a `package.json`
 * that has a name (a build's `{"type":"commonjs"}` marker has none).
 * @param {string} file
 * @returns {string | null}
 */
export function findPackageDir(file) {
	for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
		if (fs.existsSync(path.join(dir, 'package.json')) && readManifest(dir).name) {
			return dir;
		}
		if (path.dirname(dir) === dir) {
			return null;
		}
	}
}

/**
 * A package's directory and the directories of its `workspace:` dependencies, recursively:
 * the packages whose code a build of it bundles, before the bundler says which.
 * @param {string} packageDir
 * @returns {string[]}
 */
export function workspacePackageDirs(packageDir) {
	/** @type {Set<string>} */
	const dirs = new Set();
	/** @param {string} dir */
	const visit = (dir) => {
		const real = fs.realpathSync(dir);
		if (dirs.has(real)) return;
		dirs.add(real);
		const manifest = /** @type {{ dependencies?: Record<string, string> }} */ (readManifest(real));
		for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
			if (!range.startsWith('workspace:')) continue;
			const resolved = resolvePackageFrom(name, real);
			if (resolved) visit(resolved);
		}
	};
	visit(packageDir);
	return [...dirs];
}

/**
 * Resolve the external packages: `roots` from the `importers` that declare them, every
 * package's runtime dependencies from that package, and every external package an
 * importer declares from that importer, since bundled code loads it from the same top
 * level. Throws when a package resolves to more than one version, or cannot be resolved.
 * @param {{ roots: string[], importers: string[] }} options
 *   `roots`: the packages the bundles keep external.
 *   `importers`: the directories of the packages whose code the bundles contain.
 * @returns {Map<string, string>} each external package's name and real path
 */
export function resolveExternalPackages({ roots, importers }) {
	/** name -> real path -> the packages that need that version @type {Map<string, Map<string, Set<string>>>} */
	const needs = new Map();
	/** @type {string[]} */
	const missing = [];
	/** @type {Set<string>} */
	const walked = new Set();

	/**
	 * @param {string} name
	 * @param {string} dependent
	 * @returns {string | null}
	 */
	const need = (name, dependent) => {
		const real = resolvePackageFrom(name, dependent);
		if (!real) {
			missing.push(`${name} (for ${packageLabel(dependent)})`);
			return null;
		}
		const versions = needs.get(name) ?? new Map();
		const dependents = versions.get(real) ?? new Set();
		dependents.add(packageLabel(dependent));
		versions.set(real, dependents);
		needs.set(name, versions);
		return real;
	};

	/** @param {string} dir */
	const walk = (dir) => {
		if (walked.has(dir)) return;
		walked.add(dir);
		for (const name of runtimeDependencies(dir)) {
			const real = need(name, dir);
			if (real) walk(real);
		}
	};

	for (const root of roots) {
		const declaring = importers.filter((dir) => runtimeDependencies(dir).includes(root));
		if (declaring.length === 0) {
			missing.push(`${root} (no bundled package declares it)`);
		}
		for (const dir of declaring) {
			const real = need(root, dir);
			if (real) walk(real);
		}
	}

	// Bundled code loads every external package from the top level, so an importer's own
	// dependency on one counts too: vscode-languageclient on vscode-languageserver-types,
	// for example. Until nothing new turns up, as a new version brings its own dependencies.
	for (let size = -1; size !== walked.size;) {
		size = walked.size;
		for (const dir of importers) {
			for (const name of runtimeDependencies(dir)) {
				if (!needs.has(name)) continue;
				const real = need(name, dir);
				if (real) walk(real);
			}
		}
	}

	/** @type {string[]} */
	const problems = [];
	if (missing.length > 0) {
		problems.push(`Cannot resolve: ${[...new Set(missing)].join(', ')}.`);
	}
	for (const [name, versions] of [...needs].sort(([a], [b]) => a.localeCompare(b))) {
		if (versions.size > 1) {
			const lines = [...versions]
				.map(([real, dependents]) => ({
					version: String(readManifest(real).version),
					dependents: [...dependents].sort().join(', '),
				}))
				.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }))
				.map(({ version, dependents }) => `  ${version} for ${dependents}`);
			problems.push(`${name} resolves to more than one version:\n${lines.join('\n')}`);
		}
	}
	if (problems.length > 0) {
		throw new Error(
			`The VS Code extension's node_modules holds one version of each external package.\n${problems.join('\n')}\nMake each one a single version, for example with a pnpm override in pnpm-workspace.yaml.`,
		);
	}

	return new Map(
		[...needs]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([name, versions]) => [name, /** @type {string} */ ([...versions.keys()][0])]),
	);
}
