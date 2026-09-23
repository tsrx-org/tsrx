// Shared runtime fixtures for the nullish host spread test harness. Each
// platform's vite plugin transforms this file with its own compiler when
// the platform's `runtime.test.tsrx` imports the components.

type SpreadBag = { id?: string } | null | undefined;

export const nullish_spread_ref_nodes: Element[] = [];

function capture(node: Element | null) {
	if (node) nullish_spread_ref_nodes.push(node);
}

export function NullishSpreadRefApp({ bag }: { bag?: SpreadBag }) @{
	<input class="nullish-spread-ref" {...bag} ref={capture} />
}

export function NullishSpreadRefInIfApp({ bag }: { bag?: SpreadBag }) @{
	<div>
		@if (true) {
			<input class="nullish-spread-ref-if" {...bag} ref={capture} />
		}
	</div>
}

export function NullishSpreadApp({ bag }: { bag?: SpreadBag }) @{
	<input class="nullish-spread" {...bag} />
}
