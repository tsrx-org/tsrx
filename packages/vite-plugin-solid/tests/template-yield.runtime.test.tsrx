// babel-preset-solid evaluates these template values in place, so a `yield`
// in them runs in its generator and isn't reported (#259).

function run<T>(generator: Generator<string, T, unknown>, answers: Record<string, unknown>): T {
	let step = generator.next();
	while (!step.done) step = generator.next(answers[step.value]);
	return step.value;
}

function* host_field() {
	return (
		<input
			title={(yield 'title') as string}
			class={{ active: (yield 'active') as boolean }}
			onClick={(yield 'onClick') as () => void}
			ref={(yield 'ref') as (element: HTMLInputElement) => void}
		/>
	);
}

function Label(props: { text: string; children?: unknown }) @{
	<span class="label" title={props.text}>
		{props.children as string}
	</span>
}

function* component_field() {
	return <Label text={(yield 'text') as string}>{(yield 'child') as string}</Label>;
}

function* gated() @{
	<div class="gated">
		@if ((yield 'show') as boolean) {
			<p class="shown">{'yes'}</p>
		}
	</div>
}

function* spread_beside_ref(enabled: boolean) {
	return enabled ? <input {...{}} ref={() => {}} title={(yield 'title') as string} /> : null;
}

function* yielded_first() {
	const title = (yield 'title') as string;
	return <input class="first" title={title} />;
}

describe('a yield in a template position Solid evaluates in place', () => {
	it('runs in host attributes, a class object, an event handler and a ref', async () => {
		let clicks = 0;
		let referenced: HTMLInputElement | undefined;
		await render(() =>
			run(host_field(), {
				title: 'Hi',
				active: true,
				onClick: () => clicks++,
				ref: (element: HTMLInputElement) => (referenced = element),
			}),
		);
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.title).toBe('Hi');
		expect(input.classList.contains('active')).toBe(true);
		expect(referenced).toBe(input);
		input.click();
		expect(clicks).toBe(1);
	});

	it('runs in a static component prop and a lone static child', async () => {
		await render(() => run(component_field(), { text: 'tip', child: 'body' }));
		const label = container.querySelector('.label') as HTMLElement;
		expect(label.title).toBe('tip');
		expect(label.textContent).toBe('body');
	});

	it('runs in a static @if test', async () => {
		await render(() => run(gated(), { show: true }));
		expect(container.querySelector('.gated .shown')?.textContent).toBe('yes');
	});

	it("runs beside a host spread and a ref in a ternary arm (#246's shape)", async () => {
		await render(() => run(spread_beside_ref(true), { title: 'spread' }));
		expect((container.querySelector('input') as HTMLInputElement).title).toBe('spread');
	});

	it('runs before the element', async () => {
		await render(() => run(yielded_first(), { title: 'first' }));
		expect((container.querySelector('.first') as HTMLInputElement).title).toBe('first');
	});
});
