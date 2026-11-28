import { createVaporSSRApp, ref } from 'vue';

// In its own file, as element-switch-hydration.test.tsrx is. The components
// are the ones `vapor-for-ssr.test.js` renders on the server, and
// `server_markup` is what it renders for each state.

type State = { on: boolean; away: boolean; n: number; name: string };

const attrs = { 'data-x': '1' };

function ScopeCounter(props: { label: string }) @{
	const count = ref(0);
	<button class="counter" onClick={() => count.value++}>
		{props.label + ':' + count.value}
	</button>
}

function Beside({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			const label = state.name + '!';
			<ScopeCounter {label} />
		}
		{state.name}
	</p>
}

function Spread({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			<span {...attrs}>
				<ScopeCounter label="on" />
			</span>
		}
		{state.name}
	</p>
}

function ElseStatements({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			<ScopeCounter label="on" />
		} @else if (state.away) {
			const label = 'away';
			<i>{label}</i>
		} @else {
			const label = 'off';
			<b>{label}</b>
		}
		{state.name}
	</p>
}

function InBranch({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			<span>
				@switch (state.n) {
					@case 1: {
						<ScopeCounter label="one" />
					}
					@default: {
						<i>{'other'}</i>
					}
				}
			</span>
		}
		{state.name}
	</p>
}

function InScope({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			const label = 'scope';
			<span class={label}>
				@switch (state.n) {
					@case 1: {
						<ScopeCounter label="one" />
					}
					@default: {
						<i>{'other'}</i>
					}
				}
			</span>
		}
	</p>
}

function InCase({ state }: { state: State }) @{
	<p>
		@switch (state.on) {
			@case true: {
				<span>
					@switch (state.n) {
						@case 1: {
							<ScopeCounter label="one" />
						}
					}
				</span>
			}
		}
	</p>
}

function CaseStatements({ state }: { state: State }) @{
	<p>
		@switch (state.n) {
			@case 1: {
				const label = 'one';
				<ScopeCounter {label} />
			}
			@default: {
				<i>{'other'}</i>
			}
		}
		{state.name}
	</p>
}

const state = ref<State>({ on: true, away: false, n: 1, name: 'Ann' });

const states = {
	one: { on: true, away: false, n: 1, name: 'Ann' },
	two: { on: true, away: false, n: 2, name: 'Ann' },
	away: { on: false, away: true, n: 1, name: 'Ann' },
	off: { on: false, away: false, n: 1, name: 'Ann' },
} as const;

type StateName = keyof typeof states;

function BesideHost() @{
	<Beside state={state.value} />
}

function SpreadHost() @{
	<Spread state={state.value} />
}

function ElseStatementsHost() @{
	<ElseStatements state={state.value} />
}

function InBranchHost() @{
	<InBranch state={state.value} />
}

function InScopeHost() @{
	<InScope state={state.value} />
}

function InCaseHost() @{
	<InCase state={state.value} />
}

function CaseStatementsHost() @{
	<CaseStatements state={state.value} />
}

const hosts = {
	Beside: BesideHost,
	Spread: SpreadHost,
	ElseStatements: ElseStatementsHost,
	InBranch: InBranchHost,
	InScope: InScopeHost,
	InCase: InCaseHost,
	CaseStatements: CaseStatementsHost,
} as const;

type Shape = keyof typeof hosts;

const server_markup: Record<Shape, Record<StateName, string>> = {
	Beside: {
		one: '<p><button class="counter">Ann!:0</button>Ann</p>',
		two: '<p><button class="counter">Ann!:0</button>Ann</p>',
		away: '<p><!---->Ann</p>',
		off: '<p><!---->Ann</p>',
	},
	Spread: {
		one: '<p><span data-x="1"><button class="counter">on:0</button></span>Ann</p>',
		two: '<p><span data-x="1"><button class="counter">on:0</button></span>Ann</p>',
		away: '<p><!---->Ann</p>',
		off: '<p><!---->Ann</p>',
	},
	ElseStatements: {
		one: '<p><button class="counter">on:0</button>Ann</p>',
		two: '<p><button class="counter">on:0</button>Ann</p>',
		away: '<p><i>away</i>Ann</p>',
		off: '<p><b>off</b>Ann</p>',
	},
	InBranch: {
		one: '<p><span><button class="counter">one:0</button></span>Ann</p>',
		two: '<p><span><i>other</i></span>Ann</p>',
		away: '<p><!---->Ann</p>',
		off: '<p><!---->Ann</p>',
	},
	InScope: {
		one: '<p><span class="scope"><button class="counter">one:0</button></span></p>',
		two: '<p><span class="scope"><i>other</i></span></p>',
		away: '<p><!----></p>',
		off: '<p><!----></p>',
	},
	InCase: {
		one: '<p><span><button class="counter">one:0</button></span></p>',
		two: '<p><span><!----></span></p>',
		away: '<p><!----></p>',
		off: '<p><!----></p>',
	},
	CaseStatements: {
		one: '<p><button class="counter">one:0</button>Ann</p>',
		two: '<p><i>other</i>Ann</p>',
		away: '<p><button class="counter">one:0</button>Ann</p>',
		off: '<p><button class="counter">one:0</button>Ann</p>',
	},
};

const cases = (Object.keys(hosts) as Shape[]).flatMap((shape) =>
	(Object.keys(states) as StateName[]).map((start) => [shape, start] as const),
);

/** What `html` shows, without its counter's count, which a kept branch keeps. */
function shown(html: string = container.innerHTML) {
	const host = document.createElement('div');
	host.innerHTML = html;
	return host.textContent?.replace(/:\d+/g, ':');
}

describe('tsrx-vue hydrating a branch or a case that renders through TsrxScope', () => {
	it.each(cases)(
		'hydrates %s rendered for %s, keeps its state, then follows',
		async (shape, start) => {
			state.value = { ...states[start] };
			container.innerHTML = server_markup[shape][start];
			const server_nodes = Array.from(container.querySelectorAll('b, i, span, button'));
			const server_text = container.textContent;
			// The statements run once per mount: a label they derived stays.
			const label = container.querySelector('.counter')?.textContent;
			const errors: unknown[] = [];
			const warnings: string[] = [];
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
				const hydrated_nodes = Array.from(container.querySelectorAll('b, i, span, button'));
				expect(hydrated_nodes.length).toBe(server_nodes.length);
				hydrated_nodes.forEach((node, index) => expect(node).toBe(server_nodes[index]));
				expect(container.textContent).toBe(server_text);

				// The branch stays while its condition does, with its state.
				const counter = container.querySelector('.counter');
				if (counter) {
					(counter as HTMLElement).click();
					await flush();
					state.value = { ...state.value, name: 'Bo' };
					await flush();
					expect(container.querySelector('.counter')).toBe(counter);
					expect(counter.textContent).toBe(label?.replace(':0', ':1'));
				}

				// Each state, from a mount on the client, renders what the server would.
				for (const next of ['off', 'two', 'one', 'away', 'off', 'one'] as const) {
					state.value = { ...states[next] };
					await flush();
					expect(shown()).toBe(shown(server_markup[shape][next]));
				}
				expect(errors).toEqual([]);
				expect(warnings).toEqual([]);
			} finally {
				app.unmount();
			}
		},
	);
});
