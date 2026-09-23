import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { build, createServer } from 'vite';

const ENTRY = 'components/Styled.tsrx';
const CSS_IMPORT_PATTERN = /import\s*"([^"]+lang\.css)"/;
const DEV_CSS_PATTERN = /^const __vite__css = (".*")$/m;

/**
 * A component whose `<style>` block references an asset next to it. The
 * component sits below the root, so a reference resolved from anywhere but the
 * component's directory fails.
 *
 * @type {Record<string, string>}
 */
const FILES = {
	[ENTRY]: `export function Styled() @{
	<>
		<style>
			div {
				background: url(./asset.svg);
			}
		</style>
		<div />
	</>
}
`,
	'components/asset.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>\n',
};

/**
 * Build the fixture component as a Vite library and return the CSS Vite
 * emitted for it. Bare imports stay external, so the target runtime is never
 * bundled.
 *
 * As with the worker fixtures, the files are written on the fly and removed
 * afterwards, and `root` has to sit inside the package under test so imports
 * resolve against its `node_modules`.
 *
 * @param {{ root: string, plugins: import('vite').PluginOption[] }} options
 * @returns {Promise<string>}
 */
export async function buildCssReferenceFixture({ root, plugins }) {
	write_fixture(root);

	try {
		const result = await build({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins,
			build: {
				write: false,
				cssMinify: false,
				lib: { entry: join(root, ENTRY), formats: ['es'], cssFileName: 'style' },
				rolldownOptions: {
					external: (id) => !id.startsWith('.') && !id.startsWith('\0') && !isAbsolute(id),
				},
			},
		});
		const outputs = (Array.isArray(result) ? result : [result]).flatMap((entry) =>
			'output' in entry ? entry.output : [],
		);

		return outputs
			.filter((output) => output.type === 'asset' && output.fileName.endsWith('.css'))
			.map((output) => String(/** @type {{ source: string | Uint8Array }} */ (output).source))
			.join('\n');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

/**
 * Serve the fixture from a Vite dev server, request the component the way a
 * browser does, then request the stylesheet module it imports and return the
 * CSS that module injects.
 *
 * @param {{ root: string, plugins: import('vite').PluginOption[] }} options
 * @returns {Promise<{ url: string, css: string }>}
 */
export async function serveCssReferenceFixture({ root, plugins }) {
	const cache_dir = mkdtempSync(join(tmpdir(), 'tsrx-css-references-'));
	/** @type {import('vite').ViteDevServer | undefined} */
	let server;

	write_fixture(root);

	try {
		server = await createServer({
			root,
			configFile: false,
			cacheDir: cache_dir,
			logLevel: 'silent',
			plugins,
			optimizeDeps: { noDiscovery: true, include: [] },
			server: { host: '127.0.0.1', port: 0 },
		});
		await server.listen();

		const base = server.resolvedUrls?.local[0];
		if (base === undefined) throw new Error('The dev server did not report a local url');

		const component = await request(base, `/${ENTRY}`);
		const url = CSS_IMPORT_PATTERN.exec(component)?.[1];
		if (url === undefined) {
			throw new Error(`No stylesheet import in ${ENTRY}:\n${component}`);
		}

		const stylesheet = await request(base, url);
		const css = DEV_CSS_PATTERN.exec(stylesheet)?.[1];
		if (css === undefined) {
			throw new Error(`No injected CSS in ${url}:\n${stylesheet}`);
		}

		return { url, css: JSON.parse(css) };
	} finally {
		await server?.close();
		rmSync(cache_dir, { recursive: true, force: true });
		rmSync(root, { recursive: true, force: true });
	}
}

/** @param {string} root */
function write_fixture(root) {
	for (const [name, source] of Object.entries(FILES)) {
		const file = join(root, name);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, source);
	}
}

/**
 * @param {string} base
 * @param {string} path
 * @returns {Promise<string>}
 */
async function request(base, path) {
	const response = await fetch(new URL(path, base), {
		headers: { 'sec-fetch-dest': 'script' },
	});
	const code = await response.text();
	if (!response.ok) throw new Error(`${path} responded with ${response.status}:\n${code}`);
	return code;
}
