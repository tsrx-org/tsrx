import vscode from 'vscode';
import { TYPESCRIPT_7_SERVER_EXTENSIONS, follow_running_compiler } from './typescript-7.js';

// The TypeScript extensions VS Code recognizes. The nightly companion only supplies a compiler.
const TYPESCRIPT_EXTENSIONS = [
	'vscode.typescript-language-features',
	'TypeScriptTeam.vscode-typescript',
	'TypeScriptTeam.native-preview',
];

/**
 * Activate Microsoft's TypeScript extensions as opening a JS/TS file would. Each
 * extension decides whether to start its server; only closing tags and the TypeScript
 * status read their selection settings (`typescript-7.js`). Register our file
 * extensions with any API that supports content mappers, so it can discover configured
 * projects for already-open and future TSRX documents. Each project still declares its
 * own mapper in tsconfig.json. A TypeScript 7 extension's API also says which compiler
 * its server runs.
 * @param {import('vscode').ExtensionContext} context
 */
export function activate_typescript(context) {
	// Use the same extensions VS Code associates with the TSRX language.
	const languages = /** @type {{ id: string, extensions: string[] }[]} */ (
		context.extension.packageJSON.contributes.languages
	);
	const tsrx_extensions = languages.find((language) => language.id === 'tsrx')?.extensions ?? [
		'.tsrx',
	];
	// A successful activation is remembered even when that extension exposes no mapper API.
	/** @type {Map<string, { api: any, registration: import('vscode').Disposable | undefined }>} */
	const registrations = new Map();
	/** @type {{ id: string, subscription: import('vscode').Disposable | undefined } | undefined} */
	let following;
	let disposed = false;
	let pending = Promise.resolve();

	function stop_following() {
		following?.subscription?.dispose();
		following = undefined;
	}

	/**
	 * Follow the running compiler of the first TypeScript 7 server extension there is now,
	 * which changes as extensions come and go. Each one starts a server, and one report at
	 * a time can be right. `sync` calls this last, so a throw leaves the registrations be.
	 */
	function follow_server() {
		const id = TYPESCRIPT_7_SERVER_EXTENSIONS.find((candidate) => registrations.has(candidate));
		if (id === following?.id) return;
		stop_following();
		if (!id) return;
		following = { id, subscription: follow_running_compiler(registrations.get(id)?.api) };
	}

	async function sync() {
		if (disposed) return;
		for (const [id, { registration }] of registrations) {
			if (!vscode.extensions.getExtension(id)) {
				registration?.dispose();
				registrations.delete(id);
			}
		}
		for (const id of TYPESCRIPT_EXTENSIONS) {
			if (disposed) return;
			const extension = vscode.extensions.getExtension(id);
			if (!extension || registrations.has(id)) continue;
			try {
				const api = await extension.activate();
				if (disposed || !vscode.extensions.getExtension(id)) continue;
				const registration =
					typeof api?.registerContentMappers === 'function'
						? api.registerContentMappers(context.extension.id, [{ extensions: tsrx_extensions }])
						: undefined;
				registrations.set(id, { api, registration });
			} catch (error) {
				console.warn(`[TSRX] Could not activate ${id}:`, error);
			}
		}
		if (!disposed) follow_server();
	}

	function schedule() {
		pending = pending.then(sync).catch((error) => {
			console.warn('[TSRX] Could not update TypeScript registrations:', error);
		});
		return pending;
	}

	context.subscriptions.push(
		{
			dispose: () => {
				disposed = true;
				stop_following();
				for (const { registration } of registrations.values()) registration?.dispose();
				registrations.clear();
			},
		},
		vscode.extensions.onDidChange(schedule),
	);
	return schedule();
}
