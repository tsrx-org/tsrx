// vue-jsx-vapor evaluates every template value in a render effect or an
// immediately called arrow, so an `await` in an element or fragment is
// reported (#1370). An awaiting `@for` that is a template's only output isn't
// in one: TSRX awaits its `map_iterable_async` in the async function itself.

async function rows(items: Set<string>) {
	const out = (
		@{
			@for (const item of items) {
				const label = await Promise.resolve(item.toUpperCase());
				<li>{label}</li>
			}
		}
	);
	return out;
}

function List(props: { rows: unknown }) @{
	<ul>{props.rows}</ul>
}

describe('an await Vue keeps in its async function (#1370)', () => {
	it('renders the rows of an awaiting @for that is the only output', async () => {
		await render(List, { rows: await rows(new Set(['a', 'b'])) });
		expect(Array.from(container.querySelectorAll('li'), (li) => li.textContent)).toEqual([
			'A',
			'B',
		]);
	});
});
