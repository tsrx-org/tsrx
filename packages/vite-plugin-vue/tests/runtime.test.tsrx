import type { MockInstance } from 'vitest';
import {
	createVaporApp,
	createVaporSSRApp,
	defineComponent,
	defineVaporAsyncComponent,
	inject,
	onBeforeUnmount,
	onErrorCaptured,
	onMounted,
	onScopeDispose,
	onUnmounted,
	provide,
	reactive,
	ref,
	Suspense,
	watch,
	VaporKeepAlive,
	VaporTeleport,
	useTemplateRef,
	watchEffect,
} from 'vue';
import { defineVaporComponent } from 'vue-jsx-vapor';
import * as Vue from 'vue';
import { mergeRefs } from '@tsrx/vue/ref';
import { for_items } from '@tsrx/vue/runtime/iterable';
import { runSwitchFallthroughRuntimeTests } from '@tsrx/core/test-harness/runtime/switch-fallthrough';
import { runTsxExpressionTsrxRuntimeTests } from '@tsrx/core/test-harness/runtime/tsx-expression-tsrx';
import { runForOfHeadScopeRuntimeTests } from '@tsrx/core/test-harness/runtime/for-of-head-scope';
import { runJsxTextWhitespaceRuntimeTests } from '@tsrx/core/test-harness/runtime/jsx-text-whitespace';
import { runScriptBodyRuntimeTests } from '@tsrx/core/test-harness/runtime/script-body';
import { runNullishSpreadRefRuntimeTests } from '@tsrx/core/test-harness/runtime/nullish-spread-ref';
import { runExpressionSpreadRefRuntimeTests } from '@tsrx/core/test-harness/runtime/expression-spread-ref';
import { runArraySpreadRefRuntimeTests } from '@tsrx/core/test-harness/runtime/array-spread-ref';
import { runArrayRefRuntimeTests } from '@tsrx/core/test-harness/runtime/array-ref';
import { runLocalHelperNamesRuntimeTests } from '@tsrx/core/test-harness/runtime/local-helper-names';
import { runForOfSourcesRuntimeTests } from '@tsrx/core/test-harness/runtime/for-of-sources';

const EXPECTED_ERROR_LOG_SNIPPETS = [
	'sync boom',
	'conditional boom',
	'inner error',
	'pending catch boom',
	'async reject boom',
	'pending reset boom',
	'watcher boom',
	'Unhandled error during execution of setup function',
	'Active effect was not restored correctly',
];

let console_error_spy: MockInstance | undefined;
let console_warn_spy: MockInstance | undefined;

function is_expected_error_log(args: unknown[]) {
	const message = args
		.map((arg) => {
			if (arg instanceof Error) {
				return `${arg.name}: ${arg.message}`;
			}
			return String(arg);
		})
		.join(' ');

	return EXPECTED_ERROR_LOG_SNIPPETS.some((snippet) => message.includes(snippet));
}

async function click(selector: string) {
	const btn = container.querySelector(selector) as HTMLElement;
	btn.click();
	await flush();
}

function text(selector: string): string | null {
	return container.querySelector(selector)?.textContent ?? null;
}

function texts(selector: string): Array<string | null> {
	return Array.from(container.querySelectorAll(selector), (node: Element) => node.textContent);
}

function BasicApp() {
	return <div class="greeting">{'Hello world'}</div>;
}

function Child(props: { text: string }) @{
	<span class="child">{props.text}</span>
}

function NestedApp() @{
	<div>
		<Child text="nested" />
	</div>
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
	const tag = ref<'section' | 'article'>('section');
	<>
		<{tag.value} class="dynamic-switch">{tag.value}</{tag.value}>
		<button
			class="dynamic-switch-toggle"
			onClick={() => {
				tag.value = tag.value === 'section' ? 'article' : 'section';
			}}
		>
			{'toggle'}
		</button>
	</>
}

function ExplicitTextApp() @{
	const markup = '<span>Not HTML</span>';
	const hidden = false;
	const empty = null;
	const missing = undefined;
	<>
		<div class="explicit-text-markup">{String(markup)}</div>
		<div class="explicit-text-boolean">{String(hidden)}</div>
		<div class="explicit-text-null">{empty == null ? '' : String(empty)}</div>
		<div class="explicit-text-undefined">{missing == null ? '' : String(missing)}</div>
	</>
}

function ExplicitHtmlApp() @{
	const markup = ref('<span class="html-node">safe enough</span>');
	<>
		<div class="explicit-html-target" innerHTML={markup.value} />
		<button
			class="explicit-html-update"
			onClick={() => {
				markup.value = '<strong class="html-node">updated</strong>';
			}}
		>
			update
		</button>
	</>
}

function SpreadHtmlApp() @{
	const spreadProps = ref({
		innerHTML: '<em class="html-node">spread</em>',
	});
	const markup = ref('<span class="html-node">safe enough</span>');
	<>
		<div class="spread-html-child" {...spreadProps.value} innerHTML={markup.value} />
		<button
			class="spread-html-update-spread"
			onClick={() => {
				spreadProps.value = { innerHTML: '<i class="html-node">spread update</i>' };
			}}
		>
			spread
		</button>
		<button
			class="spread-html-update-markup"
			onClick={() => {
				markup.value = '<strong class="html-node">updated</strong>';
			}}
		>
			markup
		</button>
	</>
}

let element_ref_captured: HTMLDivElement | null = null;

let keyword_ref_callback_captured: HTMLDivElement | null = null;

let multi_dom_ref_a: HTMLInputElement | null = null;

let multi_dom_ref_b: HTMLInputElement | null = null;

function ElementRefApp() @{
	<div
		ref={(node: HTMLDivElement) => {
			element_ref_captured = node;
		}}
		class="ref-target"
	>
		ref test
	</div>
}

function KeywordRefCallbackApp() @{
	function capture(node: HTMLDivElement | null) {
		keyword_ref_callback_captured = node;
	}
	<div ref={capture} class="keyword-ref-target">
		{'keyword ref'}
	</div>
}

function MultiDomRefApp() @{
	function captureA(node: HTMLInputElement | null) {
		multi_dom_ref_a = node;
	}
	function captureB(node: HTMLInputElement | null) {
		multi_dom_ref_b = node;
	}
	<input ref={mergeRefs(captureA, captureB)} class="multi-dom-ref" type="text" />
}

let combo_jsx_node: HTMLInputElement | null = null;
let combo_keyword_node: HTMLInputElement | null = null;

function ComboRefApp() @{
	function jsxRef(node: HTMLInputElement | null) {
		combo_jsx_node = node;
	}
	function keywordRef(node: HTMLInputElement | null) {
		combo_keyword_node = node;
	}
	<input ref={mergeRefs(jsxRef, keywordRef)} class="combo-ref" type="text" />
}

const value_ref_object = ref<HTMLInputElement | null>(null);
let value_ref_callback_node: HTMLInputElement | null = null;

function ValueRefObjectApp() @{
	function callbackRef(node: HTMLInputElement | null) {
		value_ref_callback_node = node;
	}
	<input ref={mergeRefs(value_ref_object, callbackRef)} class="value-ref" type="text" />
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

let spread_reactive_ref_node: HTMLButtonElement | null = null;

function SpreadReactiveApp() @{
	const bag = ref({ title: 'before', disabled: false });
	<>
		<button
			class="spread-reactive-update"
			onClick={() => {
				bag.value = { title: 'after', disabled: true };
			}}
		>
			update
		</button>
		<button class="spread-reactive-target" {...bag.value}>
			spread
		</button>
		<button
			class="spread-reactive-target"
			{...bag.value}
			ref={(node: HTMLButtonElement | null) => {
				spread_reactive_ref_node = node;
			}}
		>
			spread with ref
		</button>
	</>
}

const named_vue_ref_object = ref<HTMLInputElement | null>(null);

function NamedRefObjectApp() {
	return <NamedForwardInput type="text" input_ref={named_vue_ref_object} />;
}

function CounterApp() @{
	const count = ref(0);
	<>
		<p class="count">{count.value}</p>
		<button class="inc" onClick={() => count.value++}>
			{'+'}
		</button>
	</>
}

function DestructuredParamChild({ count }: { count: number }) {
	return <p class="destructured-child-count">{count}</p>;
}

function ReactiveStateToDestructuredParamApp() @{
	const state = reactive({ count: 0 });
	<>
		<p class="reactive-local-count">{state.count}</p>
		<DestructuredParamChild count={state.count} />
		<button class="reactive-inc" onClick={() => state.count++}>
			{'+'}
		</button>
	</>
}

function ConditionalRefsApp() @{
	const count = ref(0);
	const skip = ref(false);
	<>
		<button class="early-skip" onClick={() => (skip.value = !skip.value)}>
			{'skip'}
		</button>
		@if (!skip.value) {
			const doubled = ref(0);
			<>
				<p class="early-count">{count.value}</p>
				<p class="early-doubled">{doubled.value}</p>
				<button class="early-inc" onClick={() => count.value++}>
					{'inc'}
				</button>
				<button class="early-double" onClick={() => doubled.value++}>
					{'double'}
				</button>
			</>
		}
	</>
}
let watch_fire_count = 0;
let watch_effect_fire_count = 0;

function ProvideChild() @{
	const value = inject('provide-test-key', 'default');
	<span class="provide-child">{value}</span>
}

function BareJsxConditionalApp() @{
	const skip = ref(true);
	<>
		<button class="bare-toggle" onClick={() => (skip.value = !skip.value)}>
			{'toggle'}
		</button>
		@if (!skip.value) {
			<p class="bare-continuation">{'visible'}</p>
		}
	</>
}

function ProvideConditionalApp() @{
	const skip = ref(true);
	<>
		<button class="provide-toggle" onClick={() => (skip.value = !skip.value)}>
			{'toggle'}
		</button>
		@if (!skip.value) {
			provide('provide-test-key', 'dark');
			<ProvideChild />
		}
	</>
}

function WatchConditionalApp() @{
	const skip = ref(true);
	const value = ref(0);
	<>
		<button class="watch-toggle" onClick={() => (skip.value = !skip.value)}>
			{'toggle'}
		</button>
		<button class="watch-inc" onClick={() => value.value++}>
			{'inc'}
		</button>
		@if (!skip.value) {
			watch(value, () => {
				watch_fire_count++;
			});
			<p class="watch-value">{value.value}</p>
		}
	</>
}

function WatchEffectConditionalApp() @{
	const skip = ref(true);
	const value = ref(0);
	<>
		<button class="watch-effect-toggle" onClick={() => (skip.value = !skip.value)}>
			{'toggle'}
		</button>
		<button class="watch-effect-inc" onClick={() => value.value++}>
			{'inc'}
		</button>
		@if (!skip.value) {
			watchEffect(() => {
				void value.value;
				watch_effect_fire_count++;
			});
			<p class="watch-effect-value">{value.value}</p>
		}
	</>
}

function IfReactiveApp() @{
	const show = ref(true);
	<>
		@if (show.value) {
			<span class="visible">{'shown'}</span>
		} @else {
			<span class="hidden">{'hidden'}</span>
		}
		<button class="toggle" onClick={() => (show.value = !show.value)}>
			{'toggle'}
		</button>
	</>
}

function ConditionalLocalStateApp() @{
	const count = ref(3);
	<>
		<button class="outer-inc" onClick={() => count.value++}>
			{'Outer: '}
			{count.value}
		</button>
		@if (count.value > 2) {
			const newCount = ref(0);
			<button class="inner-inc" onClick={() => newCount.value++}>
				{'Inner: '}
				{newCount.value}
			</button>
		}
	</>
}

function StatefulChild() @{
	const inner = ref(0);
	<button class="stateful-child" onClick={() => inner.value++}>
		{'Child: '}
		{inner.value}
	</button>
}

function StatefulChildHostApp() @{
	<div>
		<StatefulChild />
	</div>
}

function StatefulChildWithProp(props: { count: ReturnType<typeof ref> }) @{
	const inner = ref(0);
	<button class="stateful-child-prop" onClick={() => inner.value++}>
		{'Child prop: '}
		{inner.value}
	</button>
}

function StatefulChildWithPropHostApp() @{
	const count = ref(3);
	<div>
		<StatefulChildWithProp {count} />
	</div>
}

function ForReactiveApp() @{
	const items = ref(['a', 'b', 'c']);
	<>
		@for (const item of items.value) {
			<li class="item" key={item}>
				{item}
			</li>
		}
		<button class="add" onClick={() => (items.value = [...items.value, 'd'])}>
			{'add'}
		</button>
		<button class="remove" onClick={() => (items.value = items.value.slice(1))}>
			{'remove'}
		</button>
	</>
}

function ForFilteredApp() @{
	const items = ref(['a', '', 'c']);
	const visibleItems = () => items.value.filter(Boolean);
	@for (const item of visibleItems()) {
		<li class="continue-item" key={item}>
			{item}
		</li>
	}
}

function ForIndexReactiveApp() @{
	const items = ref(['a', 'b', 'c']);
	<>
		@for (const item of items.value; index i) {
			<li class="indexed-item">{`${i}:${item}`}</li>
		}
		<button class="prepend" onClick={() => (items.value = ['z', ...items.value])}>
			{'prepend'}
		</button>
		<button
			class="drop-middle"
			onClick={() => (items.value = [items.value[0], ...items.value.slice(2)])}
		>
			{'drop middle'}
		</button>
		<button class="reverse" onClick={() => (items.value = [...items.value].reverse())}>
			{'reverse'}
		</button>
	</>
}

function KeyedRow(props: { item: { id: string; label: string } }) @{
	const count = ref(0);
	<button
		class={`keyed-row row-${props.item.id}`}
		onClick={() => count.value++}
	>{`${props.item.label}:${count.value}`}</button>
}

function ForKeyedStateApp() @{
	const items = ref([
		{ id: 'a', label: 'Alpha' },
		{ id: 'b', label: 'Beta' },
		{ id: 'c', label: 'Gamma' },
	]);
	<>
		@for (const item of items.value; key item.id) {
			<KeyedRow {item} />
		}
		<button class="reverse-keyed" onClick={() => (items.value = [...items.value].reverse())}>
			{'reverse'}
		</button>
		<button
			class="rename-beta"
			onClick={() =>
				(items.value = items.value.map((item) =>
					item.id === 'b' ? { ...item, label: 'Bravo' } : item,
				))
			}
		>
			{'rename'}
		</button>
	</>
}

function LocalVaporForNameApp() @{
	const VaporFor = () => <p class="authored-vapor-for">{'authored'}</p>;
	const rows = ref(['a', 'b']);
	<div>
		<VaporFor />
		<ul class="vapor-for-rows">
			@for (const row of rows.value; key row) {
				<li>{row}</li>
			}
		</ul>
		<button class="reverse-vapor-for-rows" onClick={() => (rows.value = [...rows.value].reverse())}>
			{'reverse'}
		</button>
	</div>
}

function ForJsxKeyedStateApp() @{
	const items = ref([
		{ id: 'a', label: 'Alpha' },
		{ id: 'b', label: 'Beta' },
		{ id: 'c', label: 'Gamma' },
	]);
	<>
		@for (const item of items.value) {
			<KeyedRow key={item.id} {item} />
		}
		<button class="reverse-jsx-keyed" onClick={() => (items.value = [...items.value].reverse())}>
			{'reverse'}
		</button>
		<button
			class="rename-jsx-keyed-beta"
			onClick={() =>
				(items.value = items.value.map((item) =>
					item.id === 'b' ? { ...item, label: 'Bravo' } : item,
				))
			}
		>
			{'rename'}
		</button>
	</>
}

function ForIndexKeyedStateApp() @{
	const items = ref([
		{ id: 'a', label: 'Alpha' },
		{ id: 'b', label: 'Beta' },
		{ id: 'c', label: 'Gamma' },
	]);
	<>
		@for (const item of items.value; index i; key item.id) {
			<p class={`indexed-keyed-row row-${item.id}`}>{`${i}:${item.label}`}</p>
		}
		<button class="reverse-index-keyed" onClick={() => (items.value = [...items.value].reverse())}>
			{'reverse'}
		</button>
	</>
}

function ForJsxIndexKeyedApp() @{
	const items = ref([
		{ id: 'a', label: 'Alpha' },
		{ id: 'b', label: 'Beta' },
		{ id: 'c', label: 'Gamma' },
	]);
	<>
		@for (const item of items.value; index i) {
			<p key={item.id} class={`jsx-index-keyed-row row-${item.id}`}>{`${i}:${item.label}`}</p>
		}
		<button
			class="reverse-jsx-index-keyed"
			onClick={() => (items.value = [...items.value].reverse())}
		>
			{'reverse'}
		</button>
	</>
}

function ForNestedIndexKeyedApp() @{
	const items = ref([
		{ id: 'a', label: 'Alpha' },
		{ id: 'b', label: 'Beta' },
		{ id: 'c', label: 'Gamma' },
	]);
	<>
		@for (const item of items.value; index i; key item.id) {
			<section class={`nested-index-keyed-row row-${item.id}`}>
				<div>
					<span>{`${i}:${item.label}`}</span>
				</div>
			</section>
		}
		<button
			class="reverse-nested-index-keyed"
			onClick={() => (items.value = [...items.value].reverse())}
		>
			{'reverse'}
		</button>
		<button
			class="rename-nested-index-keyed-beta"
			onClick={() =>
				(items.value = items.value.map((item) =>
					item.id === 'b' ? { ...item, label: 'Bravo' } : item,
				))
			}
		>
			{'rename'}
		</button>
	</>
}

function ForImplicitIndexKeyFragmentApp() @{
	const items = ref(['a', 'b', 'c']);
	<>
		@for (const item of items.value; index i) {
			<>
				<span class="fragment-index-item">{`${i}:${item}`}</span>
				<span class="fragment-value-item">{item}</span>
			</>
		}
		<button
			class="reverse-fragment-index"
			onClick={() => (items.value = [...items.value].reverse())}
		>
			{'reverse'}
		</button>
	</>
}

function DestructuredKeyedRow(props: { id: string; label: string }) @{
	const count = ref(0);
	<button
		class={`destructured-keyed-row row-${props.id}`}
		onClick={() => count.value++}
	>{`${props.label}:${count.value}`}</button>
}

function ForNestedArrayDestructuredKeyedApp() @{
	const rows = ref<[string, [string, string][]][]>([
		[
			'p',
			[
				['x', 'X'],
				['y', 'Y'],
			],
		],
	]);
	<ul>
		@for (const [k, list] of rows.value; key k) {
			@for (const [a, b] of list; key a) {
				<li class="nested-array-destructured">{`${k}-${a}-${b}`}</li>
			}
		}
	</ul>
}

function ForArrayDestructuredKeyedApp() @{
	const rows = ref<Iterable<string>[]>([new Set(['a', 'Alpha']), '😀x', ['b']]);
	<>
		@for (const [id, label = 'none'] of rows.value; key id) {
			<DestructuredKeyedRow {id} {label} />
		}
		<button
			class="reverse-array-destructured-keyed"
			onClick={() => (rows.value = [...rows.value].reverse())}
		>
			{'reverse'}
		</button>
		<button
			class="rename-array-destructured-keyed-a"
			onClick={() =>
				(rows.value = rows.value.map((row) => ([...row][0] === 'a' ? ['a', 'Again'] : row)))
			}
		>
			{'rename'}
		</button>
	</>
}

function ForDestructuredKeyedStateApp() @{
	const items = ref([
		{ id: 'a', label: 'Alpha' },
		{ id: 'b', label: 'Beta' },
		{ id: 'c', label: 'Gamma' },
	]);
	<>
		@for (const { id, label } of items.value; key id) {
			<DestructuredKeyedRow {id} {label} />
		}
		<button
			class="reverse-destructured-keyed"
			onClick={() => (items.value = [...items.value].reverse())}
		>
			{'reverse'}
		</button>
		<button
			class="rename-destructured-keyed-beta"
			onClick={() =>
				(items.value = items.value.map((item) =>
					item.id === 'b' ? { ...item, label: 'Bravo' } : item,
				))
			}
		>
			{'rename'}
		</button>
	</>
}

function SwitchReactiveApp() @{
	const page = ref('home');
	<>
		@switch (page.value) {
			@case 'home': {
				<div class="page">{'Home'}</div>
			}
			@case 'about': {
				<div class="page">{'About'}</div>
			}
			@default: {
				<div class="page">{'404'}</div>
			}
		}
		<button class="go-about" onClick={() => (page.value = 'about')}>
			{'about'}
		</button>
		<button class="go-unknown" onClick={() => (page.value = 'other')}>
			{'other'}
		</button>
	</>
}

function StyledApp() @{
	<>
		<div class="styled">{'styled text'}</div>
		<style>
			.styled {
				color: red;
			}
		</style>
	</>
}

function ThrowingChild() @{
	throw new Error('sync boom');
	<p>{'unreachable'}</p>
}

function ErrorBoundaryApp() @{
	@try {
		<ThrowingChild />
	} @catch (err) {
		<p class="caught">{(err as Error).message}</p>
	}
}

function MaybeThrow(props: { shouldThrow: boolean }) @{
	if (props.shouldThrow) {
		throw new Error('conditional boom');
	}
	<p class="ok">{'no error'}</p>
}

function ErrorToggleApp() @{
	const fail = ref(false);
	<>
		@try {
			<MaybeThrow shouldThrow={fail.value} />
		} @catch (err, reset) {
			<>
				<p class="caught">{(err as Error).message}</p>
				<button
					class="reset"
					onClick={() => {
						fail.value = false;
						reset();
					}}
				>
					{'reset'}
				</button>
			</>
		}
		<button class="trigger-error" onClick={() => (fail.value = true)}>
			{'break'}
		</button>
	</>
}

function InnerThrow() @{
	throw new Error('inner error');
	<p>{'unreachable'}</p>
}

function NestedTryApp() @{
	@try {
		<div class="outer">
			@try {
				<InnerThrow />
			} @catch (err) {
				<p class="inner-caught">{(err as Error).message}</p>
			}
		</div>
	} @catch (err) {
		<p class="outer-caught">{(err as Error).message}</p>
	}
}

function IfInsideTryApp() @{
	const show = ref(true);
	<>
		@try {
			@if (show.value) {
				<p class="branch-a">{'visible'}</p>
			} @else {
				<p class="branch-b">{'alternate'}</p>
			}
		} @catch (err) {
			<p class="caught">{'error'}</p>
		}
		<button class="toggle" onClick={() => (show.value = !show.value)}>
			{'toggle'}
		</button>
	</>
}

function ForInsideTryApp() @{
	const items = ref(['x', 'y']);
	<>
		@try {
			@for (const item of items.value) {
				<span class="try-item" key={item}>
					{item}
				</span>
			}
		} @catch (err) {
			<p class="caught">{'error'}</p>
		}
		<button class="add" onClick={() => (items.value = [...items.value, 'z'])}>
			{'add'}
		</button>
	</>
}

function SwitchInsideTryApp() @{
	const page = ref('home');
	<>
		@try {
			@switch (page.value) {
				@case 'home': {
					<p class="try-page">{'Home'}</p>
				}
				@case 'about': {
					<p class="try-page">{'About'}</p>
				}
				@default: {
					<p class="try-page">{'404'}</p>
				}
			}
		} @catch (err) {
			<p class="caught">{'error'}</p>
		}
		<button class="go-about" onClick={() => (page.value = 'about')}>
			{'about'}
		</button>
		<button class="go-unknown" onClick={() => (page.value = 'other')}>
			{'other'}
		</button>
	</>
}

function AsyncResolvedChild(props: { value: string }) @{
	<p class="async-resolved">{props.value}</p>
}

function SuspenseApp(props: { promise: Promise<typeof AsyncResolvedChild> }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<AsyncChild value="hello" />
	} @pending {
		<p class="async-pending">{'loading...'}</p>
	}
}

function SuspenseCatchApp(props: { promise: Promise<typeof AsyncResolvedChild> }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<AsyncChild value="hello" />
	} @pending {
		<p class="async-pending">{'loading...'}</p>
	} @catch (err) {
		<p class="async-caught">{(err as Error).message}</p>
	}
}

function EmptyPendingSuspenseApp(props: { promise: Promise<typeof AsyncResolvedChild> }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<AsyncChild value="hello" />
	} @pending {
	}
}

function ThrowingSuspenseChild() @{
	throw new Error('pending catch boom');
	<p>{'unreachable'}</p>
}

function SuspenseErrorApp() @{
	const prefix = 'caught: ';
	@try {
		<ThrowingSuspenseChild />
	} @pending {
		<p class="async-pending">{'loading...'}</p>
	} @catch (err) {
		<p class="async-caught">
			{prefix}
			{(err as Error).message}
		</p>
	}
}

function loadOrThrow(state: { fail: boolean }) {
	if (state.fail) throw new Error('pending reset boom');
	return 'Ready';
}

function ElementChildBoundaryApp() @{
	<div class="wrap">
		@try {
			<ThrowingChild />
		} @catch (err) {
			<p class="caught">{(err as Error).message}</p>
		}
	</div>
}

const watched = ref(0);

function SyncWatcher() @{
	watch(
		watched,
		() => {
			throw new Error('watcher boom');
		},
		{ flush: 'sync' },
	);
	<p class="watcher">{'watcher'}</p>
}

function WatchedWriter() @{
	watched.value++;
	<p class="writer">{'writer'}</p>
}

function SiblingBoundariesApp() @{
	<>
		@try {
			<SyncWatcher />
		} @catch (err) {
			<p class="watcher-caught">{(err as Error).message}</p>
		}
		@try {
			<WatchedWriter />
		} @catch (err) {
			<p class="writer-caught">{(err as Error).message}</p>
		}
	</>
}

const null_state = { fail: true };

function NullThrower() @{
	if (null_state.fail) throw null;
	<p class="ok">{'recovered'}</p>
}

function NullThrowApp() @{
	@try {
		<NullThrower />
	} @catch (err, reset) {
		<button
			class="reset"
			onClick={() => {
				null_state.fail = false;
				reset();
			}}
		>
			{'caught ' + String(err)}
		</button>
	}
}

function SuspenseResetApp() @{
	const state = { fail: true };
	@try {
		const result = loadOrThrow(state);
		<p class="async-resolved">{result}</p>
	} @pending {
		<p class="async-pending">{'loading...'}</p>
	} @catch (err, reset) {
		<button
			class="reset"
			onClick={() => {
				state.fail = false;
				reset();
			}}
		>
			{(err as Error).message}
		</button>
	}
}

// ── Static output rendered more than once ──
// Vapor JSX evaluates to DOM nodes, so each use of a static subtree needs a
// node of its own.

function StaticBadge() @{
	<p class="static-badge">
		<b>{'plain'}</b>
	</p>
}

