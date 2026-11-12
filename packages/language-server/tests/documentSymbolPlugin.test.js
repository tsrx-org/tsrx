import { SymbolKind } from '@volar/language-server';
import { describe, expect, it } from 'vitest';
import {
	child_names,
	create_symbol_harness,
	find_symbol,
	get_range_text,
	symbol_name_kinds,
} from './setup.js';

describe('document symbol plugin', () => {
	it('returns mapped TSRX symbols through the Volar language service', async () => {
		const source = `type Mode = 'idle' | 'active';

interface Props {
	label: string;
}

const config = {
	value: 1,
};

class Store {
	value = 1;
	read() {
		return this.value;
	}
}

const App = () => {
	const count = 0;
	function increment() {
		const next = count + 1;
		return next;
	}
	const reset = () => {
		const next = 0;
		return next;
	};
	return count;
};
`;

		const { document, service, uri } = create_symbol_harness(source);
		const symbols = await service.getDocumentSymbols(uri);

		expect(symbol_name_kinds(symbols)).toEqual([
			['Mode', SymbolKind.TypeParameter],
			['Props', SymbolKind.Interface],
			['config', SymbolKind.Constant],
			['Store', SymbolKind.Class],
			['App', SymbolKind.Constant],
		]);
		expect(child_names(symbols, 'Store')).toEqual(['value', 'read']);
		expect(child_names(symbols, 'App')).toEqual(['count', 'increment', 'reset']);
		expect(child_names(symbols, 'increment')).toEqual(['next']);
		expect(child_names(symbols, 'reset')).toEqual(['next']);

		const app = find_symbol(symbols, 'App');
		const increment = find_symbol(symbols, 'increment');
		expect(app && get_range_text(document, app.selectionRange)).toBe('App');
		expect(increment && get_range_text(document, increment.selectionRange)).toBe('increment');
	});

	it('returns symbols for named export declarations', async () => {
		const source = `export type Mode = 'idle' | 'active';
export interface Props {
	label: string;
}
export const named = 1;
export function makeThing() {
	const inner = 1;
	return inner;
}
export class Store {
	value = 1;
	read() {
		return this.value;
	}
}
export const Card = () => {
	const title = 'Card';
	return title;
};
`;

		const { service, uri } = create_symbol_harness(source, 'named-exports.tsrx');
		const symbols = await service.getDocumentSymbols(uri);

		expect(symbol_name_kinds(symbols)).toEqual([
			['Mode', SymbolKind.TypeParameter],
			['Props', SymbolKind.Interface],
			['named', SymbolKind.Constant],
			['makeThing', SymbolKind.Function],
			['Store', SymbolKind.Class],
			['Card', SymbolKind.Constant],
		]);
		expect(child_names(symbols, 'makeThing')).toEqual(['inner']);
		expect(child_names(symbols, 'Store')).toEqual(['value', 'read']);
		expect(child_names(symbols, 'Card')).toEqual(['title']);
	});

	it('returns symbols for default export declarations', async () => {
		const source = `export default function App() {
	const route = '/';
	return route;
}
export default class Store {
	value = 1;
	read() {
		return this.value;
	}
}
export default function Page() {
	const title = 'Home';
	return title;
}
`;

		const { service, uri } = create_symbol_harness(source, 'default-exports.tsrx');
		const symbols = await service.getDocumentSymbols(uri);

		expect(symbol_name_kinds(symbols)).toEqual([
			['App', SymbolKind.Function],
			['Store', SymbolKind.Class],
			['Page', SymbolKind.Function],
		]);
		expect(child_names(symbols, 'App')).toEqual(['route']);
		expect(child_names(symbols, 'Store')).toEqual(['value', 'read']);
		expect(child_names(symbols, 'Page')).toEqual(['title']);
	});

	it('returns default symbols for anonymous default export declarations', async () => {
		const source = `export default function () {
	const hiddenFunction = 1;
	return hiddenFunction;
}
export default class {
	value = 1;
	read() {
		return this.value;
	}
}
export default function() {
	const hiddenComponent = 1;
	return hiddenComponent;
}
`;

		const { service, uri } = create_symbol_harness(source, 'anonymous-default-exports.tsrx');
		const symbols = await service.getDocumentSymbols(uri);

		expect(symbol_name_kinds(symbols)).toEqual([
			['default', SymbolKind.Function],
			['default', SymbolKind.Class],
			['default', SymbolKind.Function],
		]);
		expect(symbols?.[0].children?.map((symbol) => symbol.name)).toEqual(['hiddenFunction']);
		expect(symbols?.[1].children?.map((symbol) => symbol.name)).toEqual(['value', 'read']);
		expect(symbols?.[2].children?.map((symbol) => symbol.name)).toEqual(['hiddenComponent']);
	});

	it('does not return fallback symbols for anonymous default export expressions', async () => {
		const source = `export default () => {
	const hiddenArrow = 1;
	return hiddenArrow;
};
export default { value: 1 };
`;

		const { service, uri } = create_symbol_harness(source, 'anonymous-default-expressions.tsrx');
		const symbols = await service.getDocumentSymbols(uri);

		expect(symbols).toEqual([]);
	});

	it('keeps local declaration symbols for named export specifiers', async () => {
		const source = `const local = 1;
function helper() {
	const inner = 1;
	return inner;
}
export { local, helper as renamedHelper };
`;

		const { service, uri } = create_symbol_harness(source, 'export-specifiers.tsrx');
		const symbols = await service.getDocumentSymbols(uri);

		expect(symbol_name_kinds(symbols)).toEqual([
			['local', SymbolKind.Constant],
			['helper', SymbolKind.Function],
		]);
		expect(child_names(symbols, 'helper')).toEqual(['inner']);
		expect(find_symbol(symbols, 'renamedHelper')).toBeUndefined();
	});

	it('uses variable declaration kind for let and var declarations', async () => {
		const source = `const fixed = 1;
let mutable = 2;
var legacy = 3;
const App = () => {
	let local = 4;
	var oldLocal = 5;
	return local + oldLocal;
};
`;

		const { service, uri } = create_symbol_harness(source, 'variable-kinds.tsrx');
		const symbols = await service.getDocumentSymbols(uri);

		expect(symbol_name_kinds(symbols)).toEqual([
			['fixed', SymbolKind.Constant],
			['mutable', SymbolKind.Variable],
			['legacy', SymbolKind.Variable],
			['App', SymbolKind.Constant],
		]);
		expect(find_symbol(symbols, 'local')?.kind).toBe(SymbolKind.Variable);
		expect(find_symbol(symbols, 'oldLocal')?.kind).toBe(SymbolKind.Variable);
	});

	it('returns symbols for object and array binding patterns', async () => {
		const source = `const App = (props, items) => {
	const { alpha, beta: renamed, gamma = 1, nested: { delta }, ...rest } = props;
	let [first, , second = 2, ...others] = items;
	return alpha + renamed + gamma + delta + rest + first + second + others;
};
`;

		const { service, uri } = create_symbol_harness(source, 'binding-patterns.tsrx');
		const symbols = await service.getDocumentSymbols(uri);

		expect(child_names(symbols, 'App')).toEqual([
			'alpha',
			'renamed',
			'gamma',
			'delta',
			'rest',
			'first',
			'second',
			'others',
		]);
		expect(find_symbol(symbols, 'alpha')?.kind).toBe(SymbolKind.Constant);
		expect(find_symbol(symbols, 'renamed')?.kind).toBe(SymbolKind.Constant);
		expect(find_symbol(symbols, 'first')?.kind).toBe(SymbolKind.Variable);
		expect(find_symbol(symbols, 'others')?.kind).toBe(SymbolKind.Variable);
	});

	it('keeps parent ranges wide enough to contain nested local symbols', async () => {
		const source = `export const App = () => {
	const test = 'hello';
	let { start, loc } = /** @type {AST.NodeWithLocation} */ (node);
	try {
		const profile = test;
		return profile;
	} catch (err) {
		return (err as Error).message;
	}
};

function helper() {
	const inner = 1;
	return inner;
}
`;

		const { service, uri } = create_symbol_harness(source, 'breadcrumb-ranges.tsrx');
		const symbols = await service.getDocumentSymbols(uri);
		const app = find_symbol(symbols, 'App');
		const helper = find_symbol(symbols, 'helper');

		for (const name of ['test', 'start', 'loc']) {
			const local = find_symbol(symbols, name);
			expect(app && local && range_contains(app.range, local.selectionRange)).toBe(true);
		}
		const inner = find_symbol(symbols, 'inner');
		expect(helper && inner && range_contains(helper.range, inner.selectionRange)).toBe(true);
	});

	it('returns child symbols from function, arrow, and component initializers', async () => {
		const source = `const withFunction = function () {
	const insideFunction = 1;
	return insideFunction;
};
const withArrow = () => {
	const insideArrow = 1;
	return insideArrow;
};
const withComponent = () => {
	const insideComponent = 1;
	return insideComponent;
};
`;

		const { service, uri } = create_symbol_harness(source, 'initializer-children.tsrx');
		const symbols = await service.getDocumentSymbols(uri);

		expect(symbol_name_kinds(symbols)).toEqual([
			['withFunction', SymbolKind.Constant],
			['withArrow', SymbolKind.Constant],
			['withComponent', SymbolKind.Constant],
		]);
		expect(child_names(symbols, 'withFunction')).toEqual(['insideFunction']);
		expect(child_names(symbols, 'withArrow')).toEqual(['insideArrow']);
		expect(child_names(symbols, 'withComponent')).toEqual(['insideComponent']);
	});

	it('returns symbols for class property and method members', async () => {
		const source = `class Store {
	value = 1;
	read() {
		return this.value;
	}
	'quoted'() {
		return 1;
	}
	['computed']() {
		return 2;
	}
}
`;

		const { service, uri } = create_symbol_harness(source, 'class-members.tsrx');
		const symbols = await service.getDocumentSymbols(uri);

		expect(child_names(symbols, 'Store')).toEqual(['value', 'read', 'quoted', 'computed']);
		expect(find_symbol(symbols, 'value')?.kind).toBe(SymbolKind.Property);
		expect(find_symbol(symbols, 'read')?.kind).toBe(SymbolKind.Method);
		expect(find_symbol(symbols, 'quoted')?.kind).toBe(SymbolKind.Method);
		expect(find_symbol(symbols, 'computed')?.kind).toBe(SymbolKind.Method);
	});

	it('lists the top-level declarations of each `<script>` body under a `<script>` symbol', async () => {
		const source = `export function App() @{
	const count = 1;
	<>
		<head>
			<script type="module">
				import { track } from './analytics';
				export const enabled: boolean = 1 < 2;
				let visits = 0;
				function record(name: string) {
					const event = { name };
					track(event);
				}
				class Session {
					start() {}
				}
				interface Options {
					debug: boolean;
				}
				type Mode = 'a' | 'b';
				enum Level {
					Low,
				}
				record('load');
			</script>
			<script type="application/json">
				{ "ignored": true }
			</script>
		</head>
		<p>{count}</p>
		<script>
			var late = true;
		</script>
	</>
}
`;

		const { document, service, uri } = create_symbol_harness(source, 'react/script-symbols.tsrx');
		const symbols = await service.getDocumentSymbols(uri);

		// Top-level, after the component that renders them. The JSON data block is not code, so
		// it has no symbol.
		expect(symbol_name_kinds(symbols)).toEqual([
			['App', SymbolKind.Function],
			['<script>', SymbolKind.Module],
			['<script>', SymbolKind.Module],
		]);
		expect(child_names(symbols, 'App')).toEqual(['count']);
		const [, module_script, classic_script] = symbols ?? [];
		expect(symbol_name_kinds(module_script.children)).toEqual([
			['enabled', SymbolKind.Constant],
			['visits', SymbolKind.Variable],
			['record', SymbolKind.Function],
			['Session', SymbolKind.Class],
			['Options', SymbolKind.Interface],
			['Mode', SymbolKind.TypeParameter],
			['Level', SymbolKind.Enum],
		]);
		expect(child_names(module_script.children, 'record')).toEqual(['event']);
		expect(child_names(module_script.children, 'Session')).toEqual(['start']);
		expect(symbol_name_kinds(classic_script.children)).toEqual([['late', SymbolKind.Variable]]);

		// Source ranges: the tag name selects a `<script>` symbol, which spans the element from
		// its tag name to its closing tag name.
		expect(get_range_text(document, module_script.selectionRange)).toBe('script');
		expect(get_range_text(document, module_script.range)).toMatch(
			/^script type="module">[\s\S]*record\('load'\);\s*<\/script$/,
		);
		expect(get_range_text(document, classic_script.range)).toMatch(
			/^script>\s*var late = true;\s*<\/script$/,
		);
		const record = find_symbol(module_script.children, 'record');
		expect(record && get_range_text(document, record.selectionRange)).toBe('record');
		expect(record && get_range_text(document, record.range)).toMatch(
			/^function record\(name: string\) \{[\s\S]*\}$/,
		);
		for (const child of module_script.children ?? []) {
			expect(range_contains(module_script.range, child.range), child.name).toBe(true);
		}
	});

	it('takes each `<script>` symbol from its element, whatever the text around the tags', async () => {
		// `</script >` closes an element too, and `<script` can appear in an attribute value or
		// in the body.
		const source = `export function App() @{
	<>
		<script type="module" data-note="<script>">
			const first = '<script';
		</script >
		<script>
			const second = 2;
		</script>
		<script>
			const third = 3;
		</script >
	</>
}
`;

		const { document, service, uri } = create_symbol_harness(source, 'react/script-tags.tsrx');
		const symbols = await service.getDocumentSymbols(uri);
		const scripts = symbols?.filter((symbol) => symbol.name === '<script>') ?? [];

		expect(scripts.map((script) => script.children?.map((child) => child.name))).toEqual([
			['first'],
			['second'],
			['third'],
		]);
		// From the tag name to the closing tag name, each within its own element.
		expect(scripts.map((script) => get_range_text(document, script.range))).toEqual([
			'script type="module" data-note="<script>">\n\t\t\tconst first = \'<script\';\n\t\t</script',
			'script>\n\t\t\tconst second = 2;\n\t\t</script',
			'script>\n\t\t\tconst third = 3;\n\t\t</script',
		]);
		// The opening tag's name selects each one.
		const lines = source.split('\n');
		expect(
			scripts.map(({ selectionRange }) => [
				selectionRange.start.line,
				lines[selectionRange.start.line].slice(0, selectionRange.start.character).trim(),
				get_range_text(document, selectionRange),
			]),
		).toEqual([
			[2, '<', 'script'],
			[5, '<', 'script'],
			[8, '<', 'script'],
		]);
	});
});

/**
 * @param {import('@volar/language-server').Range} outer
 * @param {import('@volar/language-server').Range} inner
 */
function range_contains(outer, inner) {
	return (
		compare_position(outer.start, inner.start) <= 0 && compare_position(inner.end, outer.end) <= 0
	);
}

/**
 * @param {import('@volar/language-server').Position} a
 * @param {import('@volar/language-server').Position} b
 */
function compare_position(a, b) {
	return a.line === b.line ? a.character - b.character : a.line - b.line;
}
