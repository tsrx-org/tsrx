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
