/**
 * The editor setups `run.js` checks, one isolated VS Code instance each.
 *
 * `expect` names what serves the fixture's `.tsrx` file:
 * - `typescript-7`: the TypeScript 7 extension (`tsc --lsp`) through
 *   `@tsrx/content-mapper` (diagnostic source `ts`).
 * - `vscode-typescript`: VS Code's own TypeScript (the tsserver it bundles, 5.x
 *   or 6.x) through `@tsrx/typescript-plugin` (diagnostic source `ts-plugin`).
 * - `nothing`: no TypeScript features at all. Such a scenario records a gap
 *   and says why in `gap`.
 *
 * Unless `expect` is `nothing`, the runner also checks that `.ts` and `.tsrx`
 * files import each other (`main.ts` imports `App.tsrx`, which imports
 * `label.ts`). The fixture's tsconfig.json has no `plugins` entry. `result.tsserver`
 * lists the tsservers VS Code's own TypeScript started: their versions, and
 * whether they loaded `@tsrx/typescript-plugin`.
 *
 * `extensions` are installed into the instance's own extensions directory:
 * `tsrx` is the VSIX under test, `ts7` the marketplace TypeScript 7 extension
 * (`TypeScriptTeam.native-preview`), `ts7-nightly` its TypeScript 7 Nightly
 * companion (`TypeScriptTeam.vscode-typescript-nightly`, a 7.1 nightly
 * compiler). `settings` are that instance's user settings; `${project}` is the
 * fixture copy's path. `projectTypeScript` links the repository's TypeScript
 * 7.1 nightly into the fixture's `node_modules`, or with `'classic'` the
 * TypeScript 5.9 or 6 that `@tsrx/typescript-plugin` develops against.
 *
 * `typescript` is what the TSRX extension's status item says serves the file
 * (`src/typescript-guidance.js`), and `notice` the ids of the notices it showed,
 * comma-separated (none when left out). `action` runs one of the notice's actions,
 * as clicking it would; `check` then reads `result.afterAction`. `command` runs a
 * command at the end, as the Command Palette would; `check` then reads
 * `result.afterCommand`. `packageChange` changes the project's package.json at the
 * end, as `pnpm install` would; `check` then reads `result.afterPackageChange`.
 * `result.serverOutput` has the lines of the TSRX Language Server output.
 *
 * @typedef {'typescript-7' | 'vscode-typescript' | 'nothing'} Server
 * @typedef {'vscode' | 'typescript-7' | 'typescript-7-unsupported' | 'typescript-7-missing'} Status
 * @typedef {{
 * 	name: string,
 * 	description: string,
 * 	extensions: Array<'tsrx' | 'ts7' | 'ts7-nightly'>,
 * 	settings?: Record<string, unknown>,
 * 	projectTypeScript?: boolean | 'classic',
 * 	expect: Server,
 * 	typescript: Status,
 * 	notice?: string,
 * 	action?: string,
 * 	command?: string,
 * 	packageChange?: boolean,
 * 	gap?: string,
 * 	closingTag?: string,
 * 	check?: (result: Record<string, any>) => string | undefined,
 * }} Scenario
 */

const PROJECT_NIGHTLY = '7.1.0-dev.20260930.4';

/**
 * @param {Record<string, any>} result
 * @param {string} version
 */
function status_version(result, version) {
	return result.typescriptStatus?.version === version
		? undefined
		: `expected the status to name TypeScript ${version}, got ${result.typescriptStatus?.version}`;
}

/**
 * @param {Record<string, any>} result
 * @param {string} version
 */
function tsserver_version(result, version) {
	const versions = (result.tsserver ?? []).map(
		(/** @type {{ version: string }} */ log) => log.version,
	);
	return versions.length > 0 && versions.every((logged) => logged === version)
		? undefined
		: `expected VS Code's TypeScript to run tsserver ${version}, got ${JSON.stringify(versions)}`;
}

/**
 * @param {Record<string, any>} result
 * @param {string[]} actions
 */
function notice_actions(result, actions) {
	const shown = result.notices?.[0]?.actions;
	return JSON.stringify(shown) === JSON.stringify(actions)
		? undefined
		: `expected the notice to offer ${JSON.stringify(actions)}, got ${JSON.stringify(shown)}`;
}

/** The settings the extension README tells TypeScript 7 users to add. */
const RECOMMENDED = {
	'js/ts.experimental.useTsgo': true,
	'js/ts.tsdk.path': 'node_modules/typescript',
};

