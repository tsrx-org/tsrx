/**
 * The TypeScript versions TSRX's JavaScript tooling runs on, and the messages
 * shown when a project resolves a `typescript` package it cannot use.
 *
 * TypeScript 7 (`typescript@7`) is the native compiler: its npm package only
 * launches the platform binary and exposes no JavaScript API. Everything that
 * hosts TypeScript through Volar (the tsserver plugin, the classic TSRX language
 * server, and `tsrx-tsc` on the classic path) therefore needs TypeScript 5.9 or
 * 6 installed. The native path needs no other TypeScript: `@tsrx/content-mapper`
 * and the TSRX language server's native backend read `tsconfig.json` and resolve
 * compilers themselves (`tsconfig-resolution.js`, `package-resolution.js`), and
 * TypeScript 7 type-checks `.tsrx` files through the mapper, which needs a 7.1
 * nightly: the stable 7.0 releases have no content-mapper protocol. `tsrx-tsc`
 * runs that native path itself when the installed `typescript` is such a build
 * (`native-tsc.js`), so one command serves every supported TypeScript line.
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

/**
 * @typedef {object} ParsedTypeScriptVersion
 * @property {number[]} core `major.minor.patch` as numbers.
 * @property {'nightly' | 'prerelease' | 'release'} channel
 * @property {Array<number | string>} prerelease The dot-separated prerelease
 *   identifiers, numeric ones as numbers.
 */

/**
 * @param {string} version
 * @returns {ParsedTypeScriptVersion}
 */
function parse_typescript_version(version) {
	const [core_part, prerelease_part] = version.trim().split('-', 2);
	const core = core_part.split('.').map((part) => Number.parseInt(part, 10) || 0);
	while (core.length < 3) core.push(0);
	if (prerelease_part === undefined || prerelease_part === '') {
		return { core, channel: 'release', prerelease: [] };
	}
	const prerelease = prerelease_part
		.split('.')
		.map((part) => (/^\d+$/.test(part) ? Number.parseInt(part, 10) : part));
	return { core, channel: prerelease[0] === 'dev' ? 'nightly' : 'prerelease', prerelease };
}

const CHANNEL_ORDER = { nightly: 0, prerelease: 1, release: 2 };

/**
 * Order two `typescript` package versions. Semantic versioning except in one
 * respect: TypeScript's `-dev.<yyyymmdd>.<n>` nightlies are cut before the
 * betas and release candidates of the same `major.minor.patch`, so a
 * `-beta` or `-rc` build ranks above every nightly of that version, not
 * below it as plain identifier order would say.
 * @param {string} a
 * @param {string} b
 * @returns {number} Negative when `a` is older than `b`, positive when newer, `0` when equal.
 */
export function compare_typescript_versions(a, b) {
	const left = parse_typescript_version(a);
	const right = parse_typescript_version(b);
	for (let index = 0; index < 3; index++) {
		if (left.core[index] !== right.core[index]) {
			return left.core[index] - right.core[index];
		}
	}
	if (left.channel !== right.channel) {
		return CHANNEL_ORDER[left.channel] - CHANNEL_ORDER[right.channel];
	}
	const length = Math.max(left.prerelease.length, right.prerelease.length);
	for (let index = 0; index < length; index++) {
		const left_part = left.prerelease[index];
		const right_part = right.prerelease[index];
		if (left_part === right_part) continue;
		if (left_part === undefined) return -1;
		if (right_part === undefined) return 1;
		if (typeof left_part === 'number' && typeof right_part === 'number') {
			return left_part - right_part;
		}
		if (typeof left_part === 'number') return -1;
		if (typeof right_part === 'number') return 1;
		return left_part < right_part ? -1 : 1;
	}
	return 0;
}

/**
 * Whether a `typescript` package version is a native TypeScript 7 build that
 * speaks the content-mapper protocol, so `tsc --runExternalCode` can type-check
 * `.tsrx` files through `@tsrx/content-mapper`.
 * @param {string} version
 * @returns {boolean}
 */
export function has_content_mapper_protocol(version) {
	return (
		is_native_typescript_package(version) &&
		compare_typescript_versions(version, MINIMUM_NATIVE_TYPESCRIPT_VERSION) >= 0
	);
}

/** @typedef {'tsrx-tsc' | 'language-server'} TypeScriptConsumer */

/**
 * The message to show when `typescript` resolved to a package the given tool
 * cannot run on, or `undefined` when it can. `tsrx-tsc` runs on the classic
 * range through Volar and on TypeScript 7 builds with the content-mapper
 * protocol through native `tsc`; only a TypeScript 7 build older than
 * {@link MINIMUM_NATIVE_TYPESCRIPT_VERSION} (the stable 7.0 releases and the
 * earlier 7.1 nightlies) is unsupported there.
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
			if (has_content_mapper_protocol(version)) {
				return undefined;
			}
			return `tsrx-tsc ${resolved} tsrx-tsc runs TypeScript 7 through "tsc --runExternalCode" and @tsrx/content-mapper, which needs the content-mapper protocol of a 7.1 nightly (${MINIMUM_NATIVE_TYPESCRIPT_VERSION} or newer; install typescript@next), or TypeScript ${SUPPORTED_TYPESCRIPT_RANGE} through Volar. ${TYPESCRIPT_7_SUPPORT_NOTE}`;
		case 'language-server':
			return `The TSRX language server's classic backend ${resolved} The classic backend hosts TypeScript ${SUPPORTED_TYPESCRIPT_RANGE} through Volar: install one of those versions, or run the server with --typescript-backend=native beside TypeScript 7's own language server, which needs no other TypeScript. ${TYPESCRIPT_7_SUPPORT_NOTE}`;
	}
}
