import { configDefaults, defineConfig } from 'vitest/config';
import { tsrxPreact } from './packages/vite-plugin-preact/src/index.js';
import { tsrxReact } from './packages/vite-plugin-react/src/index.js';
import { tsrxSolid } from './packages/vite-plugin-solid/src/index.js';
import { tsrxVue } from './packages/vite-plugin-vue/src/index.js';
import solid from 'vite-plugin-solid';
import { fileURLToPath } from 'node:url';

const vue_runtime_path = fileURLToPath(
	new URL('./packages/vite-plugin-vue/tests/vue-runtime-shim.js', import.meta.url),
);
const vue_jsx_vapor_runtime_path = fileURLToPath(
	new URL('./packages/vite-plugin-vue/tests/vue-jsx-vapor-shim.js', import.meta.url),
);
const vue_jsx_vapor_jsx_runtime_path = fileURLToPath(
	new URL('./packages/vite-plugin-vue/tests/vue-jsx-vapor-jsx-runtime-shim.js', import.meta.url),
);

/**
 * `vite-plugin-solid` and `vue-jsx-vapor` rewrite `.tsrx` test files into
 * virtual `<path>.tsrx.tsx` ids before vite's import-analysis runs. Vite then
 * walks `node_modules` from the virtual id and misses workspace packages
 * that are only symlinked into the test file's package — including the
 * shared `@tsrx/core` test-harness paths. A single regex alias maps every
 * `@tsrx/core/test-harness/runtime/<file>` import to the matching file
 * under `packages/tsrx/tests/shared/runtime/<file>` so new shared fixtures
 * work without per-file additions to this config.
 */
const tsrx_core_test_harness_runtime_dir = fileURLToPath(
	new URL('./packages/tsrx/tests/shared/runtime/', import.meta.url),
);
const solid_scoped_styles_dir = fileURLToPath(
	new URL('./packages/vite-plugin-solid/tests/fixtures/scoped-styles/', import.meta.url),
);
const vue_scoped_styles_dir = fileURLToPath(
	new URL('./packages/vite-plugin-vue/tests/fixtures/scoped-styles/', import.meta.url),
);
const tsrx_core_test_harness_alias = [
	{
		find: /^@tsrx\/core\/test-harness\/runtime\/(.*)$/,
		replacement: `${tsrx_core_test_harness_runtime_dir}$1`,
	},
];
const solid_scoped_styles_alias = [
	{
		find: /^@tsrx\/vite-plugin-solid-test\/scoped-styles\/(.*)$/,
		replacement: `${solid_scoped_styles_dir}$1`,
	},
];
const vue_scoped_styles_alias = [
	{
		find: /^@tsrx\/vite-plugin-vue-test\/scoped-styles\/(.*)$/,
		replacement: `${vue_scoped_styles_dir}$1`,
	},
];

function create_test_dependency_resolver(name, package_json, package_names) {
	const importer = fileURLToPath(new URL(package_json, import.meta.url));

	return {
		name,
		enforce: 'pre',
		/** @param {string} source */
		async resolveId(source) {
			if (!package_names.some((pkg) => source === pkg || source.startsWith(`${pkg}/`))) {
				return null;
			}

			return this.resolve(source, importer, { skipSelf: true });
		},
	};
}

const react_runtime_dependency_resolver = create_test_dependency_resolver(
	'tsrx-react-runtime-dependencies',
	'./packages/vite-plugin-react/package.json',
	['@tsrx/react', 'react', 'react-dom'],
);

const preact_runtime_dependency_resolver = create_test_dependency_resolver(
	'tsrx-preact-runtime-dependencies',
	'./packages/vite-plugin-preact/package.json',
	['@tsrx/preact', 'preact'],
);

const solid_runtime_dependency_resolver = create_test_dependency_resolver(
	'tsrx-solid-runtime-dependencies',
	'./packages/vite-plugin-solid/package.json',
	['@solidjs/web', '@tsrx/solid', 'solid-js'],
);

const vue_runtime_dependency_resolver = create_test_dependency_resolver(
	'tsrx-vue-runtime-dependencies',
	'./packages/vite-plugin-vue/package.json',
	['@tsrx/vue'],
);

const vue_runtime_alias_plugin = {
	name: 'tsrx-vue-runtime-aliases',
	enforce: 'pre',
	/** @param {string} source */
	resolveId(source) {
		if (source === 'vue') return vue_runtime_path;
		if (source === 'vue-jsx-vapor/jsx-runtime') return vue_jsx_vapor_jsx_runtime_path;
		if (source === 'vue-jsx-vapor') return vue_jsx_vapor_runtime_path;
		return null;
	},
};

