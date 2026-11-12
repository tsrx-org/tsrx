// Shared runtime fixtures for `@for` sources. Each platform's vite plugin
// compiles this file with its own compiler when the platform's
// `runtime.test.tsrx` imports it. `@for` walks its source the way `for...of`
// does: any iterable, `Symbol.iterator` read once, and `@empty` only when the
// walk yields no items.

export function ForOfSourceApp({ items }: { items: Iterable<string> }) @{
	<ul class="for-of-source">
		@for (const item of items; key item) {
			<li>{item}</li>
		}
	</ul>
}

export function ForOfSourceEmptyApp({ items }: { items: Iterable<string> }) @{
	<ul class="for-of-source-empty">
		@for (const item of items; key item) {
			<li>{item}</li>
		} @empty {
			<li>{'empty'}</li>
		}
	</ul>
}

function* letters() {
	yield 'a';
	yield 'b';
}

function* visible() {
	yield 'visible';
}

/** An array whose own iterator hides its indexed items. */
function with_iterator(array: string[]): string[] {
	array[Symbol.iterator] = visible as () => ArrayIterator<string>;
	return array;
}

/** An iterable whose `Symbol.iterator` getter hands out a new snapshot per read. */
function snapshot_iterable(): Iterable<string> {
	let reads = 0;
	return {
		get [Symbol.iterator]() {
			const snapshot = ++reads;
			return function* () {
				yield 'snapshot ' + snapshot;
			};
		},
	};
}

/**
 * Each case: its label, a factory for a fresh source, and the rows the loop
 * renders. A loop with `@empty` renders `empty` in place of zero rows.
 */
export const for_of_source_cases: Array<[string, () => Iterable<string>, string[]]> = [
	['an array', () => ['a', 'b'], ['a', 'b']],
	['a Set', () => new Set(['a', 'b']), ['a', 'b']],
	[
		'a Map key iterator',
		() =>
			new Map([
				['a', 1],
				['b', 2],
			]).keys(),
		['a', 'b'],
	],
	['a generator', letters, ['a', 'b']],
	['an array with its own iterator', () => with_iterator(['stored']), ['visible']],
	['an empty array whose iterator yields', () => with_iterator([]), ['visible']],
	['an iterable whose Symbol.iterator getter changes per read', snapshot_iterable, ['snapshot 1']],
	['an empty array', () => [], []],
	['an empty Set', () => new Set(), []],
];
