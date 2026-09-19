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
	// TypeScript is never imported; it stays external so a stray import would fail
	// the forbid-typescript test instead of being inlined. The TSRX target compiler
	// is loaded by path at runtime, and `jsonc-parser` (tsconfig reading) is a
	// runtime dependency because its UMD entry requires its `./impl/*` files, which
	// a bundle cannot follow. Everything else is inlined.
	external: ['typescript', 'jsonc-parser', /^@tsrx\/core(?:\/.*)?$/],
	clean: true,
	noExternal: /.+/,
});
