import { lazy } from 'preact/compat';
import { act } from 'preact/test-utils';
import { createContext } from 'preact';
import { useContext, useState } from 'preact/hooks';
import { mergeRefs } from '@tsrx/preact/ref';
import { runSwitchFallthroughRuntimeTests } from '@tsrx/core/test-harness/runtime/switch-fallthrough';
import { runForOfSourcesRuntimeTests } from '@tsrx/core/test-harness/runtime/for-of-sources';
import { runTsxExpressionTsrxRuntimeTests } from '@tsrx/core/test-harness/runtime/tsx-expression-tsrx';
import { runJsxTextWhitespaceRuntimeTests } from '@tsrx/core/test-harness/runtime/jsx-text-whitespace';
import { runScriptBodyRuntimeTests } from '@tsrx/core/test-harness/runtime/script-body';
import { runNullishSpreadRefRuntimeTests } from '@tsrx/core/test-harness/runtime/nullish-spread-ref';
import { runExpressionSpreadRefRuntimeTests } from '@tsrx/core/test-harness/runtime/expression-spread-ref';
import { runGeneratorSpreadRefRuntimeTests } from '@tsrx/core/test-harness/runtime/generator-spread-ref';
import { runSpreadRefOrderRuntimeTests } from '@tsrx/core/test-harness/runtime/spread-ref-order';
import { runGeneratedImportBindingsRuntimeTests } from '@tsrx/core/test-harness/runtime/generated-import-bindings';

function text(selector: string): string | null {
	return container.querySelector(selector)?.textContent ?? null;
}

function ResolvedChild(props: { value: string }) {
	return <p class="resolved">{props.value}</p>;
}

function DynamicElementApp() @{
	const tag = 'section';
	<{tag} class="dynamic-host">{'dynamic element'}</{tag}>
}

function DynamicChild(props: { label: string }) @{
	<span class="dynamic-child">{props.label}</span>
}

function DynamicComponentApp() @{
	const component = DynamicChild;
	<{component} label="dynamic component" />
}

function DynamicSwitchApp() @{
	const [tag, setTag] = useState<'section' | 'article'>('section');
	<>
		<{tag} class="dynamic-switch">{tag}</{tag}>
		<button
			class="dynamic-switch-toggle"
			onClick={() => setTag(tag === 'section' ? 'article' : 'section')}
		>
			{'toggle'}
		</button>
	</>
}

function ExplicitHtmlApp() @{
	const [markup, setMarkup] = useState('<span class="html-node">safe enough</span>');
	<>
		<div class="explicit-html-child" dangerouslySetInnerHTML={{ __html: markup }} />
		<button
			class="explicit-html-update"
			onClick={() => {
				setMarkup('<strong class="html-node">updated</strong>');
			}}
		>
			{'update'}
		</button>
	</>
}

function SpreadHtmlApp() @{
	const [spreadProps, setSpreadProps] = useState({
		dangerouslySetInnerHTML: { __html: '<em class="html-node">spread</em>' },
	});
	const [markup, setMarkup] = useState('<span class="html-node">safe enough</span>');
	<>
		<div class="spread-html-child" {...spreadProps} dangerouslySetInnerHTML={{ __html: markup }} />
		<button
			class="spread-html-update-spread"
			onClick={() => {
				setSpreadProps({
					dangerouslySetInnerHTML: { __html: '<i class="html-node">spread update</i>' },
				});
			}}
		>
			{'spread'}
		</button>
		<button
			class="spread-html-update-markup"
			onClick={() => {
				setMarkup('<strong class="html-node">updated</strong>');
			}}
		>
			{'markup'}
		</button>
	</>
}

function EmptyPendingSuspenseApp(props: {
	loader: () => Promise<{ default: typeof ResolvedChild }>;
}) @{
	const LazyChild = lazy(props.loader);
	@try {
		<LazyChild value="hello" />
	} @pending {
	}
}

// ── Setup statements inside the try body ──

type Resource = { value?: string; promise: Promise<void> };

function read(resource: Resource) {
	if (resource.value === undefined) throw resource.promise;
	return resource.value;
}