/**
 * After `TSRX: Restart Language Server`, TypeScript answers again and the TSRX server
 * lists the document symbols.
 * @param {Record<string, any>} result
 */
function restarted(result) {
	const after = result.afterCommand ?? {};
	return after.error
		? `the restart failed: ${after.error}`
		: !/number/.test(after.hover ?? '')
			? `expected TypeScript to answer after the restart, got the hover ${JSON.stringify(after.hover)}`
			: after.symbols > 0
				? undefined
				: 'expected document symbols after the restart';
}

/**
 * After a package.json change, the TSRX server asks for a restart, the extension
 * restarts it, and the new server lists the document symbols. The server must not exit
 * by itself: the language client then takes it for a crash ("Connection to server got
 * closed"), and what it sends meanwhile fails, which VS Code showed as "Client TSRX
 * Language Server: connection to server is erroring. Cannot call write after a stream
 * was destroyed".
 * @param {Record<string, any>} result
 */
function restarted_after_package_change(result) {
	/** @type {string[]} */
	const output = result.serverOutput ?? [];
	const unexpected = output.filter((line) =>
		/connection to server is erroring|Connection to server got closed/.test(line),
	);
	const asked = output.findIndex((line) =>
		line.includes('Asking the client to restart the server'),
	);
	return unexpected.length > 0
		? `expected the extension to restart the server, but the output says ${JSON.stringify(unexpected)}`
		: asked < 0
			? 'expected the server to ask for a restart after the package.json change'
			: !output.slice(asked).some((line) => line.includes('Server process exited with code 0'))
				? 'expected the server to stop after it asked for the restart'
				: result.afterPackageChange?.symbols > 0
					? undefined
					: 'expected document symbols from the new server';
}

