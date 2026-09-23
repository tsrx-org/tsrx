/**
 * @import {LanguageServiceContext} from '@volar/language-server'
 * @import {TextDocument} from 'vscode-languageserver-textdocument'
 */

import { createRequire } from 'node:module';

// Monkey-patch getUserPreferences to inject TSRX-specific defaults.
// We use createRequire to get the raw CJS module.exports object, bypassing
// the bundler's __toESM wrapper which interferes with property assignment.
// volar-service-typescript is also externalized (via regex in tsdown config)
// so that its internal consumers (semantic.js, codeAction.js, etc.) load
// getUserPreferences from the same Node module cache entry we patch here.
//
// The require and the patch run on first use, not at module load: the native
// TypeScript backend never calls `createTypeScriptServices`, so it never loads
// `volar-service-typescript` at all.
const require = createRequire(import.meta.url);

/** @type {typeof import('volar-service-typescript') | undefined} */
let volar_service_typescript;

/**
 * @returns {typeof import('volar-service-typescript')}
 */
function load_typescript_service() {
	if (volar_service_typescript) {
		return volar_service_typescript;
	}
	const getUserPreferencesModule = require('volar-service-typescript/lib/configs/getUserPreferences');
	const originalGetUserPreferences = getUserPreferencesModule.getUserPreferences;

	/**
	 * Enhanced getUserPreferences to add TypeScript and TSRX preferences.
	 * Specifically makes preferTypeOnlyAutoImports true if not set
	 * @param {LanguageServiceContext} context
	 * @param {TextDocument} document
	 */
	getUserPreferencesModule.getUserPreferences = async function (context, document) {
		const origPreferences = await originalGetUserPreferences.call(this, context, document);

		const [tsConfig, tsrxConfig] = await Promise.all([
			context.env.getConfiguration?.('typescript'),
			context.env.getConfiguration?.('tsrx'),
		]);

		return {
			preferTypeOnlyAutoImports: true,
			...origPreferences,
			.../** @type {any} */ (tsConfig)?.preferences,
			.../** @type {any} */ (tsrxConfig)?.preferences,
		};
	};

	volar_service_typescript = require('volar-service-typescript');
	return /** @type {typeof import('volar-service-typescript')} */ (volar_service_typescript);
}

/**
 * Create TypeScript services with TSRX-specific enhancements (classic backend only).
 * @param {typeof import('typescript')} ts
 * @returns {ReturnType<typeof import('volar-service-typescript').create>}
 */
export function createTypeScriptServices(ts) {
	return load_typescript_service().create(ts);
}
