// Shared runtime fixtures for the JSX spread children test harness. Each
// platform's vite plugin transforms this file with its own compiler when
// the platform's `runtime.test.tsrx` imports the components.

export function SpreadChildrenApp({ items }: { items: string[] }) @{
	<ul class="spread-children">
		<li>{'first'}</li>
		{...items.map((item) => <li key={item}>{item}</li>)}
		<li>{'last'}</li>
	</ul>
}

export function SpreadChildrenFragmentApp({ items }: { items: string[] }) @{
	<p class="spread-children-fragment">
		@if (items.length > 0) {
			<>
				{...items.map((item) => <b key={item}>{item}</b>)}
			</>
		}
	</p>
}

function SpreadChildrenBox(props: { children?: any }) @{
	<section class="spread-children-box">{props.children}</section>
}

export function SpreadChildrenComponentApp({ items }: { items: string[] }) @{
	<SpreadChildrenBox>
		{...items.map((item) => <i key={item}>{item}</i>)}
		<i>{'end'}</i>
	</SpreadChildrenBox>
}
