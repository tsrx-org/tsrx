import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { use, useState } from 'hono/jsx';
import { createContext, render, useContext } from 'hono/jsx/dom';
import { Style, css } from 'hono/css';
import {
	NullishSpreadRefApp,
	NullishSpreadRefInIfApp,
	nullish_spread_ref_nodes,
} from '@tsrx/core/test-harness/runtime/nullish-spread-ref-components.tsrx';
import {
	NestedSpreadRefOrderApp,
	RefBeforeAttributeApp,
	RefBeforeSpreadApp,
	SpreadClearsRefApp,
	SpreadGetterApp,
	SpreadGetterOwnRefApp,
	SpreadGetterRefApp,
	SpreadRefOrderApp,
	SpreadsRefOrderApp,
	spread_ref_order_nodes,
} from '@tsrx/core/test-harness/runtime/spread-ref-order-components.tsrx';
import {
	CallbackSpreadRefApp,
	DeclaratorSpreadRefApp,
	SpreadArgumentSpreadRefApp,
	TemplateCallbackSpreadRefApp,
	TernarySpreadRefApp,
	expression_spread_ref_nodes,
} from '@tsrx/core/test-harness/runtime/expression-spread-ref-components.tsrx';
import {
	GeneratorSpreadRefApp,
	generator_spread_ref_nodes,
} from '@tsrx/core/test-harness/runtime/generator-spread-ref-components.tsrx';
import {
	JsxTextCharactersApp,
	JsxTextWhitespaceApp,
	jsx_text_braced_value_cases,
	jsx_text_character_cases,
	jsx_text_nbsp_cases,
	jsx_text_whitespace_cases,
} from '@tsrx/core/test-harness/runtime/jsx-text-whitespace-components.tsrx';
import {
	ScriptBodyApp,
	ScriptBracesApp,
	script_body_cases,
} from '@tsrx/core/test-harness/runtime/script-body-components.tsrx';

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

	<button class="count" onClick={() => setCount((current) => current + 1)}>
		{count}
	</button>
}

function ConditionalLabel() @{
	const [label] = useState('visible');

	<span class="conditional">{label}</span>
}

