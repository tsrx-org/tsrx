import { describe, expect, it } from 'vitest';
import { ScriptBodyApp, ScriptBracesApp, script_body_cases } from './script-body-components.tsrx';

/**
 * Shared runtime suite for raw-text `<script>` bodies across the JSX targets
 * (#708): a client render gives each script the text of its body as written.
 * Whether the script then runs is the target's decision; jsdom runs none.
 */
export function runScriptBodyRuntimeTests() {
	async function settle() {
		const flush = globalThis.flush;
		if (flush) {
			await flush();
		}
	}

	/**
	 * @param {unknown} App
	 * @param {string} selector
	 */
	async function render_script(App, selector) {
		await globalThis.render(App);
		await settle();
		return globalThis.container.querySelector(`${selector} > script`);
	}

	describe('raw-text script bodies at runtime', () => {
		for (const [label, selector, text] of script_body_cases) {
			it(`renders ${label} as written`, async () => {
				const App = selector === '.script-braces' ? ScriptBracesApp : ScriptBodyApp;
				const script = await render_script(App, selector);
				expect(script?.textContent).toBe(text);
				expect(script?.childNodes.length).toBe(1);
			});
		}
	});
}
