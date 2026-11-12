// Shared runtime fixtures for the array spread ref test harness. Each
// platform's vite plugin transforms this file with its own compiler when
// the platform's `runtime.test.tsrx` imports the components.

export const array_spread_ref_log: string[] = [];
export const array_spread_ref_object: { current: Element | null } = { current: null };
export const array_spread_ref_value: { value: Element | null } = { value: null };

function log_ref(name: string) {
	return (node: Element | null) => {
		array_spread_ref_log.push(node ? name : `${name}:null`);
	};
}

const first = log_ref('first');
const second = log_ref('second');
const own = log_ref('own');

export function ArraySpreadRefApp() @{
	<input class="array-spread-ref" {...{ ref: [first, second] }} />
}

export function ArraySpreadRefPropsApp() @{
	<input class="array-spread-ref-props" {...{ title: 'bag', ref: [first, second] }} />
}

export function ArraySecondSpreadRefApp() @{
	<input class="array-second-spread-ref" {...{ title: 'bag' }} {...{ ref: [first, second] }} />
}

export function NestedArraySpreadRefApp() @{
	<input class="nested-array-spread-ref" {...{ ref: [first, [second]] }} />
}

export function SingleArraySpreadRefApp() @{
	<input class="single-array-spread-ref" {...{ ref: [first] }} />
}

export function ObjectArraySpreadRefApp() @{
	<input class="object-array-spread-ref" {...{ ref: [first, array_spread_ref_object] }} />
}

export function LoneObjectArraySpreadRefApp() @{
	<>
		<input class="lone-current-array-spread-ref" {...{ ref: [array_spread_ref_object] }} />
		<input class="lone-value-array-spread-ref" {...{ ref: [array_spread_ref_value] }} />
	</>
}

export function ArraySpreadOwnRefApp() @{
	<input class="array-spread-own-ref" ref={own} {...{ ref: [first, second] }} />
}
