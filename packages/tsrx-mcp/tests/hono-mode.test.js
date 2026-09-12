import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compile_tsrx } from '../src/compile.js';

const cwd = fileURLToPath(new URL('./fixtures/hono-project/', import.meta.url));

describe('Hono MCP runtime selection', () => {
	it('rejects async components in client mode', async () => {
		const result = await compile_tsrx({
			cwd,
			target: 'hono',
			mode: 'client',
			code: 'export async function App() { return <div />; } <App />',
		});
		expect(result.compilerPackage).toBe('@tsrx/hono/dom');
		expect(result.ok).toBe(false);
		expect(result.errors[0].message).toContain('does not support async components');
	});

	it.each([undefined, /** @type {const} */ ('server')])(
		'preserves the server compiler for mode %s',
		async (mode) => {
			const result = await compile_tsrx({
				cwd,
				target: 'hono',
				mode,
				code: 'export async function App() { return <div />; }',
			});
			expect(result.compilerPackage).toBe('@tsrx/hono');
			expect(result.ok).toBe(true);
		},
	);

	it('emits DOM helpers in client mode', async () => {
		const result = await compile_tsrx({
			cwd,
			target: 'hono',
			mode: 'client',
			includeCode: true,
			code: 'export function App() @{ @try { <div /> } @pending { <p /> } }',
		});
		expect(result.ok).toBe(true);
		expect(result.code).toContain("from 'hono/jsx/dom'");
	});
});