function InlineSuspendApp(props: { resource: Resource }) @{
	@try {
		const data = read(props.resource);
		<p class="resolved">{data}</p>
	} @pending {
		<p class="pending">{'loading...'}</p>
	}
}

function loadOrThrow(fail: boolean) {
	if (fail) throw new Error('body boom');
	return 'loaded';
}

function BodyThrowApp() @{
	const [fail, setFail] = useState(true);

	@try {
		const result = loadOrThrow(fail);
		<p class="ok">{result}</p>
	} @catch (err, reset: () => void) {
		<button
			class="reset"
			onClick={() => {
				setFail(false);
				reset();
			}}
		>
			{(err as Error).message}
		</button>
	}
}

function DifferentHookCountArmsApp() @{
	const [first, setFirst] = useState(true);

	<>
		<button class="flip" onClick={() => setFirst(!first)}>
			{'flip'}
		</button>
		@if (first) {
			@try {
				const [label] = useState('A');
				<p class="arm">{label}</p>
			} @catch (err) {
				<p class="caught">{(err as Error).message}</p>
			}
		} @else {
			@try {
				const [label] = useState('B');
				const [suffix] = useState('!');
				<p class="arm">{label + suffix}</p>
			} @catch (err) {
				<p class="caught">{(err as Error).message}</p>
			}
		}
	</>
}

// ── The @pending body runs only while the try body suspends ──

let pendingBodyRuns = 0;

function pendingLabel(): string {
	pendingBodyRuns++;
	return 'loading';
}

function pendingBoom(): string {
	pendingBodyRuns++;
	throw new Error('pending boom');
}

function PendingSuspender(props: { resource: Resource }) @{
	const value = read(props.resource);
	<p class="resolved">{value}</p>
}

function PendingNotSuspendedApp() @{
	const [count, setCount] = useState(0);

	<>
		<button class="bump" onClick={() => setCount(count + 1)}>
			{'bump'}
		</button>
		@try {
			<p class="ready">{'ready ' + count}</p>
		} @pending {
			const label = pendingLabel();
			<p class="pending">{label}</p>
		}
	</>
}

function PendingSuspendedApp(props: { resource: Resource }) @{
	@try {
		<PendingSuspender resource={props.resource} />
	} @pending {
		const label = pendingLabel();
		<p class="pending">{label}</p>
	}
}

function ThrowingPendingNotSuspendedApp() @{
	@try {
		<p class="ready">{'ready'}</p>
	} @pending {
		const label = pendingBoom();
		<p class="pending">{label}</p>
	} @catch (err) {
		<p class="caught">{(err as Error).message}</p>
	}
}

function ThrowingPendingApp(props: { resource: Resource }) @{
	@try {
		<PendingSuspender resource={props.resource} />
	} @pending {
		const label = pendingBoom();
		<p class="pending">{label}</p>
	} @catch (err) {
		<p class="caught">{(err as Error).message}</p>
	}
}

function ThrowingPendingOuterCatchApp(props: { resource: Resource }) @{
	@try {
		<div class="outer">
			@try {
				<PendingSuspender resource={props.resource} />
			} @pending {
				const label = pendingBoom();
				<p class="pending">{label}</p>
			}
		</div>
	} @catch (err) {
		<p class="outer-caught">{(err as Error).message}</p>
	}
}

let pendingStateInits = 0;

function PendingHookApp(props: { resources: Resource[] }) @{
	const [step, setStep] = useState(0);

	<>
		<button class="next" onClick={() => setStep(step + 1)}>
			{'next'}
		</button>
		@try {
			@if (step === 0) {
				<p class="ready">{'ready'}</p>
			} @else {
				<PendingSuspender resource={props.resources[step - 1]} />
			}
		} @pending {
			const [label] = useState(() => {
				pendingStateInits++;
				return 'waiting ' + pendingStateInits;
			});
			<p class="pending">{label}</p>
		}
	</>
}

function deferred_resource(): { resource: Resource; resolve: (value: string) => void } {
	let resolve_promise: () => void;
	const resource: Resource = {
		promise: new Promise<void>((resolve) => {
			resolve_promise = resolve;
		}),
	};
	return {
		resource,
		resolve(value) {
			resource.value = value;
			resolve_promise();
		},
	};
}

