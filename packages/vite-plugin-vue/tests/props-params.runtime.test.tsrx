import { defineVaporComponent, ref } from 'vue';

// Props patterns @tsrx/vue reports as TSRX2031, run through vue-jsx-vapor's
// props macro as the compiler would wrap them, and the form it suggests. An
// explicit `defineVaporComponent` call is not a component TSRX checks, so
// these reach the macro as written.

const DefaultedParam = defineVaporComponent(function ({ s }: { s?: string } = {}) {
	return <p>{String(s)}</p>;
});

const PlainParam = defineVaporComponent(function ({ s }: { s?: string }) {
	return <p>{String(s)}</p>;
});

const NestedRest = defineVaporComponent(function ({
	t: { a, ...r },
}: {
	t: Record<string, number>;
}) {
	return <p>{`${a} ${JSON.stringify(r)}`}</p>;
});

const ArrayRest = defineVaporComponent(function ({ t: [a, ...r] }: { t: number[] }) {
	return <p>{`${a} ${JSON.stringify(r)}`}</p>;
});

const ArrayRestBeforeOwnRest = defineVaporComponent(function ({
	t: [a, ...r],
	...rest
}: {
	t: number[];
	[key: string]: unknown;
}) {
	return <p>{`${a} ${JSON.stringify(r)} ${Object.keys(rest).length}`}</p>;
});

const NestedRestBeforeOwnRest = defineVaporComponent(function ({
	t: { a, ...r },
	...rest
}: {
	t: Record<string, unknown>;
	[key: string]: unknown;
}) {
	return <p>{`${a} ${JSON.stringify({ ...r })} ${Object.keys(rest).join(',')}`}</p>;
});

let set_t: (value: Record<string, string>) => void = () => {};

const NestedRestParent = defineVaporComponent(function () {
	const t = ref<Record<string, string>>({ a: 'A', b: 'B1' });
	set_t = (value) => {
		t.value = value;
	};
	return <NestedRestBeforeOwnRest t={t.value} />;
});

describe('vue-jsx-vapor props parameters at runtime', () => {
	it('passes no props to a props parameter with a default', async () => {
		await render(DefaultedParam, { s: 'A' });
		expect(container.textContent).toBe('undefined');
	});

	it('passes props to the same parameter without its default', async () => {
		await render(PlainParam, { s: 'A' });
		expect(container.textContent).toBe('A');
	});

	it("gives a prop's rest element the attrs when it is the last rest", async () => {
		await render(NestedRest, { t: { a: 1, b: 2 }, other: 'x' });
		expect(container.textContent).toBe('1 {"other":"x"}');
	});

	it("gives an array prop's rest element the attrs when it is the last rest", async () => {
		await render(ArrayRest, { t: [1, 2, 3] });
		expect(container.textContent).toBe('1 {}');
	});

	it("gives an array prop's rest element the whole array before the pattern's own rest", async () => {
		await render(ArrayRestBeforeOwnRest, { t: [1, 2, 3] });
		expect(container.textContent).toBe('1 {"0":1,"1":2,"2":3} 0');
	});

	it("gives a prop's rest element before the pattern's own rest the rest as it was at setup", async () => {
		await render(NestedRestParent);
		expect(container.textContent).toBe('A {"b":"B1"} ');
		set_t({ a: 'A2', b: 'B2', c: 'C2' });
		await flush();
		// `a` follows the new `t`; `r` doesn't.
		expect(container.textContent).toBe('A2 {"b":"B1"} ');
	});
});
