import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { use, useState } from 'hono/jsx';
import { createContext, render, useContext } from 'hono/jsx/dom';
import { Style, css } from 'hono/css';

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
});