const PendingThemeContext = createContext('light');

function PendingContextApp(props: { resource: Resource }) @{
	<PendingThemeContext.Provider value="dark">
		@try {
			<PendingSuspender resource={props.resource} />
		} @pending {
			const theme = useContext(PendingThemeContext);
			<p class="pending">{theme}</p>
		}
	</PendingThemeContext.Provider>
}

function PendingParentStateApp(props: { resource: Resource }) @{
	const [count, setCount] = useState(0);

	<>
		<button class="bump" onClick={() => setCount(count + 1)}>
			{'bump'}
		</button>
		@try {
			<PendingSuspender resource={props.resource} />
		} @pending {
			const label = 'waiting ' + count;
			<p class="pending">{label}</p>
		}
	</>
}

function StaticPendingApp(props: { resource: Resource }) @{
	@try {
		<PendingSuspender resource={props.resource} />
	} @pending {
		<p class="pending">{'static loading'}</p>
	}
}

function PendingRowsApp(props: { rows: { id: string; resource: Resource }[] }) @{
	<div class="rows">
		@for (const row of props.rows; key row.id) {
			@try {
				<PendingSuspender resource={row.resource} />
			} @pending {
				const label = 'loading ' + row.id;
				<p class="pending">{label}</p>
			}
		}
	</div>
}

let pendingLabelReads = 0;

function SuspendingPendingApp(props: { body: Resource; label: Resource }) @{
	@try {
		<div class="outer">
			@try {
				<PendingSuspender resource={props.body} />
			} @pending {
				pendingLabelReads++;
				const label = read(props.label);
				<p class="inner-pending">{label}</p>
			}
		</div>
	} @pending {
		<p class="outer-pending">{'outer loading'}</p>
	}
}

function ForFilteredApp() @{
	const items = ['a', '', 'c'];
	const visibleItems = items.filter(Boolean);
	@for (const item of visibleItems) {
		<li class="continue-item" key={item}>
			{item}
		</li>
	}
}

function ForOverSetApp() @{
	const items = new Set<string>(['x', 'y', 'z']);
	@for (const item of items) {
		<li class="set-item" key={item}>
			{item}
		</li>
	}
}

function ForOverMapApp() @{
	const entries = new Map<string, number>([
		['a', 1],
		['b', 2],
		['c', 3],
	]);
	@for (const [key, value] of entries) {
		<li class="map-item" {key}>
			{key + ':' + value}
		</li>
	}
}

function ForOverCustomIterableApp() @{
	function* iter() {
		yield 'one';
		yield 'two';
		yield 'three';
	}
	const items = iter();
	@for (const item of items) {
		<li class="generator-item" key={item}>
			{item}
		</li>
	}
}

let named_direct_node: HTMLInputElement | null = null;
let named_direct_native_node: HTMLInputElement | null = null;
let named_direct_anonymous_node: HTMLInputElement | null = null;

function NamedDirectRefApp() @{
	function nativeRef(node: HTMLInputElement | null) {
		named_direct_native_node = node;
	}
	function anonymousRef(node: HTMLInputElement | null) {
		named_direct_anonymous_node = node;
	}
	<input
		ref={mergeRefs(nativeRef, anonymousRef, (node: HTMLInputElement | null) => {
			named_direct_node = node;
		})}
		class="named-direct-ref"
		type="text"
	/>
}

let named_forward_node: HTMLInputElement | null = null;

function NamedForwardInput(props: { type: string; input_ref?: any }) {
	return <input type={props.type} ref={props.input_ref} class="named-forward-ref" />;
}

function NamedForwardRefApp() @{
	<NamedForwardInput
		type="text"
		input_ref={(node: HTMLInputElement | null) => {
			named_forward_node = node;
		}}
	/>
}

let named_spread_before_node: HTMLInputElement | null = null;
let named_spread_before_native_node: HTMLInputElement | null = null;

function namedSpreadBeforeNativeRef(node: HTMLInputElement | null) {
	named_spread_before_native_node = node;
}

