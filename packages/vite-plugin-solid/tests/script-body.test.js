import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import solid from 'vite-plugin-solid';
import { runScriptBodyServerTests } from '@tsrx/core/test-harness/script-body-server';
import { tsrxSolid } from '../src/index.js';

// Solid's server output (`generate: 'ssr'`) writes a body into its template
// strings.
runScriptBodyServerTests({
	name: 'solid',
	root: dirname(fileURLToPath(import.meta.url)),
	plugins: () => [tsrxSolid(), solid({ ssr: true, solid: { hydratable: false } })],
	render: `import { createComponent, renderToString } from '@solidjs/web';
export const render = async (App) => renderToString(() => createComponent(App, {}));`,
});
