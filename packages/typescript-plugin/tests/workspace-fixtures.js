import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * A source containing this marker makes every compiler stub throw, the way a
 * real target compiler does on a fatal parse error. Tests use it to exercise the
 * plugin's raw-source fallback path (regex-extracted `<style>` / `<script>`
 * regions) without depending on a real parser.
 */
export const COMPILE_FAILURE_MARKER = '/* @tsrx-stub: compile-failure */';

// Shared prelude for every compiler stub. Stubs don't parse TSRX, but they do
// mirror the parts of the `compile_to_volar_mappings` contract the plugin relies
// on for embedded CSS: `cssMappings` carries one entry per *bodied* `<style>`
// block in source order, and a self-closed `<style apply={…} />` block (no CSS
// body) produces none. The opening tag is scanned so a `>` inside quotes or
// inside an `{…}` expression container does not end it.
const STUB_PRELUDE = `
const COMPILE_FAILURE_MARKER = ${JSON.stringify(COMPILE_FAILURE_MARKER)};

function collect_css_mappings(source) {
	const mappings = [];
	let from = 0;
	while (true) {
		const start = source.indexOf('<style', from);
		if (start === -1) break;
		let i = start + '<style'.length;
		let depth = 0;
		let quote = null;
		for (; i < source.length; i++) {
			const ch = source[i];
			if (quote) {
				if (ch === quote) quote = null;
			} else if (ch === '"' || ch === "'") {
				quote = ch;
			} else if (ch === '{') {
				depth++;
			} else if (ch === '}') {
				depth--;
			} else if (ch === '>' && depth === 0) {
				break;
			}
		}
		if (i >= source.length) break;
		const open_end = i + 1;
		if (source[i - 1] === '/') {
			// Self-closed block: no CSS body, no mapping.
			from = open_end;
			continue;
		}
		const close = source.indexOf('</style>', open_end);
		if (close === -1) break;
		const content = source.slice(open_end, close);
		mappings.push({
			sourceOffsets: [open_end],
			generatedOffsets: [0],
			lengths: [content.length],
			generatedLengths: [content.length],
			data: {
				verification: true,
				completion: true,
				semantic: true,
				navigation: true,
				structure: true,
				format: false,
				customData: { content, embeddedId: 'style_' + mappings.length },
			},
		});
		from = close + '</style>'.length;
	}
	return mappings;
}
`;

/**
 * @param {string} marker - `compiler:<marker>` comment stamped into the output
 * @param {string} [export_name] - name of the exported compile function
 */
function compiler_stub(marker, export_name = 'compile_to_volar_mappings') {
	return `${STUB_PRELUDE}
module.exports = {
	${export_name}(source, filename) {
		if (source.includes(COMPILE_FAILURE_MARKER)) {
			throw new Error('compile failure requested by fixture source');
		}
		const code = \`/* compiler:${marker} */\\nexport const filename = \${JSON.stringify(filename)};\\nexport default \${JSON.stringify(source)};\`;
		return {
			code,
			mappings: [
				{
					sourceOffsets: [0],
					generatedOffsets: [0],
					lengths: [source.length],
					generatedLengths: [source.length],
					data: {
						verification: false,
						completion: true,
						semantic: true,
						navigation: true,
						structure: true,
						format: true,
						customData: {},
					},
				},
			],
			cssMappings: collect_css_mappings(source),
			errors: [],
		};
	},
};
`;
}

const COMPILER_STUBS = {
	ripple: compiler_stub('ripple'),
	react: compiler_stub('react'),
	solid: compiler_stub('solid'),
	preact: compiler_stub('preact'),
	// Octane ships its compiler inside the `octane` package under
	// `<layout>/compiler/volar.js` and exports the contract under a camelCase name
	// — this stub mirrors the real published shape so the tests cover the
	// plugin's entry-path override AND its module-shape normalization.
	octane: compiler_stub('octane', 'compileToVolarMappings'),
	vue: compiler_stub('vue'),
};

// prettier-ignore
const DECLARED_COMPILER_STUB = COMPILER_STUBS.octane.replace('compiler:octane', 'compiler:declared');

/**
 * @typedef {object} DeclaredCompilerFixture
 * @property {string} specifier
 * @property {string} marker
 * @property {string} [directory]
 * @property {string[]} [entry_parts]
 * @property {boolean} [export_subpath]
 */

/**
 * @typedef {object} DeclaredWorkspaceOverrides
 * @property {string} [specifier]
 * @property {Record<string, unknown>} [package_json]
 * @property {Partial<DeclaredCompilerFixture>} [declared_compiler]
 * @property {Partial<WorkspaceFixtureConfig>} [config]
 */