function StaticTwiceApp() @{
	<div class="static-twice">
		<StaticBadge />
		<StaticBadge />
	</div>
}

function StaticThriceApp() @{
	<div class="static-thrice">
		<StaticBadge />
		<StaticBadge />
		<StaticBadge />
	</div>
}

function StaticHeaderPanel() @{
	const open = ref(false);
	<>
		<h3 class="static-panel-title">{'Panel'}</h3>
		<button class="static-panel-toggle" onClick={() => (open.value = !open.value)}>
			{open.value ? 'open' : 'closed'}
		</button>
	</>
}

function StaticPanelsApp() @{
	<>
		<div class="static-panel">
			<StaticHeaderPanel />
		</div>
		<div class="static-panel">
			<StaticHeaderPanel />
		</div>
	</>
}

function StaticInIfApp() @{
	const show = ref(false);
	<div class="static-if">
		<StaticBadge />
		@if (show.value) {
			<>
				<StaticBadge />
				<span class="static-if-text">
					<i>{'shown'}</i>
				</span>
			</>
		}
		<button class="static-if-toggle" onClick={() => (show.value = !show.value)}>
			{'toggle'}
		</button>
	</div>
}

function StaticInForApp() @{
	const items = ref(['a', 'b', 'c']);
	<div class="static-for">
		<ul>
			@for (const item of items.value) {
				<li class="static-for-row">
					<StaticBadge />
					<em>{'row'}</em>
				</li>
			}
		</ul>
		<button class="static-for-add" onClick={() => (items.value = [...items.value, 'd'])}>
			{'add'}
		</button>
	</div>
}

function StaticForBodyApp() @{
	<ul class="static-for-body">
		@for (const item of ['a', 'b', 'c']) {
			<li class="static-for-body-row">
				<b>{'row'}</b>
			</li>
		}
	</ul>
}

function StaticIfBranch(props: { show: boolean }) @{
	<div class="static-if-branch">
		@if (props.show) {
			<p class="static-if-branch-yes">
				<b>{'yes'}</b>
			</p>
		} @else {
			<p class="static-if-branch-no">{'no'}</p>
		}
	</div>
}

function StaticIfBranchesApp() @{
	<>
		<StaticIfBranch show={true} />
		<StaticIfBranch show={true} />
		<StaticIfBranch show={false} />
		<StaticIfBranch show={false} />
	</>
}

