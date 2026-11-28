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
	// An authored \`v-else\` past another element joins the \`v-if\` before the
	// \`@switch\`; runtime.test.tsrx renders the same on the client.
	'element-switch-else.tsrx': `export function Plain() @{
	<div>
		<b v-if={false}>{'before'}</b>
		@switch (1) {
			@case 1: {
				<i>{'switch'}</i>
			}
		}
		<u>{'separator'}</u>
		<s v-else>{'else'}</s>
	</div>
}
export function Shown() @{
	<div>
		<b v-if={false}>{'before'}</b>
		@switch (1) {
			@case 1: {
				<i v-show={true}>{'switch'}</i>
			}
		}
		<u>{'separator'}</u>
		<s v-else>{'else'}</s>
	</div>
}`,

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

	// if-chain-hydration.test.tsrx hydrates what these render.
	'if-chain.tsrx': `import { ref } from 'vue';

type State = { on: boolean; away: boolean; shown: boolean; name: string };

function BranchCounter(props: { label: string }) @{
	const count = ref(0);
	<button class="counter" onClick={() => count.value++}>{props.label + ':' + count.value}</button>
}

export function Chain({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			<BranchCounter label="on" />
		} @else if (state.away) {
			<i>{'away'}</i>
		} @else {
			<b>{'off'}</b>
		}
		{state.name}
	</p>
}

export function ChainNoElse({ state }: { state: State }) @{
	<p>
		{state.name}
		@if (state.on) {
			<BranchCounter label="on" />
		} @else if (state.away) {
			<i>{'away'}</i>
		}
	</p>
}

export function Alone({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			<BranchCounter label="on" />
		} @else if (state.away) {
			<i>{'away'}</i>
		} @else {
			<b>{'off'}</b>
		}
	</p>
}

export function Shown({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			<span v-show={state.shown}>
				<BranchCounter label="on" />
			</span>
		}
		{state.name}
	</p>
}

export function LaterCounter({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			<i>{'on'}</i>
		} @else if (state.away) {
			<BranchCounter label="away" />
		} @else {
			<b>{'off'}</b>
		}
		{state.name}
	</p>
}

export function NestedElse({ state }: { state: State }) @{
	<p>
		{state.name}
		@if (state.on) {
			<BranchCounter label="on" />
		} @else {
			@if (state.away) {
				<i>{'away'}</i>
			}
		}
	</p>
}

export function ShownComponent({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			<BranchCounter v-show={state.shown} label="on" />
		}
		{state.name}
	</p>
}`,

	'v-show.tsrx': `export function App({ shown }: { shown: boolean }) @{
	<p v-show={shown}>{'x'}</p>
}`,

	// The server runs a scope's statements where the branch is rendered.
	'scope-setup.tsrx': `import { inject, provide } from 'vue';
function Child() @{
	const value = inject('key', 'none');
	<b>{value}</b>
}
export function Provides() @{
	<div>
		@if (true) {
			provide('key', 'branch');
			<p>
				<Child />
			</p>
		}
	</div>
}
export function Throws() @{
	<div>
		@try {
			<p>
				@if (true) {
					throw new Error('boom');
					<b>{'fine'}</b>
				}
			</p>
		} @catch (error) {
			<i>{(error as Error).message}</i>
		}
	</div>
}`,

	// A branch that calls a composable acting on its component keeps the
	// shared lowering; scope-owner.test.tsrx hydrates what these render.
	'scope-owner.tsrx': `import { useAttrs, useModel, useSlots } from 'vue';
import { defineVaporComponent } from 'vue-jsx-vapor';
function SlotsChild() @{
	<div class="owner-slots">
		@if (true) {
			const slots = useSlots();
			<b>{Object.keys(slots).join(',')}</b>
		}
	</div>
}
export function Slots() @{
	<SlotsChild>
		<i>{'given'}</i>
	</SlotsChild>
}
function AttrsChild() @{
	<div class="owner-attrs">
		@if (true) {
			const attrs = useAttrs();
			<b>{String(attrs.title)}</b>
		}
	</div>
}
export function Attrs() @{
	<AttrsChild title="hello" />
}
const ModelChild = defineVaporComponent(
	(props: { modelValue?: string }) => @{
		<div class="owner-model">
			@if (true) {
				const model = useModel(props, 'modelValue');
				<button>{String(model.value)}</button>
			}
		</div>
	},
	{ props: ['modelValue'], emits: ['update:modelValue'] },
);
export function Model() @{
	<ModelChild modelValue="initial" />
}`,

	// scope-hydration.test.tsrx hydrates what these render.
	'scope.tsrx': `import { ref } from 'vue';

type State = { on: boolean; away: boolean; n: number; name: string };

const attrs = { 'data-x': '1' };

function ScopeCounter(props: { label: string }) @{
	const count = ref(0);
	<button class="counter" onClick={() => count.value++}>{props.label + ':' + count.value}</button>
}

export function Beside({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			const label = state.name + '!';
			<ScopeCounter {label} />
		}
		{state.name}
	</p>
}

export function Spread({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			<span {...attrs}>
				<ScopeCounter label="on" />
			</span>
		}
		{state.name}
	</p>
}

export function ElseStatements({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			<ScopeCounter label="on" />
		} @else if (state.away) {
			const label = 'away';
			<i>{label}</i>
		} @else {
			const label = 'off';
			<b>{label}</b>
		}
		{state.name}
	</p>
}

export function InBranch({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			<span>
				@switch (state.n) {
					@case 1: {
						<ScopeCounter label="one" />
					}
					@default: {
						<i>{'other'}</i>
					}
				}
			</span>
		}
		{state.name}
	</p>
}

export function InScope({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			const label = 'scope';
			<span class={label}>
				@switch (state.n) {
					@case 1: {
						<ScopeCounter label="one" />
					}
					@default: {
						<i>{'other'}</i>
					}
				}
			</span>
		}
	</p>
}

export function InCase({ state }: { state: State }) @{
	<p>
		@switch (state.on) {
			@case true: {
				<span>
					@switch (state.n) {
						@case 1: {
							<ScopeCounter label="one" />
						}
					}
				</span>
			}
		}
	</p>
}

export function CaseStatements({ state }: { state: State }) @{
	<p>
		@switch (state.n) {
			@case 1: {
				const label = 'one';
				<ScopeCounter {label} />
			}
			@default: {
				<i>{'other'}</i>
			}
		}
		{state.name}
	</p>
}

export function TwoBranches({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			<span>
				@if (!state.away) {
					<em>
						@switch (state.n) {
							@case 1: {
								<ScopeCounter label="one" />
							}
							@default: {
								<i>{'other'}</i>
							}
						}
					</em>
				}
			</span>
		}
	</p>
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

	it('leaves a later authored v-else to the v-if before it', async () => {
		const { Plain, Shown } = await server.ssrLoadModule('/element-switch-else.tsrx');
		for (const component of [Plain, Shown]) {
			const html = await renderToString(createSSRApp(component));
			expect(html.replace(/<!--.*?-->/g, '')).toBe(
				'<div><s>else</s><i>switch</i><u>separator</u></div>',
			);
		}
	});

	it("gives a component case none of its parent component's fallthrough attributes", async () => {
		// runtime.test.tsrx checks the same on the client.
		const { App } = await server.ssrLoadModule('/element-switch-attrs.tsrx');
		expect(await renderToString(createSSRApp(App, { n: 1 }))).toBe(
			'<div class="child extra" data-x="1"><span class="inner">inner</span></div>',
		);
	});
});

// An element's `@else if` chain renders as `v-if` / `v-else-if` / `v-else`
// elements, without the fragment the nested ternary put around a later
// branch; if-chain-hydration.test.tsrx hydrates this markup.
describe("[vue] an element's @else if chain or v-show branch on the server", () => {
	it('renders the picked branch, or a comment', async () => {
		const shapes = await server.ssrLoadModule('/if-chain.tsrx');
		const states = {
			on: { on: true, away: false, shown: true, name: 'Ann' },
			away: { on: false, away: true, shown: true, name: 'Ann' },
			off: { on: false, away: false, shown: true, name: 'Ann' },
		};
		/** @type {Record<string, Record<string, string>>} */
		const rendered = {};
		for (const shape of [
			'Chain',
			'ChainNoElse',
			'Alone',
			'Shown',
			'LaterCounter',
			'NestedElse',
			'ShownComponent',
		]) {
			rendered[shape] = {};
			for (const [name, state] of Object.entries(states)) {
				rendered[shape][name] = await renderToString(createSSRApp(shapes[shape], { state }));
			}
		}
		expect(rendered).toEqual({
			Chain: {
				on: '<p><button class="counter">on:0</button>Ann</p>',
				away: '<p><i>away</i>Ann</p>',
				off: '<p><b>off</b>Ann</p>',
			},
			ChainNoElse: {
				on: '<p>Ann<button class="counter">on:0</button></p>',
				away: '<p>Ann<i>away</i></p>',
				off: '<p>Ann<!----></p>',
			},
			Alone: {
				on: '<p><button class="counter">on:0</button></p>',
				away: '<p><i>away</i></p>',
				off: '<p><b>off</b></p>',
			},
			Shown: {
				on: '<p><span><button class="counter">on:0</button></span>Ann</p>',
				away: '<p><!---->Ann</p>',
				off: '<p><!---->Ann</p>',
			},
			LaterCounter: {
				on: '<p><i>on</i>Ann</p>',
				away: '<p><button class="counter">away:0</button>Ann</p>',
				off: '<p><b>off</b>Ann</p>',
			},
			NestedElse: {
				on: '<p>Ann<button class="counter">on:0</button></p>',
				away: '<p>Ann<i>away</i></p>',
				off: '<p>Ann<!----></p>',
			},
			ShownComponent: {
				on: '<p><button class="counter">on:0</button>Ann</p>',
				away: '<p><!---->Ann</p>',
				off: '<p><!---->Ann</p>',
			},
		});
	});

	// Pins a limit, not a feature: vue-jsx-vapor 3.2.29's server build applies
	// `v-show` through `withDirectives` outside a render function, which Vue
	// skips with a warning, so a hidden element renders shown and hydrating it
	// reports a style mismatch. That holds for any `v-show`, in a branch or
	// not. A release that renders it hidden fails this test.
	it('renders a hidden v-show element shown', async () => {
		const { App } = await server.ssrLoadModule('/v-show.tsrx');
		const app = createSSRApp(App, { shown: false });
		app.config.warnHandler = () => {};
		expect(await renderToString(app)).toBe('<p>x</p>');
		// In a branch too; if-chain-hydration.test.tsrx hydrates it.
		const shapes = await server.ssrLoadModule('/if-chain.tsrx');
		const branch = createSSRApp(shapes.Shown, {
			state: { on: true, away: false, shown: false, name: 'Ann' },
		});
		branch.config.warnHandler = () => {};
		expect(await renderToString(branch)).toBe(
			'<p><span><button class="counter">on:0</button></span>Ann</p>',
		);
	});
});

// A branch or a case with setup statements renders through `TsrxScope`,
// which renders its element on the server without the fragment an IIFE
// branch had; scope-hydration.test.tsrx hydrates this markup.
describe('[vue] a branch or a case that renders through TsrxScope on the server', () => {
	it('renders the picked branch, or a comment', async () => {
		const shapes = await server.ssrLoadModule('/scope.tsrx');
		const states = {
			one: { on: true, away: false, n: 1, name: 'Ann' },
			two: { on: true, away: false, n: 2, name: 'Ann' },
			away: { on: false, away: true, n: 1, name: 'Ann' },
			off: { on: false, away: false, n: 1, name: 'Ann' },
		};
		/** @type {Record<string, Record<string, string>>} */
		const rendered = {};
		for (const shape of [
			'Beside',
			'Spread',
			'ElseStatements',
			'InBranch',
			'InScope',
			'InCase',
			'CaseStatements',
			'TwoBranches',
		]) {
			rendered[shape] = {};
			for (const [name, state] of Object.entries(states)) {
				rendered[shape][name] = await renderToString(createSSRApp(shapes[shape], { state }));
			}
		}
		expect(rendered).toEqual({
			Beside: {
				one: '<p><button class="counter">Ann!:0</button>Ann</p>',
				two: '<p><button class="counter">Ann!:0</button>Ann</p>',
				away: '<p><!---->Ann</p>',
				off: '<p><!---->Ann</p>',
			},
			Spread: {
				one: '<p><span data-x="1"><button class="counter">on:0</button></span>Ann</p>',
				two: '<p><span data-x="1"><button class="counter">on:0</button></span>Ann</p>',
				away: '<p><!---->Ann</p>',
				off: '<p><!---->Ann</p>',
			},
			ElseStatements: {
				one: '<p><button class="counter">on:0</button>Ann</p>',
				two: '<p><button class="counter">on:0</button>Ann</p>',
				away: '<p><i>away</i>Ann</p>',
				off: '<p><b>off</b>Ann</p>',
			},
			InBranch: {
				one: '<p><span><button class="counter">one:0</button></span>Ann</p>',
				two: '<p><span><i>other</i></span>Ann</p>',
				away: '<p><!---->Ann</p>',
				off: '<p><!---->Ann</p>',
			},
			InScope: {
				one: '<p><span class="scope"><button class="counter">one:0</button></span></p>',
				two: '<p><span class="scope"><i>other</i></span></p>',
				away: '<p><!----></p>',
				off: '<p><!----></p>',
			},
			InCase: {
				one: '<p><span><button class="counter">one:0</button></span></p>',
				two: '<p><span><!----></span></p>',
				away: '<p><!----></p>',
				off: '<p><!----></p>',
			},
			CaseStatements: {
				one: '<p><button class="counter">one:0</button>Ann</p>',
				two: '<p><i>other</i>Ann</p>',
				away: '<p><button class="counter">one:0</button>Ann</p>',
				off: '<p><button class="counter">one:0</button>Ann</p>',
			},
			TwoBranches: {
				one: '<p><span><em><button class="counter">one:0</button></em></span></p>',
				two: '<p><span><em><i>other</i></em></span></p>',
				away: '<p><!----></p>',
				off: '<p><!----></p>',
			},
		});
	});
});

describe('[vue] a branch that calls a composable acting on its component, on the server', () => {
	// It renders as an IIFE branch did, in its fragment, with the component's
	// slots, attributes and model; on the client it does the same, so the
	// two sides agree.
	it('renders with its component’s slots, attributes and model', async () => {
		const shapes = await server.ssrLoadModule('/scope-owner.tsrx');
		/** @type {Record<string, string>} */
		const rendered = {};
		/** @type {string[]} */
		const warnings = [];
		for (const shape of ['Slots', 'Attrs', 'Model']) {
			const app = createSSRApp(shapes[shape]);
			app.config.warnHandler = (message) => {
				warnings.push(message);
			};
			rendered[shape] = await renderToString(app);
		}
		expect(rendered).toEqual({
			Slots: '<div class="owner-slots"><!--[--><b>default</b><!--]--></div>',
			Attrs: '<div class="owner-attrs" title="hello"><!--[--><b>hello</b><!--]--></div>',
			Model: '<div class="owner-model"><!--[--><button>initial</button><!--]--></div>',
		});
		expect(warnings).toEqual([]);
	});
});

describe("[vue] a TsrxScope's statements on the server", () => {
	// On the server Vue renders the scope after the content around it has
	// returned: \`scope_content\` runs the statements where the branch is
	// rendered instead, as the IIFE they replace ran.
	it('run in the setup of the component that renders the branch', async () => {
		const { Provides } = await server.ssrLoadModule('/scope-setup.tsrx');
		const app = createSSRApp(Provides);
		/** @type {string[]} */
		const warnings = [];
		app.config.warnHandler = (message) => {
			warnings.push(message);
		};
		expect(await renderToString(app)).toBe('<div><p><b>branch</b></p></div>');
		expect(warnings).toEqual([]);
	});

	it('send a throw to the @catch around them', async () => {
		const { Throws } = await server.ssrLoadModule('/scope-setup.tsrx');
		const app = createSSRApp(Throws);
		/** @type {unknown[]} */
		const errors = [];
		app.config.errorHandler = (error) => {
			errors.push(error);
		};
		expect(await renderToString(app)).toBe('<div><i>boom</i></div>');
		expect(errors).toEqual([]);
	});
});
