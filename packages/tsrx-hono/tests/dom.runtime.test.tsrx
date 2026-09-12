import { use, useState } from 'hono/jsx/dom';

const unsafe_markup = '<img class="injected" src=x onerror="globalThis.pwned=true">';

let resolve_value: (value: string) => void;
let value_promise: Promise<string>;

function AsyncContent() @{
	const value = use(value_promise);
	<span class="resolved">{value}</span>
}

function SuspendedApp() @{
	@try {
		<AsyncContent />
	} @pending {
		<p class="pending">Loading</p>
	}
}

function Broken(): never @{
	throw new Error(unsafe_markup);
}

function EscapingApp() @{
	<>
		<p class="child">{unsafe_markup}</p>
		@try {
			<Broken />
		} @catch (error) {
			<p class="fallback">{error.message}</p>
		}
	</>
}

const ref_events: string[] = [];
const object_ref: { current: HTMLInputElement | null } = { current: null };

function firstRef(node: HTMLInputElement | null) {
	if (node) {
		ref_events.push('first:set');
		return () => ref_events.push('first:cleanup');
	}
	ref_events.push('first:null');
}

function secondRef(node: HTMLInputElement | null) {
	ref_events.push(node ? 'second:set' : 'second:null');
}

function RefApp() @{
	const [alternate, setAlternate] = useState(false);
	const spread = { ref: alternate ? secondRef : firstRef };
	<>
		<input {...spread} ref={object_ref} class="ref-target" />
		<button class="replace-ref" onClick={() => setAlternate(true)}>replace</button>
	</>
}

describe('@tsrx/hono DOM runtime', () => {
	it('renders a fallback while use suspends and resumes after fulfillment', async () => {
		value_promise = new Promise((resolve) => {
			resolve_value = resolve;
		});

		render(SuspendedApp);
		expect(container.innerHTML).toBe('<p class="pending">Loading</p>');

		resolve_value('ready');
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		expect(container.innerHTML).toBe('<span class="resolved">ready</span>');
	});

	it('renders untrusted children and boundary fallbacks as text', () => {
		render(EscapingApp);

		expect(container.querySelector('.child')?.textContent).toBe(unsafe_markup);
		expect(container.querySelector('.fallback')?.textContent).toBe(unsafe_markup);
		expect(container.querySelector('.injected')).toBeNull();
	});

	it('cleans replaced and unmounted merged refs exactly once', async () => {
		ref_events.length = 0;
		render(RefApp);

		const input = container.querySelector('.ref-target');
		expect(ref_events).toEqual(['first:set']);
		expect(object_ref.current).toBe(input);

		(container.querySelector('.replace-ref') as HTMLButtonElement).click();
		await Promise.resolve();

		expect(ref_events).toEqual(['first:set', 'first:cleanup', 'second:set']);
		expect(object_ref.current).toBe(input);

		unmount();
		await Promise.resolve();
		expect(ref_events).toEqual([
			'first:set',
			'first:cleanup',
			'second:set',
			'second:null',
		]);
		expect(object_ref.current).toBeNull();
	});
});
