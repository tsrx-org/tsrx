// Shared runtime fixtures for a host spread beside a ref in a generator helper
// that yields from the element's attributes. Solid and Vue compile dynamic JSX
// attributes into getters or effects, where a `yield` cannot live even in
// native JSX, so only React, Preact, and Hono import these.

type SpreadBag = { id: string; title: string };

export const generator_spread_ref_nodes: Element[] = [];

function capture(node: Element | null) {
	if (node) generator_spread_ref_nodes.push(node);
}

function* spread_ref_field(enabled: boolean, bag: SpreadBag) {
	return enabled
		? <input class="generator-spread-ref" {...bag} ref={capture} title={yield bag.title} />
		: null;
}

export function GeneratorSpreadRefApp({ enabled, bag }: { enabled: boolean; bag: SpreadBag }) {
	const field = spread_ref_field(enabled, bag);
	const requested = field.next().value;
	return <div>{field.next(`${requested} (resumed)`).value}</div>;
}
