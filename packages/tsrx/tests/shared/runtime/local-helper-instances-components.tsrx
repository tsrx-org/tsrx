// Shared runtime fixtures for the local-helper-instance test harness. Vue
// renders a `@catch` body under `@pending` through a generated helper
// component. For a component inside another function, a helper that reads
// nothing from the component's scope is declared once beside the component;
// one that reads a binding of the component's scope stays in its setup.

function ThrowingChild() @{
	throw new Error('local helper boom');
	<p>{'unreachable'}</p>
}

function makeCaptureFree(label: string) {
	function CaptureFree() @{
		@try {
			<ThrowingChild />
		} @pending {
			<p>{'loading...'}</p>
		} @catch (error) {
			const message = (error as Error).message;
			<p class="capture-free-caught">
				{label}
				{message}
			</p>
		}
	}
	return CaptureFree;
}

function makeCapturing() {
	function Capturing() @{
		const suffix = '!';
		@try {
			<ThrowingChild />
		} @pending {
			<p>{'loading...'}</p>
		} @catch (error) {
			<p class="capturing-caught">
				{(error as Error).message}
				{suffix}
			</p>
		}
	}
	return Capturing;
}

const CaptureFree = makeCaptureFree('caught: ');
const Capturing = makeCapturing();

export function TwoCaptureFree() @{
	<div>
		<CaptureFree />
		<CaptureFree />
	</div>
}

export function TwoCapturing() @{
	<div>
		<Capturing />
		<Capturing />
	</div>
}
