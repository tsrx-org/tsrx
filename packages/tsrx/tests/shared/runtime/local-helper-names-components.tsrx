// Shared runtime fixtures for the local-helper-name test harness. Vue renders a
// `@catch` body under `@pending` through a generated helper component, which a
// component inside another function declares in its own setup. This is the
// first helper of the module, so its bare name would be `StatementBodyHook1`,
// the name the enclosing function uses.

function ThrowingChild() @{
	throw new Error('pending catch boom');
	<p>{'unreachable'}</p>
}

function makeApp() {
	const StatementBodyHook1 = 'outer: ';
	function App() @{
		@try {
			<ThrowingChild />
		} @pending {
			<p class="local-helper-pending">{'loading...'}</p>
		} @catch (err) {
			<p class="local-helper-caught">
				{StatementBodyHook1}
				{(err as Error).message}
			</p>
		}
	}
	return App;
}

export const EnclosingHelperNameApp = makeApp();