describe('tsrx-vue runtime', () => {
	beforeEach(() => {
		const original_console_error = console.error;
		console_error_spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
			if (is_expected_error_log(args)) {
				return;
			}

			original_console_error(...args);
		});

		const original_console_warn = console.warn;
		console_warn_spy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
			if (is_expected_error_log(args)) {
				return;
			}

			original_console_warn(...args);
		});
	});

	afterEach(() => {
		console_error_spy?.mockRestore();
		console_error_spy = undefined;
		console_warn_spy?.mockRestore();
		console_warn_spy = undefined;
	});

	it('renders a basic component into the DOM', async () => {
		await render(BasicApp);
		expect(text('.greeting')).toBe('Hello world');
	});

	it('renders nested components', async () => {
		await render(NestedApp);
		expect(text('.child')).toBe('nested');
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

		await click('.dynamic-switch-toggle');
		element = container.querySelector('.dynamic-switch');
		expect(element?.tagName).toBe('ARTICLE');
		expect(element?.textContent).toBe('article');
	});

	it('renders explicit text interpolation as text', async () => {
		await render(ExplicitTextApp);
		expect(text('.explicit-text-markup')).toBe('<span>Not HTML</span>');
		expect(container.querySelector('.explicit-text-markup span')).toBeNull();
		expect(text('.explicit-text-boolean')).toBe('false');
		expect(text('.explicit-text-null')).toBe('');
		expect(text('.explicit-text-undefined')).toBe('');
	});

	it('renders explicit html interpolation as html', async () => {
		await render(ExplicitHtmlApp);
		expect(text('.explicit-html-target')).toBe('safe enough');
		expect(container.querySelector('.explicit-html-target .html-node')?.tagName).toBe('SPAN');

		await click('.explicit-html-update');
		expect(text('.explicit-html-target')).toBe('updated');
		expect(container.querySelector('.explicit-html-target .html-node')?.tagName).toBe('STRONG');
	});

	it('lets native runtime resolve spread props before explicit html interpolation', async () => {
		await render(SpreadHtmlApp);
		expect(text('.spread-html-child')).toBe('safe enough');
		expect(container.querySelector('.spread-html-child .html-node')?.tagName).toBe('SPAN');

		await click('.spread-html-update-spread');
		expect(text('.spread-html-child')).toBe('safe enough');
		expect(container.querySelector('.spread-html-child .html-node')?.tagName).toBe('SPAN');

		await click('.spread-html-update-markup');
		expect(text('.spread-html-child')).toBe('updated');
		expect(container.querySelector('.spread-html-child .html-node')?.tagName).toBe('STRONG');
	});

	it('updates host spreads when their expression changes', async () => {
		spread_reactive_ref_node = null;
		await render(SpreadReactiveApp);
		const targets = Array.from(
			container.querySelectorAll('.spread-reactive-target'),
		) as HTMLButtonElement[];
		expect(targets.map((target) => [target.title, target.disabled])).toEqual([
			['before', false],
			['before', false],
		]);
		expect(spread_reactive_ref_node).toBe(targets[1]);

		await click('.spread-reactive-update');
		expect(targets.map((target) => [target.title, target.disabled])).toEqual([
			['after', true],
			['after', true],
		]);
		expect(spread_reactive_ref_node).toBe(targets[1]);
	});

	it('supports ref callback on elements', async () => {
		element_ref_captured = null;
		await render(ElementRefApp);
		expect(element_ref_captured).toBeInstanceOf(HTMLDivElement);
		expect(element_ref_captured!.textContent).toBe('ref test');
		expect(element_ref_captured!.className).toContain('ref-target');
	});

	it('supports TSRX ref={fn} callback refs on elements', async () => {
		keyword_ref_callback_captured = null;
		await render(KeywordRefCallbackApp);
		expect(keyword_ref_callback_captured).toBeInstanceOf(HTMLDivElement);
		expect(keyword_ref_callback_captured!.textContent).toBe('keyword ref');
		expect(keyword_ref_callback_captured!.className).toContain('keyword-ref-target');
	});

	it('supports multiple TSRX ref callbacks on the same DOM element', async () => {
		multi_dom_ref_a = null;
		multi_dom_ref_b = null;
		await render(MultiDomRefApp);
		expect(multi_dom_ref_a).toBeInstanceOf(HTMLInputElement);
		expect(multi_dom_ref_b).toBeInstanceOf(HTMLInputElement);
		expect(multi_dom_ref_a).toBe(multi_dom_ref_b);
		expect(multi_dom_ref_a!.className).toContain('multi-dom-ref');
	});

	it('combines callback refs via mergeRefs', async () => {
		combo_jsx_node = null;
		combo_keyword_node = null;
		await render(ComboRefApp);
		expect(combo_jsx_node).toBeInstanceOf(HTMLInputElement);
		expect(combo_jsx_node).toBe(combo_keyword_node);
	});

	it('mergeRefs assigns Vue ref() objects via .value alongside callback refs', async () => {
		value_ref_object.value = null;
		value_ref_callback_node = null;
		await render(ValueRefObjectApp);
		expect(value_ref_object.value).toBeInstanceOf(HTMLInputElement);
		expect(value_ref_object.value).toBe(value_ref_callback_node);
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
		expect(named_forward_node!.className).toContain('named-forward-ref');
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

	it('assigns named ref props backed by Vue ref objects', async () => {
		named_vue_ref_object.value = null;
		await render(NamedRefObjectApp);
		expect(named_vue_ref_object.value).toBeInstanceOf(HTMLInputElement);
		expect(named_vue_ref_object.value!.className).toContain('named-forward-ref');
	});

	it('increments a counter on click', async () => {
		await render(CounterApp);
		expect(text('.count')).toBe('0');
		await click('.inc');
		expect(text('.count')).toBe('1');
		await click('.inc');
		expect(text('.count')).toBe('2');
	});

	it('keeps reactive state updates flowing to plain destructured child params', async () => {
		await render(ReactiveStateToDestructuredParamApp);
		expect(text('.reactive-local-count')).toBe('0');
		expect(text('.destructured-child-count')).toBe('0');

		await click('.reactive-inc');
		expect(text('.reactive-local-count')).toBe('1');
		expect(text('.destructured-child-count')).toBe('1');

		await click('.reactive-inc');
		expect(text('.reactive-local-count')).toBe('2');
		expect(text('.destructured-child-count')).toBe('2');
	});

	it('toggles if-statement branches reactively', async () => {
		await render(IfReactiveApp);
		expect(text('.visible')).toBe('shown');

		await click('.toggle');
		expect(text('.hidden')).toBe('hidden');
		expect(container.querySelector('.visible')).toBeNull();

		await click('.toggle');
		expect(text('.visible')).toBe('shown');
	});

	it('preserves branch-local Vue refs across parent updates', async () => {
		await render(ConditionalLocalStateApp);
		expect(text('.inner-inc')).toBe('Inner: 0');

		await click('.inner-inc');
		expect(text('.inner-inc')).toBe('Inner: 1');

		await click('.outer-inc');
		expect(text('.outer-inc')).toBe('Outer: 4');
		expect(text('.inner-inc')).toBe('Inner: 1');
	});

	it('supports local ref state in a normal nested Vue component', async () => {
		await render(StatefulChildHostApp);
		expect(text('.stateful-child')).toBe('Child: 0');

		await click('.stateful-child');
		expect(text('.stateful-child')).toBe('Child: 1');
	});

	it('supports local ref state in a nested Vue component that receives a ref prop', async () => {
		await render(StatefulChildWithPropHostApp);
		expect(text('.stateful-child-prop')).toBe('Child prop: 0');

		await click('.stateful-child-prop');
		expect(text('.stateful-child-prop')).toBe('Child prop: 1');
	});

	it('conditional ref branch passes scope correctly to rendered body', async () => {
		await render(ConditionalRefsApp);
		expect(text('.early-skip')).toBe('skip');
		expect(text('.early-count')).toBe('0');
		expect(text('.early-doubled')).toBe('0');

		await click('.early-double');
		expect(text('.early-doubled')).toBe('1');

		await click('.early-inc');
		expect(text('.early-count')).toBe('1');
		expect(text('.early-doubled')).toBe('1');

		await click('.early-skip');
		expect(container.querySelector('.early-count')).toBeNull();
		expect(container.querySelector('.early-doubled')).toBeNull();
		expect(text('.early-skip')).toBe('skip');
	});

	it('renders bare-JSX branch reactively after condition flips', async () => {
		await render(BareJsxConditionalApp);
		expect(container.querySelector('.bare-continuation')).toBeNull();

		await click('.bare-toggle');
		await flush();

		expect(text('.bare-continuation')).toBe('visible');
	});

	it('calls provide in the branch after a reactive condition flips', async () => {
		await render(ProvideConditionalApp);
		expect(container.querySelector('.provide-child')).toBeNull();

		await click('.provide-toggle');
		await flush();

		expect(text('.provide-child')).toBe('dark');
	});

	it('registers watch in the branch after a reactive condition flips', async () => {
		watch_fire_count = 0;
		await render(WatchConditionalApp);
		expect(container.querySelector('.watch-value')).toBeNull();

		await click('.watch-toggle');
		await flush();
		expect(text('.watch-value')).toBe('0');

		const baseline = watch_fire_count;
		await click('.watch-inc');
		await flush();
		expect(text('.watch-value')).toBe('1');
		expect(watch_fire_count).toBe(baseline + 1);
	});

	it('registers watchEffect in the branch after a reactive condition flips', async () => {
		watch_effect_fire_count = 0;
		await render(WatchEffectConditionalApp);
		expect(container.querySelector('.watch-effect-value')).toBeNull();

		await click('.watch-effect-toggle');
		await flush();
		expect(text('.watch-effect-value')).toBe('0');

		const baseline = watch_effect_fire_count;
		expect(baseline).toBeGreaterThan(0);

		await click('.watch-effect-inc');
		await flush();
		expect(text('.watch-effect-value')).toBe('1');
		expect(watch_effect_fire_count).toBeGreaterThan(baseline);
	});

	it('adds and removes items in a for-of loop reactively', async () => {
		await render(ForReactiveApp);
		expect(container.querySelectorAll('.item').length).toBe(3);

		await click('.add');
		const items = container.querySelectorAll('.item');
		expect(items.length).toBe(4);
		expect(items[3].textContent).toBe('d');

		await click('.remove');
		const after = container.querySelectorAll('.item');
		expect(after.length).toBe(3);
		expect(after[0].textContent).toBe('b');
	});

	it('renders filtered for-of items', async () => {
		await render(ForFilteredApp);
		expect(texts('.continue-item')).toEqual(['a', 'c']);
	});

	it('updates for-of index bindings after insertions, removals, and reorders', async () => {
		await render(ForIndexReactiveApp);
		expect(texts('.indexed-item')).toEqual(['0:a', '1:b', '2:c']);

		await click('.prepend');
		expect(texts('.indexed-item')).toEqual(['0:z', '1:a', '2:b', '3:c']);

		await click('.drop-middle');
		expect(texts('.indexed-item')).toEqual(['0:z', '1:b', '2:c']);

		await click('.reverse');
		expect(texts('.indexed-item')).toEqual(['0:c', '1:b', '2:z']);
	});

	it('preserves keyed loop component state across reorders and prop updates', async () => {
		await render(ForKeyedStateApp);
		expect(texts('.keyed-row')).toEqual(['Alpha:0', 'Beta:0', 'Gamma:0']);

		await click('.row-b');
		expect(text('.row-b')).toBe('Beta:1');

		await click('.reverse-keyed');
		expect(texts('.keyed-row')).toEqual(['Gamma:0', 'Beta:1', 'Alpha:0']);

		await click('.rename-beta');
		expect(text('.row-b')).toBe('Bravo:1');
	});

	it('renders a keyed loop through the generated VaporFor beside a setup local VaporFor', async () => {
		await render(LocalVaporForNameApp);
		expect(texts('.authored-vapor-for')).toEqual(['authored']);
		expect(texts('.vapor-for-rows > li')).toEqual(['a', 'b']);

		await click('.reverse-vapor-for-rows');
		expect(texts('.vapor-for-rows > li')).toEqual(['b', 'a']);
	});

	it('preserves component state when keys come from JSX key attributes', async () => {
		await render(ForJsxKeyedStateApp);
		expect(texts('.keyed-row')).toEqual(['Alpha:0', 'Beta:0', 'Gamma:0']);

		await click('.row-b');
		expect(text('.row-b')).toBe('Beta:1');

		await click('.reverse-jsx-keyed');
		expect(texts('.keyed-row')).toEqual(['Gamma:0', 'Beta:1', 'Alpha:0']);

		await click('.rename-jsx-keyed-beta');
		expect(text('.row-b')).toBe('Bravo:1');
	});

	it('updates index bindings in keyed for-of loops after reorders', async () => {
		await render(ForIndexKeyedStateApp);
		expect(texts('.indexed-keyed-row')).toEqual(['0:Alpha', '1:Beta', '2:Gamma']);

		await click('.reverse-index-keyed');
		expect(texts('.indexed-keyed-row')).toEqual(['0:Gamma', '1:Beta', '2:Alpha']);
	});

	it('updates index bindings when JSX key attributes drive keyed for-of loops', async () => {
		await render(ForJsxIndexKeyedApp);
		expect(texts('.jsx-index-keyed-row')).toEqual(['0:Alpha', '1:Beta', '2:Gamma']);

		await click('.reverse-jsx-index-keyed');
		expect(texts('.jsx-index-keyed-row')).toEqual(['0:Gamma', '1:Beta', '2:Alpha']);
	});

	it('updates keyed item and index reads inside nested loop output', async () => {
		await render(ForNestedIndexKeyedApp);
		expect(texts('.nested-index-keyed-row')).toEqual(['0:Alpha', '1:Beta', '2:Gamma']);

		await click('.reverse-nested-index-keyed');
		expect(texts('.nested-index-keyed-row')).toEqual(['0:Gamma', '1:Beta', '2:Alpha']);

		await click('.rename-nested-index-keyed-beta');
		expect(text('.row-b')).toBe('1:Bravo');
	});

	it('updates implicit index-keyed fragments after reorders', async () => {
		await render(ForImplicitIndexKeyFragmentApp);
		expect(texts('.fragment-index-item')).toEqual(['0:a', '1:b', '2:c']);
		expect(texts('.fragment-value-item')).toEqual(['a', 'b', 'c']);

		await click('.reverse-fragment-index');
		expect(texts('.fragment-index-item')).toEqual(['0:c', '1:b', '2:a']);
		expect(texts('.fragment-value-item')).toEqual(['c', 'b', 'a']);
	});

	it('preserves keyed component state for destructured for-of loop params', async () => {
		await render(ForDestructuredKeyedStateApp);
		expect(texts('.destructured-keyed-row')).toEqual(['Alpha:0', 'Beta:0', 'Gamma:0']);

		await click('.row-b');
		expect(text('.row-b')).toBe('Beta:1');

		await click('.reverse-destructured-keyed');
		expect(texts('.destructured-keyed-row')).toEqual(['Gamma:0', 'Beta:1', 'Alpha:0']);

		await click('.rename-destructured-keyed-beta');
		expect(text('.row-b')).toBe('Bravo:1');
	});

	it('reads the destructured names of each loop in nested keyed loops', async () => {
		await render(ForNestedArrayDestructuredKeyedApp);
		expect(texts('.nested-array-destructured')).toEqual(['p-x-X', 'p-y-Y']);
	});

	it('destructures keyed for-of array patterns the way for...of does (#938)', async () => {
		await render(ForArrayDestructuredKeyedApp);
		expect(texts('.destructured-keyed-row')).toEqual(['Alpha:0', 'x:0', 'none:0']);

		await click('.row-a');
		expect(text('.row-a')).toBe('Alpha:1');

		await click('.reverse-array-destructured-keyed');
		expect(texts('.destructured-keyed-row')).toEqual(['none:0', 'x:0', 'Alpha:1']);

		await click('.rename-array-destructured-keyed-a');
		expect(text('.row-a')).toBe('Again:1');
	});

	it('switches rendered branches reactively', async () => {
		await render(SwitchReactiveApp);
		expect(text('.page')).toBe('Home');

		await click('.go-about');
		expect(text('.page')).toBe('About');

		await click('.go-unknown');
		expect(text('.page')).toBe('404');
	});

	it('applies scoped CSS classes', async () => {
		await render(StyledApp);
		expect(container.querySelector('div')!.className).toContain('styled');
	});

	it('catches synchronous child errors', async () => {
		await render(ErrorBoundaryApp);
		await flush();
		expect(text('.caught')).toBe('sync boom');
	});

	it('catches a child setup error when the app has its own errorHandler', async () => {
		const app = createVaporApp(ErrorBoundaryApp);
		const handled: unknown[] = [];
		app.config.errorHandler = (error) => {
			handled.push(error);
		};
		app.mount(container);
		await flush();
		expect(text('.caught')).toBe('sync boom');
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('catches inside element children when the app has its own errorHandler', async () => {
		const app = createVaporApp(ElementChildBoundaryApp);
		const handled: unknown[] = [];
		app.config.errorHandler = (error) => {
			handled.push(error);
		};
		app.mount(container);
		await flush();
		expect(text('.wrap .caught')).toBe('sync boom');
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('does not render boundary props as DOM attributes', async () => {
		await render(ElementChildBoundaryApp);
		expect(container.querySelector('.wrap')?.hasAttribute('fallback')).toBe(false);
		expect(container.querySelector('.wrap')?.hasAttribute('content')).toBe(false);
	});

	it('routes an error to the boundary around its source, not the one rendering', async () => {
		watched.value = 0;
		await render(SiblingBoundariesApp);
		await flush();
		expect(text('.watcher-caught')).toBe('watcher boom');
		expect(text('.writer')).toBe('writer');
		expect(container.querySelector('.writer-caught')).toBeNull();
	});

	it('recovers from error via reset and re-triggers on state change', async () => {
		await render(ErrorToggleApp);
		expect(text('.ok')).toBe('no error');

		await click('.trigger-error');
		expect(text('.caught')).toBe('conditional boom');
		expect(container.querySelector('.ok')).toBeNull();

		await click('.reset');
		expect(text('.ok')).toBe('no error');
		expect(container.querySelector('.caught')).toBeNull();
	});

	it('inner try/catch handles errors without propagating to outer', async () => {
		await render(NestedTryApp);
		await flush();
		expect(text('.inner-caught')).toBe('inner error');
		expect(container.querySelector('.outer-caught')).toBeNull();
		expect(container.querySelector('.outer')).not.toBeNull();
	});

	it('toggles if-else branches inside a try block', async () => {
		await render(IfInsideTryApp);
		expect(text('.branch-a')).toBe('visible');

		await click('.toggle');
		expect(text('.branch-b')).toBe('alternate');
		expect(container.querySelector('.branch-a')).toBeNull();

		await click('.toggle');
		expect(text('.branch-a')).toBe('visible');
	});

	it('adds items in a for-of loop inside a try block', async () => {
		await render(ForInsideTryApp);
		expect(container.querySelectorAll('.try-item').length).toBe(2);

		await click('.add');
		expect(container.querySelectorAll('.try-item').length).toBe(3);
		expect(container.querySelectorAll('.try-item')[2].textContent).toBe('z');
	});

	it('switches branches inside a try block', async () => {
		await render(SwitchInsideTryApp);
		expect(text('.try-page')).toBe('Home');

		await click('.go-about');
		expect(text('.try-page')).toBe('About');

		await click('.go-unknown');
		expect(text('.try-page')).toBe('404');
	});

	it('shows pending fallback then resolves a Vapor async component', async () => {
		let resolve_fn: (resolved: typeof AsyncResolvedChild) => void;
		const promise = new Promise<typeof AsyncResolvedChild>((resolve) => {
			resolve_fn = resolve;
		});

		await render(SuspenseApp, { promise });
		expect(text('.async-pending')).toBe('loading...');
		expect(container.querySelector('.async-resolved')).toBeNull();

		resolve_fn!(AsyncResolvedChild);
		await flush();
		expect(text('.async-resolved')).toBe('hello');
		expect(container.querySelector('.async-pending')).toBeNull();
	});

	it('shows pending fallback with catch while a Vapor async component is unresolved', async () => {
		let resolve_fn: (resolved: typeof AsyncResolvedChild) => void;
		let settled = false;
		const promise = new Promise<typeof AsyncResolvedChild>((resolve) => {
			resolve_fn = resolve;
		}).then((resolved) => {
			settled = true;
			return resolved;
		});

		await render(SuspenseCatchApp, { promise });
		expect(settled).toBe(false);
		expect(text('.async-pending')).toBe('loading...');
		expect(container.querySelector('.async-resolved')).toBeNull();
		expect(container.querySelector('.async-caught')).toBeNull();

		resolve_fn!(AsyncResolvedChild);
		await flush();
		expect(settled).toBe(true);
		expect(text('.async-resolved')).toBe('hello');
		expect(container.querySelector('.async-pending')).toBeNull();
	});

	it('renders no fallback for empty pending then resolves a Vapor async component', async () => {
		let resolve_fn: (resolved: typeof AsyncResolvedChild) => void;
		const promise = new Promise<typeof AsyncResolvedChild>((resolve) => {
			resolve_fn = resolve;
		});

		await render(EmptyPendingSuspenseApp, { promise });
		expect(container.textContent).toBe('');
		expect(container.querySelector('.async-pending')).toBeNull();
		expect(container.querySelector('.async-resolved')).toBeNull();

		resolve_fn!(AsyncResolvedChild);
		await flush();
		expect(text('.async-resolved')).toBe('hello');
	});

	it('routes a rejected Vapor async component to catch blocks', async () => {
		let reject_fn: (error: Error) => void;
		const promise = new Promise<typeof AsyncResolvedChild>((_resolve, reject) => {
			reject_fn = reject;
		});

		await render(SuspenseCatchApp, { promise });
		expect(text('.async-pending')).toBe('loading...');

		reject_fn!(new Error('async reject boom'));
		await flush();
		expect(text('.async-caught')).toBe('async reject boom');
		expect(container.querySelector('.async-pending')).toBeNull();
		expect(container.querySelector('.async-resolved')).toBeNull();
	});

	it('catches a thrown null and recovers via reset', async () => {
		null_state.fail = true;
		await render(NullThrowApp);
		expect(text('.reset')).toBe('caught null');

		await click('.reset');
		expect(text('.ok')).toBe('recovered');
	});

	it('re-renders the try body on reset after a sync error with pending', async () => {
		await render(SuspenseResetApp);
		await flush();
		expect(text('.reset')).toBe('pending reset boom');

		await click('.reset');
		await flush();
		expect(text('.async-resolved')).toBe('Ready');
		expect(container.querySelector('.reset')).toBeNull();
	});

	it('routes errors from Suspense default content to catch blocks', async () => {
		await render(SuspenseErrorApp);
		await flush();
		expect(text('.async-caught')).toBe('caught: pending catch boom');
		expect(container.querySelector('.async-pending')).toBeNull();
		expect(container.querySelector('.async-resolved')).toBeNull();
	});

	// ── Static output rendered more than once ──

	it('renders a static component used twice as two nodes', async () => {
		await render(StaticTwiceApp);
		expect(texts('.static-twice > .static-badge')).toEqual(['plain', 'plain']);
	});

	it('renders a static component used three times as three nodes', async () => {
		await render(StaticThriceApp);
		expect(texts('.static-thrice > .static-badge')).toEqual(['plain', 'plain', 'plain']);
	});

	it('gives each instance of a component its own static output', async () => {
		await render(StaticPanelsApp);
		const panels = container.querySelectorAll('.static-panel');
		expect(panels.length).toBe(2);
		for (const panel of panels) {
			expect(panel.querySelector('.static-panel-title')?.textContent).toBe('Panel');
			expect(panel.querySelector('.static-panel-toggle')?.textContent).toBe('closed');
		}
	});

	it('renders a static component inside @if beside one outside it', async () => {
		const badge_count = () => container.querySelectorAll('.static-if .static-badge').length;
		await render(StaticInIfApp);
		expect(badge_count()).toBe(1);
		expect(container.querySelector('.static-if-text')).toBeNull();

		await click('.static-if-toggle');
		expect(badge_count()).toBe(2);
		expect(text('.static-if-text i')).toBe('shown');

		await click('.static-if-toggle');
		expect(badge_count()).toBe(1);
		expect(container.querySelector('.static-if-text')).toBeNull();

		await click('.static-if-toggle');
		expect(badge_count()).toBe(2);
		expect(text('.static-if-text i')).toBe('shown');
	});

	it('renders a static component in every @for row', async () => {
		const expect_rows = (count: number) => {
			const rows = container.querySelectorAll('.static-for-row');
			expect(rows.length).toBe(count);
			for (const row of rows) {
				expect(row.querySelector('.static-badge')?.textContent).toBe('plain');
				expect(row.querySelector('em')?.textContent).toBe('row');
			}
		};
		await render(StaticInForApp);
		expect_rows(3);

		await click('.static-for-add');
		expect_rows(4);
	});

	it('renders a static @for body in every row', async () => {
		await render(StaticForBodyApp);
		expect(texts('.static-for-body > .static-for-body-row')).toEqual(['row', 'row', 'row']);
	});

	it('renders the static @if branch of each instance', async () => {
		await render(StaticIfBranchesApp);
		const branches = container.querySelectorAll('.static-if-branch');
		expect(branches.length).toBe(4);
		expect([...branches].map((branch) => branch.textContent)).toEqual(['yes', 'yes', 'no', 'no']);
	});

	runLocalHelperNamesRuntimeTests();
});

const HandlerArrow = ({ label, onPick }: { label: string; onPick: (label: string) => void }) => (
	<button class="handler" onClick={() => onPick(label)}>
		{label}
	</button>
);

function VariableCard({ title }: { title: string }) {
	const element = <div class="card" title={title} />;
	return element;
}

function VariableCardParent() @{
	<section>
		<VariableCard title="child" />
	</section>
}

// Reads `RegisteredInner` above its declaration, so this module only loads
// when the wrapped component is still initialized first.
const component_registry = { inner: RegisteredInner };

function RegisteredInner(props: { label: string }) @{
	<span>{props.label}</span>
}

describe('tsrx-vue component wrapping', () => {
	it('mounts an arrow component with an inline handler as the app root', async () => {
		await render(HandlerArrow, { label: 'root', onPick: () => {} });
		expect(container.innerHTML).toBe('<button class="handler">root</button>');
	});

	it('passes props to a component that returns JSX through a variable', async () => {
		await render(VariableCardParent);
		expect(container.innerHTML).toBe('<section><div class="card" title="child"></div></section>');
	});

	it('mounts a component that returns JSX through a variable as the app root', async () => {
		await render(VariableCard, { title: 'root' });
		expect(container.innerHTML).toBe('<div class="card" title="root"></div>');
	});

	it('renders a component read above its declaration', async () => {
		await render(component_registry.inner, { label: 'registered' });
		expect(container.innerHTML).toBe('<span>registered</span>');
	});
});

function ChildrenCard(props: { title: string; children?: JSX.Element }) @{
	<section class="card">
		<h2>{props.title}</h2>
		{props.children}
	</section>
}

function DestructuredChildrenCard({ children }: { children?: JSX.Element }) @{
	<section class="card">{children}</section>
}

function BodyDestructuredChildrenCard(props: { children?: JSX.Element }) @{
	const { children } = props;
	<section class="card">{children}</section>
}

function NestedChildrenApp() @{
	const count = ref(0);
	<>
		<button class="inc" onClick={() => count.value++}>
			{'inc'}
		</button>
		<ChildrenCard title="t">
			<p class="nested">{`child ${count.value}`}</p>
		</ChildrenCard>
		<DestructuredChildrenCard>
			<b>{'destructured'}</b>
		</DestructuredChildrenCard>
		<BodyDestructuredChildrenCard>
			<b>{'body destructured'}</b>
		</BodyDestructuredChildrenCard>
	</>
}

function ChildrenPropApp() @{
	<ChildrenCard title="t" children={<p>{'from prop'}</p>} />
}

const children_setups = { count: 0 };

function CountedChild() @{
	children_setups.count++;
	<i class="counted">{'counted'}</i>
}

function MaybeChildren(props: { children?: JSX.Element }) @{
	<div class="maybe">
		{props.children ? (
			<div class="has-children">{props.children}</div>
		) : (
			<span class="no-children" />
		)}
	</div>
}

function ComparedChildren(props: { children?: JSX.Element }) @{
	<div class="compared">
		{props.children != null ? <div class="has-children">{props.children}</div> : null}
		{Boolean(props.children) ? <span class="boolean-children" /> : null}
	</div>
}

function ComparedChildrenApp() @{
	<ComparedChildren>
		<CountedChild />
	</ComparedChildren>
}

function CountedChildrenApp() @{
	<MaybeChildren>
		<CountedChild />
	</MaybeChildren>
}

function NoChildrenApp() @{
	<MaybeChildren />
}

function EmptiedChildrenApp() @{
	const show = ref(true);
	<>
		<button class="hide" onClick={() => (show.value = false)}>
			{'hide'}
		</button>
		<MaybeChildren>{show.value ? <p class="shown">{'shown'}</p> : null}</MaybeChildren>
	</>
}

function SlotAndPropApp() @{
	<>
		<ChildrenCard title="both" children={<b class="from-prop">{'prop'}</b>}>
			<i class="from-slot">{'slot'}</i>
		</ChildrenCard>
		<ChildrenCard title="null" children={null} />
	</>
}

function DefaultChildrenCard({ children = 'none' }: { children?: JSX.Element | string }) @{
	<p class="default-children">{children}</p>
}

function DefaultChildrenApp() @{
	<>
		<DefaultChildrenCard />
		<DefaultChildrenCard>
			<b>{'given'}</b>
		</DefaultChildrenCard>
		<DefaultChildrenCard children={null} />
		<DefaultChildrenCard children={undefined} />
	</>
}

function OuterChildren(props: { children?: JSX.Element }) @{
	function InnerChildren(inner: { children?: JSX.Element }) @{
		<span class="inner-children">
			{inner.children}
			{props.children}
		</span>
	}
	<InnerChildren>
		<b>{'inner'}</b>
	</InnerChildren>
}

function OuterChildrenApp() @{
	<OuterChildren>
		<u>{'outer'}</u>
	</OuterChildren>
}

function SpreadChildren(props: { children?: JSX.Element }) @{
	<>
		<ChildrenCard title="spread" {...props} />
		<ChildrenCard title="passed">{props.children}</ChildrenCard>
	</>
}

const child_life = { setups: 0, mounted: 0, unmounted: 0 };

function LifecycleChild() @{
	child_life.setups++;
	onMounted(() => child_life.mounted++);
	onUnmounted(() => child_life.unmounted++);
	const clicks = ref(0);
	<button class="life-child" onClick={() => clicks.value++}>{`n=${clicks.value}`}</button>
}

const children_open = ref(false);

function TernaryChildren(props: { children?: JSX.Element }) @{
	<div class="toggled">{children_open.value ? props.children : null}</div>
}

function AndChildren(props: { children?: JSX.Element }) @{
	<div class="toggled">{children_open.value && props.children}</div>
}

function IfChildren(props: { children?: JSX.Element }) @{
	<div class="toggled">
		@if (children_open.value) {
			<section>{props.children}</section>
		}
	</div>
}

function TernaryChildrenApp() @{
	<TernaryChildren>
		<LifecycleChild />
	</TernaryChildren>
}

function AndChildrenApp() @{
	<AndChildren>
		<LifecycleChild />
	</AndChildren>
}

function IfChildrenApp() @{
	<IfChildren>
		<LifecycleChild />
	</IfChildren>
}

function HiddenChildren(props: { children?: JSX.Element }) @{
	<div class="hidden-children">{false ? props.children : 'hidden'}</div>
}

function HiddenChildrenApp() @{
	<HiddenChildren>
		<LifecycleChild />
	</HiddenChildren>
}

function SpreadChildrenApp() @{
	<SpreadChildren>
		<em>{'forwarded'}</em>
	</SpreadChildren>
}

describe('tsrx-vue component children', () => {
	it('renders nested children read through props.children', async () => {
		await render(NestedChildrenApp);
		expect(text('.nested')).toBe('child 0');
		expect(texts('.card b')).toEqual(['destructured', 'body destructured']);

		await click('.inc');
		expect(text('.nested')).toBe('child 1');
	});

	it('still renders a children prop passed explicitly', async () => {
		await render(ChildrenPropApp);
		expect(text('.card p')).toBe('from prop');
	});

	it('renders the slot once for every read of props.children', async () => {
		children_setups.count = 0;
		await render(CountedChildrenApp);
		expect(container.querySelectorAll('.has-children .counted')).toHaveLength(1);
		expect(children_setups.count).toBe(1);
	});

	it('tests the slot without rendering it in a null comparison or Boolean()', async () => {
		children_setups.count = 0;
		await render(ComparedChildrenApp);
		expect(container.querySelectorAll('.has-children .counted')).toHaveLength(1);
		expect(container.querySelector('.boolean-children')).not.toBeNull();
		expect(children_setups.count).toBe(1);
	});

	it('reads no children when the caller passes none', async () => {
		await render(NoChildrenApp);
		expect(container.querySelector('.no-children')).not.toBeNull();
		expect(container.querySelector('.has-children')).toBeNull();
	});

	it('keeps the slot truthy when the caller writes children that render nothing', async () => {
		// Vue passes nested children as a slot block, which exists whenever the
		// caller writes children, so a truthiness check cannot see that they
		// now render nothing. React would render the `no-children` branch here.
		await render(EmptiedChildrenApp);
		expect(text('.has-children .shown')).toBe('shown');

		await click('.hide');
		expect(container.querySelector('.shown')).toBeNull();
		expect(container.querySelector('.has-children')).not.toBeNull();
	});

	it('prefers nested children over a children prop, and keeps a null children prop', async () => {
		await render(SlotAndPropApp);
		expect(texts('.card i')).toEqual(['slot']);
		expect(container.querySelector('.from-prop')).toBeNull();
		expect(texts('.card h2')).toEqual(['both', 'null']);
	});

	it('falls back to a destructured children default only without children', async () => {
		await render(DefaultChildrenApp);
		// A slot keeps a trailing text anchor in its host (#870). Like a
		// destructuring default, it replaces only `undefined`, so `null` stays.
		expect(texts('.default-children').map((value) => value?.trim())).toEqual([
			'none',
			'given',
			'',
			'none',
		]);
	});

	it("reads the outer component's children inside a nested component", async () => {
		await render(OuterChildrenApp);
		expect(container.querySelector('.inner-children')?.innerHTML).toContain(
			'<b>inner</b><u>outer</u>',
		);
	});

	it.each([
		['a ternary', TernaryChildrenApp],
		['an && expression', AndChildrenApp],
		['an @if body', IfChildrenApp],
	])(
		'sets the children up when %s shows them and tears them down when it hides them',
		async (_name, App) => {
			Object.assign(child_life, { setups: 0, mounted: 0, unmounted: 0 });
			children_open.value = false;
			await render(App);
			expect(child_life).toEqual({ setups: 0, mounted: 0, unmounted: 0 });

			children_open.value = true;
			await flush();
			await click('.life-child');
			expect(text('.life-child')).toBe('n=1');

			children_open.value = false;
			await flush();
			expect(container.querySelector('.life-child')).toBeNull();
			expect(child_life).toEqual({ setups: 1, mounted: 1, unmounted: 1 });

			// Shown again, the children are a fresh instance that keeps updating.
			children_open.value = true;
			await flush();
			expect(text('.life-child')).toBe('n=0');
			await click('.life-child');
			expect(text('.life-child')).toBe('n=1');
			expect(child_life).toEqual({ setups: 2, mounted: 2, unmounted: 1 });
		},
	);

	it('never sets up children that are not shown', async () => {
		Object.assign(child_life, { setups: 0, mounted: 0, unmounted: 0 });
		await render(HiddenChildrenApp);
		expect(text('.hidden-children')).toBe('hidden');
		expect(child_life).toEqual({ setups: 0, mounted: 0, unmounted: 0 });
	});

	it('does not forward nested children through a props spread', async () => {
		// `{...props}` carries props, and Vue passes nested children as a slot,
		// so pass them on explicitly. React forwards them through the spread.
		await render(SpreadChildrenApp);
		expect(texts('.card em')).toEqual(['forwarded']);
		expect(container.querySelectorAll('.card')[1]?.querySelector('em')).not.toBeNull();
	});
});

const merged_ref_log: string[] = [];
const merged_ref_object = ref<HTMLInputElement | null>(null);

function MergedRefCleanupApp() @{
	const shown = ref(true);
	const withCleanup = (node: HTMLInputElement | null) => {
		merged_ref_log.push(node ? 'set' : 'null');
		return () => {
			merged_ref_log.push('cleanup');
		};
	};
	<>
		@if (shown.value) {
			<input class="merged-cleanup" ref={mergeRefs(withCleanup, merged_ref_object)} />
		}
		<button class="hide-merged" onClick={() => (shown.value = false)}>
			{'hide'}
		</button>
	</>
}

const swapped_ref_log: string[] = [];
const swapped_ref_which = ref(0);
const swapped_ref_object = ref<HTMLInputElement | null>(null);

function SwappedMergedRefApp() @{
	const shown = ref(true);
	const withCleanup = (node: HTMLInputElement | null) => {
		swapped_ref_log.push(node ? 'A:set' : 'A:null');
		return () => {
			swapped_ref_log.push('A:cleanup');
		};
	};
	const plain = (node: HTMLInputElement | null) => {
		swapped_ref_log.push(node ? 'B:set' : 'B:null');
	};
	const other = (node: HTMLInputElement | null) => {
		swapped_ref_log.push(node ? 'C:set' : 'C:null');
	};
	<>
		@if (shown.value) {
			<input
				class="swapped-merged"
				ref={mergeRefs(
					withCleanup,
					plain,
					swapped_ref_object,
					swapped_ref_which.value ? other : null,
				)}
			/>
		}
		<button class="hide-swapped" onClick={() => (shown.value = false)}>
			{'hide'}
		</button>
	</>
}

const forwarded_own_ref = ref<HTMLInputElement | null>(null);
const forwarded_ref = ref<HTMLInputElement | null>(null);

function ForwardedMergedRefField(props: { inputProps: Record<string, unknown> }) @{
	<input class="forwarded-merged" ref={mergeRefs(forwarded_own_ref)} {...props.inputProps} />
}

function ForwardedMergedRefApp() @{
	const shown = ref(true);
	<>
		@if (shown.value) {
			<ForwardedMergedRefField inputProps={{ ref: mergeRefs(forwarded_ref) }} />
		}
		<button class="hide-forwarded-merged" onClick={() => (shown.value = false)}>
			{'hide'}
		</button>
	</>
}

const nested_swapped_log: string[] = [];
const nested_swapped_which = ref(0);

function NestedSwappedMergedRefApp() @{
	const shown = ref(true);
	const logger = (name: string) => (node: HTMLInputElement | null) => {
		nested_swapped_log.push(`${name}:${node ? 'set' : 'null'}`);
	};
	<>
		@if (shown.value) {
			<input
				class="nested-swapped"
				ref={mergeRefs(
					mergeRefs(logger('A')),
					nested_swapped_which.value ? mergeRefs(logger('C')) : mergeRefs(logger('B')),
				)}
			/>
		}
		<button class="hide-nested-swapped" onClick={() => (shown.value = false)}>
			{'hide'}
		</button>
	</>
}

/**
 * Calls a merged ref the way Vue calls a function ref, with the node and then
 * with `null`, and returns what each ref it holds was called with.
 */
function set_and_unset(make: (log: (name: string) => (node: unknown) => void) => any) {
	const calls: string[] = [];
	const log = (name: string) => (node: unknown) => {
		calls.push(`${name}(${node ? 'node' : 'null'})`);
	};
	const merged = make(log);
	merged(document.createElement('input'));
	const set = [...calls];
	calls.length = 0;
	merged(null);
	return { set, unset: calls };
}

describe('tsrx-vue merged refs', () => {
	it('keeps every ref of merged refs that another merged ref sets on one element (#1329)', async () => {
		await render(ForwardedMergedRefApp);
		const input = container.querySelector('.forwarded-merged');
		expect(input).toBeInstanceOf(HTMLInputElement);
		expect(forwarded_own_ref.value).toBe(input);
		expect(forwarded_ref.value).toBe(input);

		await click('.hide-forwarded-merged');
		expect(forwarded_own_ref.value).toBeNull();
		expect(forwarded_ref.value).toBeNull();
	});

	it('cleans up nested merged refs once when Vue replaces or unsets the outer one (#1329)', async () => {
		nested_swapped_log.length = 0;
		nested_swapped_which.value = 0;
		await render(NestedSwappedMergedRefApp);
		expect(nested_swapped_log).toEqual(['A:set', 'B:set']);

		nested_swapped_which.value = 1;
		await flush();
		expect(nested_swapped_log.slice(2)).toEqual(['A:null', 'B:null', 'A:set', 'C:set']);

		await click('.hide-nested-swapped');
		expect(nested_swapped_log.slice(6)).toEqual(['A:null', 'C:null']);
	});

	it('sets and unsets each ref of nested merged refs once (#1329)', () => {
		const both = { set: ['a(node)', 'b(node)'], unset: ['a(null)', 'b(null)'] };
		expect(set_and_unset((log) => mergeRefs(log('a'), log('b')))).toEqual(both);
		expect(set_and_unset((log) => mergeRefs(mergeRefs(log('a')), mergeRefs(log('b'))))).toEqual(
			both,
		);
		expect(
			set_and_unset((log) => mergeRefs(mergeRefs(log('a')), (node) => mergeRefs(log('b'))(node))),
		).toEqual(both);
		expect(set_and_unset((log) => mergeRefs(mergeRefs(log('a'), log('b')), log('c')))).toEqual({
			set: ['a(node)', 'b(node)', 'c(node)'],
			unset: ['a(null)', 'b(null)', 'c(null)'],
		});

		const first = ref<HTMLInputElement | null>(null);
		const second = ref<HTMLInputElement | null>(null);
		const node = document.createElement('input');
		const merged = mergeRefs(mergeRefs(first), mergeRefs(second));
		merged(node);
		expect(first.value).toBe(node);
		expect(second.value).toBe(node);
		merged(null);
		expect(first.value).toBeNull();
		expect(second.value).toBeNull();
	});

	it('replaces the merged ref on an element after a nested ref throws (#1329)', () => {
		const node = document.createElement('input');
		const throwing = mergeRefs(
			mergeRefs((value: HTMLInputElement | null) => {
				if (value) throw new Error('ref boom');
			}),
		);
		expect(() => throwing(node)).toThrow('ref boom');

		const calls: string[] = [];
		mergeRefs((value: HTMLInputElement | null) => {
			calls.push(`first(${value ? 'node' : 'null'})`);
		})(node);
		mergeRefs((value: HTMLInputElement | null) => {
			calls.push(`second(${value ? 'node' : 'null'})`);
		})(node);
		expect(calls).toEqual(['first(node)', 'first(null)', 'second(node)']);
	});

	it('cleans up a nested merged ref set before a sibling threw when the element gets another (#1329)', () => {
		const node = document.createElement('input');
		const calls: string[] = [];
		const log = (name: string) => (value: HTMLInputElement | null) => {
			calls.push(`${name}(${value ? 'node' : 'null'})`);
		};
		const failing = mergeRefs(mergeRefs(log('a')), () => {
			throw new Error('ref boom');
		});
		expect(() => failing(node)).toThrow('ref boom');

		const replacement = mergeRefs(log('b'));
		replacement(node);
		replacement(null);
		expect(calls).toEqual(['a(node)', 'a(null)', 'b(node)', 'b(null)']);
	});

	it('cleans up what a merged ref set before a ref threw when Vue unsets it (#1329)', () => {
		const node = document.createElement('input');
		const calls: string[] = [];
		const failing = mergeRefs(
			mergeRefs((value: HTMLInputElement | null) => {
				calls.push(`a(${value ? 'node' : 'null'})`);
			}),
			() => {
				throw new Error('ref boom');
			},
		);
		expect(() => failing(node)).toThrow('ref boom');
		failing(null);
		expect(calls).toEqual(['a(node)', 'a(null)']);
	});

	it('leaves a nested merged ref set on another element after a ref beside it threw (#1329)', () => {
		const first = document.createElement('input');
		const second = document.createElement('input');
		const calls: string[] = [];
		const log = (name: string) => (value: HTMLInputElement | null) => {
			calls.push(`${name}(${value === first ? 'first' : value === second ? 'second' : 'null'})`);
		};
		const inner = mergeRefs(log('a'));
		const failing = mergeRefs(inner, () => {
			throw new Error('ref boom');
		});
		expect(() => failing(first)).toThrow('ref boom');
		inner(second);
		mergeRefs(log('b'))(first);
		expect(calls).toEqual(['a(first)', 'a(null)', 'a(second)', 'b(first)']);
	});

	it('clears nested merged refs in order after a ref beside them threw (#1329)', () => {
		const node = document.createElement('input');
		const calls: string[] = [];
		const log = (name: string) => (value: HTMLInputElement | null) => {
			calls.push(`${name}(${value ? 'node' : 'null'})`);
			if (name === 'x' && !value) throw new Error('x cleanup boom');
		};
		const failing = mergeRefs(mergeRefs(log('c'), mergeRefs(log('x'))), () => {
			throw new Error('ref boom');
		});
		expect(() => failing(node)).toThrow('ref boom');
		expect(() => mergeRefs(log('r'))(node)).toThrow('x cleanup boom');
		expect(calls).toEqual(['c(node)', 'x(node)', 'c(null)', 'x(null)']);
	});

	it('runs the replaced merged ref cleanup when a new one is set on the element', async () => {
		swapped_ref_log.length = 0;
		swapped_ref_which.value = 0;
		await render(SwappedMergedRefApp);
		expect(swapped_ref_log).toEqual(['A:set', 'B:set']);

		// A reactive read re-creates the merged ref; Vue sets the new one without
		// calling the old one with `null`.
		swapped_ref_which.value = 1;
		await flush();
		expect(swapped_ref_log).toEqual([
			'A:set',
			'B:set',
			'A:cleanup',
			'B:null',
			'A:set',
			'B:set',
			'C:set',
		]);
		expect(swapped_ref_object.value).toBeInstanceOf(HTMLInputElement);

		await click('.hide-swapped');
		expect(swapped_ref_log.slice(7)).toEqual(['A:cleanup', 'B:null', 'C:null']);
		expect(swapped_ref_object.value).toBeNull();
	});

	it("runs a merged ref's cleanup when Vue unsets the ref", async () => {
		merged_ref_log.length = 0;
		await render(MergedRefCleanupApp);
		expect(merged_ref_log).toEqual(['set']);
		expect(merged_ref_object.value).toBeInstanceOf(HTMLInputElement);

		await click('.hide-merged');
		// Vue ignores a function ref's return value and calls it with `null`;
		// the merged ref runs the stored cleanup on that call instead.
		expect(merged_ref_log).toEqual(['set', 'cleanup']);
		expect(merged_ref_object.value).toBeNull();
	});
});

// A keyed `@for` row whose body is a fragment (#179). A loop with `@empty`
// renders through `VaporFor`; one whose body has setup statements doesn't.
const fragment_rows = ref([{ id: 1 }, { id: 2 }, { id: 3 }]);

function KeyedFragmentEmptyApp() @{
	<ul class="keyed-fragment-empty">
		@for (const item of fragment_rows.value; key item.id) {
			<>
				<li>{item.id}</li>
			</>
		} @empty {
			<p>{'none'}</p>
		}
	</ul>
}

function KeyedFragmentSetupApp() @{
	<ul class="keyed-fragment-setup">
		@for (const item of fragment_rows.value; key item.id) {
			const label = 'item ' + item.id;
			<>
				<li>{label}</li>
				<li>{item.id}</li>
			</>
		}
	</ul>
}

function IndexedFragmentEmptyApp() @{
	<ul class="indexed-fragment-empty">
		@for (const item of fragment_rows.value; index i) {
			<>
				<li>{i + ':' + item.id}</li>
			</>
		} @empty {
			<p>{'none'}</p>
		}
	</ul>
}

function OwnFragmentRow(props: { label: string }) @{
	<li class="own">{props.label}</li>
}

// A module can't import Vue's `Fragment` under its own name beside its own
// `Fragment`, so here (aliased) the rows outside `VaporFor` are unkeyed
// fragments.
function OwnFragmentApp() @{
	const Fragment = OwnFragmentRow;
	<ul class="own-fragment">
		@for (const item of fragment_rows.value; key item.id) {
			const id = item.id;
			<>
				<li>{id}</li>
				<Fragment label={'own ' + id} />
			</>
		} @empty {
			<p>{'none'}</p>
		}
	</ul>
}

describe('tsrx-vue keyed fragment rows (#179)', () => {
	beforeEach(() => {
		fragment_rows.value = [{ id: 1 }, { id: 2 }, { id: 3 }];
	});

	it('renders a keyed fragment body in a loop with @empty', async () => {
		await render(KeyedFragmentEmptyApp);
		expect(texts('.keyed-fragment-empty li')).toEqual(['1', '2', '3']);

		fragment_rows.value = [];
		await flush();
		expect(texts('.keyed-fragment-empty li')).toEqual([]);
		expect(texts('.keyed-fragment-empty p')).toEqual(['none']);

		fragment_rows.value = [{ id: 3 }, { id: 1 }];
		await flush();
		expect(texts('.keyed-fragment-empty li')).toEqual(['3', '1']);
		expect(texts('.keyed-fragment-empty p')).toEqual([]);
	});

	it('renders a keyed fragment body after setup statements', async () => {
		await render(KeyedFragmentSetupApp);
		expect(texts('.keyed-fragment-setup li')).toEqual([
			'item 1',
			'1',
			'item 2',
			'2',
			'item 3',
			'3',
		]);

		fragment_rows.value = [{ id: 2 }, { id: 1 }];
		await flush();
		expect(texts('.keyed-fragment-setup li')).toEqual(['item 2', '2', 'item 1', '1']);
	});

	it('renders fragment rows in a component that declares its own Fragment', async () => {
		fragment_rows.value = [{ id: 1 }, { id: 2 }];
		await render(OwnFragmentApp);
		expect(texts('.own-fragment li')).toEqual(['1', 'own 1', '2', 'own 2']);

		fragment_rows.value = [];
		await flush();
		expect(texts('.own-fragment p')).toEqual(['none']);
	});

	it('renders a fragment body keyed by the index in a loop with @empty', async () => {
		await render(IndexedFragmentEmptyApp);
		expect(texts('.indexed-fragment-empty li')).toEqual(['0:1', '1:2', '2:3']);

		fragment_rows.value = [];
		await flush();
		expect(texts('.indexed-fragment-empty p')).toEqual(['none']);
	});
});

function SetEmptyApp(props: { items: Set<string> }) @{
	<ul class="set-empty">
		@for (const item of props.items) {
			<li>{item}</li>
		} @empty {
			<li>{'empty'}</li>
		}
	</ul>
}

function SetSkipApp(props: { items: Set<string> }) @{
	<ul class="set-skip">
		@for (const item of props.items) {
			@if (item.length > 1) {
				<li>{item}</li>
			}
		}
	</ul>
}

function SetStatementApp(props: { items: Set<string> }) @{
	<ul class="set-statement">
		@for (const item of props.items) {
			const label = item.toUpperCase();
			<li>{label}</li>
		}
	</ul>
}

function SetRefApp() @{
	const items = ref(new Set<string>(['a', 'b']));
	<>
		<ul class="set-ref">
			@for (const item of items.value) {
				const label = item.toUpperCase();
				<li>{label}</li>
			} @empty {
				<li>{'empty'}</li>
			}
		</ul>
		<button
			class="set-ref-add"
			onClick={() => {
				items.value.add('c');
			}}
		>
			{'add'}
		</button>
		<button
			class="set-ref-clear"
			onClick={() => {
				items.value.clear();
			}}
		>
			{'clear'}
		</button>
	</>
}

let next_batch_calls = 0;

function nextBatch(): string[] {
	next_batch_calls += 1;
	return next_batch_calls === 1 ? ['first', 'batch'] : ['second'];
}

function NextBatchApp() @{
	<ul class="next-batch">
		@for (const item of nextBatch()) {
			<li>{item}</li>
		} @empty {
			<li>{'empty'}</li>
		}
	</ul>
}

describe('tsrx-vue @for over iterables', () => {
	it('renders a non-empty Set through @empty', async () => {
		await render(SetEmptyApp, { items: new Set(['a', 'b']) });
		expect(texts('.set-empty li')).toEqual(['a', 'b']);
	});

	it('renders @empty for an empty Set', async () => {
		await render(SetEmptyApp, { items: new Set<string>() });
		expect(texts('.set-empty li')).toEqual(['empty']);
	});

	it('skips a row of a Set when the body does not render it', async () => {
		await render(SetSkipApp, { items: new Set(['a', 'bb', 'c', 'dd']) });
		expect(texts('.set-skip li')).toEqual(['bb', 'dd']);
	});

	it('renders a statement body over a Set', async () => {
		await render(SetStatementApp, { items: new Set(['a', 'b']) });
		expect(texts('.set-statement li')).toEqual(['A', 'B']);
	});

	it('updates a ref(Set) on add and clear', async () => {
		await render(SetRefApp);
		expect(texts('.set-ref li')).toEqual(['A', 'B']);

		await click('.set-ref-add');
		expect(texts('.set-ref li')).toEqual(['A', 'B', 'C']);

		await click('.set-ref-clear');
		expect(texts('.set-ref li')).toEqual(['empty']);
	});

	it('renders the first batch from @for (const item of nextBatch()) and calls nextBatch once (#863)', async () => {
		next_batch_calls = 0;
		await render(NextBatchApp);
		expect(texts('.next-batch li')).toEqual(['first', 'batch']);
		expect(next_batch_calls).toBe(1);
	});
});

type ToggleRow = { id: string; label: string; visible: boolean };

function toggle_rows_initial(): ToggleRow[] {
	return [
		{ id: 'a', label: 'Alpha', visible: true },
		{ id: 'b', label: 'Beta', visible: true },
		{ id: 'c', label: 'Gamma', visible: true },
	];
}

const toggle_rows = ref(toggle_rows_initial());

function KeyedSkipApp() @{
	<div class="keyed-skip">
		@for (const item of toggle_rows.value; key item.id) {
			@if (item.visible) {
				<KeyedRow {item} />
			}
		}
	</div>
}

function KeyedEmptyApp() @{
	<div class="keyed-empty">
		@for (const item of toggle_rows.value; key item.id) {
			<KeyedRow {item} />
		} @empty {
			<p>{'none'}</p>
		}
	</div>
}

function KeyedSkipEmptyApp() @{
	<div class="keyed-skip-empty">
		@for (const item of toggle_rows.value; key item.id) {
			@if (item.visible) {
				<KeyedRow {item} />
			}
		} @empty {
			<p>{'none'}</p>
		}
	</div>
}

function KeyedBranchApp() @{
	<ul class="keyed-branch">
		@for (const item of toggle_rows.value; key item.id) {
			@if (item.visible) {
				<li>{'shown ' + item.id}</li>
			} @else {
				<li>{'hidden ' + item.id}</li>
			}
		}
	</ul>
}

function KeyedSkipSwitchApp() @{
	<ul class="keyed-skip-switch">
		@for (const item of toggle_rows.value; key item.id) {
			@if (item.visible) {
				@switch (item.label) {
					@case 'Beta': {
						<li>{'beta ' + item.id}</li>
					}
				}
			}
		}
	</ul>
}

function UnkeyedBranchApp() @{
	<ul class="unkeyed-branch">
		@for (const item of toggle_rows.value) {
			@if (item.visible) {
				<li>{'shown ' + item.id}</li>
			} @else {
				<li>{'hidden ' + item.id}</li>
			}
		}
	</ul>
}

function MissingSourceApp(props: { items: { id: string }[] }) @{
	<>
		<ul class="missing-source">
			@for (const item of props.items; key item.id) {
				<li>{item.id}</li>
			}
		</ul>
		<ul class="missing-source-empty">
			@for (const item of props.items; key item.id) {
				<li>{item.id}</li>
			} @empty {
				<li>{'none'}</li>
			}
		</ul>
	</>
}

function NextKeyedBatchApp() @{
	<ul class="next-keyed-batch">
		@for (const item of nextBatch(); key item) {
			<li>{item}</li>
		} @empty {
			<li>{'empty'}</li>
		}
	</ul>
}

describe('tsrx-vue keyed @for that can skip rows or has @empty (#178)', () => {
	beforeEach(() => {
		toggle_rows.value = toggle_rows_initial();
	});

	it('keeps row state on reorder when the body can skip a row', async () => {
		await render(KeyedSkipApp);
		await click('.keyed-skip .row-b');
		toggle_rows.value = [...toggle_rows.value].reverse();
		await flush();
		expect(texts('.keyed-skip .keyed-row')).toEqual(['Gamma:0', 'Beta:1', 'Alpha:0']);
	});

	it('hides and shows a row as its condition changes in place', async () => {
		await render(KeyedSkipApp);
		await click('.keyed-skip .row-a');

		toggle_rows.value[1].visible = false;
		await flush();
		expect(texts('.keyed-skip .keyed-row')).toEqual(['Alpha:1', 'Gamma:0']);

		toggle_rows.value[1].visible = true;
		await flush();
		expect(texts('.keyed-skip .keyed-row')).toEqual(['Alpha:1', 'Beta:0', 'Gamma:0']);
	});

	it('keeps row state on reorder in a loop with @empty, and clears and refills it', async () => {
		await render(KeyedEmptyApp);
		await click('.keyed-empty .row-b');
		toggle_rows.value = [...toggle_rows.value].reverse();
		await flush();
		expect(texts('.keyed-empty .keyed-row')).toEqual(['Gamma:0', 'Beta:1', 'Alpha:0']);
		expect(texts('.keyed-empty p')).toEqual([]);

		toggle_rows.value = [];
		await flush();
		expect(texts('.keyed-empty .keyed-row')).toEqual([]);
		expect(texts('.keyed-empty p')).toEqual(['none']);

		toggle_rows.value = toggle_rows_initial();
		await flush();
		expect(texts('.keyed-empty .keyed-row')).toEqual(['Alpha:0', 'Beta:0', 'Gamma:0']);
		expect(texts('.keyed-empty p')).toEqual([]);
	});

	it('follows a ref array mutated in place, keeping row state', async () => {
		await render(KeyedEmptyApp);
		await click('.keyed-empty .row-b');

		toggle_rows.value.reverse();
		await flush();
		expect(texts('.keyed-empty .keyed-row')).toEqual(['Gamma:0', 'Beta:1', 'Alpha:0']);

		toggle_rows.value.push({ id: 'd', label: 'Delta', visible: true });
		await flush();
		expect(texts('.keyed-empty .keyed-row')).toEqual(['Gamma:0', 'Beta:1', 'Alpha:0', 'Delta:0']);

		toggle_rows.value.splice(0);
		await flush();
		expect(texts('.keyed-empty .keyed-row')).toEqual([]);
		expect(texts('.keyed-empty p')).toEqual(['none']);

		toggle_rows.value.push({ id: 'e', label: 'Echo', visible: true });
		await flush();
		expect(texts('.keyed-empty .keyed-row')).toEqual(['Echo:0']);
		expect(texts('.keyed-empty p')).toEqual([]);
	});

	it('follows a ref array mutated in place in a loop without @empty', async () => {
		await render(KeyedSkipApp);
		await click('.keyed-skip .row-b');

		toggle_rows.value.reverse();
		await flush();
		expect(texts('.keyed-skip .keyed-row')).toEqual(['Gamma:0', 'Beta:1', 'Alpha:0']);

		toggle_rows.value.splice(2, 1);
		await flush();
		expect(texts('.keyed-skip .keyed-row')).toEqual(['Gamma:0', 'Beta:1']);
	});

	it('renders @empty only when the source is empty, not when every row is skipped', async () => {
		await render(KeyedSkipEmptyApp);
		await click('.keyed-skip-empty .row-c');

		for (const item of toggle_rows.value) item.visible = item.id === 'c';
		await flush();
		expect(texts('.keyed-skip-empty .keyed-row')).toEqual(['Gamma:1']);

		toggle_rows.value[2].visible = false;
		await flush();
		expect(texts('.keyed-skip-empty .keyed-row')).toEqual([]);
		expect(texts('.keyed-skip-empty p')).toEqual([]);

		toggle_rows.value = [];
		await flush();
		expect(texts('.keyed-skip-empty p')).toEqual(['none']);
	});

	it('switches a row between @if and @else as its condition changes', async () => {
		await render(KeyedBranchApp);
		expect(texts('.keyed-branch li')).toEqual(['shown a', 'shown b', 'shown c']);

		toggle_rows.value = toggle_rows.value.map((item) =>
			item.id === 'b' ? { ...item, visible: false } : item,
		);
		await flush();
		expect(texts('.keyed-branch li')).toEqual(['shown a', 'hidden b', 'shown c']);

		toggle_rows.value[0].visible = false;
		await flush();
		expect(texts('.keyed-branch li')).toEqual(['hidden a', 'hidden b', 'shown c']);
	});

	it('renders a @switch in a row that can be skipped, as its value changes', async () => {
		await render(KeyedSkipSwitchApp);
		expect(texts('.keyed-skip-switch li')).toEqual(['beta b']);

		toggle_rows.value[0].label = 'Beta';
		await flush();
		expect(texts('.keyed-skip-switch li')).toEqual(['beta a', 'beta b']);

		toggle_rows.value[1].label = 'Bravo';
		toggle_rows.value[0].visible = false;
		await flush();
		expect(texts('.keyed-skip-switch li')).toEqual([]);
	});

	it('switches a row of a loop without a key between @if and @else in place', async () => {
		await render(UnkeyedBranchApp);
		toggle_rows.value[1].visible = false;
		await flush();
		expect(texts('.unkeyed-branch li')).toEqual(['shown a', 'hidden b', 'shown c']);
	});

	it('renders no rows, or @empty, for a missing source', async () => {
		await render(MissingSourceApp, { items: null });
		expect(texts('.missing-source li')).toEqual([]);
		expect(texts('.missing-source-empty li')).toEqual(['none']);
	});

	it('walks a keyed @for source with @empty once (#863)', async () => {
		next_batch_calls = 0;
		await render(NextKeyedBatchApp);
		expect(texts('.next-keyed-batch li')).toEqual(['first', 'batch']);
		expect(next_batch_calls).toBe(1);
	});
});

type Todo = { id: string; title: string; kind: string; synced: number };

function todos_initial(): Todo[] {
	return [
		{ id: 'a', title: 'Alpha', kind: 'task', synced: 0 },
		{ id: 'b', title: 'Beta', kind: 'task', synced: 0 },
	];
}

const todos = ref(todos_initial());

function update_todo(id: string, patch: Partial<Todo>) {
	todos.value = todos.value.map((todo) => (todo.id === id ? { ...todo, ...patch } : todo));
}

function reverse_todos() {
	todos.value = [...todos.value].reverse();
}

function TodoCounter(props: { label: string }) @{
	const count = ref(0);
	<button
		class="todo-counter"
		onClick={() => count.value++}
	>{`${props.label}:${count.value}`}</button>
}

function KindRowsApp() @{
	<ul class="kind-rows">
		@for (const todo of todos.value; key todo.id) {
			@switch (todo.kind) {
				@case 'task': {
					<li>
						<TodoCounter label={'task ' + todo.title} />
					</li>
				}
				@case 'note': {
					<li>{'note ' + todo.title}</li>
				}
			}
		}
	</ul>
}

function KindRowsEmptyApp() @{
	<ul class="kind-rows-empty">
		@for (const todo of todos.value; key todo.id) {
			@switch (todo.kind) {
				@case 'task': {
					<li>
						<TodoCounter label={'task ' + todo.title} />
					</li>
				}
			}
		} @empty {
			<li>{'none'}</li>
		}
	</ul>
}

function IndexSwitchRowsApp() @{
	<ul class="index-switch-rows">
		@for (const todo of todos.value; index i; key todo.id) {
			@switch (i === 0) {
				@case true: {
					<li>
						<TodoCounter label={'first ' + todo.title} />
					</li>
				}
				@default: {
					<li>
						<TodoCounter label={'later ' + todo.title} />
					</li>
				}
			}
		}
	</ul>
}

const no_match_rows = ref([{ id: 'z', kind: 'none' }]);

function NoMatchRowsApp() @{
	<ul class="no-match-rows">
		@for (const row of no_match_rows.value; key row.id) {
			@switch (row.kind) {
				@case 'note': {
					<li>{'note ' + row.id}</li>
				}
			}
		}
	</ul>
}

const lookup_rows = ref([
	{ id: '1', kind: 'a' },
	{ id: '2', kind: 'b' },
]);
const kind_lookup = ref<Record<string, string> | null>({ a: 'a', b: 'b' });
const lookup_fails = ref(false);

function kind_or_throw(kind: string) {
	if (lookup_fails.value) throw new Error('lookup boom');
	return kind;
}

function LookupRowsApp() @{
	<ul class="lookup-rows">
		@for (const row of lookup_rows.value; key row.id) {
			@switch (kind_lookup.value![row.kind]) {
				@case 'a': {
					<li>{'a' + row.id}</li>
				}
				@case 'b': {
					<li>{'b' + row.id}</li>
				}
			}
		}
	</ul>
}

function FlagRowsApp() @{
	<ul class="lookup-rows">
		@for (const row of lookup_rows.value; key row.id) {
			@switch (kind_or_throw(row.kind)) {
				@case 'a': {
					<li>{'a' + row.id}</li>
				}
				@case 'b': {
					<li>{'b' + row.id}</li>
				}
			}
		}
	</ul>
}

function SecondCaseRowsApp() @{
	<ul class="second-case-rows">
		@for (const row of lookup_rows.value; key row.id) {
			@switch (kind_or_throw(row.kind)) {
				@case 'a': {
					<li>{'a'}</li>
				}
				@case 'b': {
					<li>
						<TodoCounter label={'b' + row.id} />
					</li>
				}
			}
		}
	</ul>
}

const case_fails = ref(false);

function case_value(value: string) {
	if (case_fails.value) throw new Error('case boom');
	return value;
}

function CaseTestRowsApp() @{
	<ul class="case-test-rows">
		@for (const row of lookup_rows.value; key row.id) {
			@switch (row.kind) {
				@case case_value('a'): {
					<li>{'a'}</li>
				}
				@case case_value('b'): {
					<li>{'b'}</li>
				}
				@default: {
					<li>
						<TodoCounter label={'other' + row.id} />
					</li>
				}
			}
		}
	</ul>
}

let empty_switch_runs = 0;

function count_kind(kind: string) {
	empty_switch_runs++;
	return kind;
}

function EmptySwitchRowsApp() @{
	<ul class="empty-switch-rows">
		@for (const row of lookup_rows.value; key row.id) {
			@switch (count_kind(row.kind)) {
			}
		}
		<li>{'end'}</li>
	</ul>
}

function NestedCaseRowsApp() @{
	<ul class="nested-case-rows">
		@for (const todo of todos.value; key todo.id) {
			@switch (todo.kind) {
				@case 'task': {
					@switch (todo.id) {
						@case 'a': {
							<li>
								<TodoCounter label={todo.id} />
							</li>
						}
						@default: {
							<li>{'other'}</li>
						}
					}
				}
			}
		}
	</ul>
}

function CaseSetupRowsApp() @{
	<ul class="case-setup-rows">
		@for (const todo of todos.value; key todo.id) {
			@switch (todo.kind) {
				@case 'task': {
					const label = todo.id;
					<li>
						<TodoCounter {label} />
					</li>
				}
			}
		}
	</ul>
}

const switch_fails = ref(false);

function select_kind() {
	if (switch_fails.value) throw new Error('switch boom');
	return 'a';
}

let picks = 0;

function pick_kind(todo: Todo) {
	picks++;
	if (switch_fails.value) throw new Error('row boom');
	return todo.kind;
}

function SwitchRowTryApp() @{
	<div class="switch-row-try">
		@try {
			<ul>
				@for (const todo of todos.value; key todo.id) {
					@switch (pick_kind(todo)) {
						@case 'task': {
							<li>{todo.title}</li>
						}
					}
				}
			</ul>
		} @catch (error) {
			<p>{(error as Error).message}</p>
		}
	</div>
}

function SwitchTryApp() @{
	<div class="switch-try">
		@try {
			@switch (select_kind()) {
				@case 'a': {
					<b>{'ok'}</b>
				}
			}
		} @catch (error) {
			<p>{(error as Error).message}</p>
		}
	</div>
}

describe('tsrx-vue keyed @switch rows', () => {
	beforeEach(() => {
		todos.value = todos_initial();
		switch_fails.value = false;
	});

	it('follows a keyed @switch row’s value and keeps its case mounted while it stays chosen', async () => {
		await render(KindRowsApp);
		await click('.kind-rows .todo-counter');

		update_todo('a', { synced: 1 });
		await flush();
		expect(texts('.kind-rows li')).toEqual(['task Alpha:1', 'task Beta:0']);

		update_todo('b', { kind: 'note' });
		await flush();
		expect(texts('.kind-rows li')).toEqual(['task Alpha:1', 'note Beta']);

		reverse_todos();
		await flush();
		expect(texts('.kind-rows li')).toEqual(['note Beta', 'task Alpha:1']);

		update_todo('a', { kind: 'none' });
		await flush();
		expect(texts('.kind-rows li')).toEqual(['note Beta']);

		update_todo('a', { kind: 'task' });
		await flush();
		expect(texts('.kind-rows li')).toEqual(['note Beta', 'task Alpha:0']);
	});

	it('renders nothing for a keyed @switch row whose value matches no case when it mounts', async () => {
		// Its own rows and a caught mount error, so a mount that throws can't
		// leave effects behind that the later tests' updates run.
		/** @type {unknown} */
		let error = null;
		try {
			await render(NoMatchRowsApp);
		} catch (caught) {
			error = caught;
		}
		expect(error).toBeNull();
		expect(texts('.no-match-rows li')).toEqual([]);

		no_match_rows.value = [{ id: 'z', kind: 'note' }];
		await flush();
		expect(texts('.no-match-rows li')).toEqual(['note z']);
	});

	it('mounts a @switch row without cases and runs its discriminant on each change', async () => {
		lookup_rows.value = [
			{ id: '1', kind: 'a' },
			{ id: '2', kind: 'b' },
		];
		empty_switch_runs = 0;
		await render(EmptySwitchRowsApp);
		expect(texts('.empty-switch-rows li')).toEqual(['end']);
		expect(empty_switch_runs).toBe(2);

		lookup_rows.value = [
			{ id: '1', kind: 'c' },
			{ id: '2', kind: 'b' },
		];
		await flush();
		expect(texts('.empty-switch-rows li')).toEqual(['end']);
		expect(empty_switch_runs).toBe(4);
	});

	it('keeps following a @switch row’s value after its discriminant throws outside a @catch', async () => {
		/** @type {string[]} */
		const errors = [];
		/** @param {Array<() => void>} steps */
		const run = async (Component: unknown, steps: Array<() => void>) => {
			lookup_rows.value = [
				{ id: '1', kind: 'a' },
				{ id: '2', kind: 'b' },
			];
			kind_lookup.value = { a: 'a', b: 'b' };
			lookup_fails.value = false;
			const app = createVaporApp(Component as Parameters<typeof createVaporApp>[0]);
			app.config.errorHandler = (caught) => {
				errors.push(String(caught));
			};
			app.mount(container);
			await flush();
			for (const step of steps) {
				step();
				await flush();
			}
			const shown = texts('.lookup-rows li');
			app.unmount();
			return shown;
		};
		const swap = () => {
			lookup_rows.value = [
				{ id: '1', kind: 'b' },
				{ id: '2', kind: 'a' },
			];
		};
		const restore = () => {
			kind_lookup.value = { a: 'a', b: 'b' };
		};

		expect(await run(LookupRowsApp, [() => (kind_lookup.value = null), restore, swap])).toEqual([
			'b1',
			'a2',
		]);
		expect(await run(LookupRowsApp, [() => (kind_lookup.value = null), swap, restore])).toEqual([
			'b1',
			'a2',
		]);
		expect(
			await run(FlagRowsApp, [
				() => (lookup_fails.value = true),
				() => (lookup_fails.value = false),
				swap,
			]),
		).toEqual(['b1', 'a2']);
		expect(
			await run(FlagRowsApp, [
				() => (lookup_fails.value = true),
				() => {
					lookup_fails.value = false;
					swap();
				},
			]),
		).toEqual(['b1', 'a2']);
		expect(errors.length).toBeGreaterThan(0);

		// While it throws, a row keeps the case it showed, with its state.
		lookup_rows.value = [{ id: '1', kind: 'b' }];
		lookup_fails.value = false;
		const app = createVaporApp(SecondCaseRowsApp);
		app.config.errorHandler = (caught) => {
			errors.push(String(caught));
		};
		app.mount(container);
		await flush();
		(container.querySelector('.second-case-rows .todo-counter') as HTMLElement).click();
		await flush();
		lookup_fails.value = true;
		await flush();
		const during = texts('.second-case-rows li');
		lookup_fails.value = false;
		await flush();
		const after = texts('.second-case-rows li');
		app.unmount();
		expect(during).toEqual(['b1:1']);
		expect(after).toEqual(['b1:1']);

		// A throwing case test, with the default case showing.
		lookup_rows.value = [{ id: '1', kind: 'c' }];
		case_fails.value = false;
		const tests_app = createVaporApp(CaseTestRowsApp);
		tests_app.config.errorHandler = (caught) => {
			errors.push(String(caught));
		};
		tests_app.mount(container);
		await flush();
		(container.querySelector('.case-test-rows .todo-counter') as HTMLElement).click();
		await flush();
		case_fails.value = true;
		await flush();
		const failing = texts('.case-test-rows li');
		case_fails.value = false;
		await flush();
		const recovered = texts('.case-test-rows li');
		lookup_rows.value = [{ id: '1', kind: 'b' }];
		await flush();
		const followed = texts('.case-test-rows li');
		tests_app.unmount();
		expect(failing).toEqual(['other1:1']);
		expect(recovered).toEqual(['other1:1']);
		expect(followed).toEqual(['b']);
		expect(errors.some((error) => error.includes('case boom'))).toBe(true);
	});

	it('follows a @switch row’s value in a loop with @empty, and renders @empty', async () => {
		await render(KindRowsEmptyApp);
		update_todo('b', { kind: 'note' });
		await flush();
		expect(texts('.kind-rows-empty li')).toEqual(['task Alpha:0']);

		todos.value = [];
		await flush();
		expect(texts('.kind-rows-empty li')).toEqual(['none']);
	});

	it('switches the case of a keyed @switch row that reads the index when the rows move', async () => {
		await render(IndexSwitchRowsApp);
		await click('.index-switch-rows .todo-counter');
		expect(texts('.index-switch-rows li')).toEqual(['first Alpha:1', 'later Beta:0']);

		reverse_todos();
		await flush();
		expect(texts('.index-switch-rows li')).toEqual(['first Beta:0', 'later Alpha:0']);
	});

	it('keeps the case of a keyed @switch row whose case has setup statements mounted, as before', async () => {
		// Such a row keeps the shared lowering: as a branch of its own, the case
		// would render again whenever its item is replaced.
		await render(CaseSetupRowsApp);
		await click('.case-setup-rows .todo-counter');
		update_todo('a', { synced: 1 });
		await flush();
		expect(texts('.case-setup-rows li')).toEqual(['a:1', 'b:0']);
	});

	it('keeps the case of a keyed @switch row whose case is a nested @switch mounted, as before', async () => {
		await render(NestedCaseRowsApp);
		await click('.nested-case-rows .todo-counter');
		update_todo('a', { synced: 1 });
		await flush();
		expect(texts('.nested-case-rows li')).toEqual(['a:1', 'other']);
	});

	it('runs a keyed @switch row’s value once per change, and sends its throw to @catch', async () => {
		picks = 0;
		await render(SwitchRowTryApp);
		expect(texts('.switch-row-try li')).toEqual(['Alpha', 'Beta']);
		expect(picks).toBe(2);

		update_todo('a', { title: 'Alpha2' });
		await flush();
		expect(texts('.switch-row-try li')).toEqual(['Alpha2', 'Beta']);
		expect(picks).toBe(3);

		switch_fails.value = true;
		update_todo('a', { synced: 1 });
		await flush();
		expect(texts('.switch-row-try p')).toEqual(['row boom']);
	});

	it('sends a throw from a @switch’s value on an update to its @catch', async () => {
		await render(SwitchTryApp);
		expect(texts('.switch-try b')).toEqual(['ok']);

		switch_fails.value = true;
		await flush();
		expect(texts('.switch-try p')).toEqual(['switch boom']);
	});
});

const element_switch = ref(1);
const element_switch_fails = ref(false);
let element_switch_runs = 0;

function element_switch_value(): number {
	element_switch_runs++;
	if (element_switch_fails.value) throw new Error('element switch boom');
	return element_switch.value;
}

function ElementSwitchCounter(props: { label: string }) @{
	const count = ref(0);
	<button class="element-switch-counter" onClick={() => count.value++}>
		{props.label + ':' + count.value}
	</button>
}

function ElementSwitch({ n }: { n: number }) @{
	<div class="element-switch">
		@switch (n) {
			@case 1: {
				<ElementSwitchCounter label="one" />
			}
			@case 2: {
			}
			@default: {
				<ElementSwitchCounter label="other" />
			}
		}
		{'n=' + n}
	</div>
}

function ElementSwitchHost() @{
	<ElementSwitch n={element_switch.value} />
}

function ElementSwitchRuns() @{
	<p class="element-switch-runs">
		@switch (element_switch_value()) {
			@case 1: {
				<ElementSwitchCounter label="one" />
			}
			@default: {
				<i>{'other'}</i>
			}
		}
	</p>
}

function ElementSwitchTry() @{
	<div class="element-switch-try">
		@try {
			<ElementSwitchRuns />
		} @catch (error) {
			<b>{(error as Error).message}</b>
		}
	</div>
}

function ElementSwitchInner() @{
	<span class="element-switch-inner">{'inner'}</span>
}

function ElementSwitchChild() @{
	<div class="element-switch-child">
		@switch (element_switch.value) {
			@case 1: {
				<ElementSwitchInner />
			}
			@default: {
				<i>{'other'}</i>
			}
		}
	</div>
}

function ElementSwitchAttrs() @{
	<ElementSwitchChild class="extra" data-x="1" />
}

function ElementSwitchTeleport() @{
	<p class="element-switch-teleport">
		@switch (element_switch.value) {
			@case 1: {
				<VaporTeleport to="body">
					<b class="element-switch-teleported">{'one'}</b>
				</VaporTeleport>
			}
			@default: {
				<i>{'other'}</i>
			}
		}
	</p>
}

const element_switch_key = ref(0);
let element_switch_calls = 0;

function ElementSwitchKeyed() @{
	<div class="element-switch-keyed" key={element_switch_key.value}>
		@switch (++element_switch_calls) {
			@case 1: {
				<b>{'first'}</b>
			}
			@default: {
				<i>{'later'}</i>
			}
		}
	</div>
}

describe("tsrx-vue an element's @switch (#1403)", () => {
	beforeEach(() => {
		element_switch.value = 1;
		element_switch_fails.value = false;
		element_switch_runs = 0;
	});

	it('follows its value, and keeps its case mounted while the case stays picked', async () => {
		await render(ElementSwitchHost);
		expect(text('.element-switch')).toBe('one:0n=1');
		await click('.element-switch-counter');

		element_switch.value = 3;
		await flush();
		expect(text('.element-switch')).toBe('other:0n=3');
		await click('.element-switch-counter');

		// The default case stays picked: its component keeps its state.
		element_switch.value = 4;
		await flush();
		expect(text('.element-switch')).toBe('other:1n=4');

		// A case that renders nothing.
		element_switch.value = 2;
		await flush();
		expect(text('.element-switch')).toBe('n=2');
		expect(container.querySelector('.element-switch-counter')).toBeNull();

		element_switch.value = 1;
		await flush();
		expect(text('.element-switch')).toBe('one:0n=1');
	});

	it('runs its discriminant once per change, as before', async () => {
		await render(ElementSwitchRuns);
		expect(element_switch_runs).toBe(1);
		element_switch.value = 2;
		await flush();
		expect(text('.element-switch-runs')).toBe('other');
		expect(element_switch_runs).toBe(2);
		element_switch.value = 3;
		await flush();
		expect(element_switch_runs).toBe(3);
	});

	it('keeps the case it showed while its discriminant throws, then follows, as before', async () => {
		const errors: string[] = [];
		const app = createVaporApp(ElementSwitchRuns);
		app.config.errorHandler = (error) => {
			errors.push(String(error));
		};
		try {
			app.mount(container);
			await flush();
			await click('.element-switch-counter');
			element_switch_fails.value = true;
			await flush();
			expect(text('.element-switch-runs')).toBe('one:1');
			element_switch_fails.value = false;
			element_switch.value = 2;
			await flush();
			expect(text('.element-switch-runs')).toBe('other');
			element_switch.value = 1;
			await flush();
			expect(text('.element-switch-runs')).toBe('one:0');
			expect(errors).toEqual(['Error: element switch boom']);
		} finally {
			app.unmount();
		}
	});

	it("gives a component case none of its parent component's fallthrough attributes", async () => {
		// The server renders it without them too.
		await render(ElementSwitchAttrs);
		expect(container.querySelector('.element-switch-child')?.className).toBe(
			'element-switch-child extra',
		);
		const inner = container.querySelector('.element-switch-inner') as HTMLElement;
		expect(inner.className).toBe('element-switch-inner');
		expect(inner.hasAttribute('data-x')).toBe(false);
	});

	it('leaves no comments behind when a VaporTeleport case comes and goes', async () => {
		await render(ElementSwitchTeleport);
		for (const value of [2, 1, 2, 1]) {
			element_switch.value = value;
			await flush();
		}
		const host = container.querySelector('.element-switch-teleport') as HTMLElement;
		expect(host.innerHTML.match(/<!--teleport start-->/g)).toHaveLength(1);
		expect(document.body.querySelectorAll('.element-switch-teleported')).toHaveLength(1);
	});

	it('runs it again when a keyed element around it renders again, as before', async () => {
		// The keyed element renders its children again, so the \`@switch\` keeps
		// the shared lowering there.
		element_switch_calls = 0;
		await render(ElementSwitchKeyed);
		expect(text('.element-switch-keyed')).toBe('first');
		element_switch_key.value++;
		await flush();
		expect(text('.element-switch-keyed')).toBe('later');
	});

	it('sends a throw from its discriminant to the @catch around its component, as before', async () => {
		await render(ElementSwitchTry);
		expect(text('.element-switch-try')).toBe('one:0');
		element_switch_fails.value = true;
		await flush();
		expect(text('.element-switch-try')).toBe('element switch boom');
	});
});

const shadow_log: string[] = [];

function ShadowRows(props: { rows: { id: string }[] }) @{
	<ul>
		@for (const row of props.rows; index i; key row.id) {
			<li>
				<button
					class="shadow-row"
					onClick={() => {
						try {
							throw 'catch';
						} catch (row) {
							shadow_log.push(String(row));
						}
						try {
							throw { row: 'catch pattern' };
						} catch ({ row }) {
							shadow_log.push(row);
						}
						for (const row of ['for of']) shadow_log.push(row);
						for (const row in { 'for in': 1 }) {
							shadow_log.push(row);
						}
						for (let row = 0; row < 1; row++) {
							shadow_log.push('for ' + row);
						}
						switch (row.id) {
							case 'a':
								const row = 'case';
								shadow_log.push(row);
						}
						const Named = class row {
							static label = 'class';
							read() {
								return row.label;
							}
						};
						shadow_log.push(new Named().read());
						[7].forEach((i) => shadow_log.push('param ' + i));
						try {
							throw 'index';
						} catch (i) {
							shadow_log.push(String(i));
						}
						shadow_log.push(row.id + i);
					}}
				>
					{row.id}
				</button>
			</li>
		}
	</ul>
}

function ShadowPatternRows(props: { rows: { id: string }[] }) @{
	<ul>
		@for (const { id } of props.rows; key id) {
			<li>
				<button
					class="shadow-pattern-row"
					onClick={() => {
						try {
							throw 'catch';
						} catch (id) {
							shadow_log.push(String(id));
						}
						for (const id of ['for of']) {
							shadow_log.push(id);
						}
						shadow_log.push(id);
					}}
				>
					{id}
				</button>
			</li>
		}
	</ul>
}

describe('tsrx-vue a keyed row that declares its item’s name again', () => {
	beforeEach(() => {
		shadow_log.length = 0;
	});

	it('reads the inner binding, and the item outside it', async () => {
		await render(ShadowRows, { rows: [{ id: 'a' }] });
		await click('.shadow-row');
		expect(shadow_log).toEqual([
			'catch',
			'catch pattern',
			'for of',
			'for in',
			'for 0',
			'case',
			'class',
			'param 7',
			'index',
			'a0',
		]);
	});

	it('does the same for a destructured item', async () => {
		await render(ShadowPatternRows, { rows: [{ id: 'a' }] });
		await click('.shadow-pattern-row');
		expect(shadow_log).toEqual(['catch', 'for of', 'a']);
	});
});

const ifs = ref({ on: false, level: 0 });

function IfsCounter({ label }: { label: string }) @{
	const count = ref(0);
	<button onClick={() => count.value++}>{label + ':' + count.value}</button>
}

function HydratedIfs({ on, level }: { on: boolean; level: number }) @{
	<div>
		<span class="on">
			@if (on) {
				<IfsCounter label="on" />
			}
		</span>
		<span class="level">
			@if (level === 2) {
				<i>{'two'}</i>
			}
		</span>
	</div>
}

function HydratedIfsHost() @{
	<HydratedIfs on={ifs.value.on} level={ifs.value.level} />
}

describe('tsrx-vue hydrating an element whose child is an @if without @else', () => {
	// The markup the server build renders for these states
	// (vapor-for-ssr.test.js renders the same component).
	const server_markup = {
		empty: '<div><span class="on"><!----></span><span class="level"><!----></span></div>',
		rendered:
			'<div><span class="on"><button>on:0</button></span><span class="level"><i>two</i></span></div>',
	};

	async function hydrate(markup: string) {
		container.innerHTML = markup;
		const server_nodes = Array.from(container.querySelectorAll('button, b, i'));
		const errors: unknown[] = [];
		const warnings: string[] = [];
		const warn_spy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
			warnings.push(args.map(String).join(' '));
		});
		const app = createVaporSSRApp(HydratedIfsHost);
		app.config.errorHandler = (error) => {
			errors.push(error);
		};
		app.mount(container);
		await flush();
		warn_spy.mockRestore();
		expect(errors).toEqual([]);
		expect(warnings.filter((warning) => warning.includes('ydration'))).toEqual([]);
		const hydrated_nodes = Array.from(container.querySelectorAll('button, b, i'));
		expect(hydrated_nodes.length).toBe(server_nodes.length);
		hydrated_nodes.forEach((node, index) => expect(node).toBe(server_nodes[index]));
		return app;
	}

	function shown() {
		return [text('.on'), text('.level')];
	}

	it('hydrates the empty branches, then follows their conditions', async () => {
		ifs.value = { on: false, level: 0 };
		const app = await hydrate(server_markup.empty);
		try {
			ifs.value = { on: true, level: 2 };
			await flush();
			expect(shown()).toEqual(['on:0', 'two']);
			(container.querySelector('.on button') as HTMLElement).click();
			await flush();

			// The branch stays while its condition does, with its state.
			ifs.value = { on: true, level: 0 };
			await flush();
			expect(shown()).toEqual(['on:1', '']);

			ifs.value = { on: false, level: 0 };
			await flush();
			expect(shown()).toEqual(['', '']);
		} finally {
			app.unmount();
		}
	});

	it('hydrates the rendered branches, keeps their state, then follows their conditions', async () => {
		ifs.value = { on: true, level: 2 };
		const app = await hydrate(server_markup.rendered);
		try {
			(container.querySelector('.on button') as HTMLElement).click();
			await flush();
			ifs.value = { on: true, level: 0 };
			await flush();
			expect(shown()).toEqual(['on:1', '']);

			ifs.value = { on: false, level: 0 };
			await flush();
			expect(shown()).toEqual(['', '']);

			ifs.value = { on: true, level: 2 };
			await flush();
			expect(shown()).toEqual(['on:0', 'two']);
		} finally {
			app.unmount();
		}
	});
});

const kept_tab = ref(0);

function KeptTabA() @{
	const count = ref(0);
	<button class="kept-a" onClick={() => count.value++}>
		{'a:' + count.value}
	</button>
}

function KeptTabB() @{
	const count = ref(0);
	<button class="kept-b" onClick={() => count.value++}>
		{'b:' + count.value}
	</button>
}

function KeptTabs() @{
	<div class="kept">
		<VaporKeepAlive>
			@if (kept_tab.value === 1) {
				<KeptTabA />
			} @else if (kept_tab.value === 2) {
				<KeptTabB />
			}
		</VaporKeepAlive>
	</div>
}

const sibling_user = ref({ name: 'Ann', online: true });

function SiblingCounter() @{
	const count = ref(0);
	<button class="sibling-counter" onClick={() => count.value++}>
		{'a:' + count.value}
	</button>
}

function SiblingIf() @{
	<div class="sibling-if">
		@if (sibling_user.value.online) {
			<SiblingCounter />
		}
		{sibling_user.value.name}
	</div>
}

describe('tsrx-vue an element whose child is an @if without @else, on the client', () => {
	it('keeps an @else if branch cached by VaporKeepAlive', async () => {
		// The chain keeps the nested ternary: its keyed \`createIf\` is what
		// \`VaporKeepAlive\` caches, where a \`v-else-if\` one isn't.
		kept_tab.value = 2;
		await render(KeptTabs);
		(container.querySelector('.kept-b') as HTMLElement).click();
		await flush();
		for (const tab of [1, 2, 0, 2]) {
			kept_tab.value = tab;
			await flush();
		}
		expect(text('.kept')).toBe('b:1');
	});

	it('keeps its branch when a sibling expression changes (#1402)', async () => {
		// The \`v-if\` is a \`createIf\` of its own, outside the sibling's effect.
		sibling_user.value = { name: 'Ann', online: true };
		await render(SiblingIf);
		(container.querySelector('.sibling-counter') as HTMLElement).click();
		await flush();
		sibling_user.value = { ...sibling_user.value };
		await flush();
		expect(text('.sibling-counter')).toBe('a:1');
	});
});

let catch_runs = 0;

function throw_from_catch(error: unknown): string {
	catch_runs++;
	throw new Error('catch boom after ' + (error as Error).message);
}

function throw_pending_label(): string {
	throw new Error('pending boom');
}

type CatchLoader = Promise<typeof CatchResolved>;

function CatchResolved(props: { value: string }) @{
	<p class="catch-resolved">{props.value}</p>
}

function never_loads(): CatchLoader {
	return new Promise(() => {});
}

// The async child rejects, and the inner @catch throws.
function RejectedCatchThrows(props: { promise: CatchLoader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		@try {
			<AsyncChild value="hello" />
		} @pending {
			<p class="catch-pending">{'loading'}</p>
		} @catch (err) {
			const message = throw_from_catch(err);
			<p class="inner-caught">{message}</p>
		}
	} @catch (err) {
		<p class="outer-caught">{(err as Error).message}</p>
	}
}

// The same, without an outer @try.
function RejectedCatchThrowsAlone(props: { promise: CatchLoader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<AsyncChild value="hello" />
	} @pending {
		<p class="catch-pending">{'loading'}</p>
	} @catch (err) {
		const message = throw_from_catch(err);
		<p class="inner-caught">{message}</p>
	}
}

// The @pending body throws, and the inner @catch throws.
function PendingCatchThrows(props: { promise: CatchLoader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		@try {
			<AsyncChild value="hello" />
		} @pending {
			const label = throw_pending_label();
			<p class="catch-pending">{label}</p>
		} @catch (err) {
			<p class="inner-caught">{throw_from_catch(err)}</p>
		}
	} @catch (err) {
		<p class="outer-caught">{(err as Error).message}</p>
	}
}

// The same, without an outer @try.
function PendingCatchThrowsAlone(props: { promise: CatchLoader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<AsyncChild value="hello" />
	} @pending {
		const label = throw_pending_label();
		<p class="catch-pending">{label}</p>
	} @catch (err) {
		const message = throw_from_catch(err);
		<p class="inner-caught">{message}</p>
	}
}

function count_catch_pattern(): string {
	catch_runs++;
	return '!';
}

function SyncThrow() @{
	throw new Error('sync body');
	<p />
}

// The body throws as it renders, under @pending, and the @catch's parameter
// pattern throws: it reads `status` from an error without a `response`.
function SyncCatchPatternThrows() @{
	@try {
		@try {
			<SyncThrow />
		} @pending {
			<p class="catch-pending">{'loading'}</p>
		} @catch ({ seen = count_catch_pattern(), response: { status } }: any) {
			<p class="inner-caught">{String(status) + seen}</p>
		}
	} @catch (err) {
		<p class="outer-caught">{(err as Error).message}</p>
	}
}

// The same, without an outer @try.
function SyncCatchPatternThrowsAlone() @{
	@try {
		<SyncThrow />
	} @pending {
		<p class="catch-pending">{'loading'}</p>
	} @catch ({ seen = count_catch_pattern(), response: { status } }: any) {
		<p class="inner-caught">{String(status) + seen}</p>
	}
}

// The async child rejects, and the @catch's parameter pattern throws.
function RejectedCatchPatternThrows(props: { promise: CatchLoader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		@try {
			<AsyncChild value="hello" />
		} @pending {
			<p class="catch-pending">{'loading'}</p>
		} @catch ({ seen = count_catch_pattern(), response: { status } }: any) {
			<p class="inner-caught">{String(status) + seen}</p>
		}
	} @catch (err) {
		<p class="outer-caught">{(err as Error).message}</p>
	}
}

// The async child appears after the Suspense resolved, then rejects, and the
// @catch's parameter pattern throws.
const catch_pattern_async_shown = ref(false);

function LateRejectedCatchPatternThrows(props: { promise: CatchLoader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		@try {
			<div>
				@if (catch_pattern_async_shown.value) {
					<AsyncChild value="hello" />
				}
			</div>
		} @pending {
			<p class="catch-pending">{'loading'}</p>
		} @catch ({ seen = count_catch_pattern(), response: { status } }: any) {
			<p class="inner-caught">{String(status) + seen}</p>
		}
	} @catch (err) {
		<p class="outer-caught">{(err as Error).message}</p>
	}
}

// The body's first render throws while the Suspense is pending, and leaves a
// watcher that throws later. The @catch resets, which replaces the boundary
// inside the Suspense; the watcher then throws.
const replaced_twin = { initial: true, release: () => {} };

function fail_with(message: string): never {
	throw new Error(message);
}

function arm_late_watcher(): string {
	if (replaced_twin.initial) {
		const gate = new Promise<void>((resolve) => (replaced_twin.release = resolve));
		watchEffect(async () => {
			await gate;
			throw new Error('late');
		});
	}
	return '';
}

function LateFromReplacedTwin(props: { promise: CatchLoader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<div>
			@if (replaced_twin.initial) {
				<AsyncChild value="hello" />
			}
			<span>{arm_late_watcher()}</span>
			<span class="replaced-body">{replaced_twin.initial ? fail_with('body') : 'ok'}</span>
		</div>
	} @pending {
		<i>{replaced_twin.initial ? fail_with('pending') : 'loading'}</i>
	} @catch (err, reset) {
		<button
			class="replaced-reset"
			onClick={() => {
				replaced_twin.initial = false;
				reset();
			}}
		>
			{(err as Error).message}
		</button>
	}
}

// The body registers an unmount hook that throws, then throws as it renders,
// so the @catch shows; the hook throws when the @try goes away.
function arm_teardown(): string {
	onBeforeUnmount(() => {
		throw new Error('teardown');
	});
	return '';
}

function TeardownTwin() @{
	@try {
		<p>
			{arm_teardown()}
			{fail_with('body')}
		</p>
	} @pending {
		<i>{'wait'}</i>
	} @catch (err) {
		<b class="teardown-caught">{(err as Error).message}</b>
	}
}

function TeardownPlain() @{
	@try {
		<p>
			{arm_teardown()}
			{fail_with('body')}
		</p>
	} @catch (err) {
		<b class="teardown-caught">{(err as Error).message}</b>
	}
}

// The same, while the body shows.
function TeardownShowingTwin() @{
	@try {
		<p class="teardown-body">{arm_teardown()}</p>
	} @pending {
		<i>{'wait'}</i>
	} @catch (err) {
		<b class="teardown-caught">{(err as Error).message}</b>
	}
}

function TeardownShowingPlain() @{
	@try {
		<p class="teardown-body">{arm_teardown()}</p>
	} @catch (err) {
		<b class="teardown-caught">{(err as Error).message}</b>
	}
}

// A component in the body whose unmount hook throws.
function ChildTeardown() @{
	onBeforeUnmount(() => {
		throw new Error('child teardown');
	});
	<span class="child-teardown">{'child'}</span>
}

function ChildTeardownTwin() @{
	@try {
		<ChildTeardown />
	} @pending {
		<i>{'wait'}</i>
	} @catch (err) {
		<b class="teardown-caught">{(err as Error).message}</b>
	}
}

function ChildTeardownPlain() @{
	@try {
		<ChildTeardown />
	} @catch (err) {
		<b class="teardown-caught">{(err as Error).message}</b>
	}
}

function ChildTeardownNoTry() @{
	<div>
		<ChildTeardown />
	</div>
}

const child_teardown_shown = ref(true);

// An @if removes the inner part while the @try around it stays.
function IfRemovesTeardown(props: { inner: unknown }) @{
	const Inner = props.inner as typeof ChildTeardownPlain;
	@try {
		<div>
			@if (child_teardown_shown.value) {
				<Inner />
			}
		</div>
	} @catch (err) {
		<b class="if-caught">{(err as Error).message}</b>
	}
}

// The same, with the @if as the whole body of the @try around it, which
// renders its content again to remove it.
function IfRemovesTeardownAtRoot(props: { inner: unknown }) @{
	const Inner = props.inner as typeof ChildTeardownPlain;
	@try {
		@if (child_teardown_shown.value) {
			<Inner />
		}
	} @catch (err) {
		<b class="if-caught">{(err as Error).message}</b>
	}
}

// A body component whose click throws, and whose unmount hook throws as
// the @catch replaces it.
function ClickThenTeardown() @{
	onBeforeUnmount(() => {
		throw new Error('child teardown');
	});
	<button
		class="click-then-teardown"
		onClick={() => {
			throw new Error('click');
		}}
	>
		{'fail'}
	</button>
}

function SwapTeardownTwin() @{
	@try {
		<ClickThenTeardown />
	} @pending {
		<i>{'wait'}</i>
	} @catch (err) {
		<b class="teardown-caught">{(err as Error).message}</b>
	}
}

function SwapTeardownPlain() @{
	@try {
		<ClickThenTeardown />
	} @catch (err) {
		<b class="teardown-caught">{(err as Error).message}</b>
	}
}

// A component whose scope dispose callback throws, which ends Vue's teardown
// of it partway, beside one whose teardown is plain.
let scope_teardown_unmounts = 0;

function ScopeTeardown() @{
	onScopeDispose(() => {
		throw new Error('scope teardown');
	});
	<span class="scope-teardown">{'scope'}</span>
}

function AfterScopeTeardown() @{
	onBeforeUnmount(() => {
		scope_teardown_unmounts++;
	});
	<span class="after-scope-teardown">{'after'}</span>
}

function ScopeTeardownBody() @{
	<>
		<button
			class="scope-click"
			onClick={() => {
				throw new Error('click');
			}}
		>
			{'fail'}
		</button>
		<ScopeTeardown />
		<AfterScopeTeardown />
	</>
}

function SwapScopeTeardownTwin() @{
	@try {
		<ScopeTeardownBody />
	} @pending {
		<i>{'wait'}</i>
	} @catch (err) {
		<b class="teardown-caught">{(err as Error).message}</b>
	}
}

function SwapScopeTeardownPlain() @{
	@try {
		<ScopeTeardownBody />
	} @catch (err) {
		<b class="teardown-caught">{(err as Error).message}</b>
	}
}

// A reset renders the content again, removing the @catch, which holds it.
const scope_reset_fails = ref(true);

function ScopeResetBody() @{
	<p class="scope-reset-body">{scope_reset_fails.value ? fail_with('first') : 'ok'}</p>
}

function ResetScopeTeardown() @{
	@try {
		<ScopeResetBody />
	} @catch (err, reset) {
		<>
			<ScopeTeardown />
			<button class="scope-reset" onClick={reset}>
				{(err as Error).message}
			</button>
		</>
	}
}

// The same, with the component in a Suspense, which Vue tears down as the
// @try removes the @catch, after the content rendered again.
function ResetSuspenseScopeTeardown() @{
	@try {
		<ScopeResetBody />
	} @catch (err, reset) {
		<>
			<Suspense
				v-slots={{
					default: () => <ScopeTeardown />,
					fallback: () => <i>{'wait'}</i>,
				}}
			/>
			<button class="scope-reset" onClick={reset}>
				{(err as Error).message}
			</button>
		</>
	}
}

// The @catch holds, in a Suspense, a component whose scope dispose callback
// sets off a watcher in the content a reset renders, which throws.
const reset_signal = ref(0);

function BumpsOnDispose() @{
	onScopeDispose(() => {
		reset_signal.value++;
	});
	<span>{'old'}</span>
}

function WatchesResetSignal() @{
	watch(
		reset_signal,
		() => {
			throw new Error('new content watcher');
		},
		{ flush: 'sync' },
	);
	<p class="scope-reset-body">{'ok'}</p>
}

function WatchesResetSignalTwice() @{
	watch(
		reset_signal,
		() => {
			throw new Error('new content watcher');
		},
		{ flush: 'sync' },
	);
	watch(
		reset_signal,
		() => {
			throw new Error('second content watcher');
		},
		{ flush: 'sync' },
	);
	<p class="scope-reset-body">{'ok'}</p>
}

function ResetWatcherBody(props: { body: unknown }) @{
	const Body = props.body as typeof WatchesResetSignal;
	<>{scope_reset_fails.value ? fail_with('first') : <Body />}</>
}

function ResetWatcherPlain(props: { body: unknown }) @{
	@try {
		<ResetWatcherBody body={props.body} />
	} @catch (err, reset) {
		<>
			<Suspense
				v-slots={{
					default: () => <BumpsOnDispose />,
					fallback: () => <i>{'wait'}</i>,
				}}
			/>
			<button class="scope-reset" onClick={reset}>
				{(err as Error).message}
			</button>
		</>
	}
}

function ResetWatcherTwin(props: { body: unknown }) @{
	@try {
		<ResetWatcherBody body={props.body} />
	} @pending {
		<i>{'pending'}</i>
	} @catch (err, reset) {
		<>
			<Suspense
				v-slots={{
					default: () => <BumpsOnDispose />,
					fallback: () => <i>{'wait'}</i>,
				}}
			/>
			<button class="scope-reset" onClick={reset}>
				{(err as Error).message}
			</button>
		</>
	}
}

// The same, with the watcher in the @try body's own inline code.
let inline_reset_fails = true;

function ResetInlineWatcherPlain() @{
	@try {
		if (inline_reset_fails) throw new Error('first');
		watch(
			reset_signal,
			() => {
				throw new Error('inline content watcher');
			},
			{ flush: 'sync' },
		);
		<p class="scope-reset-body">{'ok'}</p>
	} @catch (err, reset) {
		<>
			<Suspense
				v-slots={{
					default: () => <BumpsOnDispose />,
					fallback: () => <i>{'wait'}</i>,
				}}
			/>
			<button class="scope-reset" onClick={reset}>
				{(err as Error).message}
			</button>
		</>
	}
}

function ResetInlineWatcherTwin() @{
	@try {
		if (inline_reset_fails) throw new Error('first');
		watch(
			reset_signal,
			() => {
				throw new Error('inline content watcher');
			},
			{ flush: 'sync' },
		);
		<p class="scope-reset-body">{'ok'}</p>
	} @pending {
		<i>{'pending'}</i>
	} @catch (err, reset) {
		<>
			<Suspense
				v-slots={{
					default: () => <BumpsOnDispose />,
					fallback: () => <i>{'wait'}</i>,
				}}
			/>
			<button class="scope-reset" onClick={reset}>
				{(err as Error).message}
			</button>
		</>
	}
}

// The body holds, in a Suspense, a component whose unmount hook throws, and
// throws as it renders again, which swaps in the @catch in that same render.
const swap_render_fails = ref(false);

function SuspendedTeardown() @{
	onBeforeUnmount(() => {
		throw new Error('old teardown');
	});
	<p>{'old'}</p>
}

function RenderSwapTwin() @{
	@try {
		if (swap_render_fails.value) throw new Error('render failure');
		<Suspense v-slots={{ default: () => <SuspendedTeardown />, fallback: () => <i /> }} />
	} @pending {
		<i>{'wait'}</i>
	} @catch (err) {
		<b class="teardown-caught">{(err as Error).message}</b>
	}
}

function RenderSwapPlain() @{
	@try {
		if (swap_render_fails.value) throw new Error('render failure');
		<Suspense v-slots={{ default: () => <SuspendedTeardown />, fallback: () => <i /> }} />
	} @catch (err) {
		<b class="teardown-caught">{(err as Error).message}</b>
	}
}

// A reset removes a @catch whose component's scope dispose callback throws
// `scope_teardown_value`, once; a hook above that sees that value sets off a
// watcher in the new content.
let scope_teardown_armed = true;
let scope_teardown_value: unknown = null;

function ScopeTeardownOnce() @{
	onScopeDispose(() => {
		if (!scope_teardown_armed) return;
		scope_teardown_armed = false;
		throw scope_teardown_value;
	});
	<span>{'scope'}</span>
}

// The same value, thrown again by the new content's watcher.
function WatchesResetSignalSameValue() @{
	watch(
		reset_signal,
		() => {
			throw scope_teardown_value;
		},
		{ flush: 'sync' },
	);
	<p class="scope-reset-body">{'ok'}</p>
}

function ObservedResetWatcher(props: { body: unknown }) @{
	onErrorCaptured((error) => {
		if (error === scope_teardown_value) reset_signal.value++;
	});
	<ResetWatcherWithThrowingCatch body={props.body} />
}

function ResetWatcherWithThrowingCatch(props: { body: unknown }) @{
	@try {
		<ResetWatcherBody body={props.body} />
	} @catch (err, reset) {
		<>
			<Suspense
				v-slots={{
					default: () => <ScopeTeardownOnce />,
					fallback: () => <i>{'wait'}</i>,
				}}
			/>
			<button class="scope-reset" onClick={reset}>
				{err instanceof Error ? err.message : String(err)}
			</button>
		</>
	}
}

// The @catch's own teardown resets the @try, as the @catch renders again
// for a change it reads: that render shows the content, whose watcher the
// rest of the teardown sets off.
let cleanup_reset_fails = true;
let cleanup_resets = false;
const cleanup_revision = ref(0);

function ResetDuringCleanup() @{
	@try {
		if (cleanup_reset_fails) throw new Error('first');
		<WatchesResetSignal />
	} @catch (err, reset) {
		const detail = cleanup_revision.value + ': ' + (err as Error).message;
		onScopeDispose(() => {
			if (!cleanup_resets) return;
			cleanup_resets = false;
			cleanup_reset_fails = false;
			reset();
		});
		<>
			<Suspense
				v-slots={{
					default: () => <BumpsOnDispose />,
					fallback: () => <i>{'wait'}</i>,
				}}
			/>
			<b class="cleanup-caught">{detail}</b>
		</>
	}
}

// The body's async component rejects while the Suspense is pending, so the
// boundary around the Suspense swaps in the @catch and removes the body,
// whose other component throws as it is torn down.
let reject_beside_teardown: (error: Error) => void = () => {};

function BesideTeardownBody() @{
	const Loader = defineVaporAsyncComponent(
		() => new Promise<any>((_resolve, fail) => (reject_beside_teardown = fail)),
	);
	<div>
		<ChildTeardown />
		<Loader />
	</div>
}

function PendingSwapTeardown() @{
	@try {
		<BesideTeardownBody />
	} @pending {
		<i>{'wait'}</i>
	} @catch (err) {
		<b class="teardown-caught">{(err as Error).message}</b>
	}
}

// A component whose setup never settles, so it counts as pending, with an
// unmount hook that throws.
const PendingSetupTeardown = defineVaporComponent(() => {
	onBeforeUnmount(() => {
		throw new Error('pending teardown');
	});
	return new Promise<never>(() => {});
});

function PendingSetupInTry() @{
	@try {
		<PendingSetupTeardown />
	} @catch (err) {
		<b>{String(err)}</b>
	}
}

function ThrowsOnRender() @{
	throw new Error('render');
	<span />
}

// The outer @try drops its content, with the inner @try, before it mounts.
function DropsBeforeMount() @{
	@try {
		<>
			<PendingSetupInTry />
			<ThrowsOnRender />
		</>
	} @pending {
		<i>{'wait'}</i>
	} @catch (err) {
		<b class="dropped-caught">{(err as Error).message}</b>
	}
}

// An enclosing @try shows its @catch, which removes the @try inside it.
function EnclosingTeardown(props: { inner: unknown }) @{
	const Inner = props.inner as typeof TeardownTwin;
	@try {
		<div>
			<Inner />
			<button
				class="remove-inner"
				onClick={() => {
					throw new Error('remove');
				}}
			>
				{'remove'}
			</button>
		</div>
	} @catch (err) {
		<b class="enclosing-caught">{(err as Error).message}</b>
	}
}

function throw_content(error: unknown): never {
	throw error;
}

function TwoFailingButtons() @{
	<>
		<button class="fail-a" onClick={() => throw_content('a')}>
			{'a'}
		</button>
		<button class="fail-b" onClick={() => throw_content('b')}>
			{'b'}
		</button>
	</>
}

// Two content errors before the update that shows the @catch.
function ContentBurst() @{
	@try {
		@try {
			<TwoFailingButtons />
		} @catch (err) {
			<b class="inner-caught">{String(err)}</b>
		}
	} @catch (err) {
		<p class="outer-caught">{String(err)}</p>
	}
}

function ThrowsInSetup() @{
	throw_content('sync body');
	<p />
}

// An async child that rejects after a sibling's error shows the @catch.
function LateRejection(props: { promise: CatchLoader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		@try {
			<>
				<AsyncChild value="hello" />
				<ThrowsInSetup />
			</>
		} @pending {
			<p class="catch-pending">{'loading'}</p>
		} @catch (err) {
			<b class="inner-caught">{String(err)}</b>
		}
	} @catch (err) {
		<p class="outer-caught">{String(err)}</p>
	}
}

let catch_signal = ref(0);

function bump_signal_once(error: unknown): string {
	if (catch_runs++ === 0) catch_signal.value++;
	return String(error);
}

function WatchesSignal() @{
	watch(catch_signal, () => throw_content('content watcher'), { flush: 'sync' });
	<p />
}

// A component of the content that never mounts, because its sibling throws,
// throws from a watcher while the @catch renders.
function ContentWatcher() @{
	@try {
		@try {
			<>
				<WatchesSignal />
				<ThrowsInSetup />
			</>
		} @catch (err) {
			<b class="inner-caught">{bump_signal_once(err)}</b>
		}
	} @catch (err) {
		<p class="outer-caught">{String(err)}</p>
	}
}

const VdomThrows = defineComponent({
	setup() {
		throw new Error('vdom catch');
	},
});

// The @catch renders a VDOM component, which Vue creates after the @catch
// has rendered.
function VdomCatchThrows(props: { promise: CatchLoader }) @{
	const AsyncChild = defineVaporAsyncComponent(() => props.promise);
	@try {
		<AsyncChild value="hello" />
	} @pending {
		<p class="catch-pending">{'loading'}</p>
	} @catch (err) {
		catch_runs++;
		<VdomThrows />
	}
}

function FallbackWatcher() @{
	watch(catch_signal, () => throw_content(new Error('fallback watcher')), { flush: 'sync' });
	<p class="fallback-child">{'fallback child'}</p>
}

function BumpsSignal() @{
	catch_signal.value++;
	<i />
}

// A component of the @catch, mounted before the @catch has rendered, throws
// from a watcher that the next one sets off.
function MountedFallbackWatcher() @{
	@try {
		<ThrowsInSetup />
	} @catch (err) {
		catch_runs++;
		<div>
			<FallbackWatcher />
			<BumpsSignal />
		</div>
	}
}

function CatchButton(props: { error: unknown }) @{
	<button class="catch-button" onClick={() => throw_content(new Error('catch click'))}>
		{String(props.error)}
	</button>
}

// A component of the @catch throws from a click handler.
function CatchClickThrows() @{
	@try {
		<ThrowsInSetup />
	} @catch (err) {
		<CatchButton error={err} />
	}
}

const nested_broken = ref(false);

function nested_label(): string {
	if (nested_broken.value) throw new Error('nested body');
	return 'ok';
}

// A @try inside the @catch, whose inline body code throws on an update.
function NestedInlineInCatch() @{
	@try {
		<ThrowsInSetup />
	} @catch (_initial) {
		@try {
			<p class="nested-body">{nested_label()}</p>
		} @catch (err) {
			<b class="nested-caught">{String(err)}</b>
		}
	}
}

// The same inside an outer @try.
function NestedInlineInCatchOuter() @{
	@try {
		@try {
			<ThrowsInSetup />
		} @catch (_initial) {
			@try {
				<p class="nested-body">{nested_label()}</p>
			} @catch (err) {
				<b class="nested-caught">{String(err)}</b>
			}
		}
	} @catch (err) {
		<p class="outer-caught">{String(err)}</p>
	}
}

function ResetThenThrowButton(props: { error: unknown; reset: () => void }) @{
	catch_runs++;
	<button
		class="reset-then-throw"
		onClick={() => {
			props.reset();
			throw_content(new Error('catch after reset'));
		}}
	>
		{String(props.error)}
	</button>
}

// A component of the @catch calls reset and then throws, from a click.
function ResetThenThrowClick() @{
	@try {
		@try {
			<ThrowsInSetup />
		} @pending {
			<p class="catch-pending">{'loading'}</p>
		} @catch (err, reset) {
			<ResetThenThrowButton error={err} reset={reset} />
		}
	} @catch (err) {
		<p class="outer-caught">{String(err)}</p>
	}
}

function ResetThenThrowSetup(props: { reset: () => void }) @{
	catch_runs++;
	props.reset();
	throw_content(new Error('catch after reset'));
	<b />
}

// A component of the @catch calls reset and then throws as it renders.
function ResetThenThrowRender() @{
	@try {
		@try {
			<ThrowsInSetup />
		} @pending {
			<p class="catch-pending">{'loading'}</p>
		} @catch (_err, reset) {
			<ResetThenThrowSetup reset={reset} />
		}
	} @catch (err) {
		<p class="outer-caught">{String(err)}</p>
	}
}

function reset_then_throw(reset: () => void): never {
	catch_runs++;
	reset();
	throw new Error('catch after reset');
}

// The @catch's own inline code calls reset and then throws, from a click.
function InlineResetThenThrowClick() @{
	@try {
		@try {
			<ThrowsInSetup />
		} @catch (err, reset) {
			<button class="reset-then-throw" onClick={() => reset_then_throw(reset)}>
				{String(err)}
			</button>
		}
	} @catch (err) {
		<p class="outer-caught">{String(err)}</p>
	}
}

// The same as the @catch renders.
function InlineResetThenThrowRender() @{
	@try {
		@try {
			<ThrowsInSetup />
		} @catch (_err, reset) {
			<b>{reset_then_throw(reset)}</b>
		}
	} @catch (err) {
		<p class="outer-caught">{String(err)}</p>
	}
}

// The same, from a @try inside the @catch of another @try.
function InlineResetThenThrowInCatch() @{
	@try {
		<ThrowsInSetup />
	} @catch (_initial) {
		@try {
			<ThrowsInSetup />
		} @catch (err, reset) {
			<button class="reset-then-throw" onClick={() => reset_then_throw(reset)}>
				{String(err)}
			</button>
		}
	}
}

let finish_hidden: () => void = () => {};

function SuspendedTry() @{
	const AsyncChild = defineVaporAsyncComponent(
		() =>
			new Promise<typeof CatchResolved>(
				(resolve) => (finish_hidden = () => resolve(CatchResolved)),
			),
	);
	@try {
		<>
			<AsyncChild value="loaded" />
			<span>{nested_label()}</span>
		</>
	} @catch (err) {
		<b class="nested-caught">{String(err)}</b>
	}
}

// A @try inside an authored Suspense in the @catch; its inline body code
// throws while the Suspense is still pending.
function SuspendedTryInCatch() @{
	@try {
		<ThrowsInSetup />
	} @catch (_initial) {
		<Suspense
			v-slots={{
				default: () => <SuspendedTry />,
				fallback: () => <small class="hidden-loading">{'loading'}</small>,
			}}
		/>
	}
}

const nested_shown = ref(true);

function throw_before_unmount() {
	onBeforeUnmount(() => {
		throw new Error('before unmount');
	});
}

// A @try inside the @catch, whose body throws as it unmounts.
function NestedTeardownInCatch() @{
	@try {
		<ThrowsInSetup />
	} @catch (_initial) {
		<div class="catch-region">
			@if (nested_shown.value) {
				@try {
					throw_before_unmount();
					<span class="nested-body">{'body'}</span>
				} @catch (err) {
					<b class="nested-caught">{String(err)}</b>
				}
			}
		</div>
	}
}

const late_shown = ref(true);
let release_late: () => void = () => {};

// A @try whose inline click handler throws after the @try is gone.
function LateInlineAfterUnmount() @{
	@try {
		@if (late_shown.value) {
			@try {
				<button
					class="late"
					onClick={async () => {
						await new Promise<void>((resolve) => (release_late = resolve));
						throw new Error('late inline');
					}}
				>
					{'late'}
				</button>
			} @catch (err) {
				<b class="nested-caught">{String(err)}</b>
			}
		}
	} @catch (err) {
		<p class="outer-caught">{String(err)}</p>
	}
}

// The same inside the @catch of another @try.
function LateInlineInCatchAfterUnmount() @{
	@try {
		<ThrowsInSetup />
	} @catch (_initial) {
		<div class="catch-region">
			@if (late_shown.value) {
				@try {
					<button
						class="late"
						onClick={async () => {
							await new Promise<void>((resolve) => (release_late = resolve));
							throw new Error('late inline');
						}}
					>
						{'late'}
					</button>
				} @catch (err) {
					<b class="nested-caught">{String(err)}</b>
				}
			}
		</div>
	}
}

// The body throws from a click, and the @catch resets it.
function ResetAndFailAgain() @{
	@try {
		<TwoFailingButtons />
	} @catch (err, reset) {
		<button class="reset" onClick={reset}>
			{String(err)}
		</button>
	}
}

describe('tsrx-vue a @catch that throws', () => {
	let handled: string[] = [];

	async function mount(component: unknown, props: Record<string, unknown>) {
		handled = [];
		catch_runs = 0;
		catch_signal = ref(0);
		nested_broken.value = false;
		late_shown.value = true;
		nested_shown.value = true;
		const app = createVaporApp(component as Parameters<typeof createVaporApp>[0], props);
		app.config.errorHandler = (error) => {
			handled.push((error as Error).message);
		};
		app.mount(container);
		await flush();
		return app;
	}

	it('passes what it throws after a rejection to the next @catch out', async () => {
		let reject!: (error: Error) => void;
		const promise: CatchLoader = new Promise((_resolve, fail) => (reject = fail));
		const app = await mount(RejectedCatchThrows, { promise });
		expect(text('.catch-pending')).toBe('loading');
		reject(new Error('rejected'));
		await flush();
		expect(text('.outer-caught')).toBe('catch boom after rejected');
		// The @catch ran once: the boundary around the Suspense, which renders
		// the same @catch, let the error go on too.
		expect(catch_runs).toBe(1);
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('passes what it throws after a rejection to app.config.errorHandler', async () => {
		let reject!: (error: Error) => void;
		const promise: CatchLoader = new Promise((_resolve, fail) => (reject = fail));
		const app = await mount(RejectedCatchThrowsAlone, { promise });
		reject(new Error('rejected'));
		await flush();
		expect(handled).toEqual(['catch boom after rejected']);
		expect(catch_runs).toBe(1);
		expect(container.querySelector('.inner-caught')).toBeNull();
		app.unmount();
	});

	it('passes what it throws after a @pending throw to the next @catch out', async () => {
		const app = await mount(PendingCatchThrows, { promise: never_loads() });
		expect(text('.outer-caught')).toBe('catch boom after pending boom');
		expect(handled).toEqual([]);
		app.unmount();
	});

	it.each([
		['as the body renders', false],
		['after a rejection', true],
	])(
		'runs a @catch parameter pattern that throws once, %s, and passes its error to the next @catch out',
		async (_name, rejects) => {
			let app;
			if (rejects) {
				let reject!: (error: Error) => void;
				const promise: CatchLoader = new Promise((_resolve, fail) => (reject = fail));
				app = await mount(RejectedCatchPatternThrows, { promise });
				reject(new Error('rejected'));
				await flush();
			} else {
				app = await mount(SyncCatchPatternThrows, {});
			}
			expect(text('.outer-caught')).toBe("Cannot read properties of undefined (reading 'status')");
			// The boundary around the Suspense, which renders the same @catch, let
			// the error go on without running the pattern again.
			expect(catch_runs).toBe(1);
			expect(handled).toEqual([]);
			app.unmount();
		},
	);

	it('runs a @catch parameter pattern that throws once after a rejection once the Suspense resolved', async () => {
		catch_pattern_async_shown.value = false;
		let reject!: (error: Error) => void;
		const promise: CatchLoader = new Promise((_resolve, fail) => (reject = fail));
		const app = await mount(LateRejectedCatchPatternThrows, { promise });
		catch_pattern_async_shown.value = true;
		await flush();
		reject(new Error('rejected'));
		await flush();
		expect(text('.outer-caught')).toBe("Cannot read properties of undefined (reading 'status')");
		expect(catch_runs).toBe(1);
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('keeps a later error from the body a reset replaced in its @catch', async () => {
		replaced_twin.initial = true;
		const app = await mount(LateFromReplacedTwin, { promise: never_loads() });
		expect(text('.replaced-reset')).toBe('pending');
		(container.querySelector('.replaced-reset') as HTMLElement).click();
		await flush();
		expect(text('.replaced-body')).toBe('ok');
		replaced_twin.release();
		await flush();
		// As without @pending: the @catch around the body shows it.
		expect(text('.replaced-reset')).toBe('late');
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('passes on a later error from the body a reset replaced once the @try unmounts', async () => {
		replaced_twin.initial = true;
		const app = await mount(LateFromReplacedTwin, { promise: never_loads() });
		(container.querySelector('.replaced-reset') as HTMLElement).click();
		await flush();
		expect(text('.replaced-body')).toBe('ok');
		app.unmount();
		replaced_twin.release();
		await flush();
		// As without @pending, it goes to errorHandler.
		expect(handled).toEqual(['late']);
	});

	it.each([
		['with @pending', TeardownTwin, 'body'],
		['without @pending', TeardownPlain, 'body'],
		['with @pending, the body showing', TeardownShowingTwin, null],
		['without @pending, the body showing', TeardownShowingPlain, null],
	])(
		'passes on what its body throws as the @try unmounts, %s',
		async (_name, component, caught) => {
			const app = await mount(component, {});
			expect(container.querySelector('.teardown-caught')?.textContent ?? null).toBe(caught);
			app.unmount();
			expect(handled).toEqual(['teardown']);
		},
	);

	it.each([
		['with @pending', TeardownTwin],
		['without @pending', TeardownPlain],
	])(
		'passes on what its body throws as an enclosing @catch removes the @try %s',
		async (_name, inner) => {
			const app = await mount(EnclosingTeardown, { inner });
			expect(text('.teardown-caught')).toBe('body');
			(container.querySelector('.remove-inner') as HTMLElement).click();
			await flush();
			// The enclosing @catch keeps the error it was swapped in for; the
			// teardown error goes to errorHandler.
			expect(text('.enclosing-caught')).toBe('remove');
			expect(handled).toEqual(['teardown']);
			app.unmount();
		},
	);

	it.each([
		['with @pending', ChildTeardownTwin],
		['without @pending', ChildTeardownPlain],
		['with no @try', ChildTeardownNoTry],
	])(
		"passes on what a component's unmount hook throws as the app unmounts, %s",
		async (_name, component) => {
			const app = await mount(component, {});
			expect(text('.child-teardown')).toBe('child');
			app.unmount();
			expect(handled).toEqual(['child teardown']);
		},
	);

	it.each([
		['with @pending', ChildTeardownTwin],
		['without @pending', ChildTeardownPlain],
		['with no @try', ChildTeardownNoTry],
	])(
		"passes on what a component's unmount hook throws as an enclosing @catch removes it, %s",
		async (_name, inner) => {
			const app = await mount(EnclosingTeardown, { inner });
			expect(text('.child-teardown')).toBe('child');
			(container.querySelector('.remove-inner') as HTMLElement).click();
			await flush();
			expect(text('.enclosing-caught')).toBe('remove');
			expect(handled).toEqual(['child teardown']);
			app.unmount();
		},
	);

	it.each([
		['the @try', ChildTeardownPlain],
		['the component, with no @try', ChildTeardownNoTry],
	])(
		"shows in the @catch around it what a component's unmount hook throws as an @if removes %s",
		async (_name, inner) => {
			for (const host of [IfRemovesTeardown, IfRemovesTeardownAtRoot]) {
				child_teardown_shown.value = true;
				handled = [];
				const app = await mount(host, { inner });
				expect(text('.child-teardown')).toBe('child');
				child_teardown_shown.value = false;
				await flush();
				expect(text('.if-caught')).toBe('child teardown');
				expect(handled).toEqual([]);
				app.unmount();
			}
		},
	);

	it.each([
		['with @pending', SwapTeardownTwin],
		['without @pending', SwapTeardownPlain],
	])(
		'keeps the error the @catch was swapped in for over what the removed content throws, %s',
		async (_name, component) => {
			const app = await mount(component, {});
			(container.querySelector('.click-then-teardown') as HTMLElement).click();
			await flush();
			expect(text('.teardown-caught')).toBe('click');
			expect(handled).toEqual(['child teardown']);
			app.unmount();
		},
	);

	it.each([
		['with @pending', SwapScopeTeardownTwin],
		['without @pending', SwapScopeTeardownPlain],
	])(
		'shows the @catch and passes on what an onScopeDispose of the content it replaces throws, %s',
		async (_name, component) => {
			scope_teardown_unmounts = 0;
			const app = await mount(component, {});
			(container.querySelector('.scope-click') as HTMLElement).click();
			await flush();
			expect(text('.teardown-caught')).toBe('click');
			expect(container.querySelector('.scope-teardown')).toBeNull();
			expect(container.querySelector('.after-scope-teardown')).toBeNull();
			expect(scope_teardown_unmounts).toBe(1);
			expect(handled).toEqual(['scope teardown']);
			app.unmount();
		},
	);

	it('shows the @catch in development with no app.config.errorHandler, and logs what an onScopeDispose throws', async () => {
		const logged: unknown[] = [];
		const error_spy = vi.spyOn(console, 'error').mockImplementation((error) => {
			logged.push(error);
		});
		const app = createVaporApp(SwapScopeTeardownPlain);
		app.config.warnHandler = () => {};
		try {
			app.mount(container);
			await flush();
			(container.querySelector('.scope-click') as HTMLElement).click();
			await flush();
			expect(text('.teardown-caught')).toBe('click');
			expect(container.querySelector('.scope-teardown')).toBeNull();
			expect(logged.map((error) => (error as Error).message)).toEqual(['scope teardown']);
		} finally {
			app.unmount();
			error_spy.mockRestore();
		}
	});

	it('passes on what an onScopeDispose in a Suspense in the @catch throws as a reset removes it', async () => {
		scope_reset_fails.value = true;
		const app = await mount(ResetSuspenseScopeTeardown, {});
		expect(text('.scope-reset')).toBe('first');
		scope_reset_fails.value = false;
		(container.querySelector('.scope-reset') as HTMLElement).click();
		await flush();
		expect(text('.scope-reset-body')).toBe('ok');
		expect(texts('.scope-reset')).not.toContain('scope teardown');
		expect(handled).toEqual(['scope teardown']);
		app.unmount();
	});

	it('shows the @catch in development with no app.config.errorHandler, and logs what an onBeforeUnmount throws', async () => {
		const logged: unknown[] = [];
		const error_spy = vi.spyOn(console, 'error').mockImplementation((error) => {
			logged.push(error);
		});
		const app = createVaporApp(SwapTeardownPlain);
		app.config.warnHandler = () => {};
		try {
			app.mount(container);
			await flush();
			(container.querySelector('.click-then-teardown') as HTMLElement).click();
			await flush();
			expect(text('.teardown-caught')).toBe('click');
			expect(logged.map((error) => (error as Error).message)).toContain('child teardown');
		} finally {
			app.unmount();
			error_spy.mockRestore();
		}
	});

	it.each([
		['a component, with @pending', ResetWatcherTwin, WatchesResetSignal, 'new content watcher'],
		['a component, without @pending', ResetWatcherPlain, WatchesResetSignal, 'new content watcher'],
		[
			'two watchers, with @pending',
			ResetWatcherTwin,
			WatchesResetSignalTwice,
			'second content watcher',
		],
		[
			'two watchers, without @pending',
			ResetWatcherPlain,
			WatchesResetSignalTwice,
			'second content watcher',
		],
	])(
		'shows in its @catch what the content a reset renders throws as the @catch is torn down: %s',
		async (_name, component, body, shown) => {
			scope_reset_fails.value = true;
			reset_signal.value = 0;
			const app = await mount(component, { body });
			expect(text('.scope-reset')).toBe('first');
			scope_reset_fails.value = false;
			(container.querySelector('.scope-reset') as HTMLElement).click();
			await flush();
			expect(texts('.scope-reset')).toEqual([shown]);
			expect(handled).toEqual([]);
			app.unmount();
		},
	);

	it.each([
		['with @pending', ResetInlineWatcherTwin],
		['without @pending', ResetInlineWatcherPlain],
	])(
		"shows in its @catch what the @try body's own code throws as a reset tears down the @catch, %s",
		async (_name, component) => {
			inline_reset_fails = true;
			reset_signal.value = 0;
			const app = await mount(component, {});
			expect(text('.scope-reset')).toBe('first');
			inline_reset_fails = false;
			(container.querySelector('.scope-reset') as HTMLElement).click();
			await flush();
			expect(texts('.scope-reset')).toEqual(['inline content watcher']);
			expect(handled).toEqual([]);
			app.unmount();
		},
	);

	it.each([
		['with @pending', RenderSwapTwin],
		['without @pending', RenderSwapPlain],
	])(
		'keeps the error the content threw as it rendered again over what removing it throws, %s',
		async (_name, component) => {
			swap_render_fails.value = false;
			const app = await mount(component, {});
			swap_render_fails.value = true;
			await flush();
			expect(texts('.teardown-caught')).toEqual(['render failure']);
			expect(handled).toEqual(['old teardown']);
			app.unmount();
		},
	);

	it.each([
		['its own error', WatchesResetSignal, 'new content watcher'],
		['the same error', WatchesResetSignalSameValue, 'Error: scope teardown'],
	])(
		'keeps with the content a reset renders what a hook that sees a teardown error sets off, throwing %s',
		async (_name, body, shown) => {
			scope_teardown_armed = true;
			scope_teardown_value = new Error('scope teardown');
			scope_reset_fails.value = true;
			reset_signal.value = 0;
			const app = await mount(ObservedResetWatcher, { body });
			expect(text('.scope-reset')).toBe('first');
			scope_reset_fails.value = false;
			(container.querySelector('.scope-reset') as HTMLElement).click();
			await flush();
			// The old @catch can stay beside it: Vue's teardown of what the
			// Suspense held stopped at the throw.
			expect(texts('.scope-reset')).toContain(shown.replace('Error: ', ''));
			expect(handled).toEqual(['scope teardown']);
			app.unmount();
		},
	);

	it('shows in its @catch what the content throws when the @catch resets the @try as it is torn down', async () => {
		cleanup_reset_fails = true;
		cleanup_resets = false;
		reset_signal.value = 0;
		const app = await mount(ResetDuringCleanup, {});
		expect(text('.cleanup-caught')).toBe('0: first');
		cleanup_resets = true;
		cleanup_revision.value++;
		await flush();
		expect(texts('.cleanup-caught')).toContain('1: new content watcher');
		expect(handled).toEqual([]);
		cleanup_resets = false;
		app.unmount();
	});

	it('passes on a teardown error whatever the value, also NaN', async () => {
		scope_teardown_armed = true;
		scope_teardown_value = Number.NaN;
		scope_reset_fails.value = true;
		reset_signal.value = 0;
		const app = await mount(ResetWatcherWithThrowingCatch, { body: WatchesResetSignal });
		scope_reset_fails.value = false;
		(container.querySelector('.scope-reset') as HTMLElement).click();
		await flush();
		expect(text('.scope-reset-body')).toBe('ok');
		expect(texts('.scope-reset')).not.toContain('NaN');
		expect(handled).toHaveLength(1);
		app.unmount();
	});

	it('shows in the @catch around it what an onScopeDispose throws as an @if removes it', async () => {
		for (const host of [IfRemovesTeardown, IfRemovesTeardownAtRoot]) {
			child_teardown_shown.value = true;
			handled = [];
			const app = await mount(host, { inner: ScopeTeardown });
			expect(text('.scope-teardown')).toBe('scope');
			child_teardown_shown.value = false;
			await flush();
			expect(text('.if-caught')).toBe('scope teardown');
			expect(handled).toEqual([]);
			app.unmount();
		}
	});

	it('renders the content again after a reset, and passes on what an onScopeDispose in the @catch throws', async () => {
		scope_reset_fails.value = true;
		const app = await mount(ResetScopeTeardown, {});
		expect(text('.scope-reset')).toBe('first');
		scope_reset_fails.value = false;
		(container.querySelector('.scope-reset') as HTMLElement).click();
		await flush();
		expect(text('.scope-reset-body')).toBe('ok');
		expect(container.querySelector('.scope-teardown')).toBeNull();
		expect(handled).toEqual(['scope teardown']);
		app.unmount();
	});

	it('passes on what the body throws as the @catch of a pending @try replaces it', async () => {
		const app = await mount(PendingSwapTeardown, {});
		reject_beside_teardown(new Error('rejected'));
		await flush();
		await flush();
		expect(text('.teardown-caught')).toBe('rejected');
		expect(handled).toEqual(['child teardown']);
		app.unmount();
	});

	it('passes on what a component throws as a @try dropped before it mounted is disposed of', async () => {
		const app = await mount(DropsBeforeMount, {});
		expect(text('.dropped-caught')).toBe('render');
		app.unmount();
		await flush();
		expect(handled).toEqual(['pending teardown']);
	});

	it('runs a @catch parameter pattern that throws once, and passes its error to app.config.errorHandler', async () => {
		const app = await mount(SyncCatchPatternThrowsAlone, {});
		expect(handled).toEqual(["Cannot read properties of undefined (reading 'status')"]);
		expect(catch_runs).toBe(1);
		expect(container.querySelector('.inner-caught')).toBeNull();
		app.unmount();
	});

	it('keeps a second error from the content in its own @catch', async () => {
		// The content is still mounted when the second one comes, before the
		// update that shows the @catch.
		const app = await mount(ContentBurst, {});
		(container.querySelector('.fail-a') as HTMLElement).click();
		(container.querySelector('.fail-b') as HTMLElement).click();
		await flush();
		expect(text('.inner-caught')).toBe('b');
		expect(container.querySelector('.outer-caught')).toBeNull();
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('keeps a late rejection from the content in its own @catch', async () => {
		let reject!: (error: unknown) => void;
		const promise: CatchLoader = new Promise((_resolve, fail) => (reject = fail));
		const app = await mount(LateRejection, { promise });
		expect(text('.inner-caught')).toBe('sync body');
		reject('late');
		await flush();
		expect(text('.inner-caught')).toBe('Error: late');
		expect(container.querySelector('.outer-caught')).toBeNull();
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('passes what it throws after a @pending throw to app.config.errorHandler', async () => {
		const app = await mount(PendingCatchThrowsAlone, { promise: never_loads() });
		expect(handled).toEqual(['catch boom after pending boom']);
		expect(container.querySelector('.inner-caught')).toBeNull();
		app.unmount();
	});

	it('keeps an error from a content component that never mounted in its own @catch', async () => {
		const app = await mount(ContentWatcher, {});
		expect(text('.inner-caught')).toBe('content watcher');
		expect(container.querySelector('.outer-caught')).toBeNull();
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('passes on what a VDOM component of the @catch throws', async () => {
		let reject!: (error: Error) => void;
		const promise: CatchLoader = new Promise((_resolve, fail) => (reject = fail));
		const app = await mount(VdomCatchThrows, { promise });
		reject(new Error('rejected'));
		await flush();
		expect(handled).toEqual(['vdom catch']);
		expect(catch_runs).toBe(1);
		app.unmount();
	});

	it('passes on what a component of the @catch throws after it mounted', async () => {
		const app = await mount(MountedFallbackWatcher, {});
		expect(handled).toEqual(['fallback watcher']);
		expect(text('.fallback-child')).toBe('fallback child');
		expect(catch_runs).toBe(1);
		app.unmount();
	});

	it('keeps an error from the body rendered again by reset in its own @catch', async () => {
		const app = await mount(ResetAndFailAgain, {});
		(container.querySelector('.fail-a') as HTMLElement).click();
		await flush();
		expect(text('.reset')).toBe('a');
		(container.querySelector('.reset') as HTMLElement).click();
		await flush();
		(container.querySelector('.fail-b') as HTMLElement).click();
		await flush();
		expect(text('.reset')).toBe('b');
		expect(handled).toEqual([]);
		app.unmount();
	});

	it.each([
		['inside the @catch', NestedInlineInCatch],
		['inside the @catch, inside an outer @try', NestedInlineInCatchOuter],
	])('shows an update error of a @try %s in that @try', async (_name, component) => {
		const app = await mount(component, {});
		expect(text('.nested-body')).toBe('ok');
		nested_broken.value = true;
		await flush();
		expect(text('.nested-caught')).toBe('Error: nested body');
		expect(container.querySelector('.nested-body')).toBeNull();
		expect(container.querySelector('.outer-caught')).toBeNull();
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('passes on what the @catch throws right after its reset, from a click', async () => {
		const app = await mount(ResetThenThrowClick, {});
		(container.querySelector('.reset-then-throw') as HTMLElement).click();
		await flush();
		expect(text('.outer-caught')).toBe('Error: catch after reset');
		expect(catch_runs).toBe(1);
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('passes on what the @catch throws right after its reset, as it renders', async () => {
		const app = await mount(ResetThenThrowRender, {});
		expect(text('.outer-caught')).toBe('Error: catch after reset');
		expect(catch_runs).toBe(1);
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('passes on what the inline code of the @catch throws right after its reset', async () => {
		const app = await mount(InlineResetThenThrowClick, {});
		(container.querySelector('.reset-then-throw') as HTMLElement).click();
		await flush();
		expect(text('.outer-caught')).toBe('Error: catch after reset');
		expect(catch_runs).toBe(1);
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('passes on what the inline code of the @catch throws right after its reset, as it renders', async () => {
		const app = await mount(InlineResetThenThrowRender, {});
		expect(text('.outer-caught')).toBe('Error: catch after reset');
		expect(catch_runs).toBeLessThan(3);
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('passes on what the inline code of a @catch inside a @catch throws right after its reset', async () => {
		const app = await mount(InlineResetThenThrowInCatch, {});
		(container.querySelector('.reset-then-throw') as HTMLElement).click();
		await flush();
		expect(handled).toEqual(['catch after reset']);
		expect(catch_runs).toBe(1);
		app.unmount();
	});

	it('lets a Suspense in the @catch resolve after a @try inside it throws while pending', async () => {
		const app = await mount(SuspendedTryInCatch, {});
		expect(text('.hidden-loading')).toBe('loading');
		nested_broken.value = true;
		await flush();
		finish_hidden();
		await flush();
		await new Promise((resolve) => setTimeout(resolve, 0));
		await flush();
		expect(container.querySelector('.hidden-loading')).toBeNull();
		expect(handled).toEqual(['nested body']);
		app.unmount();
	});

	it('passes on what a @try inside the @catch throws as it unmounts', async () => {
		const app = await mount(NestedTeardownInCatch, {});
		expect(text('.nested-body')).toBe('body');
		nested_shown.value = false;
		await flush();
		expect(handled).toEqual(['before unmount']);
		expect(container.querySelector('.nested-caught')).toBeNull();
		app.unmount();
	});

	it('passes on an error from a @try that is gone', async () => {
		const app = await mount(LateInlineAfterUnmount, {});
		(container.querySelector('.late') as HTMLElement).click();
		late_shown.value = false;
		await flush();
		release_late();
		await flush();
		expect(text('.outer-caught')).toBe('Error: late inline');
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('passes on an error from a @try inside the @catch that is gone', async () => {
		const app = await mount(LateInlineInCatchAfterUnmount, {});
		(container.querySelector('.late') as HTMLElement).click();
		late_shown.value = false;
		await flush();
		release_late();
		await flush();
		expect(handled).toEqual(['late inline']);
		app.unmount();
	});

	// The boundary needs this Vapor internal to tell its @catch's components
	// from its body's; without it, it falls back to showing both.
	it('finds nextUid in the installed Vue', () => {
		expect(typeof (Vue as unknown as { nextUid?: unknown }).nextUid).toBe('function');
	});

	it('passes on what an event handler of the @catch throws', async () => {
		const app = await mount(CatchClickThrows, {});
		(container.querySelector('.catch-button') as HTMLElement).click();
		await flush();
		expect(handled).toEqual(['catch click']);
		expect(text('.catch-button')).toBe('sync body');
		app.unmount();
	});
});

const picked = ref({ on: true, name: 'Ann' });

function PickCounter({ label }: { label: string }) @{
	const count = ref(0);
	<button class="pick-counter" onClick={() => count.value++}>
		{label + ':' + count.value}
	</button>
}

function Pick({ on, name }: { on: boolean; name: string }) @{
	<div>
		<span class="pick">
			@if (on) {
				<PickCounter label="on" />
			} @else {
				<i>{'off'}</i>
			}
			{name}
		</span>
	</div>
}

function PickHost() @{
	<Pick on={picked.value.on} name={picked.value.name} />
}

const kept_pick = ref(true);

function KeptPickA() @{
	const count = ref(0);
	<button class="kept-pick-a" onClick={() => count.value++}>
		{'a:' + count.value}
	</button>
}

function KeptPickB() @{
	const count = ref(0);
	<button class="kept-pick-b" onClick={() => count.value++}>
		{'b:' + count.value}
	</button>
}

function KeptPick() @{
	<div class="kept-pick">
		<VaporKeepAlive>
			@if (kept_pick.value) {
				<KeptPickA />
			} @else {
				<KeptPickB />
			}
		</VaporKeepAlive>
	</div>
}

const pick_user = ref({ name: 'Ann', online: true });

function PickUser() @{
	<div class="pick-user">
		@if (pick_user.value.online) {
			<PickCounter label="online" />
		} @else {
			<i>{'away'}</i>
		}
		{pick_user.value.name}
	</div>
}

describe('tsrx-vue an element whose child is an @if / @else', () => {
	it('keeps its branch when a sibling expression changes (#1402)', async () => {
		// \`v-if\` / \`v-else\` is a \`createIf\` of its own, outside the sibling's effect.
		pick_user.value = { name: 'Ann', online: true };
		await render(PickUser);
		(container.querySelector('.pick-counter') as HTMLElement).click();
		await flush();
		pick_user.value = { ...pick_user.value };
		await flush();
		expect(text('.pick-counter')).toBe('online:1');
		pick_user.value = { ...pick_user.value, online: false };
		await flush();
		expect(text('.pick-user')).toBe('awayAnn');
	});

	it('keeps each branch cached by VaporKeepAlive', async () => {
		// A component's child keeps the ternary, as on main, so VaporKeepAlive
		// still caches both branches.
		kept_pick.value = true;
		await render(KeptPick);
		(container.querySelector('.kept-pick-a') as HTMLElement).click();
		await flush();
		kept_pick.value = false;
		await flush();
		(container.querySelector('.kept-pick-b') as HTMLElement).click();
		await flush();
		kept_pick.value = true;
		await flush();
		expect(text('.kept-pick')).toBe('a:1');
		kept_pick.value = false;
		await flush();
		expect(text('.kept-pick')).toBe('b:1');
	});

	for (const [state, markup] of [
		[
			{ on: true, name: 'Ann' },
			'<div><span class="pick"><button class="pick-counter">on:0</button>Ann</span></div>',
		],
		[{ on: false, name: 'Ann' }, '<div><span class="pick"><i>off</i>Ann</span></div>'],
	] as const) {
		it(`hydrates the server's branch beside an expression, then follows (on: ${state.on})`, async () => {
			// The markup the server build renders (vapor-for-ssr.test.js).
			picked.value = { ...state };
			container.innerHTML = markup;
			const server_node = container.querySelector('button, i');
			const errors: unknown[] = [];
			const warnings: string[] = [];
			const warn_spy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
				warnings.push(args.map(String).join(' '));
			});
			const app = createVaporSSRApp(PickHost);
			app.config.errorHandler = (error) => {
				errors.push(error);
			};
			try {
				app.mount(container);
				await flush();
				expect(errors).toEqual([]);
				expect(warnings.filter((warning) => warning.includes('ydration'))).toEqual([]);
				expect(container.querySelector('button, i')).toBe(server_node);

				picked.value = { on: true, name: 'Bo' };
				await flush();
				expect(text('.pick')).toBe('on:0Bo');
				(container.querySelector('.pick-counter') as HTMLElement).click();
				await flush();
				picked.value = { on: true, name: 'Cy' };
				await flush();
				expect(text('.pick')).toBe('on:1Cy');
				picked.value = { on: false, name: 'Cy' };
				await flush();
				expect(text('.pick')).toBe('offCy');
			} finally {
				app.unmount();
				warn_spy.mockRestore();
			}
		});
	}
});

const chain_user = ref({ name: 'Ann', online: true, away: false, shown: true });

function ChainCounter({ label }: { label: string }) @{
	const count = ref(0);
	<button class="chain-counter" onClick={() => count.value++}>
		{label + ':' + count.value}
	</button>
}

function ChainUser() @{
	<div class="chain-user">
		@if (chain_user.value.online) {
			<ChainCounter label="online" />
		} @else if (chain_user.value.away) {
			<i>{'away'}</i>
		} @else {
			<b>{'off'}</b>
		}
		{chain_user.value.name}
	</div>
}

function NestedElseUser() @{
	<div class="nested-else-user">
		{chain_user.value.name}
		@if (chain_user.value.online) {
			<ChainCounter label="online" />
		} @else {
			@if (chain_user.value.away) {
				<i>{'away'}</i>
			}
		}
	</div>
}

function ShownUser() @{
	<div class="shown-user">
		@if (chain_user.value.online) {
			<p v-show={chain_user.value.shown}>
				<ChainCounter label="online" />
			</p>
		}
		{chain_user.value.name}
	</div>
}

function ShownCase() @{
	<div class="shown-case">
		@switch (chain_user.value.online) {
			@case true: {
				<p v-show={chain_user.value.shown}>
					<ChainCounter label="case" />
				</p>
			}
		}
		{chain_user.value.name}
	</div>
}

function ShownComponentUser() @{
	<div class="shown-component">
		@if (chain_user.value.online) {
			<ChainCounter v-show={chain_user.value.shown} label="online" />
		}
		{chain_user.value.name}
	</div>
}

describe("tsrx-vue an element's @else if chain or v-show branch (#1402)", () => {
	beforeEach(() => {
		chain_user.value = { name: 'Ann', online: true, away: false, shown: true };
	});

	it.each([
		['an @else if chain', ChainUser, '.chain-user', ['awayBo', 'offBo']],
		['an @else that renders only an @if', NestedElseUser, '.nested-else-user', ['Boaway', 'Bo']],
	] as const)(
		'keeps the branch of %s when a sibling expression changes',
		async (_name, component, selector, later) => {
			await render(component);
			await click('.chain-counter');
			chain_user.value = { ...chain_user.value };
			await flush();
			expect(text('.chain-counter')).toBe('online:1');
			chain_user.value = { ...chain_user.value, name: 'Bo' };
			await flush();
			expect(text('.chain-counter')).toBe('online:1');

			chain_user.value = { ...chain_user.value, online: false, away: true };
			await flush();
			expect(text(selector)).toBe(later[0]);
			chain_user.value = { ...chain_user.value, away: false };
			await flush();
			expect(text(selector)).toBe(later[1]);
			chain_user.value = { ...chain_user.value, online: true };
			await flush();
			expect(text('.chain-counter')).toBe('online:0');
		},
	);

	it.each([
		['an @if branch', ShownUser, '.shown-user', '.shown-user p'],
		['a @switch case', ShownCase, '.shown-case', '.shown-case p'],
		['a component @if branch', ShownComponentUser, '.shown-component', '.chain-counter'],
	] as const)(
		'keeps %s with v-show when a sibling expression changes, and shows and hides it',
		async (_name, component, selector, shown_selector) => {
			await render(component);
			await click('.chain-counter');
			chain_user.value = { ...chain_user.value, name: 'Bo' };
			await flush();
			expect(text(selector)?.endsWith(':1Bo')).toBe(true);

			const shown = container.querySelector(shown_selector) as HTMLElement;
			chain_user.value = { ...chain_user.value, shown: false };
			await flush();
			expect(container.querySelector(shown_selector)).toBe(shown);
			expect(shown.style.display).toBe('none');
			chain_user.value = { ...chain_user.value, shown: true };
			await flush();
			expect(shown.style.display).toBe('');
			expect(text('.chain-counter')?.endsWith(':1')).toBe(true);

			chain_user.value = { ...chain_user.value, online: false };
			await flush();
			expect(container.querySelector('.chain-counter')).toBeNull();
		},
	);
});

type ScopeTodo = { id: string; title: string; editing: boolean; synced: number };

const scope_todos = ref<ScopeTodo[]>([]);
const scope_user = ref({ name: 'Ann', online: true });
const scope_attrs = { 'data-x': '1' };
const scope_log: string[] = [];

function scope_todos_initial(): ScopeTodo[] {
	return [
		{ id: 'a', title: 'Alpha', editing: true, synced: 0 },
		{ id: 'b', title: 'Beta', editing: true, synced: 0 },
	];
}

function update_scope_todo(id: string, patch: Partial<ScopeTodo>) {
	scope_todos.value = scope_todos.value.map((todo) =>
		todo.id === id ? { ...todo, ...patch } : todo,
	);
}

function ScopeEditor(props: { title: string }) @{
	const draft = ref(props.title);
	<input
		class="scope-editor"
		value={draft.value}
		onInput={(event: Event) => (draft.value = (event.target as HTMLInputElement).value)}
	/>
}

function ScopeCounter(props: { label: string }) @{
	const count = ref(0);
	<button class="scope-counter" onClick={() => count.value++}>
		{props.label + ':' + count.value}
	</button>
}

function ScopeRows() @{
	<ul class="scope-rows">
		@for (const todo of scope_todos.value; key todo.id) {
			@if (todo.editing) {
				const label = todo.title + '!';
				<li>
					<ScopeEditor title={label} />
					<ScopeCounter {label} />
				</li>
			} @else {
				<li>{todo.title}</li>
			}
		}
	</ul>
}

function ScopeSwitchRows() @{
	<ul class="scope-switch-rows">
		@for (const todo of scope_todos.value; key todo.id) {
			@switch (todo.editing) {
				@case true: {
					const label = todo.title + '!';
					<li>
						<ScopeCounter {label} />
					</li>
				}
				@default: {
					<li>{todo.title}</li>
				}
			}
		}
	</ul>
}

function ScopeRowSwitch() @{
	<ul class="scope-row-switch">
		@for (const todo of scope_todos.value; key todo.id) {
			<li>
				@switch (todo.editing) {
					@case true: {
						<ScopeCounter label={todo.title} />
					}
					@default: {
						<i>{todo.title}</i>
					}
				}
			</li>
		}
	</ul>
}

function ScopeUser() @{
	<div class="scope-user">
		@if (scope_user.value.online) {
			const label = scope_user.value.name + '!';
			<ScopeCounter {label} />
		}
		{scope_user.value.name}
	</div>
}

function ScopeSpread() @{
	<div class="scope-spread">
		@if (scope_user.value.online) {
			<p {...scope_attrs}>
				<ScopeCounter label="spread" />
			</p>
		}
		{scope_user.value.name}
	</div>
}

function ScopeChild() @{
	const value = inject('scope-key', 'none');
	<b class="scope-child">{value}</b>
}

function ScopeHooks() @{
	provide('scope-key', 'host');
	<div class="scope-hooks">
		@if (scope_user.value.online) {
			scope_log.push('run ' + inject('scope-key', 'none'));
			onMounted(() => scope_log.push('mounted'));
			onUnmounted(() => scope_log.push('unmounted'));
			provide('scope-key', 'branch');
			<p>
				<ScopeChild />
			</p>
		}
		{scope_user.value.name}
	</div>
}

function ScopeSlotChild() @{
	<div class="scope-slot">
		@if (scope_user.value.online) {
			<section {...scope_attrs}>
				<slot>
					<i>{'fallback'}</i>
				</slot>
			</section>
		}
	</div>
}

function ScopeSlotApp() @{
	<ScopeSlotChild>
		<b>{'provided'}</b>
	</ScopeSlotChild>
}

let scope_field: unknown = null;

function ScopeTemplateRef() @{
	const field = useTemplateRef('field');
	onMounted(() => {
		scope_field = field.value;
	});
	<div class="scope-ref">
		@if (scope_user.value.online) {
			<input {...scope_attrs} ref="field" />
		}
	</div>
}

const scope_fails = ref(false);

function ScopeThrows() @{
	<div class="scope-throws">
		@try {
			<p>
				@if (scope_user.value.online) {
					if (scope_fails.value) throw new Error('scope boom');
					const label = 'fine';
					<b>{label}</b>
				}
			</p>
		} @catch (error) {
			<em>{(error as Error).message}</em>
		}
	</div>
}

function ScopeRoot() @{
	@if (scope_user.value.online) {
		const label = 'root';
		<b class="scope-root">{label}</b>
	}
}

function ScopeRootHost() @{
	<ScopeRoot content="description" class="extra" />
}

function scope_rows(selector: string) {
	return Array.from(container.querySelectorAll(`${selector} li`), (row) => {
		const counter = row.querySelector('.scope-counter')?.textContent;
		const editor = row.querySelector('input');
		return (counter ?? row.textContent) + (editor ? ' ' + editor.value : '');
	});
}

describe('tsrx-vue setup statements in a branch or a case run once per mount', () => {
	beforeEach(() => {
		scope_todos.value = scope_todos_initial();
		scope_user.value = { name: 'Ann', online: true };
		scope_log.length = 0;
	});

	it('keeps a keyed row’s @if branch, and what its statements derived, while it stays (#1401)', async () => {
		await render(ScopeRows);
		const editor = container.querySelector('.scope-rows input') as HTMLInputElement;
		editor.value = 'Alpha draft';
		editor.dispatchEvent(new Event('input'));
		await click('.scope-rows .scope-counter');
		expect(scope_rows('.scope-rows')).toEqual(['Alpha!:1 Alpha draft', 'Beta!:0 Beta!']);

		update_scope_todo('a', { synced: 1 });
		await flush();
		expect(scope_rows('.scope-rows')).toEqual(['Alpha!:1 Alpha draft', 'Beta!:0 Beta!']);

		// The statements ran when the branch mounted: the label they derived
		// stays until it mounts again.
		update_scope_todo('a', { title: 'Alpha2' });
		await flush();
		expect(scope_rows('.scope-rows')).toEqual(['Alpha!:1 Alpha draft', 'Beta!:0 Beta!']);

		update_scope_todo('a', { editing: false });
		await flush();
		expect(scope_rows('.scope-rows')).toEqual(['Alpha2', 'Beta!:0 Beta!']);
		update_scope_todo('a', { editing: true });
		await flush();
		expect(scope_rows('.scope-rows')).toEqual(['Alpha2!:0 Alpha2!', 'Beta!:0 Beta!']);
	});

	it('follows a keyed @switch row whose case has setup statements', async () => {
		await render(ScopeSwitchRows);
		await click('.scope-switch-rows .scope-counter');
		update_scope_todo('a', { synced: 1 });
		await flush();
		expect(scope_rows('.scope-switch-rows')).toEqual(['Alpha!:1', 'Beta!:0']);
		update_scope_todo('a', { editing: false });
		await flush();
		expect(scope_rows('.scope-switch-rows')).toEqual(['Alpha', 'Beta!:0']);
	});

	it('keeps the case of a @switch in a keyed row’s element when its item is replaced', async () => {
		await render(ScopeRowSwitch);
		await click('.scope-row-switch .scope-counter');
		update_scope_todo('a', { synced: 1 });
		await flush();
		expect(scope_rows('.scope-row-switch')).toEqual(['Alpha:1', 'Beta:0']);
		update_scope_todo('a', { title: 'Alpha2' });
		await flush();
		expect(scope_rows('.scope-row-switch')).toEqual(['Alpha2:1', 'Beta:0']);
	});

	it.each([
		['with setup statements', ScopeUser, '.scope-user', 'Ann!:1Bo'],
		['with a spread host element', ScopeSpread, '.scope-spread', 'spread:1Bo'],
	] as const)(
		'keeps an @if branch %s beside an expression (#1402)',
		async (_name, component, selector, renamed) => {
			await render(component);
			await click('.scope-counter');
			scope_user.value = { ...scope_user.value };
			await flush();
			scope_user.value = { ...scope_user.value, name: 'Bo' };
			await flush();
			expect(text(selector)).toBe(renamed);
			scope_user.value = { ...scope_user.value, online: false };
			await flush();
			scope_user.value = { ...scope_user.value, online: true };
			await flush();
			expect(text(selector)).toBe(renamed.replace(':1', ':0').replace('Ann!', 'Bo!'));
		},
	);

	// A \`<slot>\` and a string \`ref\` resolve against the component that
	// renders them, so a branch with one keeps the shared lowering.
	it('renders the slot a branch’s <slot> names', async () => {
		await render(ScopeSlotApp);
		expect(text('.scope-slot')).toBe('provided');
	});

	it('registers a branch’s string ref with its component', async () => {
		scope_field = null;
		await render(ScopeTemplateRef);
		expect(scope_field).toBe(container.querySelector('.scope-ref input'));
	});

	it('sends a throw from a branch’s statements to the @catch around it, without a warning', async () => {
		const warnings: string[] = [];
		const warn_spy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
			warnings.push(args.map(String).join(' '));
		});
		try {
			scope_fails.value = true;
			await render(ScopeThrows);
			expect(text('.scope-throws')).toBe('scope boom');
			expect(warnings).toEqual([]);
		} finally {
			warn_spy.mockRestore();
			scope_fails.value = false;
		}
	});

	it('passes a component’s fallthrough attributes to a scope that is its whole output', async () => {
		// Its own prop is \`__content\`, so an attribute named \`content\` falls through.
		await render(ScopeRootHost);
		const root = container.querySelector('.scope-root') as HTMLElement;
		expect(root.className).toBe('scope-root extra');
		expect(root.getAttribute('content')).toBe('description');
		expect(root.textContent).toBe('root');
	});

	it('runs a branch’s statements as the setup of a component of its own', async () => {
		await render(ScopeHooks);
		expect(text('.scope-child')).toBe('branch');
		expect(scope_log).toEqual(['run host', 'mounted']);
		scope_user.value = { ...scope_user.value, name: 'Bo' };
		await flush();
		expect(scope_log).toEqual(['run host', 'mounted']);
		scope_user.value = { ...scope_user.value, online: false };
		await flush();
		expect(scope_log).toEqual(['run host', 'mounted', 'unmounted']);
	});
});

describe('tsrx-vue for_items', () => {
	it('hands a reactive array to VaporFor as it is (#1147)', () => {
		const list = reactive(['a', 'b']);
		expect(for_items(list)).toBe(list);
		const held = ref(['a']);
		expect(for_items(held.value)).toBe(held.value);
	});

	it('walks a reactive array with its own iterator through that iterator', () => {
		const raw = ['stored'];
		raw[Symbol.iterator] = function* () {
			yield 'visible';
		} as () => ArrayIterator<string>;
		expect(for_items(reactive(raw))).toEqual(['visible']);
	});

	it('reads a missing source as no items', () => {
		expect(for_items(null as unknown as string[])).toEqual([]);
		expect(for_items(undefined as unknown as string[])).toEqual([]);
	});
});

const hydrated_count = ref(0);

function HydratedTryInElement() @{
	<div>
		@try {
			<button class="hydrated-inc" onClick={() => hydrated_count.value++}>
				{'count ' + hydrated_count.value}
			</button>
		} @catch (err) {
			<b class="hydrated-caught">{String(err)}</b>
		}
	</div>
}

function HydratedTryAtRoot() @{
	@try {
		<button class="hydrated-inc" onClick={() => hydrated_count.value++}>
			{'count ' + hydrated_count.value}
		</button>
	} @catch (err) {
		<b class="hydrated-caught">{String(err)}</b>
	}
}

describe('tsrx-vue hydrating a @try', () => {
	// The markup the server build renders (try-ssr.test.js renders the same
	// shapes).
	it.each([
		[
			'inside an element',
			HydratedTryInElement,
			'<div><button class="hydrated-inc">count 0</button></div>',
		],
		['at the component root', HydratedTryAtRoot, '<button class="hydrated-inc">count 0</button>'],
	])('hydrates its body %s, then updates it', async (_name, component, markup) => {
		hydrated_count.value = 0;
		container.innerHTML = markup;
		const server_button = container.querySelector('.hydrated-inc');
		const errors: unknown[] = [];
		const warnings: string[] = [];
		const app = createVaporSSRApp(component);
		app.config.errorHandler = (error) => {
			errors.push(error);
		};
		app.config.warnHandler = (message) => {
			warnings.push(message);
		};
		try {
			app.mount(container);
			await flush();
			expect(errors).toEqual([]);
			expect(warnings).toEqual([]);
			expect(container.querySelector('.hydrated-inc')).toBe(server_button);
			(server_button as HTMLElement).click();
			await flush();
			expect(text('.hydrated-inc')).toBe('count 1');
		} finally {
			app.unmount();
		}
	});
});

let pending_finish: (component: unknown) => void = () => {};
const pending_sibling_broken = ref(false);

function pending_loader(): Promise<any> {
	return new Promise((resolve) => (pending_finish = resolve));
}

function ResolvedThrows() @{
	throw new Error('resolved body');
	<p />
}

function ResolvedFine() @{
	<p class="pending-resolved">{'resolved'}</p>
}

// An async component under @pending resolves to one that throws in setup.
function PendingResolvesToThrower() @{
	const AsyncChild = defineVaporAsyncComponent(pending_loader);
	@try {
		<AsyncChild />
	} @pending {
		<i class="pending-loading">{'loading'}</i>
	} @catch (err) {
		<b class="pending-caught">{String(err)}</b>
	}
}

// The same inside an element, where the boundary's blocks don't hold it.
function PendingResolvesToThrowerInElement() @{
	const AsyncChild = defineVaporAsyncComponent(pending_loader);
	@try {
		<section>
			<AsyncChild />
		</section>
	} @pending {
		<i class="pending-loading">{'loading'}</i>
	} @catch (err) {
		<b class="pending-caught">{String(err)}</b>
	}
}

function pending_sibling_label(): string {
	if (pending_sibling_broken.value) throw new Error('sibling');
	return 'ok';
}

function PendingSibling() @{
	<span class="pending-sibling">{pending_sibling_label()}</span>
}

// A component beside a loading async component throws on an update.
function PendingSiblingThrows() @{
	const AsyncChild = defineVaporAsyncComponent(pending_loader);
	@try {
		<>
			<AsyncChild />
			<PendingSibling />
		</>
	} @pending {
		<i class="pending-loading">{'loading'}</i>
	} @catch (err) {
		<b class="pending-caught">{String(err)}</b>
	}
}

function RenderThrows() @{
	throw new Error('render body');
	<p />
}

// A component beside a loading one throws as the @pending body first renders.
function PendingRenderThrows() @{
	const AsyncChild = defineVaporAsyncComponent(pending_loader);
	@try {
		<>
			<AsyncChild />
			<RenderThrows />
		</>
	} @pending {
		<i class="pending-loading">{'loading'}</i>
	} @catch (err) {
		<b class="pending-caught">{String(err)}</b>
	}
}

const pending_rerender_broken = ref(false);

function pending_rerender_label(): string {
	if (pending_rerender_broken.value) throw new Error('body render');
	return 'ok';
}

// The body's own setup code throws as the body renders again, while a
// component in it loads.
function PendingRerenderThrows() @{
	const AsyncChild = defineVaporAsyncComponent(pending_loader);
	@try {
		const label = pending_rerender_label();
		<>
			<AsyncChild />
			<p class="pending-label">{label}</p>
		</>
	} @pending {
		<i class="pending-loading">{'loading'}</i>
	} @catch (err) {
		<b class="pending-caught">{String(err)}</b>
	}
}

function PendingFineChild() @{
	<p class="pending-child">{'child'}</p>
}

const pending_child_throws = ref(false);

// As the body renders again, while a component in it loads, it creates a
// component that throws in setup.
function PendingRerenderChildThrows() @{
	const AsyncChild = defineVaporAsyncComponent(pending_loader);
	@try {
		const Child = pending_child_throws.value ? RenderThrows : PendingFineChild;
		<>
			<AsyncChild />
			<Child />
		</>
	} @pending {
		<i class="pending-loading">{'loading'}</i>
	} @catch (err) {
		<b class="pending-caught">{String(err)}</b>
	}
}

let reject_first: (error: unknown) => void = () => {};

// One async component rejects while another is still loading.
function PendingRejectBeside() @{
	const Rejects = defineVaporAsyncComponent(
		() => new Promise<any>((_resolve, reject) => (reject_first = reject)),
	);
	const AsyncChild = defineVaporAsyncComponent(pending_loader);
	@try {
		<>
			<Rejects />
			<AsyncChild />
		</>
	} @pending {
		<i class="pending-loading">{'loading'}</i>
	} @catch (err) {
		<b class="pending-caught">{String(err)}</b>
	}
}

let finish_inner: (component: unknown) => void = () => {};

function NestedLoader() @{
	const Inner = defineVaporAsyncComponent(
		() => new Promise<any>((resolve) => (finish_inner = resolve)),
	);
	<Inner />
}

// The same shapes with a plain @try inside an authored Suspense.
function PlainTryResolvesInElement() @{
	const AsyncChild = defineVaporAsyncComponent(pending_loader);
	@try {
		<section>
			<AsyncChild />
		</section>
	} @catch (err) {
		<b class="pending-caught">{String(err)}</b>
	}
}

function PlainTrySibling() @{
	const AsyncChild = defineVaporAsyncComponent(pending_loader);
	@try {
		<>
			<AsyncChild />
			<PendingSibling />
		</>
	} @catch (err) {
		<b class="pending-caught">{String(err)}</b>
	}
}

function PlainTryReject() @{
	const Rejects = defineVaporAsyncComponent(
		() => new Promise<any>((_resolve, reject) => (reject_first = reject)),
	);
	const AsyncChild = defineVaporAsyncComponent(pending_loader);
	@try {
		<>
			<Rejects />
			<AsyncChild />
		</>
	} @catch (err) {
		<b class="pending-caught">{String(err)}</b>
	}
}

function SuspendedResolvesInElement() @{
	<Suspense
		v-slots={{
			default: () => <PlainTryResolvesInElement />,
			fallback: () => <i class="pending-loading">{'loading'}</i>,
		}}
	/>
}

function SuspendedSibling() @{
	<Suspense
		v-slots={{
			default: () => <PlainTrySibling />,
			fallback: () => <i class="pending-loading">{'loading'}</i>,
		}}
	/>
}

function SuspendedReject() @{
	<Suspense
		v-slots={{
			default: () => <PlainTryReject />,
			fallback: () => <i class="pending-loading">{'loading'}</i>,
		}}
	/>
}

const retry_pending_failed = ref(true);
const retry_resolve: Array<(component: unknown) => void> = [];
const retry_reject: Array<(error: unknown) => void> = [];
let retry_reset: () => void = () => {};

function RetryLoading() @{
	const AsyncChild = defineVaporAsyncComponent(
		() =>
			new Promise<any>((resolve, reject) => {
				retry_resolve.push(resolve);
				retry_reject.push(reject);
			}),
	);
	<AsyncChild />
}

function retry_label(): string {
	if (retry_pending_failed.value) throw new Error('pending failed');
	return 'loading';
}

function keep_retry(reset: () => void): string {
	retry_reset = reset;
	return '';
}

// The @pending body throws; the @catch resets, and the first loader rejects
// after the reset rendered a new one.
function RetryAfterReset() @{
	@try {
		<RetryLoading />
	} @pending {
		<i class="pending-loading">{retry_label()}</i>
	} @catch (err, reset) {
		<b class="pending-caught">{keep_retry(reset) + String(err)}</b>
	}
}

const late_async_shown = ref(false);
let finish_late: (component: unknown) => void = () => {};

// A @try in a resolved Suspense whose body later shows an async component
// that never loads; the Suspense doesn't wait for it.
function ResolvedSuspenseTry() @{
	const LateAsync = defineVaporAsyncComponent(
		() => new Promise<any>((resolve) => (finish_late = resolve)),
	);
	@try {
		<>
			@if (late_async_shown.value) {
				<LateAsync />
			}
			<PendingSibling />
		</>
	} @pending {
		<i class="pending-loading">{'loading'}</i>
	} @catch (err) {
		<b class="pending-caught">{String(err)}</b>
	}
}

const stale_broken = ref(false);
let stale_failed: boolean | string = true;
let stale_reset: () => void = () => {};

function stale_label(): string {
	if (stale_broken.value) throw new Error('late');
	return 'ok';
}

function StaleChild() @{
	if (stale_failed) throw new Error(stale_failed === true ? 'initial' : stale_failed);
	<p class="stale-body">{stale_label()}</p>
}

function stale_keep_reset(reset: () => void): string {
	stale_reset = reset;
	return '';
}

function StaleTry() @{
	@try {
		<StaleChild />
	} @catch (err, reset) {
		<b class="stale-caught">{stale_keep_reset(reset) + String(err)}</b>
	}
}

// A @try beside an async component in an authored Suspense.
function StaleApp() @{
	const AsyncChild = defineVaporAsyncComponent(pending_loader);
	<Suspense
		v-slots={{
			default: () => (
				<div>
					<AsyncChild />
					<StaleTry />
				</div>
			),
			fallback: () => <i class="stale-loading">{'loading'}</i>,
		}}
	/>
}

function stale_recover(failed: boolean | string) {
	stale_failed = failed;
	stale_broken.value = false;
	stale_reset();
}

describe('tsrx-vue a @try whose body throws while its Suspense is pending', () => {
	async function settle() {
		await flush();
		await new Promise((resolve) => setTimeout(resolve, 0));
		await flush();
	}

	async function mount(component: unknown) {
		const handled: string[] = [];
		const app = createVaporApp(component as Parameters<typeof createVaporApp>[0]);
		app.config.errorHandler = (error) => {
			handled.push(String(error));
		};
		app.mount(container);
		await flush();
		return { app, handled };
	}

	// With @pending, the boundary around the Suspense shows the @catch and
	// replaces the whole Suspense, as React's does.
	it('shows the @catch for a component that throws as the body first renders beside a loading one', async () => {
		const { app, handled } = await mount(PendingRenderThrows);
		await settle();
		expect(text('.pending-caught')).toBe('Error: render body');
		expect(container.querySelector('.pending-loading')).toBeNull();
		pending_finish(ResolvedFine);
		await settle();
		expect(text('.pending-caught')).toBe('Error: render body');
		expect(container.querySelector('.pending-resolved')).toBeNull();
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('shows the @catch for a component that throws as the body renders again while another loads', async () => {
		pending_child_throws.value = false;
		const { app, handled } = await mount(PendingRerenderChildThrows);
		expect(text('.pending-loading')).toBe('loading');
		pending_child_throws.value = true;
		await settle();
		pending_finish(ResolvedFine);
		await settle();
		expect(text('.pending-caught')).toBe('Error: render body');
		expect(container.querySelector('.pending-loading')).toBeNull();
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('shows the @catch for the body throwing as it renders again while a component in it loads', async () => {
		pending_rerender_broken.value = false;
		const { app, handled } = await mount(PendingRerenderThrows);
		expect(text('.pending-loading')).toBe('loading');
		pending_rerender_broken.value = true;
		await settle();
		pending_finish(ResolvedFine);
		await settle();
		expect(text('.pending-caught')).toBe('Error: body render');
		expect(container.querySelector('.pending-loading')).toBeNull();
		expect(handled).toEqual([]);
		app.unmount();
	});

	it.each([
		['', PendingResolvesToThrower],
		[' inside an element', PendingResolvesToThrowerInElement],
	])(
		'shows the @catch once an async component%s resolves to one that throws',
		async (_name, component) => {
			const { app, handled } = await mount(component);
			expect(text('.pending-loading')).toBe('loading');
			pending_finish(ResolvedThrows);
			await settle();
			expect(text('.pending-caught')).toBe('Error: resolved body');
			expect(container.querySelector('.pending-loading')).toBeNull();
			expect(handled).toEqual([]);
			app.unmount();
		},
	);

	it('shows the @catch at once for a sibling that throws while one loads', async () => {
		pending_sibling_broken.value = false;
		const { app, handled } = await mount(PendingSiblingThrows);
		expect(text('.pending-loading')).toBe('loading');
		pending_sibling_broken.value = true;
		await settle();
		expect(text('.pending-caught')).toBe('Error: sibling');
		expect(container.querySelector('.pending-loading')).toBeNull();
		expect(handled).toEqual([]);
		pending_finish(ResolvedFine);
		await settle();
		expect(text('.pending-caught')).toBe('Error: sibling');
		app.unmount();
	});

	it('shows the @catch at once for an async component that rejects while another loads', async () => {
		const { app, handled } = await mount(PendingRejectBeside);
		reject_first(new Error('rejected'));
		await settle();
		expect(text('.pending-caught')).toBe('Error: rejected');
		expect(container.querySelector('.pending-loading')).toBeNull();
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('keeps a rejection of a loader the @try reset away from the new body', async () => {
		retry_pending_failed.value = true;
		retry_resolve.length = 0;
		retry_reject.length = 0;
		const { app, handled } = await mount(RetryAfterReset);
		expect(text('.pending-caught')).toBe('Error: pending failed');
		retry_pending_failed.value = false;
		retry_reset();
		await flush();
		expect(retry_resolve).toHaveLength(2);
		expect(text('.pending-loading')).toBe('loading');
		retry_reject[0](new Error('old rejection'));
		await settle();
		expect(text('.pending-loading')).toBe('loading');
		retry_resolve[1](ResolvedFine);
		await settle();
		expect(text('.pending-resolved')).toBe('resolved');
		expect(container.querySelector('.pending-caught')).toBeNull();
		expect(handled).toEqual([]);
		app.unmount();
	});

	// A plain @try inside an authored Suspense shows its own @catch, once the
	// async components the Suspense waits for in its body have settled.
	it('waits for the loading component an error came through, inside an element', async () => {
		const { app, handled } = await mount(SuspendedResolvesInElement);
		expect(text('.pending-loading')).toBe('loading');
		pending_finish(ResolvedThrows);
		await settle();
		expect(text('.pending-caught')).toBe('Error: resolved body');
		expect(container.querySelector('.pending-loading')).toBeNull();
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('waits for a loading component beside the one that threw', async () => {
		pending_sibling_broken.value = false;
		const { app, handled } = await mount(SuspendedSibling);
		pending_sibling_broken.value = true;
		await settle();
		expect(text('.pending-loading')).toBe('loading');
		pending_finish(ResolvedFine);
		await settle();
		expect(text('.pending-caught')).toBe('Error: sibling');
		expect(container.querySelector('.pending-loading')).toBeNull();
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('waits for a loading component beside one that rejected', async () => {
		const { app, handled } = await mount(SuspendedReject);
		reject_first(new Error('rejected'));
		await settle();
		expect(text('.pending-loading')).toBe('loading');
		pending_finish(ResolvedFine);
		await settle();
		expect(text('.pending-caught')).toBe('Error: rejected');
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('waits for an async component that a loading one renders once it resolves', async () => {
		pending_sibling_broken.value = false;
		const { app, handled } = await mount(SuspendedSibling);
		pending_sibling_broken.value = true;
		await flush();
		pending_finish(NestedLoader);
		await settle();
		expect(text('.pending-loading')).toBe('loading');
		finish_inner(ResolvedFine);
		await settle();
		expect(text('.pending-caught')).toBe('Error: sibling');
		expect(container.querySelector('.pending-loading')).toBeNull();
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('shows the @catch at once in a Suspense that has resolved', async () => {
		pending_sibling_broken.value = false;
		late_async_shown.value = false;
		const { app, handled } = await mount(ResolvedSuspenseTry);
		expect(text('.pending-sibling')).toBe('ok');
		late_async_shown.value = true;
		await flush();
		pending_sibling_broken.value = true;
		await flush();
		expect(text('.pending-caught')).toBe('Error: sibling');
		expect(handled).toEqual([]);
		finish_late(ResolvedFine);
		app.unmount();
	});

	it("keeps a reset @try's body while an async component beside it loads", async () => {
		stale_failed = true;
		stale_broken.value = false;
		const { app, handled } = await mount(StaleApp);
		stale_recover(false);
		await flush();
		stale_broken.value = true;
		await flush();
		stale_recover(false);
		await flush();
		pending_finish(ResolvedFine);
		await settle();
		expect(container.querySelector('.stale-caught')).toBeNull();
		expect(text('.stale-body')).toBe('ok');
		expect(handled).toEqual([]);
		app.unmount();
	});

	it("shows a @try's newer error while an async component beside it loads", async () => {
		stale_failed = true;
		stale_broken.value = false;
		const { app, handled } = await mount(StaleApp);
		stale_recover(false);
		await flush();
		stale_broken.value = true;
		await flush();
		stale_recover('newer');
		await flush();
		pending_finish(ResolvedFine);
		await settle();
		expect(text('.stale-caught')).toBe('Error: newer');
		expect(handled).toEqual([]);
		app.unmount();
	});
});

const inline_obj = ref<{ x?: { y: string } }>({ x: { y: 'ok' } });

// The body's inline code throws on an update.
function InlineUpdateThrows() @{
	@try {
		<p class="inline-body">{(inline_obj.value.x as { y: string }).y}</p>
	} @catch (err) {
		<b class="inline-caught">{String(err)}</b>
	}
}

// The body's inline click handler throws.
function InlineClickThrows() @{
	@try {
		<button
			class="inline-click"
			onClick={() => {
				throw new Error('inline click');
			}}
		>
			{'click'}
		</button>
	} @catch (err) {
		<b class="inline-caught">{String(err)}</b>
	}
}

// A @try inside another one's body, whose inline code throws on an update.
function InlineUpdateThrowsNested() @{
	@try {
		<section>
			@try {
				<p class="inline-body">{(inline_obj.value.x as { y: string }).y}</p>
			} @catch (err) {
				<b class="inline-caught">{String(err)}</b>
			}
		</section>
	} @catch (err) {
		<p class="inline-outer">{String(err)}</p>
	}
}

let finish_inline_async: (component: unknown) => void = () => {};

// A @try with @pending whose inline body code, inside an element beside a
// loading async component, throws on an update.
function InlinePendingInElement() @{
	const AsyncChild = defineVaporAsyncComponent(
		() => new Promise<any>((resolve) => (finish_inline_async = resolve)),
	);
	@try {
		<div>
			<AsyncChild />
			<p class="inline-body">{(inline_obj.value.x as { y: string }).y}</p>
		</div>
	} @pending {
		<i class="inline-loading">{'loading'}</i>
	} @catch (err) {
		<b class="inline-caught">{String(err)}</b>
	}
}

describe("tsrx-vue a @try body's inline code", () => {
	async function mount(component: unknown) {
		const handled: string[] = [];
		const app = createVaporApp(component as Parameters<typeof createVaporApp>[0]);
		app.config.errorHandler = (error) => {
			handled.push(String(error));
		};
		app.mount(container);
		await flush();
		return { app, handled };
	}

	it.each([
		['', InlineUpdateThrows],
		[' inside another @try', InlineUpdateThrowsNested],
	])('shows an error it throws on an update in the @catch%s', async (_name, component) => {
		inline_obj.value = { x: { y: 'ok' } };
		const { app, handled } = await mount(component);
		expect(text('.inline-body')).toBe('ok');
		inline_obj.value = {};
		await flush();
		expect(text('.inline-caught')).toMatch(/^TypeError: /);
		expect(container.querySelector('.inline-body')).toBeNull();
		expect(container.querySelector('.inline-outer')).toBeNull();
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('shows an error it throws while a @pending Suspense loads, and lets that Suspense go', async () => {
		inline_obj.value = { x: { y: 'ok' } };
		const { app, handled } = await mount(InlinePendingInElement);
		expect(text('.inline-loading')).toBe('loading');
		inline_obj.value = {};
		await flush();
		finish_inline_async(CatchResolved);
		await new Promise((resolve) => setTimeout(resolve, 0));
		await flush();
		expect(text('.inline-caught')).toMatch(/^TypeError: /);
		expect(container.querySelector('.inline-loading')).toBeNull();
		expect(handled).toEqual([]);
		app.unmount();
	});

	it('shows an error its click handler throws in the @catch', async () => {
		const { app, handled } = await mount(InlineClickThrows);
		(container.querySelector('.inline-click') as HTMLElement).click();
		await flush();
		expect(text('.inline-caught')).toBe('Error: inline click');
		expect(handled).toEqual([]);
		app.unmount();
	});
});

runForOfSourcesRuntimeTests();
runSwitchFallthroughRuntimeTests();
runTsxExpressionTsrxRuntimeTests();
runForOfHeadScopeRuntimeTests();
// Vapor leaves an empty comment where a constant `@if` with a following sibling
// was inserted.
runJsxTextWhitespaceRuntimeTests({
	nbsp: 'kept',
	anchors: 'empty comments',
	children: 'slots',
	references: 'html',
	lines: 'kept',
});
runScriptBodyRuntimeTests();
runNullishSpreadRefRuntimeTests();
runExpressionSpreadRefRuntimeTests();
runArraySpreadRefRuntimeTests();
runArrayRefRuntimeTests();