/**
 * Published `octane` releases only ship `dist/` and expose the compiler through
 * the `./compiler/volar` export; `octane-src` models a source checkout of the
 * same package, which the plugin still falls back to.
 */
const OCTANE_LAYOUT_DIRS = {
	octane: 'dist',
	'octane-src': 'src',
};

/** @typedef {keyof typeof COMPILER_STUBS | keyof typeof OCTANE_LAYOUT_DIRS} FixtureCompilerName */

/**
 * @typedef {object} WorkspaceFixtureConfig
 * @property {Record<string, unknown>} package_json
 * @property {unknown} [tsconfig_json]
 * @property {unknown} [nested_tsconfig_json]
 * @property {FixtureCompilerName[]} compilers
 * @property {DeclaredCompilerFixture[]} [declared_compilers]
 * @property {boolean} [imports_escape]
 */

/** @param {string} file_name @param {unknown} value */
function write_json(file_name, value) {
	fs.mkdirSync(path.dirname(file_name), { recursive: true });
	fs.writeFileSync(file_name, JSON.stringify(value, null, 2) + '\n');
}

/**
 * @param {string} package_name
 * @param {string} compiler
 * @param {string} marker
 * @param {DeclaredWorkspaceOverrides} [overrides]
 */
function declared_workspace_config(package_name, compiler, marker, overrides = {}) {
	const specifier = overrides.specifier ?? compiler.trim();
	return {
		package_json: { name: package_name, private: true, ...overrides.package_json },
		tsconfig_json: { tsrx: { compiler }, compilerOptions: {} },
		compilers: [],
		declared_compilers: [{ specifier, marker, ...overrides.declared_compiler }],
		...overrides.config,
	};
}

