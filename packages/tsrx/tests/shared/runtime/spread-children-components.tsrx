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

// A setup statement after a child that reassigns what the child renders. The
// child renders the value at its own source position, so a spread child and
// an expression child in the same place render the same items.
export function SpreadChildrenInterleavedApp({ items }: { items: string[] }) @{
	let current = items;
	<ul class="spread-children-interleaved">
		{...current.map((item) => <li key={item}>{item}</li>)}
		@{
			current = [...current, 'late'];
		}
		<li>{current.length}</li>
	</ul>
}

export function ExpressionChildrenInterleavedApp({ items }: { items: string[] }) @{
	let current = items;
	<ul class="expression-children-interleaved">
		{current.map((item) => <li key={item}>{item}</li>)}
		@{
			current = [...current, 'late'];
		}
		<li>{current.length}</li>
	</ul>
}
