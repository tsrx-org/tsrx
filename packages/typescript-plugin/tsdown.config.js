import { defineConfig } from 'tsdown';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
	entry: ['src/index.js', 'src/tsc.js'],
	format: ['cjs'],
	outExtensions: () => ({ js: '.js' }),
	platform: 'node',
	target: 'node22',
	outDir: 'dist',
	sourcemap: isDev,
	outputOptions: {
		comments: { legal: true },
		minify: true,
	},
	deps: {
		// `jsonc-parser` stays external: its `main` is a UMD build whose internal
		// `require('./impl/...')` calls survive bundling and then fail at runtime.
		// It is a runtime dependency, so consumers install it next to this package.
		neverBundle: ['typescript', 'jsonc-parser', /^@tsrx\/.*$/],
		alwaysBundle: /.+/,
		onlyBundle: false,
	},
	clean: true,
	hooks: {
		'build:done': () => {
			fs.writeFileSync(path.join(dirname, 'dist', 'package.json'), '{"type":"commonjs"}\n');
		},
	},
});