/** @satisfies {Record<string, WorkspaceFixtureConfig>} */
export const WORKSPACE_CONFIGS = {
	'ripple-only': {
		package_json: {
			name: '@tsrx/fixture-ripple-only-project',
			private: true,
			devDependencies: {
				'@tsrx/ripple': '*',
				'@ripple-ts/vite-plugin': '*',
				ripple: '*',
			},
		},
		compilers: ['ripple'],
	},
	'react-only': {
		package_json: {
			name: '@tsrx/fixture-react-only-project',
			private: true,
			devDependencies: {
				'@tsrx/react': 'workspace:*',
				'@tsrx/vite-plugin-react': 'workspace:*',
			},
		},
		compilers: ['react'],
	},
	'solid-only': {
		package_json: {
			name: '@tsrx/fixture-solid-only-project',
			private: true,
			devDependencies: {
				'@tsrx/solid': 'workspace:*',
				'@tsrx/vite-plugin-solid': 'workspace:*',
			},
		},
		compilers: ['solid'],
	},
	'preact-only': {
		package_json: {
			name: '@tsrx/fixture-preact-only-project',
			private: true,
			devDependencies: {
				'@tsrx/preact': 'workspace:*',
				'@tsrx/vite-plugin-preact': 'workspace:*',
			},
		},
		compilers: ['preact'],
	},
	'vue-only': {
		package_json: {
			name: '@tsrx/fixture-vue-only-project',
			private: true,
			devDependencies: {
				'@tsrx/vue': 'workspace:*',
				vue: '^3.5.0',
				'vue-jsx-vapor': '^3.2.10',
			},
		},
		compilers: ['vue'],
	},
	'octane-only': {
		package_json: {
			name: '@octanejs/fixture-octane-only-project',
			private: true,
			devDependencies: {
				octane: 'workspace:*',
				'@octanejs/vite-plugin': 'workspace:*',
			},
		},
		compilers: ['octane'],
	},
	'octane-src-only': {
		package_json: {
			name: '@octanejs/fixture-octane-src-only-project',
			private: true,
			devDependencies: {
				octane: 'workspace:*',
				'@octanejs/vite-plugin': 'workspace:*',
			},
		},
		compilers: ['octane-src'],
	},
	'both-octane': {
		package_json: {
			name: '@octanejs/fixture-octane-project',
			private: true,
			devDependencies: {
				octane: 'workspace:*',
				'@octanejs/vite-plugin': 'workspace:*',
			},
		},
		compilers: ['ripple', 'react', 'octane'],
	},
	both: {
		package_json: {
			name: '@tsrx/fixture-ripple-project',
			private: true,
			devDependencies: {
				'@tsrx/ripple': '*',
				'@ripple-ts/vite-plugin': '*',
				ripple: '*',
			},
		},
		compilers: ['ripple', 'react'],
	},
	'both-vue': {
		package_json: {
			name: '@tsrx/fixture-vue-project',
			private: true,
			devDependencies: {
				'@tsrx/vue': 'workspace:*',
				vue: '^3.5.0',
				'vue-jsx-vapor': '^3.2.10',
			},
		},
		compilers: ['ripple', 'vue'],
	},
	'both-react': {
		package_json: {
			name: '@tsrx/fixture-react-project',
			private: true,
			devDependencies: {
				'@tsrx/react': 'workspace:*',
				'@tsrx/vite-plugin-react': 'workspace:*',
			},
		},
		compilers: ['ripple', 'react'],
	},
	'both-preact': {
		package_json: {
			name: '@tsrx/fixture-preact-project',
			private: true,
			devDependencies: {
				'@tsrx/preact': 'workspace:*',
				'@tsrx/vite-plugin-preact': 'workspace:*',
			},
		},
		compilers: ['ripple', 'react', 'solid', 'preact'],
	},
	'declared-only': declared_workspace_config(
		'@tsrx/fixture-declared-only-project',
		'consumer-tsrx-compiler',
		'declared',
	),
	'declared-scoped': declared_workspace_config(
		'@tsrx/fixture-declared-scoped-project',
		'@consumer/tsrx-compiler',
		'scoped',
	),
	'declared-scoped-whitespace': declared_workspace_config(
		'@tsrx/fixture-declared-scoped-whitespace-project',
		' @consumer/tsrx-compiler ',
		'scoped',
	),
	'declared-dist': declared_workspace_config(
		'@tsrx/fixture-declared-dist-project',
		'consumer-dist-compiler',
		'dist',
		{ declared_compiler: { entry_parts: ['dist', 'volar.cjs'] } },
	),
	'declared-subpath': declared_workspace_config(
		'@tsrx/fixture-declared-subpath-project',
		'consumer-tsrx-compiler/volar',
		'subpath',
	),
	'declared-scoped-subpath': declared_workspace_config(
		'@tsrx/fixture-declared-scoped-subpath-project',
		'@consumer/tsrx-compiler/compiler/volar',
		'scoped-subpath',
	),
	'declared-mixed-case-subpath': declared_workspace_config(
		'@tsrx/fixture-declared-mixed-case-subpath-project',
		'@consumer/tsrx-compiler/compileToVolar',
		'mixed-case-subpath',
		{ declared_compiler: { export_subpath: true } },
	),
	'declared-beats-candidates': declared_workspace_config(
		'@tsrx/fixture-declared-priority-project',
		'consumer-tsrx-compiler',
		'declared',
		{
			package_json: { devDependencies: { '@tsrx/ripple': '*' } },
			config: { compilers: ['ripple', 'react'] },
		},
	),
	'invalid-declared-specifier': {
		package_json: {
			name: '@tsrx/fixture-invalid-declared-project',
			private: true,
			imports: { '#internal': './escape.cjs' },
		},
		tsconfig_json: { tsrx: { compiler: '#internal' }, compilerOptions: {} },
		compilers: ['ripple'],
		imports_escape: true,
	},
	'nearest-tsconfig': {
		package_json: {
			name: '@tsrx/fixture-nearest-tsconfig-project',
			private: true,
		},
		tsconfig_json: { tsrx: { compiler: 'consumer-tsrx-compiler' }, compilerOptions: {} },
		nested_tsconfig_json: {
			tsrx: { compiler: 'nested-tsrx-compiler' },
			compilerOptions: {},
		},
		compilers: [],
		declared_compilers: [
			{ specifier: 'consumer-tsrx-compiler', marker: 'declared' },
			{ specifier: 'nested-tsrx-compiler', marker: 'nested', directory: 'nested' },
		],
	},
	'inherited-declaration': {
		package_json: {
			name: '@tsrx/fixture-inherited-declaration-project',
			private: true,
			devDependencies: { '@tsrx/ripple': '*' },
		},
		compilers: ['ripple'],
		declared_compilers: [
			{ specifier: 'inherited-compiler-a', marker: 'inherited-a' },
			{ specifier: 'inherited-compiler-b', marker: 'inherited-b' },
			{
				specifier: 'declaring-config-compiler',
				marker: 'declaring-config',
				directory: 'configs',
			},
		],
	},
};

/** @type {string[]} */
const created_workspaces = [];

