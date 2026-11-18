// Shared runtime fixtures for the host spread attribute order test harness.
// Each platform's vite plugin transforms this file with its own compiler when
// the platform's `runtime.test.tsrx` imports the components.

export const spread_ref_order_nodes: Element[] = [];

function capture(node: Element | null) {
	if (node) spread_ref_order_nodes.push(node);
}

function counter() {
	let count = 0;
	return () => String(++count);
}

export function SpreadRefOrderApp() @{
	const next = counter();
	<div
		class="spread-ref-order"
		data-first={next()}
		{...{ 'data-second': next() }}
		data-third={next()}
		ref={capture}
	/>
}

export function NestedSpreadRefOrderApp() @{
	const next = counter();
	<section data-first={next()}>
		<div
			class="nested-spread-ref-order"
			ref={capture}
			data-second={next()}
			{...{ 'data-third': next() }}
		/>
	</section>
}

export function SpreadsRefOrderApp() @{
	const next = counter();
	<div
		class="spreads-ref-order"
		{...{ 'data-first': next() }}
		data-second={next()}
		{...{ 'data-third': next(), ref: capture }}
		ref={capture}
	/>
}

function getter_bag(extra: object = {}) {
	const counter = { reads: 0 };
	const bag = Object.assign(
		{
			get title() {
				return String(++counter.reads);
			},
		},
		extra,
	);
	return [counter, bag] as const;
}

export function SpreadGetterApp() @{
	const [counter, bag] = getter_bag();
	<input class="spread-getter" {...bag} data-reads={String(counter.reads)} />
}

export function SpreadGetterRefApp() @{
	const [counter, bag] = getter_bag();
	<input class="spread-getter-ref" {...bag} data-reads={String(counter.reads)} ref={capture} />
}

export function SpreadClearsRefApp() @{
	<div class="spread-clears-ref" {...{ ref: capture }} {...{ ref: undefined }} />
}

export function SpreadGetterOwnRefApp() @{
	const [counter, bag] = getter_bag({ ref: capture });
	<input class="spread-getter-own-ref" {...bag} data-reads={String(counter.reads)} />
}

export function RefBeforeSpreadApp() @{
	let ready = false;
	function init_ref() {
		ready = true;
		return capture;
	}
	<div
		class="ref-before-spread"
		ref={init_ref()}
		{...{ 'data-ready': String(ready), ref: capture }}
	/>
}

export function RefBeforeAttributeApp() @{
	let ready = false;
	function init_ref() {
		ready = true;
		return capture;
	}
	<div class="ref-before-attribute" {...{}} ref={init_ref()} data-ready={String(ready)} />
}
