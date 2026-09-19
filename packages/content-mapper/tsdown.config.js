import { defineConfig } from 'tsdown';

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
	inlineOnly: false,
	dts: false,
	entry: ['src/server.js'],
	format: ['esm'],
	outExtensions: () => ({ js: '.js' }),
	platform: 'node',
	target: 'node22',
	outDir: 'dist',
	sourcemap: isDev,
	outputOptions: {
		legalComments: 'inline',
		minify: false,
	},
	// The consumer's project supplies TypeScript (config parsing) and the TSRX
	// target compiler (loaded by path at runtime); everything else is inlined.
	external: ['typescript', /^@tsrx\/core(?:\/.*)?$/],
	clean: true,
	noExternal: /.+/,
});
