import { createVaporSSRApp, ref } from 'vue';

// In its own file: vue-jsx-vapor caches the component proxies it makes with
// the instance of the first app that renders them, so a client app that
// renders the same components from this file would mount them as VDOM ones.
//
// The components are the ones `vapor-for-ssr.test.js` renders on the server,
// and `server_markup` is what it renders for each value of `n`.

const n = ref(1);

function CaseCounter(props: { label: string }) @{
	const count = ref(0);
	<button class="counter" onClick={() => count.value++}>
		{props.label + ':' + count.value}
	</button>
}

function Plain(props: { n: number }) @{
	<section>
		<p>
			@switch (props.n) {
				@case 1: {
					<b>{'one'}</b>
				}
				@default: {
					<i>{'other'}</i>
				}
			}
		</p>
	</section>
}

function Counted({ n }: { n: number }) @{
	<p>
		@switch (n) {
			@case 1: {
				<CaseCounter label="one" />
			}
			@default: {
				<CaseCounter label="other" />
			}
		}
		{'n=' + n}
	</p>
}

function Between({ n }: { n: number }) @{
	<p>
		{'n=' + n}
		@switch (n) {
			@case 1: {
				<b>{'one'}</b>
			}
			@default: {
				<i>{'other'}</i>
			}
		}
		<em>{'after'}</em>
	</p>
}

function Partial({ n }: { n: number }) @{
	<p>
		@switch (n) {
			@case 1: {
				<b>{'one'}</b>
			}
			@case 2: {
			}
		}
	</p>
}

function BesideIf({ n }: { n: number }) @{
	<p>
		@if (n === 1) {
			<b>{'if'}</b>
		}
		@switch (n) {
			@case 1: {
				<i>{'mode a'}</i>
			}
		}
	</p>
}

function Local({ n }: { n: number }) {
	const view = (
		<p>
			@switch (n) {
				@case 1: {
					<b>{'one'}</b>
				}
				@default: {
					<i>{'other'}</i>
				}
			}
		</p>
	);
	return view;
}

function PlainHost() @{
	<Plain n={n.value} />
}

function CountedHost() @{
	<Counted n={n.value} />
}

function BetweenHost() @{
	<Between n={n.value} />
}

function PartialHost() @{
	<Partial n={n.value} />
}

function BesideIfHost() @{
	<BesideIf n={n.value} />
}

function LocalHost() @{
	<Local n={n.value} />
}

/** What each value of `n` renders, as text. */
const shown = {
	Plain: { 1: 'one', 2: 'other', 3: 'other' },
	Counted: { 1: 'one:0n=1', 2: 'other:0n=2', 3: 'other:0n=3' },
	Between: { 1: 'n=1oneafter', 2: 'n=2otherafter', 3: 'n=3otherafter' },
	Partial: { 1: 'one', 2: '', 3: '' },
	BesideIf: { 1: 'ifmode a', 2: '', 3: '' },
	Local: { 1: 'one', 2: 'other', 3: 'other' },
} as const;

const server_markup = {
	Plain: {
		1: '<section><p><b>one</b></p></section>',
		2: '<section><p><i>other</i></p></section>',
		3: '<section><p><i>other</i></p></section>',
	},
	Counted: {
		1: '<p><button class="counter">one:0</button>n=1</p>',
		2: '<p><button class="counter">other:0</button>n=2</p>',
		3: '<p><button class="counter">other:0</button>n=3</p>',
	},
	Between: {
		1: '<p>n=1<b>one</b><em>after</em></p>',
		2: '<p>n=2<i>other</i><em>after</em></p>',
		3: '<p>n=3<i>other</i><em>after</em></p>',
	},
	Partial: { 1: '<p><b>one</b></p>', 2: '<p><!----></p>', 3: '<p><!----></p>' },
	BesideIf: {
		1: '<p><b>if</b><i>mode a</i></p>',
		2: '<p><!----><!----></p>',
		3: '<p><!----><!----></p>',
	},
	Local: { 1: '<p><b>one</b></p>', 2: '<p><i>other</i></p>', 3: '<p><i>other</i></p>' },
} as const;

