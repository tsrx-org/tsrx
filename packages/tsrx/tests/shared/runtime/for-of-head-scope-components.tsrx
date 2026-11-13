// Shared runtime fixtures for the scopes of an `@for` head and body. Each
// platform's vite plugin compiles this file with its own compiler when the
// platform's `runtime.test.tsrx` imports it. As in `for...of`, the body can
// declare the item's or the index's name again (#1325), and a default in the
// item's pattern can read the index (#1312).

type Row = { id: string; name: string };
type PairRow = [string | undefined, string];
type ObjectRow = { a?: string; b: string };

const other = { id: 'other' };

export function RedeclaredItemApp({ rows }: { rows: Row[] }) @{
	<ul class="redeclared-item">
		@for (const { id } of rows) {
			const { id } = other;
			<li>{id}</li>
		}
	</ul>
}

export function RedeclaredNameApp({ rows }: { rows: Row[] }) @{
	<ul class="redeclared-name">
		@for (const row of rows) {
			const row = 'body';
			<li>{row}</li>
		}
	</ul>
}

export function RedeclaredIndexApp({ rows }: { rows: Row[] }) @{
	<ul class="redeclared-index">
		@for (const { name } of rows; index i) {
			const i = '!';
			<li>{name + i}</li>
		}
	</ul>
}

export function RedeclaredKeyApp({ rows }: { rows: Row[] }) @{
	<ul class="redeclared-key">
		@for (const { id, name } of rows; key id) {
			const { id } = other;
			<li>{name + ':' + id}</li>
		}
	</ul>
}

export function IndexDefaultApp({ rows }: { rows: PairRow[] }) @{
	<ul class="index-default">
		@for (const [a = 'r' + i, b] of rows; index i) {
			<li>{a + ':' + b}</li>
		}
	</ul>
}

export function IndexDefaultKeyedApp({ rows }: { rows: PairRow[] }) @{
	<ul class="index-default-keyed">
		@for (const [a = 'r' + i, b] of rows; index i; key b) {
			<li>{a + ':' + b}</li>
		}
	</ul>
}

export function IndexDefaultObjectApp({ rows }: { rows: ObjectRow[] }) @{
	<ul class="index-default-object">
		@for (const { a = 'r' + i, b } of rows; index i) {
			<li>{a + ':' + b}</li>
		}
	</ul>
}

export function IndexDefaultObjectKeyedApp({ rows }: { rows: ObjectRow[] }) @{
	<ul class="index-default-object-keyed">
		@for (const { a = 'r' + i, b } of rows; index i; key b) {
			<li>{a + ':' + b}</li>
		}
	</ul>
}

export function IndexDefaultSkipApp({ rows }: { rows: PairRow[] }) @{
	<ul class="index-default-skip">
		@for (const [a = 'r' + i, b] of rows; index i; key b) {
			@if (b !== 'skip') {
				<li>{a + ':' + b}</li>
			}
		}
	</ul>
}

export function IndexDefaultRedeclaredApp({ rows }: { rows: PairRow[] }) @{
	<ul class="index-default-redeclared">
		@for (const [a = 'r' + i, b] of rows; index i; key b) {
			const b = 'body';
			<li>{a + ':' + b}</li>
		}
	</ul>
}

const pair_rows: PairRow[] = [
	[undefined, 'x'],
	['y', 'z'],
];
const object_rows: ObjectRow[] = [{ b: 'x' }, { a: 'y', b: 'z' }];
const rows: Row[] = [
	{ id: 'a', name: 'A' },
	{ id: 'b', name: 'B' },
];

/**
 * Each case: its label, the component, the list's class, its rows, and the
 * text of each row it renders.
 */
export const for_of_head_scope_cases: Array<[string, unknown, string, unknown[], string[]]> = [
	[
		'a body that declares the item pattern’s names again',
		RedeclaredItemApp,
		'redeclared-item',
		rows,
		['other', 'other'],
	],
	[
		'a body that declares the item’s name again',
		RedeclaredNameApp,
		'redeclared-name',
		rows,
		['body', 'body'],
	],
	[
		'a body that declares the index’s name again',
		RedeclaredIndexApp,
		'redeclared-index',
		rows,
		['A!', 'B!'],
	],
	[
		'a body that declares a name the key reads again',
		RedeclaredKeyApp,
		'redeclared-key',
		rows,
		['A:other', 'B:other'],
	],
	[
		'an array pattern default that reads the index',
		IndexDefaultApp,
		'index-default',
		pair_rows,
		['r0:x', 'y:z'],
	],
	[
		'an array pattern default that reads the index, keyed',
		IndexDefaultKeyedApp,
		'index-default-keyed',
		pair_rows,
		['r0:x', 'y:z'],
	],
	[
		'an object pattern default that reads the index',
		IndexDefaultObjectApp,
		'index-default-object',
		object_rows,
		['r0:x', 'y:z'],
	],
	[
		'an object pattern default that reads the index, keyed',
		IndexDefaultObjectKeyedApp,
		'index-default-object-keyed',
		object_rows,
		['r0:x', 'y:z'],
	],
	[
		'a pattern default that reads the index in a body that can skip a row',
		IndexDefaultSkipApp,
		'index-default-skip',
		[...pair_rows, [undefined, 'skip'], [undefined, 'w']],
		['r0:x', 'y:z', 'r3:w'],
	],
	[
		'a pattern default that reads the index in a body that declares a name the key reads again',
		IndexDefaultRedeclaredApp,
		'index-default-redeclared',
		pair_rows,
		['r0:body', 'y:body'],
	],
];
