import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { use, useState } from 'hono/jsx';
import { createContext, render, useContext } from 'hono/jsx/dom';
import { Style, css } from 'hono/css';
import {
	NullishSpreadRefApp,
	NullishSpreadRefInIfApp,
	nullish_spread_ref_nodes,
} from '@tsrx/core/test-harness/runtime/nullish-spread-ref-components.tsrx';

let container: HTMLDivElement;
let resolveValue: (value: string) => void;
let valuePromise: Promise<string>;

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	valuePromise = new Promise((resolve) => {
		resolveValue = resolve;
	});
});

afterEach(() => {
	render(null, container);
	document.body.removeChild(container);
});

function Counter() @{
	const [count, setCount] = useState(0);

	<button class="count" onClick={() => setCount((current) => current + 1)}>{count}</button>
}

function ConditionalHook({ visible }: { visible: boolean }) @{
	@if (visible) {
		const [label] = useState('visible');
		<span class="conditional">{label}</span>
	}
}

type KeyedBranchItem = { id: string; visible: boolean };

function KeyedBranchRow({ item }: { item: KeyedBranchItem }) @{
	const [initial] = useState(item.id);

	<li class="keyed-branch-row">{`${item.id}:${initial}`}</li>
}

function ForKeyedIfApp() @{
	const [items, setItems] = useState<KeyedBranchItem[]>([
		{ id: 'a', visible: true },
		{ id: 'b', visible: true },
	]);

	<>
		<ul>
			@for (const item of items; key item.id) {
				@if (item.visible) {
					<KeyedBranchRow item={item} />
				}
			}
		</ul>
		<button
			class="reverse-keyed-if"
			onClick={() => setItems([...items].reverse())}
		>{'reverse'}</button>
	</>
}

function ForKeyedSwitchApp() @{
	const [items, setItems] = useState<KeyedBranchItem[]>([
		{ id: 'a', visible: true },
		{ id: 'b', visible: true },
	]);

	<>
		<ul>
			@for (const item of items; key item.id) {
				@switch (item.visible) {
					@case true: {
						<KeyedBranchRow item={item} />
					}
					@default: {
						<li>{'hidden'}</li>
					}
				}
			}
		</ul>
		<button
			class="reverse-keyed-switch"
			onClick={() => setItems([...items].reverse())}
		>{'reverse'}</button>
	</>
}

function AsyncContent() @{
	const value = use(valuePromise);
	<span class="resolved">{value}</span>
}

function SuspendedApp() @{
	@try {
		<AsyncContent />
	} @pending {
		<p class="pending">{'Loading'}</p>
	}
}

function Broken(): never @{
	throw new Error('boom');
}

function BoundaryApp() @{
	@try {
		<Broken />
	} @catch (error) {
		<p class="error">{error.message}</p>
	}
}

const ThemeContext = createContext('light');

function ThemeLabel() @{
	<span class="theme">{useContext(ThemeContext)}</span>
}

function ContextApp() @{
	<ThemeContext.Provider value="dark">
		<ThemeLabel />
	</ThemeContext.Provider>
}

function StyledApp() @{
	<div>
		<Style />
		<div class={css`
			color: red;
		`}>{'styled'}</div>
	</div>
}

describe('@tsrx/vite-plugin-hono DOM runtime', () => {
	it('renders and updates Hono DOM state', async () => {
		render(<Counter />, container);

		expect(container.innerHTML).toBe('<button class="count">0</button>');
		container.querySelector('button')?.click();
		await Promise.resolve();
		expect(container.innerHTML).toBe('<button class="count">1</button>');
		const button = container.querySelector('button');
		button?.click();
		await Promise.resolve();
		expect(container.querySelector('button')).toBe(button);
		expect(container.textContent).toBe('2');
	});

	it('supports Hono hooks imported from hono/jsx with the DOM renderer', () => {
		render(<ContextApp />, container);

		expect(container.innerHTML).toBe('<span class="theme">dark</span>');
	});

	it('composes Hono css and Style with the DOM target', async () => {
		render(<StyledApp />, container);

		expect(container.querySelector('style')?.id).toBe('hono-css');
		expect(container.textContent).toBe('styled');
		await Promise.resolve();
		expect(container.querySelector('style')?.sheet?.cssRules[0].cssText).toContain('color: red');
	});

	it('keeps hook-bearing TSRX branches stable across renders', async () => {
		render(<ConditionalHook visible={true} />, container);

		expect(container.innerHTML).toBe('<span class="conditional">visible</span>');
		render(<ConditionalHook visible={false} />, container);
		render(<ConditionalHook visible={true} />, container);
		await Promise.resolve();
		expect(container.innerHTML).toBe('<span class="conditional">visible</span>');
	});

	it('uses Hono use and Suspense for @pending', async () => {
		render(<SuspendedApp />, container);

		expect(container.innerHTML).toBe('<p class="pending">Loading</p>');
		resolveValue('ready');
		await Promise.resolve();
		await Promise.resolve();
		expect(container.innerHTML).toBe('<span class="resolved">ready</span>');
	});

	it('renders @catch through Hono DOM ErrorBoundary', () => {
		render(<BoundaryApp />, container);

		expect(container.innerHTML).toBe('<p class="error">boom</p>');
	});

	for (const [label, App, selector] of [
		['', NullishSpreadRefApp, '.nullish-spread-ref'],
		[' inside @if', NullishSpreadRefInIfApp, '.nullish-spread-ref-if'],
	] as const) {
		it(`spreads a nullish props bag beside an explicit ref${label}`, () => {
			for (const bag of [undefined, null]) {
				nullish_spread_ref_nodes.length = 0;
				render(<App bag={bag} />, container);

				const input = container.querySelector(selector);
				expect(input).toBeInstanceOf(HTMLInputElement);
				expect(nullish_spread_ref_nodes).toEqual([input]);
				render(null, container);
			}
		});
	}

	for (const [directive, App, reverse] of [
		['@if', ForKeyedIfApp, '.reverse-keyed-if'],
		['@switch', ForKeyedSwitchApp, '.reverse-keyed-switch'],
	] as const) {
		it(`keeps row state with its item when a keyed loop renders through ${directive}`, async () => {
			const rows = () => Array.from(
				container.querySelectorAll('.keyed-branch-row'),
				(row) => row.textContent,
			);

			render(<App />, container);
			expect(rows()).toEqual(['a:a', 'b:b']);

			(container.querySelector(reverse) as HTMLButtonElement).click();
			await Promise.resolve();
			expect(rows()).toEqual(['b:b', 'a:a']);
		});
	}
});
