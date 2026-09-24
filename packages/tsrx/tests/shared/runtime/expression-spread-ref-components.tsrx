// Shared runtime fixtures for host spreads beside a ref in plain-JS expression
// positions. Each platform's vite plugin transforms this file with its own
// compiler when the platform's `runtime.test.tsrx` imports the components.

type SpreadBag = { id: string; title: string };

export const expression_spread_ref_nodes: Element[] = [];

function capture(node: Element | null) {
	if (node) expression_spread_ref_nodes.push(node);
}

export function TernarySpreadRefApp({ enabled, bag }: { enabled: boolean; bag: SpreadBag }) {
	return enabled ? <input class="expression-spread-ref-ternary" {...bag} ref={capture} /> : null;
}

export function DeclaratorSpreadRefApp({ bag }: { bag: SpreadBag }) {
	const field = <span>
		<input class="expression-spread-ref-declarator" {...bag} ref={capture} />
	</span>;
	return <div>{field}</div>;
}

// `key` keeps React and Preact from warning about the list; Solid renders it as
// a plain attribute.
export function CallbackSpreadRefApp({ bags }: { bags: SpreadBag[] }) {
	return <ul>{bags.map(
		(bag) => <li key={bag.id} class="expression-spread-ref-callback" {...bag} ref={capture} />,
	)}</ul>;
}

export function TemplateCallbackSpreadRefApp({ bags }: { bags: SpreadBag[] }) @{
	<ul>{bags.map(
		(bag) =>
			<li key={bag.id} class="expression-spread-ref-template-callback" {...bag} ref={capture} />,
	)}</ul>
}

function List(props: { items: unknown }) @{
	<ul>{props.items}</ul>
}

// JSX in a spread argument is parsed as plain JSX rather than a template node.
export function SpreadArgumentSpreadRefApp({ bags }: { bags: SpreadBag[] }) {
	const list = <List
		{...{
			items: bags.map(
				(bag) =>
					<li key={bag.id} class="expression-spread-ref-spread-argument" {...bag} ref={capture} />,
			),
		}}
	/>;
	return <div>{list}</div>;
}
