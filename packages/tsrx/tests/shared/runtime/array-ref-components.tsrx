// Shared runtime fixtures for the array ref test harness. Each platform's vite
// plugin transforms this file with its own compiler when the platform's
// `runtime.test.tsrx` imports the components.

export const array_ref_log: string[] = [];
export const array_ref_object: { current: Element | null } = { current: null };
export const array_ref_value: { value: Element | null } = { value: null };

function log_ref(name: string) {
	return (node: Element | null) => {
		array_ref_log.push(node ? name : `${name}:null`);
	};
}

const first = log_ref('first');
const second = log_ref('second');
const third = log_ref('third');
const hidden = false as boolean;

export function ArrayRefApp() @{
	<input class="array-ref" ref={[first, second]} />
}

export function NestedArrayRefApp() @{
	<input class="nested-array-ref" ref={[first, [second, [third]]]} />
}

export function SingleArrayRefApp() @{
	<input class="single-array-ref" ref={[first]} />
}

export function EmptyArrayRefApp() @{
	<input class="empty-array-ref" ref={[]} />
}

export function FalsyArrayRefApp() @{
	<input class="falsy-array-ref" ref={[first, hidden && second, null, undefined, third]} />
}

export function ArrayRefSpreadApp() @{
	<input class="array-ref-spread" ref={[first, second]} {...{ title: 'bag' }} />
}

export function SpreadArrayRefApp() @{
	<input class="spread-array-ref" {...{ title: 'bag' }} ref={[first, second]} />
}

export function ArrayRefSpreadRefApp() @{
	<input class="array-ref-spread-ref" ref={[first, second]} {...{ title: 'bag', ref: third }} />
}

export function ObjectArrayRefApp() @{
	<>
		<input class="object-array-ref" ref={[first, array_ref_object]} />
		<input class="lone-value-array-ref" ref={[array_ref_value]} />
	</>
}
