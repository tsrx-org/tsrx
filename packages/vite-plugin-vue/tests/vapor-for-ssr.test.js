import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tsrxVue } from '../src/index.js';

// Pins a limit, not a feature. A keyed `@for` with `@empty` or a body that can
// skip a row renders through `VaporFor` (#178), and vue-jsx-vapor 3.2.29's
// `VaporFor` calls `createFor`, which Vue's server build doesn't have, so the
// server render throws, as it does for every `VaporFor` loop. These loops
// rendered on the server through `map_iterable` before; a vue-jsx-vapor or Vue
// release that renders `VaporFor` on the server fails this test, and the loops
// can be server-rendered again.
const FIXTURES = {
	'empty.tsrx': `export function App({ items }: { items: { id: number }[] }) @{
	<ul>
		@for (const item of items; key item.id) {
			<li>{item.id}</li>
		} @empty {
			<p>{'none'}</p>
		}
	</ul>
}`,

	'skip.tsrx': `export function App({ items }: { items: { id: number }[] }) @{
	<ul>
		@for (const item of items; key item.id) {
			@if (item.id > 1) {
				<li>{item.id}</li>
			}
		}
	</ul>
}`,

	'ifs.tsrx': `import { ref } from 'vue';
function Counter({ label }: { label: string }) @{
	const count = ref(0);
	<button>{label + ':' + count.value}</button>
}
function Ifs({ on, level }: { on: boolean; level: number }) @{
	<div>
		<span class="on">
			@if (on) {
				<Counter label="on" />
			}
		</span>
		<span class="level">
			@if (level === 2) {
				<i>{'two'}</i>
			}
		</span>
	</div>
}
export function App(props: { on: boolean; level: number }) @{
	<Ifs on={props.on} level={props.level} />
}`,

	'if-else.tsrx': `import { ref } from 'vue';
function Counter({ label }: { label: string }) @{
	const count = ref(0);
	<button class="pick-counter">{label + ':' + count.value}</button>
}
function Pick({ on, name }: { on: boolean; name: string }) @{
	<div>
		<span class="pick">
			@if (on) {
				<Counter label="on" />
			} @else {
				<i>{'off'}</i>
			}
			{name}
		</span>
	</div>
}
export function App(props: { on: boolean; name: string }) @{
	<Pick on={props.on} name={props.name} />
}`,

	'kept-if-else.tsrx': `import { KeepAlive } from 'vue';
function A() @{
	<button>{'a'}</button>
}
function B() @{
	<button>{'b'}</button>
}
export function App({ on }: { on: boolean }) @{
	<div>
		<KeepAlive>
			@if (on) {
				<A />
			} @else {
				<B />
			}
		</KeepAlive>
	</div>
}`,

	'switch.tsrx': `export function App({ items }: { items: { id: number }[] }) @{
	<div>
		@switch (items.length) {
			@case 0: {
				<p>{'zero'}</p>
			}
			@default: {
				const count = items.length + ' items';
				<p>{count}</p>
			}
		}
		<ul>
			@for (const item of items; key item.id) {
				@switch (item.id) {
					@case 1: {
						<li>{'one'}</li>
					}
				}
			} @empty {
				<li>{'none'}</li>
			}
		</ul>
	</div>
}`,

	'element-switch-attrs.tsrx': `function Inner() @{
	<span class="inner">{'inner'}</span>
}
function Child({ n }: { n: number }) @{
	<div class="child">
		@switch (n) {
			@case 1: {
				<Inner />
			}
		}
	</div>
}
export function App({ n }: { n: number }) @{
	<Child class="extra" data-x="1" n={n} />
}`,

	// element-switch-hydration.test.tsrx hydrates what these render.
	'element-switch.tsrx': `import { ref } from 'vue';

function CaseCounter(props: { label: string }) @{
	const count = ref(0);
	<button class="counter" onClick={() => count.value++}>{props.label + ':' + count.value}</button>
}

export function Plain(props: { n: number }) @{
	<section>
		<p>
			@switch (props.n) {
				@case 1: {
					<b>{'one'}</b>
				}
				@default: {
					<i>{'other'}</i>
				}
			}
		</p>
	</section>
}

export function Counted({ n }: { n: number }) @{
	<p>
		@switch (n) {
			@case 1: {
				<CaseCounter label="one" />
			}
			@default: {
				<CaseCounter label="other" />
			}
		}
		{'n=' + n}
	</p>
}

export function Between({ n }: { n: number }) @{
	<p>
		{'n=' + n}
		@switch (n) {
			@case 1: {
				<b>{'one'}</b>
			}
			@default: {
				<i>{'other'}</i>
			}
		}
		<em>{'after'}</em>
	</p>
}

export function Partial({ n }: { n: number }) @{
	<p>
		@switch (n) {
			@case 1: {
				<b>{'one'}</b>
			}
			@case 2: {}
		}
	</p>
}

export function BesideIf({ n }: { n: number }) @{
	<p>
		@if (n === 1) {
			<b>{'if'}</b>
		}
		@switch (n) {
			@case 1: {
				<i>{'mode a'}</i>
			}
		}
	</p>
}

export function Local({ n }: { n: number }) {
	const view = <p>
		@switch (n) {
			@case 1: {
				<b>{'one'}</b>
			}
			@default: {
				<i>{'other'}</i>
			}
		}
	</p>;
	return view;
}`,
};

