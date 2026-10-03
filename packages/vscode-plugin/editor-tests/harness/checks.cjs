/**
 * Runs inside an isolated VS Code instance (`--extensionTestsPath`) started by
 * `../run.js`. Opens the fixture's `.tsrx` file, asks the editor for a hover, a
 * definition and the diagnostics of a type error typed into the unsaved
 * buffer, checks the imports between `.ts` and `.tsrx` files both ways, and
 * writes what it saw to the `out` file named in `config.json` (written next to
 * this file by the runner). It never saves the documents.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * An editor request that may never settle (a provider stuck behind a server
 * that is restarting) must not hang the run.
 * @template T
 * @param {Thenable<T>} request
 * @param {number} ms
 * @param {T} fallback
 * @returns {Promise<T>}
 */
function within(request, ms, fallback) {
	return Promise.race([Promise.resolve(request), sleep(ms).then(() => fallback)]);
}

/** @param {vscode.Hover[] | undefined} hovers */
function hover_text(hovers) {
	return (hovers ?? [])
		.flatMap((hover) =>
			hover.contents.map((content) => (typeof content === 'string' ? content : content.value)),
		)
		.join('\n')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * The hover at `offset(text)`, polled until it matches `expected` or time runs out.
 * @param {vscode.TextDocument} document
 * @param {(text: string) => number} offset
 * @param {RegExp} expected
 * @param {number} timeout_ms
 */
async function poll_hover(document, offset, expected, timeout_ms) {
	let hover = '';
	const deadline = Date.now() + timeout_ms;
	while (!expected.test(hover) && Date.now() < deadline) {
		const position = document.positionAt(offset(document.getText()));
		hover = hover_text(
			await within(
				vscode.commands.executeCommand('vscode.executeHoverProvider', document.uri, position),
				5000,
				[],
			),
		);
		if (!expected.test(hover)) await sleep(1000);
	}
	return hover;
}

/**
 * The hover on `count` in `{count}`, polled until it names the type or time runs out.
 * @param {vscode.TextDocument} document
 * @param {number} timeout_ms
 */
function hover_on_count(document, timeout_ms) {
	return poll_hover(document, (text) => text.indexOf('{count}') + 1, /number/, timeout_ms);
}

/**
 * The number of document symbols in `document`, polled until there are some or 20
 * seconds have passed: right after a restart, the TSRX server may not answer yet.
 * @param {vscode.TextDocument} document
 */
async function poll_symbols(document) {
	let symbols = 0;
	const deadline = Date.now() + 20000;
	while (symbols === 0 && Date.now() < deadline) {
		/** @type {unknown[] | undefined} */
		const found = await within(
			vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri),
			5000,
			undefined,
		);
		symbols = found?.length ?? 0;
		if (symbols === 0) await sleep(500);
	}
	return symbols;
}

/**
 * The text of `document` with `edits` applied to a copy: a changed document would make
 * VS Code ask to save it when the instance closes, and that dialog brings the hidden
 * window to the front.
 * @param {vscode.TextDocument} document
 * @param {vscode.TextEdit[] | undefined} edits
 */
function applied(document, edits) {
	let text = document.getText();
	const offset = (/** @type {vscode.Position} */ position) => document.offsetAt(position);
	for (const edit of [...(edits ?? [])].sort(
		(a, b) => offset(b.range.start) - offset(a.range.start),
	)) {
		text =
			text.slice(0, offset(edit.range.start)) + edit.newText + text.slice(offset(edit.range.end));
	}
	return text;
}

/** @param {vscode.Uri} uri */
function diagnostics_of(uri) {
	return vscode.languages.getDiagnostics(uri).map((diagnostic) => ({
		source: diagnostic.source,
		code:
			typeof diagnostic.code === 'object' ? String(diagnostic.code.value) : String(diagnostic.code),
		message: diagnostic.message,
	}));
}

/** @param {string} key */
function use_tsgo(key) {
	const inspected = vscode.workspace.getConfiguration('js/ts').inspect(key);
	return { user: inspected?.globalValue, workspace: inspected?.workspaceValue };
}

