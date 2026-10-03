import { createProxyLanguageService } from '@volar/typescript/lib/node/proxyLanguageService.js';
import {
	createLanguageCommon,
	isHasAlreadyDecoratedLanguageService,
	makeGetExternalFiles,
	projectExternalFileExtensions,
} from '@volar/typescript/lib/quickstart/languageServicePluginCommon.js';
import { getTsrxLanguagePlugin } from './language.js';
import { without_typescript_diagnostics_on_compile_error } from './plugin-diagnostics.js';
import { with_jsx_closing_tags } from './plugin-jsx-closing-tag.js';
import { with_whole_file_import_edits } from './plugin-organize-imports.js';
import {
	register_source_definition_command,
	with_source_definition_project,
} from './plugin-source-definition.js';

/**
 * The Volar language each decorated language service maps through, for the
 * methods Volar's own proxy leaves out (`with_jsx_closing_tags`) or maps
 * differently (`with_whole_file_import_edits`).
 * @type {WeakMap<object, import('@volar/language-core').Language<string>>}
 */
const languages = new WeakMap();

/**
 * The language service each Volar proxy wraps, for `with_whole_file_import_edits`.
 * @type {WeakMap<object, import('typescript').LanguageService>}
 */
const originals = new WeakMap();

/**
 * TypeScript's tsserver loads this plugin to serve `.tsrx` files: through the
 * `plugins` entry of a project's tsconfig.json (other editors, next to the
 * workspace TypeScript), or handed to whichever tsserver VS Code runs by the
 * TSRX VS Code extension (`typescriptServerPlugins`), where the TSRX language
 * server runs beside it in its slim `plugin` mode and adds what a tsserver
 * plugin cannot: TSRX compile errors, snippets, CSS in `<style>`, symbols.
 *
 * `create` is Volar's `createLanguageServicePlugin` (quickstart), reproduced so
 * the Volar language it creates can be kept for `with_jsx_closing_tags` and
 * `with_whole_file_import_edits`.
 * @param {{ typescript: typeof import('typescript') }} modules
 */
const plugin = (modules) => {
	const { typescript: ts } = modules;
	return {
		/** @param {import('typescript').server.PluginCreateInfo} info */
		create(info) {
			if (!isHasAlreadyDecoratedLanguageService(info)) {
				const config_file_name =
					info.project.projectKind === ts.server.ProjectKind.Configured
						? info.project.getProjectName()
						: undefined;
				const created = decorate(ts, info, config_file_name);
				projectExternalFileExtensions.set(
					info.project,
					created.languagePlugins.flatMap(
						(language_plugin) =>
							language_plugin.typescript?.extraFileExtensions.map(
								(extension) => '.' + extension.extension,
							) ?? [],
					),
				);
				// The helper project of Go to Source Definition reads `.tsrx` files the same
				// way, with the host project's compiler.
				with_source_definition_project(info.project, (helper) => {
					const helper_info = { ...info, project: helper, languageServiceHost: helper };
					helper_info.languageService = /** @type {any} */ (helper).languageService;
					decorate(ts, helper_info, config_file_name);
					/** @type {any} */ (helper).languageService = helper_info.languageService;
				});
				register_source_definition_command(info.session);
			}
			const decorated = info.languageService;
			const get_language = () => languages.get(decorated);
			return with_jsx_closing_tags(
				with_whole_file_import_edits(
					without_typescript_diagnostics_on_compile_error(decorated),
					() => originals.get(decorated),
					get_language,
				),
				get_language,
			);
		},
		getExternalFiles: makeGetExternalFiles(ts),
	};
};

/**
 * Serve `.tsrx` files in the project of `info` through a Volar language: decorate its
 * host, and replace `info.languageService` with a proxy that maps through it.
 * @param {typeof import('typescript')} ts
 * @param {import('typescript').server.PluginCreateInfo} info
 * @param {string | undefined} config_file_name
 */
function decorate(ts, info, config_file_name) {
	const created = {
		languagePlugins: [
			getTsrxLanguagePlugin({ ts, configFileName: config_file_name, configHost: ts.sys }),
		],
	};
	const { proxy, initialize } = createProxyLanguageService(info.languageService);
	originals.set(proxy, info.languageService);
	info.languageService = proxy;
	createLanguageCommon(created, ts, info, (language) => {
		languages.set(proxy, language);
		initialize(language);
	});
	return created;
}

export default plugin;
