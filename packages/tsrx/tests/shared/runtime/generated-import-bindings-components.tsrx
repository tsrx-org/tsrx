// Shared runtime fixtures for the generated-import test harness. Each fixture
// declares a binding named like a component the compiler imports for `@try`
// or a keyed fragment row. The generated element must keep rendering the
// compiler's own import, and the authored binding must keep its own value.

function TsrxErrorBoundary(props: { children?: unknown }) {
	return <section class="authored-error-boundary">{props.children as never}</section>;
}

export function ModuleErrorBoundaryNameApp() @{
	<div>
		<TsrxErrorBoundary>
			<p class="authored-error-boundary-child">{'authored'}</p>
		</TsrxErrorBoundary>
		@try {
			<p class="generated-error-boundary-child">{'ready'}</p>
		} @catch (_error) {
			<p>{'failed'}</p>
		}
	</div>
}

export function LocalSuspenseNameApp() @{
	const Suspense = (props: { children?: unknown }) => (
		<section class="local-suspense">{props.children as never}</section>
	);

	<div>
		<Suspense>
			<p class="authored-suspense-child">{'authored'}</p>
		</Suspense>
		@try {
			<p class="generated-suspense-child">{'ready'}</p>
		} @pending {
			<p>{'loading'}</p>
		}
	</div>
}

export function LoopVariableFragmentNameApp() @{
	const rows = [
		['a', 'A'],
		['b', 'B'],
	];

	<ul class="fragment-rows">
		@for (const Fragment of rows; key Fragment[0]) {
			<>
				<li>{Fragment[0]}</li>
				<li>{Fragment[1]}</li>
			</>
		}
	</ul>
}