function ConditionalHook({ visible }: { visible: boolean }) @{
	@if (visible) {
		<ConditionalLabel />
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
		<button class="reverse-keyed-if" onClick={() => setItems([...items].reverse())}>
			{'reverse'}
		</button>
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
		<button class="reverse-keyed-switch" onClick={() => setItems([...items].reverse())}>
			{'reverse'}
		</button>
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
		<div
			class={css`
				color: red;
			`}
		>
			{'styled'}
		</div>
	</div>
}

const spread_ref_render_log: string[] = [];

function log_spread_ref(name: string) {
	return (node: HTMLInputElement | null) => {
		spread_ref_render_log.push(`${name}:${node ? 'attach' : 'detach'}`);
	};
}

const own_before_ref = log_spread_ref('own-before');
const own_after_ref = log_spread_ref('own-after');
const own_beside_ref = log_spread_ref('own-beside');
const bag_beside_ref = log_spread_ref('bag-beside');
const swap_first_ref = log_spread_ref('swap-first');
const swap_second_ref = log_spread_ref('swap-second');
const plain_bag = { title: 'bag' };
const ref_bag = { title: 'bag', ref: bag_beside_ref };

function SpreadRefRenderApp() @{
	const [count, setCount] = useState(0);
	const [swapped, setSwapped] = useState(false);

	<>
		<input class="own-before" ref={own_before_ref} {...plain_bag} />
		<input class="own-after" {...plain_bag} ref={own_after_ref} />
		<input class="own-beside" ref={own_beside_ref} data-count={count} {...ref_bag} />
		<input
			class="swap"
			ref={swapped ? swap_second_ref : swap_first_ref}
			{...{ 'data-count': count }}
		/>
		<button class="spread-ref-rerender" onClick={() => setCount(count + 1)}>
			{count}
		</button>
		<button class="spread-ref-swap" onClick={() => setSwapped(true)}>
			{'swap'}
		</button>
	</>
}

let conditional_spread_and_node: HTMLInputElement | null = null;
let conditional_spread_null_node: HTMLInputElement | null = null;

function ConditionalSpreadApp(props: { enabled: boolean }) @{
	<>
		<input class="conditional-spread" {...(props.enabled && { disabled: true })} />
		<input
			class="conditional-spread"
			ref={(node: HTMLInputElement | null) => {
				conditional_spread_and_node = node;
			}}
			{...(props.enabled && { disabled: true })}
		/>
		<input
			class="conditional-spread"
			ref={(node: HTMLInputElement | null) => {
				conditional_spread_null_node = node;
			}}
			{...(props.enabled ? { disabled: true } : null)}
		/>
	</>
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

	it('keeps a hook component in a TSRX branch stable across renders', async () => {
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

	// oxc, which compiles the target's JSX, trims a non-breaking space at the
	// edge of a line, like TypeScript
	for (const [label, selector, html] of [
		...jsx_text_whitespace_cases,
		...jsx_text_nbsp_cases.map(
			([label, selector, , trimmed]) => [label, selector, trimmed] as const,
		),
	]) {
		it(`renders ${label} like TSX`, () => {
			render(<JsxTextWhitespaceApp />, container);

			expect(container.querySelector(selector)?.innerHTML).toBe(html);
		});
	}

	for (const [label, selector, braced] of jsx_text_braced_value_cases) {
		it(`renders ${label} like the same markup in a braced value`, () => {
			render(<JsxTextWhitespaceApp />, container);

			const html = container.querySelector(selector)?.innerHTML;
			expect(html).toBeTypeOf('string');
			expect(html).toBe(container.querySelector(braced)?.innerHTML);
		});
	}

	for (const [label, selector, text] of jsx_text_character_cases) {
		it(`renders ${label} like TSX`, () => {
			render(<JsxTextCharactersApp />, container);

			expect(container.querySelector(selector)?.textContent).toBe(text);
		});
	}

	// A raw-text `<script>` body renders as written (#708).
	for (const [label, selector, text] of script_body_cases) {
		it(`renders a script with ${label} as written`, () => {
			render(selector === '.script-braces' ? <ScriptBracesApp /> : <ScriptBodyApp />, container);

			const script = container.querySelector(`${selector} > script`);
			expect(script?.textContent).toBe(text);
			expect(script?.childNodes.length).toBe(1);
		});
	}

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

	for (const [label, App, selector, refCalls] of [
		['a spread between attributes', SpreadRefOrderApp, '.spread-ref-order', 1],
		['a spread on a nested element', NestedSpreadRefOrderApp, '.nested-spread-ref-order', 1],
		['two spreads, one carrying a ref', SpreadsRefOrderApp, '.spreads-ref-order', 2],
	] as const) {
		it(`keeps authored attribute order beside a ref: ${label}`, () => {
			spread_ref_order_nodes.length = 0;
			render(<App />, container);

			const element = container.querySelector(selector);
			const values = ['data-first', 'data-second', 'data-third'].map(
				(name) => element?.closest(`[${name}]`)?.getAttribute(name) ?? null,
			);
			expect(values).toEqual(['1', '2', '3']);
			expect(spread_ref_order_nodes).toEqual(Array(refCalls).fill(element));
		});
	}

	for (const [label, App, selector, refCalls] of [
		['without a ref', SpreadGetterApp, '.spread-getter', 0],
		['beside a ref', SpreadGetterRefApp, '.spread-getter-ref', 1],
		['whose bag carries a ref', SpreadGetterOwnRefApp, '.spread-getter-own-ref', 1],
	] as const) {
		it(`reads a spread getter once ${label}`, () => {
			spread_ref_order_nodes.length = 0;
			render(<App />, container);

			const element = container.querySelector(selector);
			expect(element?.getAttribute('title')).toBe('1');
			expect(element?.getAttribute('data-reads')).toBe('1');
			expect(spread_ref_order_nodes).toEqual(Array(refCalls).fill(element));
		});
	}

	it("lets a later spread's `ref: undefined` clear an earlier spread's ref", () => {
		spread_ref_order_nodes.length = 0;
		render(<SpreadClearsRefApp />, container);

		expect(container.querySelector('.spread-clears-ref')).not.toBeNull();
		expect(spread_ref_order_nodes).toEqual([]);
	});

	for (const [label, App, selector, refCalls] of [
		['a spread', RefBeforeSpreadApp, '.ref-before-spread', 2],
		['a later attribute', RefBeforeAttributeApp, '.ref-before-attribute', 1],
	] as const) {
		it(`evaluates a ref before ${label} in authored order`, () => {
			spread_ref_order_nodes.length = 0;
			render(<App />, container);

			const element = container.querySelector(selector);
			expect(element?.getAttribute('data-ready')).toBe('true');
			expect(spread_ref_order_nodes).toEqual(Array(refCalls).fill(element));
		});
	}

	it('applies refs beside a host spread again only when a ref changes', async () => {
		async function click(selector: string) {
			(container.querySelector(selector) as HTMLButtonElement).click();
			await Promise.resolve();
		}

		spread_ref_render_log.length = 0;
		render(<SpreadRefRenderApp />, container);
		expect(spread_ref_render_log).toEqual([
			'own-before:attach',
			'own-after:attach',
			'own-beside:attach',
			'bag-beside:attach',
			'swap-first:attach',
		]);

		spread_ref_render_log.length = 0;
		await click('.spread-ref-rerender');
		await click('.spread-ref-rerender');
		expect(container.querySelector('.spread-ref-rerender')?.textContent).toBe('2');
		expect(container.querySelector('.own-beside')?.getAttribute('data-count')).toBe('2');
		expect(spread_ref_render_log).toEqual([]);

		await click('.spread-ref-swap');
		expect(spread_ref_render_log).toEqual(['swap-first:detach', 'swap-second:attach']);
	});

	const spread_bag = { id: 'first', title: 'First' };
	const spread_bags = [spread_bag, { id: 'second', title: 'Second' }];
	for (const [label, app, selector, rendered] of [
		[
			'a ternary arm',
			() => <TernarySpreadRefApp enabled bag={spread_bag} />,
			'.expression-spread-ref-ternary',
			[spread_bag],
		],
		[
			'a declarator init',
			() => <DeclaratorSpreadRefApp bag={spread_bag} />,
			'.expression-spread-ref-declarator',
			[spread_bag],
		],
		[
			'a callback in a plain function',
			() => <CallbackSpreadRefApp bags={spread_bags} />,
			'.expression-spread-ref-callback',
			spread_bags,
		],
		[
			'a callback in a native template',
			() => <TemplateCallbackSpreadRefApp bags={spread_bags} />,
			'.expression-spread-ref-template-callback',
			spread_bags,
		],
		[
			'a callback in a spread argument',
			() => <SpreadArgumentSpreadRefApp bags={spread_bags} />,
			'.expression-spread-ref-spread-argument',
			spread_bags,
		],
	] as const) {
		it(`spreads the bag and attaches the ref in expression position: ${label}`, () => {
			expression_spread_ref_nodes.length = 0;
			render(app(), container);

			const elements = Array.from(container.querySelectorAll(selector));
			expect(elements.map((element) => [element.id, element.getAttribute('title')])).toEqual(
				rendered.map((item) => [item.id, item.title]),
			);
			expect(expression_spread_ref_nodes).toEqual(elements);
		});
	}

	it('spreads the bag and attaches the ref in a generator that yields', () => {
		generator_spread_ref_nodes.length = 0;
		render(<GeneratorSpreadRefApp enabled bag={spread_bag} />, container);

		const elements = Array.from(container.querySelectorAll('.generator-spread-ref'));
		expect(elements.map((element) => [element.id, element.getAttribute('title')])).toEqual([
			[spread_bag.id, `${spread_bag.title} (resumed)`],
		]);
		expect(generator_spread_ref_nodes).toEqual(elements);
	});

	for (const [directive, App, reverse] of [
		['@if', ForKeyedIfApp, '.reverse-keyed-if'],
		['@switch', ForKeyedSwitchApp, '.reverse-keyed-switch'],
	] as const) {
		it(`keeps row state with its item when a keyed loop renders through ${directive}`, async () => {
			const rows = () =>
				Array.from(container.querySelectorAll('.keyed-branch-row'), (row) => row.textContent);

			render(<App />, container);
			expect(rows()).toEqual(['a:a', 'b:b']);

			(container.querySelector(reverse) as HTMLButtonElement).click();
			await Promise.resolve();
			expect(rows()).toEqual(['b:b', 'a:a']);
		});
	}

	for (const enabled of [false, true]) {
		it(`renders conditional host spreads when the condition is ${enabled}`, () => {
			conditional_spread_and_node = null;
			conditional_spread_null_node = null;
			render(<ConditionalSpreadApp enabled={enabled} />, container);
			const inputs = Array.from(
				container.querySelectorAll('.conditional-spread'),
			) as HTMLInputElement[];
			expect(inputs.map((input) => input.disabled)).toEqual([enabled, enabled, enabled]);
			expect(conditional_spread_and_node).toBe(inputs[1]);
			expect(conditional_spread_null_node).toBe(inputs[2]);
		});
	}
});
