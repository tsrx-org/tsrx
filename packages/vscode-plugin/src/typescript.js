import vscode from 'vscode';

// The TypeScript extensions VS Code recognizes. The nightly companion only supplies a compiler.
const TYPESCRIPT_EXTENSIONS = [
	'vscode.typescript-language-features',
	'TypeScriptTeam.vscode-typescript',
	'TypeScriptTeam.native-preview',
];

/**
 * Activate Microsoft's TypeScript extensions as opening a JS/TS file would. Each
 * extension decides whether to start its server; TSRX does not read their selection
 * settings. Register our file extensions with any API that supports content mappers,
 * so it can discover configured projects for already-open and future TSRX documents.
 * Each project still declares its own mapper in tsconfig.json.
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
	/** @type {Map<string, import('vscode').Disposable | undefined>} */
	const registrations = new Map();
	let disposed = false;
	let pending = Promise.resolve();

	async function sync() {
		if (disposed) return;
		for (const [id, registration] of registrations) {
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
				registrations.set(id, registration);
			} catch (error) {
				console.warn(`[TSRX] Could not activate ${id}:`, error);
			}
		}
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
				for (const registration of registrations.values()) registration?.dispose();
				registrations.clear();
			},
		},
		vscode.extensions.onDidChange(schedule),
	);
	return schedule();
}