/** @type {string} */
let dir;
/** @type {import('vite').ViteDevServer} */
let server;

beforeAll(async () => {
	dir = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), '.tmp-vapor-for-ssr-'));
	for (const [file, source] of Object.entries(FIXTURES)) writeFileSync(join(dir, file), source);
	server = await createServer({
		root: dir,
		configFile: false,
		cacheDir: join(dir, '.vite'),
		logLevel: 'silent',
		plugins: [tsrxVue()],
		optimizeDeps: { noDiscovery: true, include: [] },
		server: { middlewareMode: true, hmr: false, watch: null },
	});
});

afterAll(async () => {
	await server?.close();
	rmSync(dir, { recursive: true, force: true });
});

/**
 * @param {string} file
 * @param {{ id: number }[]} items
 */
async function render(file, items) {
	const { App } = await server.ssrLoadModule(`/${file}`);
	const html = await renderToString(createSSRApp(App, { items }));
	return html.replace(/<!--[^]*?-->/g, '');
}

describe('[vue] keyed @for through VaporFor on the server', () => {
	it('throws for a keyed loop with @empty whose source has items', async () => {
		await expect(render('empty.tsrx', [{ id: 1 }, { id: 2 }])).rejects.toThrow('createFor');
	});

	it('renders @empty for a keyed loop whose source is empty', async () => {
		expect(await render('empty.tsrx', [])).toBe('<ul><p>none</p></ul>');
	});

	it('throws for a keyed loop whose body can skip a row', async () => {
		await expect(render('skip.tsrx', [{ id: 1 }, { id: 2 }])).rejects.toThrow('createFor');
	});
});

// An element's `@if` without `@else` renders as `v-if` elements. The server
// renders the picked branch, or a `<!---->`, which the client build hydrates;
// runtime.test.tsrx hydrates this markup (comments kept here).
describe('[vue] an element whose child is an @if without @else on the server', () => {
	it('renders the picked branch, or a comment', async () => {
		const { App } = await server.ssrLoadModule('/ifs.tsrx');
		expect(await renderToString(createSSRApp(App, { on: false, level: 0 }))).toBe(
			'<div><span class="on"><!----></span><span class="level"><!----></span></div>',
		);
		expect(await renderToString(createSSRApp(App, { on: true, level: 2 }))).toBe(
			'<div><span class="on"><button>on:0</button></span><span class="level"><i>two</i></span></div>',
		);
	});
});

