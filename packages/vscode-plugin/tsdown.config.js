import { defineConfig } from 'tsdown';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAllExternalPackages } from '../../scripts/collect-external-deps.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Root packages to treat as external (their full dependency trees will be copied)
// `typescript` is deliberately absent: the classic backend hosts the TypeScript VS Code
// runs for the workspace (`typescript.tsdk` initialization option), never a bundled copy.
const ROOT_EXTERNAL_PACKAGES = [
	'@tsrx/core',
	'volar-service-css',
	'vscode-uri',
	// this definitely has to be external as we monkey patch it at runtime
	'volar-service-typescript',
	// its UMD entry requires ./impl/* files at run time — can't be bundled
	'jsonc-parser',
];
const REGEX_EXTERNAL_PACKAGES = [
	// also definitely need it for monkey patching
	/^volar-service-typescript(?:\/.*)?$/,
];
// Always external (provided by VS Code)
const ALWAYS_EXTERNAL = ['vscode'];
const OUT_DIR = 'dist';

// Compute all external packages by collecting dependency trees
const computed = getAllExternalPackages(ROOT_EXTERNAL_PACKAGES);
const allExternalPackages = [...ALWAYS_EXTERNAL, ...computed, ...REGEX_EXTERNAL_PACKAGES];

console.log(`ℹ️  Found ${computed.length} packages to mark as external`);

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
	// `@tsrx/typescript-plugin` is inlined into the server, exactly like the language server's
	// own build does.
	entry: ['src/extension.js', 'src/server.js'],
	outDir: OUT_DIR,
	sourcemap: isDev,
	outputOptions: {
		comments: { legal: true },
		minify: false,
	},
	clean: true,
	format: ['cjs'],
	outExtensions: () => ({ js: '.js' }),
	platform: 'node',
	target: 'node22',
	deps: {
		neverBundle: [...allExternalPackages],
		alwaysBundle: /.+/,
		onlyBundle: false,
	},
	hooks: {
		'build:done': () => {
			// Write a CJS package.json so Node.js treats dist/*.js as CommonJS
			fs.writeFileSync(path.join(dirname, OUT_DIR, 'package.json'), '{"type":"commonjs"}\n');

			const scriptPath = path.join(dirname, '../../scripts/copy-external-deps.js');
			const distPath = path.join(dirname, OUT_DIR);

			execSync(`node "${scriptPath}" "${distPath}" ${ROOT_EXTERNAL_PACKAGES.join(' ')}`, {
				stdio: 'inherit',
			});

			// `@tsrx/typescript-plugin` is contributed to VS Code as a tsserver plugin
			// (`typescriptServerPlugins` in package.json): VS Code passes this extension's
			// directory as a plugin probe location, so the built plugin package must sit in
			// the extension's node_modules. Only its manifest and build are copied: its
			// bundle needs nothing but `jsonc-parser` (copied above) and the TypeScript that
			// loads it, and it resolves TSRX target compilers from the workspace at run time.
			const TSSERVER_PLUGIN = '@tsrx/typescript-plugin';
			const pluginSource = path.join(dirname, '../typescript-plugin');
			const pluginTarget = path.join(distPath, 'node_modules', TSSERVER_PLUGIN);
			fs.rmSync(pluginTarget, { recursive: true, force: true });
			fs.mkdirSync(pluginTarget, { recursive: true });
			fs.copyFileSync(
				path.join(pluginSource, 'package.json'),
				path.join(pluginTarget, 'package.json'),
			);
			fs.cpSync(path.join(pluginSource, 'dist'), path.join(pluginTarget, 'dist'), {
				recursive: true,
			});
		},
	},
});