/** @param {string} workspace_dir @param {FixtureCompilerName} compiler_name */
function write_compiler_stub(workspace_dir, compiler_name) {
	if (compiler_name === 'octane' || compiler_name === 'octane-src') {
		// Octane's layout: the compiler entry lives INSIDE the octane package.
		const octane_layout_dir = OCTANE_LAYOUT_DIRS[compiler_name];
		const package_dir = path.join(workspace_dir, 'node_modules', 'octane');
		const compiler_dir = path.join(package_dir, octane_layout_dir, 'compiler');
		fs.mkdirSync(compiler_dir, { recursive: true });
		write_json(path.join(package_dir, 'package.json'), {
			name: 'octane',
			exports: { './compiler/volar': `./${octane_layout_dir}/compiler/volar.js` },
		});
		fs.writeFileSync(path.join(compiler_dir, 'volar.js'), COMPILER_STUBS.octane);
		return;
	}
	const package_dir = path.join(workspace_dir, 'node_modules', '@tsrx', compiler_name);
	const compiler_dir = path.join(package_dir, 'src');
	fs.mkdirSync(compiler_dir, { recursive: true });
	write_json(path.join(package_dir, 'package.json'), {
		name: `@tsrx/${compiler_name}`,
		main: './src/index.js',
	});
	fs.writeFileSync(path.join(compiler_dir, 'index.js'), COMPILER_STUBS[compiler_name]);
}

/** @param {string} workspace_dir @param {string} specifier @param {string} marker @param {string} [directory] @param {string[]} [entry_parts] @param {boolean} [export_subpath] */
function write_declared_compiler_stub(
	workspace_dir,
	specifier,
	marker,
	directory = '',
	entry_parts,
	export_subpath = false,
) {
	const specifier_parts = specifier.split('/');
	const package_part_count = specifier.startsWith('@') ? 2 : 1;
	const package_name = specifier_parts.slice(0, package_part_count).join('/');
	const subpath_parts = specifier_parts.slice(package_part_count);
	const subpath = subpath_parts.join('/');
	const compiler_dir = path.join(workspace_dir, directory, 'node_modules', package_name);
	fs.mkdirSync(compiler_dir, { recursive: true });
	write_json(path.join(compiler_dir, 'package.json'), {
		name: package_name,
		main: entry_parts?.join('/') ?? 'index.cjs',
		...(export_subpath ? { exports: { [`./${subpath}`]: `./${subpath}.js` } } : {}),
	});
	const compiler_path =
		entry_parts !== undefined
			? path.join(compiler_dir, ...entry_parts)
			: subpath_parts.length === 0
				? path.join(compiler_dir, 'index.cjs')
				: path.join(compiler_dir, ...subpath_parts) + '.js';
	fs.mkdirSync(path.dirname(compiler_path), { recursive: true });
	fs.writeFileSync(
		compiler_path,
		DECLARED_COMPILER_STUB.replace('compiler:declared', `compiler:${marker}`),
	);
}

/** @param {keyof typeof WORKSPACE_CONFIGS} name */
export function create_fixture_workspace(name) {
	/** @type {WorkspaceFixtureConfig | undefined} */
	const config = WORKSPACE_CONFIGS[name];
	if (!config) {
		throw new Error(`Unknown fixture workspace: ${name}`);
	}

	const workspace_dir = fs.mkdtempSync(path.join(os.tmpdir(), `ts-plugin-${name}-`));
	created_workspaces.push(workspace_dir);

	fs.mkdirSync(path.join(workspace_dir, 'src', 'nested', 'components'), { recursive: true });
	write_json(path.join(workspace_dir, 'package.json'), config.package_json);
	if (config.tsconfig_json) {
		write_json(path.join(workspace_dir, 'tsconfig.json'), config.tsconfig_json);
	}
	if (config.nested_tsconfig_json) {
		fs.mkdirSync(path.join(workspace_dir, 'nested'), { recursive: true });
		write_json(path.join(workspace_dir, 'nested', 'tsconfig.json'), config.nested_tsconfig_json);
	}

	for (const compiler_name of config.compilers) {
		write_compiler_stub(workspace_dir, compiler_name);
	}
	for (const declared_compiler of config.declared_compilers ?? []) {
		write_declared_compiler_stub(
			workspace_dir,
			declared_compiler.specifier,
			declared_compiler.marker,
			declared_compiler.directory,
			declared_compiler.entry_parts,
			declared_compiler.export_subpath,
		);
	}
	if (config.imports_escape) {
		fs.writeFileSync(
			path.join(workspace_dir, 'escape.cjs'),
			`require('fs').writeFileSync(__dirname + '/escape-executed', 'executed');\n${DECLARED_COMPILER_STUB}`,
		);
	}

	return workspace_dir;
}

export function cleanup_fixture_workspaces() {
	while (created_workspaces.length > 0) {
		fs.rmSync(/** @type {string} */ (created_workspaces.pop()), { recursive: true, force: true });
	}
}