function NamedSpreadBeforeRefInput({ input_ref, ...props }: { type: string; input_ref?: any }) @{
	<input
		{...props}
		ref={mergeRefs(input_ref, namedSpreadBeforeNativeRef)}
		class="named-spread-before-ref"
	/>
}

function NamedSpreadBeforeRefApp() @{
	<NamedSpreadBeforeRefInput
		type="text"
		input_ref={(node: HTMLInputElement | null) => {
			named_spread_before_node = node;
		}}
	/>
}

let named_spread_after_node: HTMLInputElement | null = null;
let named_spread_after_native_node: HTMLInputElement | null = null;

function namedSpreadAfterNativeRef(node: HTMLInputElement | null) {
	named_spread_after_native_node = node;
}

function NamedSpreadAfterRefInput({ input_ref, ...props }: { type: string; input_ref?: any }) @{
	<input
		ref={mergeRefs(namedSpreadAfterNativeRef, input_ref)}
		{...props}
		class="named-spread-after-ref"
	/>
}

function NamedSpreadAfterRefApp() @{
	<NamedSpreadAfterRefInput
		type="text"
		input_ref={(node: HTMLInputElement | null) => {
			named_spread_after_node = node;
		}}
	/>
}

let multi_spread_first_node: HTMLInputElement | null = null;
let multi_spread_second_node: HTMLInputElement | null = null;
let multi_spread_native_node: HTMLInputElement | null = null;
let multi_spread_native_calls = 0;

function multiSpreadExplicitNativeRef(node: HTMLInputElement | null) {
	if (node) {
		multi_spread_native_calls += 1;
	}
	multi_spread_native_node = node;
}

function MultiSpreadExplicitRefInput(props: { type: string; first_ref?: any; second_ref?: any }) @{
	const first = { type: props.type, ref: props.first_ref };
	const second = { ref: props.second_ref };
	<input
		{...first}
		{...second}
		ref={multiSpreadExplicitNativeRef}
		class="multi-spread-explicit-ref"
	/>
}

function MultiSpreadExplicitRefApp() @{
	<MultiSpreadExplicitRefInput
		type="text"
		first_ref={(node: HTMLInputElement | null) => {
			multi_spread_first_node = node;
		}}
		second_ref={(node: HTMLInputElement | null) => {
			multi_spread_second_node = node;
		}}
	/>
}

// ── Elements that merge the same refs ──

const shared_ref_log: string[] = [];

function shared_cleanup_ref(node: HTMLParagraphElement | null) {
	const name = node?.className;
	shared_ref_log.push(`own:${name}`);
	return () => {
		shared_ref_log.push(`own-cleanup:${name}`);
	};
}

const shared_ref_bag = {
	ref: (node: HTMLParagraphElement | null) => {
		shared_ref_log.push(`bag:${node ? node.className : 'null'}`);
	},
};

function SharedRefToggle() @{
	const [shown, setShown] = useState(true);

	<>
		@if (shown) {
			<p class="shared-ref-b" ref={shared_cleanup_ref} {...shared_ref_bag} />
		}
		<button class="shared-ref-hide" onClick={() => setShown(false)}>
			{'hide'}
		</button>
	</>
}

function SharedRefApp() @{
	<>
		<p class="shared-ref-a" ref={shared_cleanup_ref} {...shared_ref_bag} />
		<SharedRefToggle />
	</>
}

// ── Conditional host spreads ──

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

const named_ref_object: { current: HTMLInputElement | null } = { current: null };

function NamedRefObjectApp() {
	return <NamedForwardInput type="text" input_ref={named_ref_object} />;
}

function TsrxExpressionHookPanel(props: { active: boolean; label: string }) @{
	const [count, setCount] = useState(0);

	if (!props.active) return null;

	<button class="tsrx-expression-hook-count" onClick={() => setCount(count + 1)}>
		{props.label + ':' + count}
	</button>
}