/** @type {Scenario[]} */
export const SCENARIOS = [
	{
		name: 'ts7-recommended',
		description:
			"The README's setup: TypeScript 7 extension, useTsgo and js/ts.tsdk.path = node_modules/typescript, project has the 7.1 nightly",
		extensions: ['tsrx', 'ts7'],
		settings: RECOMMENDED,
		projectTypeScript: true,
		expect: 'typescript-7',
		typescript: 'typescript-7',
		closingTag: '<b></b>',
		check: (result) => status_version(result, PROJECT_NIGHTLY),
	},
	{
		name: 'ts7-recommended-tsrx-closing-off',
		description:
			"The README's setup, TSRX's own closing tags off: what TypeScript 7 closes by itself",
		extensions: ['tsrx', 'ts7'],
		settings: { ...RECOMMENDED, 'tsrx.autoClosingTags.enabled': false },
		projectTypeScript: true,
		expect: 'typescript-7',
		typescript: 'typescript-7',
		closingTag: '<b>',
		gap: 'The TypeScript 7 extension does not close tags in `.tsrx` files (microsoft/TypeScript#64564): the closing tag comes from the TSRX extension (`tsrx.autoClosingTags.enabled`).',
	},
	{
		name: 'ts7-recommended-restart',
		description: "The README's setup, then TSRX: Restart Language Server",
		extensions: ['tsrx', 'ts7'],
		settings: RECOMMENDED,
		projectTypeScript: true,
		expect: 'typescript-7',
		typescript: 'typescript-7',
		command: 'tsrx.restartServer',
		closingTag: '<b></b>',
		check: restarted,
	},
	{
		name: 'ts7-recommended-no-project-typescript',
		description: "The README's settings in a project without typescript: the built-in 7.0.2 serves",
		extensions: ['tsrx', 'ts7'],
		settings: RECOMMENDED,
		expect: 'nothing',
		typescript: 'typescript-7-unsupported',
		notice: 'typescript-7-unsupported',
		closingTag: '<b></b>',
		check: (result) => notice_actions(result, ['Learn More', 'Turn Off TypeScript 7']),
	},
	{
		name: 'ts7-recommended-classic-project',
		description:
			"The README's settings in a project on TypeScript 5.9: the setting is skipped, the built-in 7.0.2 serves",
		extensions: ['tsrx', 'ts7'],
		settings: RECOMMENDED,
		projectTypeScript: 'classic',
		expect: 'nothing',
		typescript: 'typescript-7-unsupported',
		notice: 'typescript-7-unsupported',
		closingTag: '<b></b>',
	},
	{
		name: 'ts7-bundled',
		description: 'TypeScript 7 extension on without js/ts.tsdk.path, project has the 7.1 nightly',
		extensions: ['tsrx', 'ts7'],
		settings: { 'js/ts.experimental.useTsgo': true },
		projectTypeScript: true,
		expect: 'nothing',
		typescript: 'typescript-7-unsupported',
		notice: 'typescript-7-unsupported',
		closingTag: '<b></b>',
		gap: "The TypeScript 7 extension's built-in compiler is 7.0.2, which has no content-mapper protocol, and VS Code's own TypeScript stands down while TypeScript 7 is on. The extension does not find the project's `node_modules/typescript` by itself (microsoft/TypeScript#64565). The TSRX extension's notice says to set `js/ts.tsdk.path`.",
		check: (result) =>
			status_version(result, '7.0.2') ??
			notice_actions(result, ['Use Project TypeScript', 'Turn Off TypeScript 7']),
	},
	{
		name: 'ts7-bundled-use-project-typescript',
		description:
			"ts7-bundled, then the notice's Use Project TypeScript: TSRX writes js/ts.tsdk.path and restarts TypeScript 7",
		extensions: ['tsrx', 'ts7'],
		settings: { 'js/ts.experimental.useTsgo': true },
		projectTypeScript: true,
		expect: 'nothing',
		typescript: 'typescript-7-unsupported',
		notice: 'typescript-7-unsupported',
		action: 'use-project-typescript',
		closingTag: '<b></b>',
		check: (result) =>
			result.afterAction?.tsdkPath !== 'node_modules/typescript'
				? `expected js/ts.tsdk.path node_modules/typescript in the user settings, got ${JSON.stringify(result.afterAction?.tsdkPath)}`
				: result.afterAction?.typescriptStatus?.version !== PROJECT_NIGHTLY
					? `expected the status to name ${PROJECT_NIGHTLY} afterwards, got ${JSON.stringify(result.afterAction?.typescriptStatus)}`
					: /number/.test(result.afterAction?.hover ?? '')
						? undefined
						: `expected TypeScript 7 to serve the file afterwards, got the hover ${JSON.stringify(result.afterAction?.hover)}`,
	},
	{
		name: 'ts7-bundled-turn-off',
		description: "ts7-bundled, then the notice's Turn Off TypeScript 7",
		extensions: ['tsrx', 'ts7'],
		settings: { 'js/ts.experimental.useTsgo': true },
		projectTypeScript: true,
		expect: 'nothing',
		typescript: 'typescript-7-unsupported',
		notice: 'typescript-7-unsupported',
		action: 'turn-off-typescript-7',
		closingTag: '<b></b>',
		check: (result) =>
			result.afterAction?.useTsgo?.user !== false
				? `expected js/ts.experimental.useTsgo to be false, got ${JSON.stringify(result.afterAction?.useTsgo)}`
				: result.afterAction?.typescriptStatus?.kind !== 'vscode'
					? `expected the status vscode afterwards, got ${result.afterAction?.typescriptStatus?.kind}`
					: /number/.test(result.afterAction?.hover ?? '')
						? undefined
						: `expected VS Code's TypeScript to serve the file afterwards, got the hover ${JSON.stringify(result.afterAction?.hover)}`,
	},
	{
		name: 'ts7-first-run',
		description: 'TypeScript 7 extension installed, no settings: its first start turns itself on',
		extensions: ['tsrx', 'ts7'],
		expect: 'nothing',
		typescript: 'typescript-7-unsupported',
		notice: 'typescript-7-unsupported',
		closingTag: '<b></b>',
		gap: 'Same as ts7-bundled: on its first start the TypeScript 7 extension sets `js/ts.experimental.useTsgo` to true in the user settings.',
		check: (result) =>
			result.useTsgoAtEnd?.user !== true
				? 'expected the TypeScript 7 extension to turn `js/ts.experimental.useTsgo` on in the user settings'
				: notice_actions(result, ['Learn More', 'Turn Off TypeScript 7']),
	},
	{
		name: 'ts7-nightly-extension',
		description:
			'TypeScript 7 extension on with the TypeScript 7 Nightly extension, which some users install: its compiler serves',
		extensions: ['tsrx', 'ts7', 'ts7-nightly'],
		settings: { 'js/ts.experimental.useTsgo': true },
		expect: 'typescript-7',
		typescript: 'typescript-7',
		closingTag: '<b></b>',
	},
	{
		name: 'ts7-nightly-only',
		description:
			"Only the TypeScript 7 Nightly extension, TypeScript 7 on: it has no server, and VS Code's own TypeScript stands down",
		extensions: ['tsrx', 'ts7-nightly'],
		settings: { 'js/ts.experimental.useTsgo': true },
		expect: 'nothing',
		typescript: 'typescript-7-missing',
		notice: 'typescript-7-missing',
		closingTag: '<b></b>',
		gap: "The TypeScript 7 Nightly extension only ships a compiler for the TypeScript 7 extension. The TSRX extension's notice offers to install it or turn TypeScript 7 off.",
	},
	{
		name: 'ts7-off',
		description: 'TypeScript 7 extension installed but off (`useTsgo: false`)',
		extensions: ['tsrx', 'ts7'],
		settings: { 'js/ts.experimental.useTsgo': false },
		projectTypeScript: true,
		expect: 'vscode-typescript',
		typescript: 'vscode',
		closingTag: '<b></b>',
	},
	{
		name: 'vscode-typescript',
		description: 'TSRX extension only',
		extensions: ['tsrx'],
		expect: 'vscode-typescript',
		typescript: 'vscode',
		closingTag: '<b></b>',
	},
	{
		name: 'vscode-typescript-restart',
		description: 'TSRX extension only, then TSRX: Restart Language Server',
		extensions: ['tsrx'],
		expect: 'vscode-typescript',
		typescript: 'vscode',
		command: 'tsrx.restartServer',
		closingTag: '<b></b>',
		check: restarted,
	},
	{
		name: 'vscode-typescript-package-change',
		description:
			'TSRX extension only, then package.json changes: the TSRX server restarts without an error',
		extensions: ['tsrx'],
		expect: 'vscode-typescript',
		typescript: 'vscode',
		packageChange: true,
		closingTag: '<b></b>',
		check: restarted_after_package_change,
	},
	{
		name: 'vscode-typescript-tsrx-closing-off',
		description:
			"TSRX extension only, TSRX's own closing tags off: VS Code's TypeScript closes the tag through the tsserver plugin",
		extensions: ['tsrx'],
		settings: { 'tsrx.autoClosingTags.enabled': false },
		expect: 'vscode-typescript',
		typescript: 'vscode',
		closingTag: '<b></b>',
	},
	{
		name: 'vscode-typescript-closing-off',
		description:
			"TSRX extension only, VS Code's TypeScript closing tags off: TSRX closes tags only for TypeScript 7, so nothing closes it",
		extensions: ['tsrx'],
		settings: { 'js/ts.autoClosingTags.enabled': false },
		expect: 'vscode-typescript',
		typescript: 'vscode',
		closingTag: '<b>',
	},
	{
		name: 'vscode-typescript-project-ts7',
		description:
			'TSRX extension only, project has the TypeScript 7.1 nightly: VS Code cannot run it, so its bundled TypeScript serves',
		extensions: ['tsrx'],
		projectTypeScript: true,
		expect: 'vscode-typescript',
		typescript: 'vscode',
		notice: 'install-typescript-7',
		closingTag: '<b></b>',
	},
	{
		name: 'vscode-typescript-tsdk-ts7-project',
		description:
			"TSRX extension only, the README's js/ts.tsdk.path set, project has the 7.1 nightly: VS Code's own TypeScript still serves",
		extensions: ['tsrx'],
		settings: { 'js/ts.tsdk.path': 'node_modules/typescript' },
		projectTypeScript: true,
		expect: 'vscode-typescript',
		typescript: 'vscode',
		notice: 'install-typescript-7',
		closingTag: '<b></b>',
	},
	{
		name: 'vscode-typescript-tsdk-classic-project',
		description:
			"TSRX extension only, the README's js/ts.tsdk.path set, project has TypeScript 5.9: VS Code's own TypeScript still serves",
		extensions: ['tsrx'],
		settings: { 'js/ts.tsdk.path': 'node_modules/typescript' },
		projectTypeScript: 'classic',
		expect: 'vscode-typescript',
		typescript: 'vscode',
		closingTag: '<b></b>',
	},
	{
		name: 'vscode-typescript-classic-project',
		description:
			"TSRX extension only, js/ts.tsdk.path = node_modules/typescript/lib, project has TypeScript 5.9: the project's tsserver serves",
		extensions: ['tsrx'],
		settings: { 'js/ts.tsdk.path': 'node_modules/typescript/lib' },
		projectTypeScript: 'classic',
		expect: 'vscode-typescript',
		typescript: 'vscode',
		closingTag: '<b></b>',
		check: (result) => tsserver_version(result, '5.9.3'),
	},
];
