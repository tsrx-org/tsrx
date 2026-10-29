// vue-jsx-vapor evaluates every template value in a render effect or an
// immediately called arrow, so a `yield` in a template is reported (#259).
// These keep the `yield` out of the template: a host spread, which TSRX
// evaluates before the element, and a value yielded first.

function run<T>(generator: Generator<string, T, unknown>, answers: Record<string, unknown>): T {
	let step = generator.next();
	while (!step.done) step = generator.next(answers[step.value]);
	return step.value;
}

function* spread_field() {
	return <input {...((yield 'attrs') as Record<string, string>)} />;
}

function* yielded_first() {
	const title = (yield 'title') as string;
	return <input class="first" title={title} />;
}

function SpreadApp() @{
	const element = run(spread_field(), { attrs: { title: 'spread', 'data-kind': 'field' } });
	<div class="host">{element}</div>
}

function YieldedFirstApp() @{
	const element = run(yielded_first(), { title: 'first' });
	<div class="host">{element}</div>
}

describe('a yield Vue keeps in its generator', () => {
	it('runs in a host spread', async () => {
		await render(SpreadApp);
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.title).toBe('spread');
		expect(input.dataset.kind).toBe('field');
	});

	it('runs before the element', async () => {
		await render(YieldedFirstApp);
		expect((container.querySelector('.first') as HTMLInputElement).title).toBe('first');
	});
});
