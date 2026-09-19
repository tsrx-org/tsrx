/**
 * The TypeScript versions TSRX's JavaScript tooling runs on, and the messages
 * shown when a project resolves a `typescript` package it cannot use.
 *
 * TypeScript 7 (`typescript@7`) is the native compiler: its npm package only
 * launches the platform binary and exposes no JavaScript API. Everything that
 * hosts TypeScript through Volar (`tsrx-tsc`, the tsserver plugin, the classic
 * TSRX language server) and everything that reads `tsconfig.json` through the
 * API (`@tsrx/content-mapper`, the TSRX language server on the native backend)
 * therefore needs TypeScript 5.9 or 6 installed. TypeScript 7 itself
 * type-checks `.tsrx` files through `@tsrx/content-mapper`, which needs a 7.1
 * nightly: the stable 7.0 releases have no content-mapper protocol.
 */

/** The `typescript` versions whose JavaScript API TSRX runs on. */
export const SUPPORTED_TYPESCRIPT_RANGE = '^5.9.3 || ^6.0.0';

/**
 * The oldest TypeScript 7 build whose content-mapper protocol
 * `@tsrx/content-mapper` speaks (`tsc --runExternalCode`, `tsc --lsp`). The VS
 * Code "TypeScript 7 Nightly" extension version that bundles it is
 * `0.<date>.<n>` for the same date.
 */
export const MINIMUM_NATIVE_TYPESCRIPT_VERSION = '7.1.0-dev.20260822.1';

/** Where the gaps in TypeScript 7 support and their upstream issues are tracked. */
export const TYPESCRIPT_7_TRACKING_ISSUE_URL = 'https://github.com/tsrx-org/tsrx/issues/136';

/** One sentence to append to every message that mentions TypeScript 7. */
export const TYPESCRIPT_7_SUPPORT_NOTE = `TypeScript 7 support for .tsrx files is not complete yet; the gaps and the upstream TypeScript issues behind them are tracked in ${TYPESCRIPT_7_TRACKING_ISSUE_URL}. If you run into one that is not listed there, please file a new issue on the tsrx repository.`;

/**
 * @param {string} version
 * @returns {number}
 */
export function typescript_major(version) {
	return Number.parseInt(version, 10);
}

/**
 * Whether a `typescript` package version is the native compiler (7 and up),
 * whose package has no JavaScript API.
 * @param {string} version
 * @returns {boolean}
 */
export function is_native_typescript_package(version) {
	return typescript_major(version) >= 7;
}

/** @typedef {'tsrx-tsc' | 'language-server' | 'content-mapper'} TypeScriptConsumer */

/**
 * The message to show when `typescript` resolved to a package the given tool
 * cannot run on, or `undefined` when it can.
 * @param {{ version?: string } | string | undefined} typescript The `typescript` module, or its version.
 * @param {TypeScriptConsumer} tool
 * @returns {string | undefined}
 */
export function unsupported_typescript_message(typescript, tool) {
	const version = typeof typescript === 'string' ? typescript : typescript?.version;
	if (typeof version !== 'string' || !is_native_typescript_package(version)) {
		return undefined;
	}
	const resolved = `resolved typescript@${version}, the native TypeScript compiler, whose npm package has no JavaScript API.`;
	switch (tool) {
		case 'tsrx-tsc':
			return `tsrx-tsc ${resolved} tsrx-tsc runs TypeScript ${SUPPORTED_TYPESCRIPT_RANGE} through Volar: install one of those versions, or type-check with TypeScript 7 itself (a 7.1 nightly, ${MINIMUM_NATIVE_TYPESCRIPT_VERSION} or newer) through "tsc --runExternalCode" and @tsrx/content-mapper. ${TYPESCRIPT_7_SUPPORT_NOTE}`;
		case 'language-server':
			return `The TSRX language server ${resolved} It needs TypeScript's JavaScript API (typescript ${SUPPORTED_TYPESCRIPT_RANGE}) on both backends: to host TypeScript on "classic", and to read tsconfig.json on "native". Install one of those versions beside TypeScript 7. ${TYPESCRIPT_7_SUPPORT_NOTE}`;
		case 'content-mapper':
			return `@tsrx/content-mapper ${resolved} The mapper reads tsconfig.json through TypeScript's JavaScript API and declares typescript ${SUPPORTED_TYPESCRIPT_RANGE} as its own dependency; reinstall dependencies so that copy is present, or install one of those versions beside TypeScript 7. ${TYPESCRIPT_7_SUPPORT_NOTE}`;
	}
}
