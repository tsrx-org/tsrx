import { defineConfig } from 'tsdown';

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
	dts: false,
	// `server.js` is the executable the manifest names; `mapper.js`, `rpc.js` and
	// `protocol.js` are the package's `exports`. They are bundled too because the
	// source imports `@tsrx/typescript-plugin/src/*`, which that package does not
	// publish (only its `dist`) and which is not a dependency of this one.
	entry: ['src/server.js', 'src/mapper.js', 'src/rpc.js', 'src/protocol.js'],
	format: ['esm'],
	outExtensions: () => ({ js: '.js' }),
	platform: 'node',
	target: 'node22',
	outDir: 'dist',
	sourcemap: isDev,
	outputOptions: {
		comments: { legal: true },
		minify: false,
	},
	deps: {
		// TypeScript is never imported; it stays external so a stray import would fail
		// the forbid-typescript test instead of being inlined. The TSRX target compiler
		// is loaded by path at runtime, and `jsonc-parser` (tsconfig reading) is a
		// runtime dependency because its UMD entry requires its `./impl/*` files, which
		// a bundle cannot follow. Everything else is inlined.
		neverBundle: ['typescript', 'jsonc-parser', /^@tsrx\/core(?:\/.*)?$/],
		alwaysBundle: /.+/,
		onlyBundle: false,
	},
	clean: true,
});
