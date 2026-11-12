import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: 'src/index.ts',
	format: ['esm'],
	fixedExtension: false,
	dts: true,
	deps: {
		// Mark peer dependencies as external so they're not bundled
		neverBundle: [
			'eslint',
			'eslint/use-at-your-own-risk',
			'@typescript-eslint/parser',
			'@tsrx/eslint-parser',
			'@tsrx/core',
		],
		alwaysBundle: /.+/,
		onlyBundle: false,
	},
	outputOptions: {
		comments: { legal: true },
	},
	clean: true,
	platform: 'node',
	target: 'node22',
	outDir: 'dist',
});
