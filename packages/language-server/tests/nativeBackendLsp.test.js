/**
 * The built TSRX language server driven over stdio on the native backend, the
 * way an editor runs it beside TypeScript 7: TSRX-only features (CSS in
 * `<style>`, CSS-class hover and definition, document symbols) are served,
 * and everything TypeScript 7 owns (TypeScript hover, diagnostics) is not.
 * The classic backend is driven the same way as the contrast.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
	consumer_fixture_files,
	create_native_workspace,
} from '../../content-mapper/tests/fixture-utils.js';
import { NativeLspClient, position_of } from '../../content-mapper/tests/lsp-client.js';
import { parse_jsonc } from '@tsrx/typescript-plugin/src/jsonc.js';

// On the native backend the server must run in a project whose only
// `typescript` is TypeScript 7's launcher package, so loading one is forbidden.
const forbid_typescript = fileURLToPath(
	new URL('../../content-mapper/tests/forbid-typescript.cjs', import.meta.url),
);

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// The source entry uses bundler-style imports, so the built server is driven
// (CI builds before testing; locally: `pnpm --filter @tsrx/language-server build`).
const server_path = fileURLToPath(new URL('../dist/language-server.js', import.meta.url));

/** @param {'native' | 'plugin' | 'classic'} backend */
function workspace_with_server(backend) {
	const files = consumer_fixture_files();
	const tsconfig = /** @type {Record<string, unknown>} */ (
		parse_jsonc(files['tsconfig.json']).value
	);
	tsconfig.contentMappers = [{ package: '@tsrx/content-mapper', extensions: ['.tsrx'] }];
	tsconfig.include = ['*.ts', '*.tsrx'];
	files['tsconfig.json'] = JSON.stringify(tsconfig, null, '\t');
	delete files['tsconfig.native.json'];
	const workspace = create_native_workspace(files);
	const client = new NativeLspClient(workspace.dir, {
		command: process.execPath,
		args: [
			...(backend === 'native' ? ['--require', forbid_typescript] : []),
			server_path,
			'--stdio',
			`--typescript-backend=${backend}`,
		],
	});
	return { files, workspace, client };
}

describe.each(/** @type {const} */ (['native', 'plugin', 'classic']))(
	'TSRX language server over stdio on the %s backend',
	(backend) => {
		/** @type {ReturnType<typeof workspace_with_server>} */
		let session;
		/** @type {Record<string, unknown>} */
		let capabilities;

		beforeAll(async () => {
			if (!fs.existsSync(server_path)) {
				throw new Error(
					`Built language server not found at ${server_path}; run "pnpm --filter @tsrx/language-server build".`,
				);
			}
			session = workspace_with_server(backend);
			capabilities = (await session.client.initialize()).capabilities;
			session.client.open('Panel.tsrx', session.files['Panel.tsrx']);
		});

		afterAll(async () => {
			await session?.client.shutdown();
			session?.workspace.cleanup();
		});

		/** @param {string} needle @param {number} [skip] */
		function at(needle, skip = 0) {
			return {
				textDocument: { uri: session.client.uri('Panel.tsrx') },
				position: position_of(session.files['Panel.tsrx'], needle, skip),
			};
		}

		it('advertises TypeScript-owned features only on the classic backend', () => {
			for (const feature of [
				'inlayHintProvider',
				'signatureHelpProvider',
				'semanticTokensProvider',
			]) {
				expect(feature in capabilities, feature).toBe(backend === 'classic');
			}
			expect(capabilities).not.toHaveProperty('documentFormattingProvider');
		});

		it('completes CSS values inside <style>', async () => {
			const completion = await session.client.request('textDocument/completion', {
				...at('padding: 1rem', 'padding: '.length),
				context: { triggerKind: 1 },
			});
			const labels = completion.items.map((/** @type {{ label: string }} */ i) => i.label);
			expect(labels).toContain('inherit');
			expect(labels).toContain('var()');
		});

		it('hovers CSS properties and class selectors, and jumps from a class attribute to its rule', async () => {
			const property = await session.client.request('textDocument/hover', at('font-weight', 3));
			expect(property.contents.value).toContain('weight of glyphs');
			const usage = at('className="heading"', 'className="'.length + 2);
			const class_hover = await session.client.request('textDocument/hover', usage);
			expect(class_hover.contents.value).toContain('.heading');
			const definition = await session.client.request('textDocument/definition', usage);
			expect(definition).toHaveLength(1);
			expect(definition[0].uri).toBe(session.client.uri('Panel.tsrx'));
			expect(definition[0].range.start).toEqual(
				position_of(session.files['Panel.tsrx'], '.heading {'),
			);
		});

		it(
			backend === 'classic'
				? 'serves TypeScript hover itself'
				: "leaves TypeScript hover to the editor's TypeScript",
			async () => {
				const hover = await session.client.request('textDocument/hover', at('{label}', 1));
				if (backend !== 'classic') {
					expect(hover).toBeNull();
				} else {
					expect(hover.contents.value).toContain('const label: string');
				}
			},
		);

		it('lists CSS rules and components as document symbols', async () => {
			const symbols = await session.client.request('textDocument/documentSymbol', {
				textDocument: { uri: session.client.uri('Panel.tsrx') },
			});
			const names = symbols.map((/** @type {{ name: string }} */ s) => s.name);
			for (const name of ['.panel', '.heading', 'PanelProps', 'Panel']) {
				expect(names).toContain(name);
			}
			// The `<script>` body's declarations come from the TypeScript service.
			expect(names.includes('analyticsEnabled')).toBe(backend === 'classic');
		});

		it(
			backend === 'native'
				? 'publishes no diagnostics of its own'
				: 'publishes the TSRX compile error itself',
			async () => {
				// Volar publishes for every open document; on native the list is always
				// empty because TypeScript 7 reports type and TSRX compile errors itself.
				// On plugin the editor's tsserver reports type errors but cannot report
				// TSRX compile errors, so the server publishes those.
				session.client.change(
					'Panel.tsrx',
					session.files['Panel.tsrx'].replace('{label}', '{{{label}'),
				);
				const with_items = await session.client
					.wait_for_notification(
						'textDocument/publishDiagnostics',
						(params) => params.diagnostics.length > 0,
						backend === 'native' ? 3_000 : 15_000,
					)
					.catch(() => undefined);
				if (backend === 'native') {
					expect(with_items).toBeUndefined();
				} else {
					expect(
						with_items?.diagnostics.map((/** @type {{ source?: string }} */ d) => d.source),
					).toContain('TSRX');
				}
			},
		);
	},
);
