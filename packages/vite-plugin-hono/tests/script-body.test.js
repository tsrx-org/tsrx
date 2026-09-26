import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScriptBodyServerTests } from '@tsrx/core/test-harness/script-body-server';
import { tsrxHono } from '../src/index.js';

runScriptBodyServerTests({
	name: 'hono',
	root: dirname(fileURLToPath(import.meta.url)),
	plugins: () => [tsrxHono({ mode: 'server' })],
	render: `export const render = async (App) => String(await (await App({})).toString());`,
});
