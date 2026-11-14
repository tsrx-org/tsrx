import { defineConfig } from 'vitest/config';

/**
 * The ESLint parser and plugin tests against ESLint 9, the oldest major in their
 * `eslint` peer range (`>=9.0.0`). `vitest.config.js` runs them against the
 * catalog's ESLint 10. `eslint-9` is an npm alias of ESLint 9 in both packages'
 * devDependencies; the alias swaps it in for every `eslint` import the tests and
 * the packages' sources make. Run with `pnpm test:eslint-9`.
 */
const eslint_9 = [{ find: /^eslint(?=\/|$)/u, replacement: 'eslint-9' }];
const setupFiles = ['packages/eslint-plugin/tests/eslint-9-setup.js'];

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: 'eslint-plugin (ESLint 9)',
					include: ['packages/eslint-plugin/tests/**/*.test.ts'],
					environment: 'jsdom',
					globals: true,
					setupFiles,
				},
				resolve: { alias: eslint_9 },
			},
			{
				test: {
					name: 'eslint-parser (ESLint 9)',
					include: ['packages/eslint-parser/tests/**/*.test.ts'],
					environment: 'jsdom',
					globals: true,
					setupFiles,
				},
				resolve: { alias: eslint_9 },
			},
		],
	},
});