export default defineConfig({
	test: {
		...configDefaults,
		projects: [
			{
				test: {
					name: 'tsrx-react',
					include: ['packages/tsrx-react/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'tsrx-preact',
					include: ['packages/tsrx-preact/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'vite-plugin-preact',
					include: ['packages/vite-plugin-preact/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'tsrx-preact-runtime',
					include: ['packages/vite-plugin-preact/tests/**/*.test.tsrx'],
					environment: 'jsdom',
					setupFiles: ['packages/vite-plugin-preact/tests/setup.js'],
					globals: true,
					css: true,
				},
				plugins: [preact_runtime_dependency_resolver, tsrxPreact()],
				resolve: {
					alias: tsrx_core_test_harness_alias,
				},
			},
			{
				test: {
					name: 'bun-plugin-preact',
					include: ['packages/bun-plugin-preact/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'bun-plugin-react',
					include: ['packages/bun-plugin-react/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'bun-plugin-vue',
					include: ['packages/bun-plugin-vue/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'bun-plugin-solid',
					include: ['packages/bun-plugin-solid/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'tsrx-solid',
					include: ['packages/tsrx-solid/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'tsrx-vue',
					include: ['packages/tsrx-vue/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'vite-plugin-vue',
					include: ['packages/vite-plugin-vue/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'tsrx-vue-runtime',
					include: ['packages/vite-plugin-vue/tests/**/*.test.tsrx'],
					environment: 'jsdom',
					setupFiles: ['packages/vite-plugin-vue/tests/setup.js'],
					globals: true,
					css: true,
				},
				plugins: [vue_runtime_dependency_resolver, vue_runtime_alias_plugin, tsrxVue()],
				resolve: process.env.VITEST
					? {
							conditions: ['browser'],
							alias: [...tsrx_core_test_harness_alias, ...vue_scoped_styles_alias],
						}
					: { alias: [...tsrx_core_test_harness_alias, ...vue_scoped_styles_alias] },
				ssr: {
					noExternal: ['vue', 'vue-jsx-vapor', '@tsrx/vue'],
				},
			},
			{
				test: {
					name: 'vite-plugin-react',
					include: ['packages/vite-plugin-react/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'rspack-plugin-react',
					include: ['packages/rspack-plugin-react/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'rspack-plugin-preact',
					include: ['packages/rspack-plugin-preact/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'rspack-plugin-solid',
					include: ['packages/rspack-plugin-solid/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'rspack-plugin-vue',
					include: ['packages/rspack-plugin-vue/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'turbopack-plugin-react',
					include: ['packages/turbopack-plugin-react/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'tsrx-react-runtime',
					include: ['packages/vite-plugin-react/tests/**/*.test.tsrx'],
					environment: 'jsdom',
					setupFiles: ['packages/vite-plugin-react/tests/setup.js'],
					globals: true,
					css: true,
				},
				plugins: [react_runtime_dependency_resolver, tsrxReact()],
				resolve: {
					alias: tsrx_core_test_harness_alias,
				},
			},
			{
				test: {
					name: 'vite-plugin-solid',
					include: ['packages/vite-plugin-solid/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'tsrx-solid-runtime',
					include: ['packages/vite-plugin-solid/tests/**/*.test.tsrx'],
					environment: 'jsdom',
					setupFiles: ['packages/vite-plugin-solid/tests/setup.js'],
					globals: true,
					css: true,
				},
				plugins: [solid_runtime_dependency_resolver, tsrxSolid(), solid()],
				resolve: {
					alias: [...tsrx_core_test_harness_alias, ...solid_scoped_styles_alias],
				},
			},
			{
				test: {
					name: 'prettier-plugin',
					include: ['packages/prettier-plugin/src/*.test.js'],
					environment: 'jsdom',
				},
				plugins: [],
			},
			{
				test: {
					name: 'eslint-plugin',
					include: ['packages/eslint-plugin/tests/**/*.test.ts'],
					environment: 'jsdom',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'eslint-parser',
					include: ['packages/eslint-parser/tests/**/*.test.ts'],
					environment: 'jsdom',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'tsrx-utils',
					include: ['packages/tsrx/tests/utils/**/*.test.js'],
					environment: 'node',
					globals: true,
					// The `*-types` suites here spin up a TypeScript program per
					// assertion, which can run past the 5s default once the rest of
					// the suite is competing for workers. They assert diagnostics,
					// not speed, so the timeout is only here to catch a hang.
					testTimeout: 30_000,
				},
				plugins: [],
			},
			{
				test: {
					name: 'tsrx-analyze',
					include: ['packages/tsrx/tests/analyze/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'tsrx-vite',
					include: ['packages/tsrx/tests/vite/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'typescript-plugin',
					include: ['packages/typescript-plugin/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'language-server',
					include: ['packages/language-server/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'vscode-plugin',
					include: ['packages/vscode-plugin/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'intellij-plugin',
					include: ['packages/intellij-plugin/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
			{
				test: {
					name: 'tsrx-mcp',
					include: ['packages/tsrx-mcp/tests/**/*.test.js'],
					environment: 'node',
					globals: true,
				},
				plugins: [],
			},
		],
	},
});