// An element's `@if` / `@else` beside an expression child renders as `v-if` /
// `v-else` elements; the server renders the picked branch, which the client
// build hydrates (runtime.test.tsrx hydrates this markup; comments kept here).
describe('[vue] an element whose child is an @if / @else beside an expression on the server', () => {
	it('renders the picked branch', async () => {
		const { App } = await server.ssrLoadModule('/if-else.tsrx');
		expect(await renderToString(createSSRApp(App, { on: true, name: 'Ann' }))).toBe(
			'<div><span class="pick"><button class="pick-counter">on:0</button>Ann</span></div>',
		);
		expect(await renderToString(createSSRApp(App, { on: false, name: 'Ann' }))).toBe(
			'<div><span class="pick"><i>off</i>Ann</span></div>',
		);
	});

	it('keeps a component child as one choice, for KeepAlive', async () => {
		// A component's child keeps the ternary, as on main: vue-jsx-vapor's
		// server build would pass \`v-if\` / \`v-else\` to it as two children,
		// which \`KeepAlive\` rejects.
		const { App } = await server.ssrLoadModule('/kept-if-else.tsrx');
		expect(await renderToString(createSSRApp(App, { on: true }))).toBe(
			'<div><button>a</button></div>',
		);
		expect(await renderToString(createSSRApp(App, { on: false }))).toBe(
			'<div><button>b</button></div>',
		);
	});
});

// A `@switch` picks its case in a `computed`, which the server build has; a
// keyed loop with `@empty` whose row is a `@switch` stays on `map_iterable`.
describe('[vue] @switch on the server', () => {
	it('renders a @switch and a keyed @switch row in a loop with @empty', async () => {
		expect(await render('switch.tsrx', [{ id: 1 }, { id: 2 }])).toBe(
			'<div><p>2 items</p><ul><li>one</li></ul></div>',
		);
		expect(await render('switch.tsrx', [])).toBe('<div><p>zero</p><ul><li>none</li></ul></div>');
	});
});

// An element's `@switch` renders as `v-if` / `v-else-if` elements; the server
// renders the picked case, or a `<!---->`, which
// element-switch-hydration.test.tsrx hydrates (comments kept here).
describe("[vue] an element's @switch on the server", () => {
	it('renders the picked case, or a comment', async () => {
		const shapes = await server.ssrLoadModule('/element-switch.tsrx');
		/** @type {Record<string, string[]>} */
		const rendered = {};
		for (const shape of ['Plain', 'Counted', 'Between', 'Partial', 'BesideIf', 'Local']) {
			rendered[shape] = [];
			for (const n of [1, 2, 3]) {
				rendered[shape].push(await renderToString(createSSRApp(shapes[shape], { n })));
			}
		}
		expect(rendered).toEqual({
			Plain: [
				'<section><p><b>one</b></p></section>',
				'<section><p><i>other</i></p></section>',
				'<section><p><i>other</i></p></section>',
			],
			Counted: [
				'<p><button class="counter">one:0</button>n=1</p>',
				'<p><button class="counter">other:0</button>n=2</p>',
				'<p><button class="counter">other:0</button>n=3</p>',
			],
			Between: [
				'<p>n=1<b>one</b><em>after</em></p>',
				'<p>n=2<i>other</i><em>after</em></p>',
				'<p>n=3<i>other</i><em>after</em></p>',
			],
			Partial: ['<p><b>one</b></p>', '<p><!----></p>', '<p><!----></p>'],
			BesideIf: ['<p><b>if</b><i>mode a</i></p>', '<p><!----><!----></p>', '<p><!----><!----></p>'],
			Local: ['<p><b>one</b></p>', '<p><i>other</i></p>', '<p><i>other</i></p>'],
		});
	});

	it("gives a component case none of its parent component's fallthrough attributes", async () => {
		// runtime.test.tsrx checks the same on the client.
		const { App } = await server.ssrLoadModule('/element-switch-attrs.tsrx');
		expect(await renderToString(createSSRApp(App, { n: 1 }))).toBe(
			'<div class="child extra" data-x="1"><span class="inner">inner</span></div>',
		);
	});
});