exports.run = async () => {
	/** @type {Record<string, unknown>} */
	const result = { scenario: config.scenario };
	try {
		const uri = vscode.Uri.file(config.file);
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(document);
		result.languageId = document.languageId;
		result.useTsgoAtStart = use_tsgo('experimental.useTsgo');

		const text = document.getText();
		result.hover = await hover_on_count(document, config.hoverTimeoutMs);
		// Without a TypeScript that answers, the import checks below only look once.
		const answering = /number/.test(result.hover);

		// `App.tsrx` imports `label.ts`.
		result.tsImportHover = await poll_hover(
			document,
			(text) => text.indexOf('{label}') + 1,
			/label: string/,
			answering ? 10000 : 0,
		);

		// Linked editing on the <button> tag (auto-rename of the tag pair with
		// editor.linkedEditing on): the text of the ranges VS Code's provider returns.
		// An internal command: its ranges are the editor's one-based IRange, not vscode.Range.
		/** @type {{ ranges: Array<{ startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }> } | undefined} */
		const linked = await within(
			vscode.commands.executeCommand(
				'_executeLinkedEditingProvider',
				uri,
				document.positionAt(text.indexOf('<button') + 2),
			),
			10000,
			undefined,
		);
		result.linkedEditing = linked?.ranges?.map((range) =>
			document.getText(
				new vscode.Range(
					range.startLineNumber - 1,
					range.startColumn - 1,
					range.endLineNumber - 1,
					range.endColumn - 1,
				),
			),
		);

		/** @type {Array<vscode.Location | vscode.LocationLink>} */
		const definitions = await within(
			vscode.commands.executeCommand(
				'vscode.executeDefinitionProvider',
				uri,
				document.positionAt(text.indexOf('useState(0)') + 2),
			),
			10000,
			[],
		);
		result.definitions = (definitions ?? []).map((definition) =>
			('targetUri' in definition ? definition.targetUri : definition.uri).path
				.split('/node_modules/')
				.pop(),
		);

		// A type error in the unsaved buffer only.
		const edit = new vscode.WorkspaceEdit();
		edit.insert(
			uri,
			document.positionAt(text.indexOf('\n\n\t<button')),
			'\n\tconst wrong: string = count;',
		);
		await vscode.workspace.applyEdit(edit);
		/** @type {vscode.Diagnostic[]} */
		let diagnostics = [];
		const diagnostic_deadline = Date.now() + config.diagnosticTimeoutMs;
		while (
			!diagnostics.some((diagnostic) => /not assignable/.test(diagnostic.message)) &&
			Date.now() < diagnostic_deadline
		) {
			await sleep(1000);
			diagnostics = vscode.languages.getDiagnostics(uri);
		}
		result.diagnostics = diagnostics_of(uri);

		// Closing tags: type `<b` and then `>` inside the button (or the scenario's
		// `typedTag` instead of `b`), and record what follows: `<b></b>` once,
		// nothing, or a closing tag inserted by more than one provider. Each
		// keystroke is an edit at the cursor, which moves the cursor past it, as
		// typing does. The `type` command would need the window to have the
		// focus, and the runner keeps the instance hidden. Both
		// closing-tag providers react to the document change and the cursor.
		// Another extension may have opened an editor of its own meanwhile.
		const editor = await vscode.window.showTextDocument(document);
		result.activeEditorBeforeTyping = vscode.window.activeTextEditor?.document.uri.path
			.split('/')
			.pop();
		if (editor) {
			const before_close = document.positionAt(document.getText().indexOf('</button>'));
			editor.selection = new vscode.Selection(before_close, before_close);
			for (const text of [`<${config.typedTag}`, '>']) {
				const at = editor.selection.active;
				await editor.edit((builder) => builder.insert(at, text));
				const after = at.translate(0, text.length);
				editor.selection = new vscode.Selection(after, after);
			}
			await sleep(config.autoInsertWaitMs);
			const line = document.lineAt(before_close.line).text;
			result.closingTag = line.slice(before_close.character, line.lastIndexOf('</button>'));
		}

		// What the TSRX extension says about the TypeScript serving the file, and the
		// notices it showed (src/typescript-guidance.js), read from its exports.
		const tsrx = vscode.extensions.getExtension('tsrx.tsrx-vscode-plugin');
		const exports = tsrx ? await within(tsrx.activate(), 30000, undefined) : undefined;
		const guidance = exports?.typescriptGuidance;
		result.typescriptStatus = guidance?.status();
		result.notices = guidance?.shown;
		if (config.action) {
			// One of the notice's actions, as clicking it would run it.
			await within(guidance?.run(config.action), 30000, undefined);
			await sleep(config.actionWaitMs);
			result.afterAction = {
				activeTab: vscode.window.tabGroups.activeTabGroup.activeTab?.label,
				useTsgo: use_tsgo('experimental.useTsgo'),
				tsdkPath: vscode.workspace.getConfiguration('js/ts').inspect('tsdk.path')?.globalValue,
				typescriptStatus: guidance?.status(),
				hover: await hover_on_count(document, config.hoverTimeoutMs),
			};
			// Back to the file, so it is what gets reverted and closed below.
			await vscode.window.showTextDocument(document);
		}

		if (config.command) {
			// A command of the TSRX extension, as the Command Palette would run it; then
			// TypeScript must answer again, and the TSRX server list the symbols.
			result.afterCommand = {};
			try {
				await within(vscode.commands.executeCommand(config.command), 30000, undefined);
			} catch (error) {
				result.afterCommand.error = error instanceof Error ? error.message : String(error);
			}
			await sleep(config.actionWaitMs);
			result.afterCommand.hover = await hover_on_count(document, config.hoverTimeoutMs);
			/** @type {unknown[] | undefined} */
			const symbols = await within(
				vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri),
				10000,
				undefined,
			);
			result.afterCommand.symbols = symbols?.length ?? 0;
		}

		if (config.packageChange) {
			// The project's package.json changes, as `pnpm install` changes it: the TSRX
			// server restarts to load the TSRX compiler again, and then lists the symbols.
			// The runner reads what the server's output says about the restart.
			const package_json = path.join(path.dirname(path.dirname(config.file)), 'package.json');
			fs.appendFileSync(package_json, '\n');
			await sleep(config.actionWaitMs);
			result.afterPackageChange = { symbols: await poll_symbols(document) };
		}

		if (config.serverCrash) {
			// The TSRX server process dies, as in a crash: the language client starts it
			// again, and the new server lists the symbols. The runner reads what the
			// server's output says about it. The server is the one this extension host
			// started (`--clientProcessId`).
			const servers = execFileSync('ps', ['-A', '-o', 'pid=,command='], { encoding: 'utf8' })
				.split('\n')
				.filter(
					(line) =>
						line.includes(`--clientProcessId=${process.pid}`) &&
						/tsrx\.tsrx-vscode-plugin-[^/]*\/dist\/server\.js/.test(line),
				)
				.map((line) => Number.parseInt(line.trim(), 10));
			for (const pid of servers) {
				process.kill(pid, 'SIGKILL');
			}
			await sleep(config.actionWaitMs);
			result.afterServerCrash = { killed: servers.length, symbols: await poll_symbols(document) };
		}

		// `main.ts` imports `App.tsrx`: whatever serves `.ts` files must resolve it,
		// with no `plugins` entry in the fixture's tsconfig.json.
		const main = await vscode.workspace.openTextDocument(
			vscode.Uri.file(path.join(path.dirname(config.file), 'main.ts')),
		);
		await vscode.window.showTextDocument(main);
		result.tsrxImport = {
			hover: await poll_hover(
				main,
				(text) => text.lastIndexOf('App') + 1,
				/function App/,
				answering ? config.hoverTimeoutMs : 10000,
			),
			diagnostics: diagnostics_of(main.uri),
		};

		// Format Document on a messy .tsrx file, written into the project copy here (the
		// repository formats its own files). VS Code takes the first formatter that returns
		// edits; TypeScript's .tsrx formatters return none.
		const format_file = path.join(path.dirname(config.file), 'Format.tsrx');
		fs.writeFileSync(
			format_file,
			`import { useState } from "react";

export function Format() @{
      const [count,setCount]=useState(0);
  <button   onClick={() => setCount(count+1)}>{count}</button>
}
`,
		);
		const format_document = await vscode.workspace.openTextDocument(format_file);
		/** @type {vscode.TextEdit[] | undefined} */
		const format_edits = await within(
			vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', format_document.uri, {
				tabSize: 2,
				insertSpaces: false,
			}),
			30000,
			undefined,
		);
		// Format Selection on the <button> line, with the range formatter.
		const button_line = format_document
			.getText()
			.split('\n')
			.findIndex((line) => line.includes('<button'));
		/** @type {vscode.TextEdit[] | undefined} */
		const range_edits = await within(
			vscode.commands.executeCommand(
				'vscode.executeFormatRangeProvider',
				format_document.uri,
				new vscode.Range(button_line, 0, button_line + 1, 0),
				{ tabSize: 2, insertSpaces: false },
			),
			30000,
			undefined,
		);
		result.formatting = {
			defaultFormatter: vscode.workspace
				.getConfiguration('editor', { languageId: 'tsrx' })
				.get('defaultFormatter'),
			text: applied(format_document, format_edits),
			rangeText: applied(format_document, range_edits),
		};

		// TSRX's Go to Source Definition on `useState`: the file it opens.
		const source_editor = await vscode.window.showTextDocument(document);
		const use_state = document.positionAt(document.getText().indexOf('useState(0)') + 2);
		source_editor.selection = new vscode.Selection(use_state, use_state);
		// TypeScript can still be loading the definition's file: wait until it has one.
		const definition_deadline = Date.now() + (answering ? 20000 : 0);
		while (Date.now() < definition_deadline) {
			/** @type {unknown[] | undefined} */
			const found = await within(
				vscode.commands.executeCommand('vscode.executeDefinitionProvider', document.uri, use_state),
				5000,
				undefined,
			);
			if (found?.length) break;
			await sleep(500);
		}
		await within(vscode.commands.executeCommand('tsrx.goToSourceDefinition'), 30000, undefined);
		const source_deadline = Date.now() + 10000;
		while (vscode.window.activeTextEditor?.document === document && Date.now() < source_deadline) {
			await sleep(250);
		}
		const opened = vscode.window.activeTextEditor?.document;
		result.sourceDefinition =
			opened && opened !== document ? opened.uri.path.split('/node_modules/').pop() : undefined;

		// TSRX: Go to Project Configuration in App.tsrx: the file it opens.
		await vscode.window.showTextDocument(document);
		await within(vscode.commands.executeCommand('tsrx.goToProjectConfig'), 10000, undefined);
		const project_config = vscode.window.activeTextEditor?.document;
		// Real paths on both sides: the opened file's path can differ in letter case.
		result.projectConfig =
			project_config && project_config !== document
				? path.relative(
						fs.realpathSync.native(path.dirname(path.dirname(config.file))),
						fs.realpathSync.native(project_config.uri.fsPath),
					)
				: undefined;

		// TSRX: Remove Unused Imports on a file written into the project copy here. The
		// command changes the document, so it is reverted and closed right after.
		const imports_file = path.join(path.dirname(config.file), 'Imports.tsrx');
		fs.writeFileSync(
			imports_file,
			`import { useState } from 'react';
import { label } from './label';
import { App } from './App.tsrx';

export function Imports() @{
	const [count] = useState(0);
	<p>{count}</p>
}
`,
		);
		const imports_document = await vscode.workspace.openTextDocument(imports_file);
		await vscode.window.showTextDocument(imports_document);
		const imports_before = imports_document.getText();
		// The source actions need the file's project: wait for TypeScript to answer.
		await poll_hover(
			imports_document,
			(text) => text.indexOf('useState(0)') + 2,
			/useState/,
			answering ? 20000 : 0,
		);
		await within(vscode.commands.executeCommand('tsrx.removeUnusedImports'), 20000, undefined);
		const imports_deadline = Date.now() + 5000;
		while (imports_document.getText() === imports_before && Date.now() < imports_deadline) {
			await sleep(250);
		}
		result.removeUnusedImports = imports_document
			.getText()
			.split('\n')
			.filter((line) => line.startsWith('import '));
		await vscode.window.showTextDocument(imports_document);
		await within(
			vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor'),
			5000,
			undefined,
		);

		// Back to the file, so it is what gets reverted and closed below.
		await vscode.window.showTextDocument(document);

		/** @param {string} id */
		const active = (id) => vscode.extensions.getExtension(id)?.isActive ?? 'not installed';
		result.extensions = {
			tsrx: active('tsrx.tsrx-vscode-plugin'),
			builtinTypeScript: active('vscode.typescript-language-features'),
			typescript7: active('TypeScriptTeam.native-preview'),
			typescript7Nightly: active('TypeScriptTeam.vscode-typescript-nightly'),
		};
		result.useTsgoAtEnd = use_tsgo('experimental.useTsgo');
		await within(
			vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor'),
			5000,
			undefined,
		);
		// Nothing may stay changed: VS Code would ask to save it when the instance closes,
		// and that dialog brings the hidden window to the front.
		result.unsavedDocuments = vscode.workspace.textDocuments
			.filter((document) => document.isDirty)
			.map((document) => document.uri.path.split('/').pop());
	} catch (error) {
		result.error = error instanceof Error ? error.stack : String(error);
	}
	fs.writeFileSync(config.out, JSON.stringify(result, null, 2));
};