function TsrxExpressionHookApp() @{
	const [active, setActive] = useState(false);
	const [label, setLabel] = useState('first');
	<>
		<button class="tsrx-expression-hook-toggle" onClick={() => setActive(!active)}>
			{active ? 'hide' : 'show'}
		</button>
		<button class="tsrx-expression-hook-label" onClick={() => setLabel('second')}>
			{'label'}
		</button>
		<TsrxExpressionHookPanel {active} {label} />
	</>
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

describe('@tsrx/vite-plugin-preact runtime', () => {
	it('renders nothing for an empty pending fallback then resolves', async () => {
		let resolve_fn: (mod: { default: typeof ResolvedChild }) => void;
		const loader = () =>
			new Promise<{ default: typeof ResolvedChild }>((r) => {
				resolve_fn = r;
			});

		await render(EmptyPendingSuspenseApp, { loader });
		expect(container.innerHTML).toBe('');
		expect(container.querySelector('.resolved')).toBeNull();

		await act(async () => {
			resolve_fn!({ default: ResolvedChild });
		});
		expect(container.querySelector('.resolved')?.textContent).toBe('hello');
	});

	it('shows pending fallback for a try body setup statement that suspends', async () => {
		let resolve_fn: () => void;
		const resource: Resource = {
			promise: new Promise<void>((r) => {
				resolve_fn = r;
			}),
		};

		await render(InlineSuspendApp, { resource });
		expect(text('.pending')).toBe('loading...');

		await act(async () => {
			resource.value = 'inline';
			resolve_fn!();
		});
		expect(text('.resolved')).toBe('inline');
		expect(container.querySelector('.pending')).toBeNull();
	});

	it('catches a synchronous throw from a try body setup statement', async () => {
		await render(BodyThrowApp);
		expect(text('.reset')).toBe('body boom');

		await act(async () => {
			(container.querySelector('.reset') as HTMLButtonElement).click();
		});
		expect(text('.ok')).toBe('loaded');
		expect(container.querySelector('.reset')).toBeNull();
	});

	it('gives each try site in an if/else its own body state', async () => {
		await render(DifferentHookCountArmsApp);
		expect(text('.arm')).toBe('A');

		await act(async () => {
			(container.querySelector('.flip') as HTMLButtonElement).click();
		});
		expect(text('.arm')).toBe('B!');
		expect(container.querySelector('.caught')).toBeNull();
	});

	// ── The @pending body runs only while the try body suspends ──

	it('does not run the pending body when nothing suspends', async () => {
		pendingBodyRuns = 0;
		await render(PendingNotSuspendedApp);
		expect(text('.ready')).toBe('ready 0');
		expect(pendingBodyRuns).toBe(0);

		await act(async () => {
			(container.querySelector('.bump') as HTMLButtonElement).click();
		});
		expect(text('.ready')).toBe('ready 1');
		expect(pendingBodyRuns).toBe(0);
	});

	it('runs the pending body while the try body suspends', async () => {
		pendingBodyRuns = 0;
		const { resource, resolve } = deferred_resource();

		await render(PendingSuspendedApp, { resource });
		expect(text('.pending')).toBe('loading');
		expect(pendingBodyRuns).toBeGreaterThan(0);

		await act(async () => {
			resolve('hello');
		});
		expect(text('.resolved')).toBe('hello');
		expect(container.querySelector('.pending')).toBeNull();
	});

	it('does not throw from a pending body when nothing suspends', async () => {
		pendingBodyRuns = 0;
		await render(ThrowingPendingNotSuspendedApp);
		expect(text('.ready')).toBe('ready');
		expect(container.querySelector('.caught')).toBeNull();
		expect(pendingBodyRuns).toBe(0);
	});

	it('catches a throw from the pending body in the same try', async () => {
		await render(ThrowingPendingApp, { resource: deferred_resource().resource });
		expect(text('.caught')).toBe('pending boom');
		expect(container.querySelector('.pending')).toBeNull();
	});

	it('catches a throw from the pending body in an enclosing try', async () => {
		await render(ThrowingPendingOuterCatchApp, { resource: deferred_resource().resource });
		expect(text('.outer-caught')).toBe('pending boom');
		expect(container.querySelector('.outer')).toBeNull();
	});

	it('gives hooks in the pending body to the fallback, which each suspension mounts fresh', async () => {
		pendingStateInits = 0;
		const first = deferred_resource();
		const resources = [first.resource, deferred_resource().resource];

		await render(PendingHookApp, { resources });
		expect(text('.ready')).toBe('ready');
		expect(pendingStateInits).toBe(0);

		await act(async () => {
			(container.querySelector('.next') as HTMLButtonElement).click();
		});
		expect(text('.pending')).toBe('waiting 1');

		await act(async () => {
			first.resolve('first');
		});
		expect(text('.resolved')).toBe('first');
		expect(container.querySelector('.pending')).toBeNull();

		await act(async () => {
			(container.querySelector('.next') as HTMLButtonElement).click();
		});
		expect(text('.pending')).toBe('waiting 2');
	});

	it('reads context the same component provides around the try in the pending body', async () => {
		await render(PendingContextApp, { resource: deferred_resource().resource });
		expect(text('.pending')).toBe('dark');
	});

	it("re-renders the pending body with the parent's current state", async () => {
		await render(PendingParentStateApp, { resource: deferred_resource().resource });
		expect(text('.pending')).toBe('waiting 0');

		await act(async () => {
			(container.querySelector('.bump') as HTMLButtonElement).click();
		});
		expect(text('.pending')).toBe('waiting 1');
	});

	it('shows a static pending body while the try body suspends', async () => {
		const { resource, resolve } = deferred_resource();
		await render(StaticPendingApp, { resource });
		expect(text('.pending')).toBe('static loading');

		await act(async () => {
			resolve('hello');
		});
		expect(text('.resolved')).toBe('hello');
		expect(container.querySelector('.pending')).toBeNull();
	});

	it('shows each row its own pending body in a keyed loop', async () => {
		const a = deferred_resource();
		const b = deferred_resource();
		await render(PendingRowsApp, {
			rows: [
				{ id: 'a', resource: a.resource },
				{ id: 'b', resource: b.resource },
			],
		});
		expect(container.querySelector('.rows')?.textContent).toBe('loading aloading b');

		await act(async () => {
			b.resolve('b done');
		});
		expect(container.querySelector('.rows')?.textContent).toBe('loading ab done');

		await act(async () => {
			a.resolve('a done');
		});
		expect(container.querySelector('.rows')?.textContent).toBe('a doneb done');
	});

	// Preact limitation: preact/compat's Suspense counts a suspension thrown by
	// its own fallback as one more child suspension, so it renders nothing
	// until the try body resolves. React shows the enclosing @pending instead.
	it('renders nothing while a pending body suspends, then the content', async () => {
		pendingLabelReads = 0;
		const body = deferred_resource();
		const label = deferred_resource();
		await render(SuspendingPendingApp, { body: body.resource, label: label.resource });
		// The pending body ran and suspended; the empty output is not a missing fallback.
		expect(pendingLabelReads).toBeGreaterThan(0);
		expect(container.innerHTML).toBe('<div class="outer"></div>');

		await act(async () => {
			label.resolve('inner loading');
		});
		expect(container.innerHTML).toBe('<div class="outer"></div>');

		await act(async () => {
			body.resolve('done');
		});
		expect(container.innerHTML).toBe('<div class="outer"><p class="resolved">done</p></div>');
	});

	it('renders dynamic host elements', async () => {
		await render(DynamicElementApp);
		const element = container.querySelector('.dynamic-host');
		expect(element?.tagName).toBe('SECTION');
		expect(element?.textContent).toBe('dynamic element');
	});

	it('renders dynamic components', async () => {
		await render(DynamicComponentApp);
		expect(text('.dynamic-child')).toBe('dynamic component');
	});

	it('updates when the dynamic is prop changes', async () => {
		await render(DynamicSwitchApp);
		let element = container.querySelector('.dynamic-switch');
		expect(element?.tagName).toBe('SECTION');
		expect(element?.textContent).toBe('section');

		await act(async () => {
			(container.querySelector('.dynamic-switch-toggle') as HTMLButtonElement).click();
		});
		element = container.querySelector('.dynamic-switch');
		expect(element?.tagName).toBe('ARTICLE');
		expect(element?.textContent).toBe('article');
	});

	it('renders explicit html interpolation as html', async () => {
		await render(ExplicitHtmlApp);
		expect(text('.explicit-html-child')).toBe('safe enough');
		expect(container.querySelector('.explicit-html-child .html-node')?.tagName).toBe('SPAN');

		await act(async () => {
			(container.querySelector('.explicit-html-update') as HTMLButtonElement).click();
		});
		expect(text('.explicit-html-child')).toBe('updated');
		expect(container.querySelector('.explicit-html-child .html-node')?.tagName).toBe('STRONG');
	});

	it('lets native runtime resolve spread props before explicit html interpolation', async () => {
		await render(SpreadHtmlApp);
		expect(text('.spread-html-child')).toBe('safe enough');
		expect(container.querySelector('.spread-html-child .html-node')?.tagName).toBe('SPAN');

		await act(async () => {
			(container.querySelector('.spread-html-update-spread') as HTMLButtonElement).click();
		});
		expect(text('.spread-html-child')).toBe('safe enough');
		expect(container.querySelector('.spread-html-child .html-node')?.tagName).toBe('SPAN');

		await act(async () => {
			(container.querySelector('.spread-html-update-markup') as HTMLButtonElement).click();
		});
		expect(text('.spread-html-child')).toBe('updated');
		expect(container.querySelector('.spread-html-child .html-node')?.tagName).toBe('STRONG');
	});

	it('renders filtered for-of items', async () => {
		await render(ForFilteredApp);
		expect(
			Array.from(container.querySelectorAll('.continue-item'), (item) => item.textContent),
		).toEqual(['a', 'c']);
	});

	it('renders for-of over a Set via map_iterable', async () => {
		await render(ForOverSetApp);
		expect(Array.from(container.querySelectorAll('.set-item'), (el) => el.textContent)).toEqual([
			'x',
			'y',
			'z',
		]);
	});

	it('renders for-of over a Map via map_iterable', async () => {
		await render(ForOverMapApp);
		expect(Array.from(container.querySelectorAll('.map-item'), (el) => el.textContent)).toEqual([
			'a:1',
			'b:2',
			'c:3',
		]);
	});

	it('renders for-of over a generator/iterator via map_iterable', async () => {
		await render(ForOverCustomIterableApp);
		expect(
			Array.from(container.querySelectorAll('.generator-item'), (el) => el.textContent),
		).toEqual(['one', 'two', 'three']);
	});

	it('merges explicit callback refs with native refs', async () => {
		named_direct_node = null;
		named_direct_native_node = null;
		named_direct_anonymous_node = null;
		await render(NamedDirectRefApp);
		expect(named_direct_node).toBeInstanceOf(HTMLInputElement);
		expect(named_direct_node).toBe(named_direct_native_node);
		expect(named_direct_node).toBe(named_direct_anonymous_node);
		expect(container.querySelector('.named-direct-ref')!.hasAttribute('input_ref')).toBe(false);
	});

	it('supports explicit forwarding of named ref props into host ref', async () => {
		named_forward_node = null;
		await render(NamedForwardRefApp);
		expect(named_forward_node).toBeInstanceOf(HTMLInputElement);
		expect(named_forward_node!.className).toBe('named-forward-ref');
	});

	it('merges explicitly forwarded ref props with native ref after the spread', async () => {
		named_spread_before_node = null;
		named_spread_before_native_node = null;
		await render(NamedSpreadBeforeRefApp);
		expect(named_spread_before_node).toBeInstanceOf(HTMLInputElement);
		expect(named_spread_before_node).toBe(named_spread_before_native_node);
	});

	it('merges explicitly forwarded ref props with native ref before the spread', async () => {
		named_spread_after_node = null;
		named_spread_after_native_node = null;
		await render(NamedSpreadAfterRefApp);
		expect(named_spread_after_node).toBeInstanceOf(HTMLInputElement);
		expect(named_spread_after_node).toBe(named_spread_after_native_node);
	});

	it('merges ref props from multiple host spreads with one explicit ref', async () => {
		multi_spread_first_node = null;
		multi_spread_second_node = null;
		multi_spread_native_node = null;
		multi_spread_native_calls = 0;
		await render(MultiSpreadExplicitRefApp);
		expect(multi_spread_first_node).toBeInstanceOf(HTMLInputElement);
		expect(multi_spread_first_node).toBe(multi_spread_second_node);
		expect(multi_spread_first_node).toBe(multi_spread_native_node);
		expect(multi_spread_native_calls).toBe(1);
		expect(container.querySelector('.multi-spread-explicit-ref')!.hasAttribute('ref')).toBe(false);
	});

	it("keeps each element's ref cleanup when two elements merge the same refs", async () => {
		shared_ref_log.length = 0;
		await render(SharedRefApp);
		// Mounting the second element runs no cleanup of the first.
		expect(shared_ref_log).toEqual([
			'own:shared-ref-a',
			'bag:shared-ref-a',
			'own:shared-ref-b',
			'bag:shared-ref-b',
		]);

		shared_ref_log.length = 0;
		await act(() => {
			(container.querySelector('.shared-ref-hide') as HTMLButtonElement).click();
		});
		expect(container.querySelector('.shared-ref-b')).toBeNull();
		expect(container.querySelector('.shared-ref-a')).not.toBeNull();
		expect(shared_ref_log).toEqual(['own-cleanup:shared-ref-b', 'bag:null']);
	});

	for (const enabled of [false, true]) {
		it(`renders conditional host spreads when the condition is ${enabled}`, async () => {
			conditional_spread_and_node = null;
			conditional_spread_null_node = null;
			await render(ConditionalSpreadApp, { enabled });
			const inputs = Array.from(
				container.querySelectorAll('.conditional-spread'),
			) as HTMLInputElement[];
			expect(inputs.map((input) => input.disabled)).toEqual([enabled, enabled, enabled]);
			expect(conditional_spread_and_node).toBe(inputs[1]);
			expect(conditional_spread_null_node).toBe(inputs[2]);
		});
	}

	it('assigns named ref props backed by Preact-style ref objects', async () => {
		named_ref_object.current = null;
		await render(NamedRefObjectApp);
		expect(named_ref_object.current).toBeInstanceOf(HTMLInputElement);
		expect(named_ref_object.current!.className).toBe('named-forward-ref');
	});

	it('keeps <> expression hook state stable across regular function rerenders', async () => {
		await render(TsrxExpressionHookApp);
		expect(container.querySelector('.tsrx-expression-hook-count')).toBeNull();

		await act(() => {
			(container.querySelector('.tsrx-expression-hook-toggle') as HTMLButtonElement).click();
		});
		expect(container.querySelector('.tsrx-expression-hook-count')?.textContent).toBe('first:0');

		await act(() => {
			(container.querySelector('.tsrx-expression-hook-count') as HTMLButtonElement).click();
		});
		expect(container.querySelector('.tsrx-expression-hook-count')?.textContent).toBe('first:1');

		await act(() => {
			(container.querySelector('.tsrx-expression-hook-label') as HTMLButtonElement).click();
		});
		expect(container.querySelector('.tsrx-expression-hook-count')?.textContent).toBe('second:1');
	});

	for (const [directive, App, reverse] of [
		['@if', ForKeyedIfApp, '.reverse-keyed-if'],
		['@switch', ForKeyedSwitchApp, '.reverse-keyed-switch'],
	] as const) {
		it(`keeps row state with its item when a keyed loop renders through ${directive}`, async () => {
			const rows = () =>
				Array.from(container.querySelectorAll('.keyed-branch-row'), (row) => row.textContent);

			await render(App);
			expect(rows()).toEqual(['a:a', 'b:b']);

			await act(() => {
				(container.querySelector(reverse) as HTMLButtonElement).click();
			});
			expect(rows()).toEqual(['b:b', 'a:a']);
		});
	}
});

runSwitchFallthroughRuntimeTests();
runForOfSourcesRuntimeTests();
runTsxExpressionTsrxRuntimeTests();
runJsxTextWhitespaceRuntimeTests({ nbsp: 'trimmed' });
runScriptBodyRuntimeTests();
runNullishSpreadRefRuntimeTests();
runExpressionSpreadRefRuntimeTests();
runGeneratorSpreadRefRuntimeTests();
runSpreadRefOrderRuntimeTests();
runGeneratedImportBindingsRuntimeTests();
