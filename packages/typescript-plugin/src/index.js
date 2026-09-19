import { createLanguageServicePlugin } from '@volar/typescript/lib/quickstart/createLanguageServicePlugin.js';
import { getTsrxLanguagePlugin } from './language.js';
import { without_typescript_diagnostics_on_compile_error } from './plugin-diagnostics.js';

/**
 * TypeScript's tsserver loads this plugin to serve `.tsrx` files: through the
 * `plugins` entry of a project's tsconfig.json (other editors, next to the
 * workspace TypeScript), or handed to whichever tsserver VS Code runs by the
 * TSRX VS Code extension (`typescriptServerPlugins`), where the TSRX language
 * server runs beside it in its slim `plugin` mode and adds what a tsserver
 * plugin cannot: TSRX compile errors, snippets, CSS in `<style>`, symbols.
 */
const volar_plugin = createLanguageServicePlugin((ts, info) => ({
	languagePlugins: [
		getTsrxLanguagePlugin({
			ts,
			configFileName:
				info.project.projectKind === ts.server.ProjectKind.Configured
					? info.project.getProjectName()
					: undefined,
			configHost: ts.sys,
		}),
	],
}));

/** @type {typeof volar_plugin} */
const plugin = (modules) => {
	const inner = volar_plugin(modules);
	return {
		...inner,
		create(info) {
			return without_typescript_diagnostics_on_compile_error(inner.create(info));
		},
	};
};

export default plugin;