/** The elements each value of `n` renders. */
const elements = {
	Plain: { 1: 'B', 2: 'I', 3: 'I' },
	Counted: { 1: 'BUTTON', 2: 'BUTTON', 3: 'BUTTON' },
	Between: { 1: 'B,EM', 2: 'I,EM', 3: 'I,EM' },
	Partial: { 1: 'B', 2: '', 3: '' },
	BesideIf: { 1: 'B,I', 2: '', 3: '' },
	Local: { 1: 'B', 2: 'I', 3: 'I' },
} as const;

function rendered_elements() {
	return Array.from(container.querySelectorAll('b, i, em, button'), (node) => node.tagName).join(
		',',
	);
}

const hosts = {
	Plain: PlainHost,
	Counted: CountedHost,
	Between: BetweenHost,
	Partial: PartialHost,
	BesideIf: BesideIfHost,
	Local: LocalHost,
} as const;

type Shape = keyof typeof hosts;

const cases = (Object.keys(hosts) as Shape[]).flatMap((shape) =>
	([1, 2, 3] as const).map((start) => [shape, start] as const),
);

describe("tsrx-vue hydrating an element's @switch (#1403)", () => {
	it.each(cases)('hydrates %s rendered for n = %i, then follows n', async (shape, start) => {
		n.value = start;
		container.innerHTML = server_markup[shape][start];
		const server_nodes = Array.from(container.querySelectorAll('b, i, em, button'));
		const errors: unknown[] = [];
		const warnings: string[] = [];
		const warn_spy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
			warnings.push(args.map(String).join(' '));
		});
		const app = createVaporSSRApp(hosts[shape]);
		app.config.errorHandler = (error) => {
			errors.push(error);
		};
		app.config.warnHandler = (message) => {
			warnings.push(message);
		};
		try {
			app.mount(container);
			await flush();
			expect(errors).toEqual([]);
			expect(warnings).toEqual([]);
			// The server's nodes are kept.
			const hydrated_nodes = Array.from(container.querySelectorAll('b, i, em, button'));
			expect(hydrated_nodes.length).toBe(server_nodes.length);
			hydrated_nodes.forEach((node, index) => expect(node).toBe(server_nodes[index]));
			expect(container.textContent).toBe(shown[shape][start]);

			for (const next of [1, 2, 3, 1, 3] as const) {
				n.value = next;
				await flush();
				expect(container.textContent).toBe(shown[shape][next]);
				// A case that goes away is removed, not left empty.
				expect(rendered_elements()).toBe(elements[shape][next]);
			}
			expect(errors).toEqual([]);
			expect(warnings).toEqual([]);
		} finally {
			app.unmount();
			warn_spy.mockRestore();
		}
	});

	it.each([1, 2] as const)(
		"keeps the hydrated case's state while the case stays picked (n = %i)",
		async (start) => {
			n.value = start;
			container.innerHTML = server_markup.Counted[start];
			const button = container.querySelector('button');
			const errors: unknown[] = [];
			const app = createVaporSSRApp(CountedHost);
			app.config.errorHandler = (error) => {
				errors.push(error);
			};
			try {
				app.mount(container);
				await flush();
				(container.querySelector('button') as HTMLElement).click();
				await flush();
				expect(container.querySelector('button')).toBe(button);
				const label = start === 1 ? 'one' : 'other';
				expect(container.textContent).toBe(`${label}:1n=${start}`);

				// Still the same case.
				n.value = start === 1 ? 1 : 3;
				await flush();
				expect(container.querySelector('button')).toBe(button);
				expect(container.textContent).toBe(`${label}:1n=${n.value}`);

				// Another case mounts with its own state.
				n.value = start === 1 ? 2 : 1;
				await flush();
				expect(container.textContent).toBe(start === 1 ? 'other:0n=2' : 'one:0n=1');
				expect(errors).toEqual([]);
			} finally {
				app.unmount();
			}
		},
	);
});
