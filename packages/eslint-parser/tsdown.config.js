import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: 'src/index.ts',
	format: ['esm'],
	fixedExtension: false,
	dts: true,
	deps: {
		// Mark peer dependencies and workspace packages as external so they're not bundled
		neverBundle: ['eslint', '@tsrx/core'],
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
