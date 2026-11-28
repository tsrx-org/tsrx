import { createVaporSSRApp, ref } from 'vue';

// In its own file, as element-switch-hydration.test.tsrx is. The components
// are the ones `vapor-for-ssr.test.js` renders on the server, and
// `server_markup` is what it renders for each state.

type State = { on: boolean; away: boolean; shown: boolean; name: string };

function BranchCounter(props: { label: string }) @{
	const count = ref(0);
	<button class="counter" onClick={() => count.value++}>
		{props.label + ':' + count.value}
	</button>
}

function Chain({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			<BranchCounter label="on" />
		} @else if (state.away) {
			<i>{'away'}</i>
		} @else {
			<b>{'off'}</b>
		}
		{state.name}
	</p>
}

function ChainNoElse({ state }: { state: State }) @{
	<p>
		{state.name}
		@if (state.on) {
			<BranchCounter label="on" />
		} @else if (state.away) {
			<i>{'away'}</i>
		}
	</p>
}

function Alone({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			<BranchCounter label="on" />
		} @else if (state.away) {
			<i>{'away'}</i>
		} @else {
			<b>{'off'}</b>
		}
	</p>
}

function Shown({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			<span v-show={state.shown}>
				<BranchCounter label="on" />
			</span>
		}
		{state.name}
	</p>
}

function LaterCounter({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			<i>{'on'}</i>
		} @else if (state.away) {
			<BranchCounter label="away" />
		} @else {
			<b>{'off'}</b>
		}
		{state.name}
	</p>
}

function NestedElse({ state }: { state: State }) @{
	<p>
		{state.name}
		@if (state.on) {
			<BranchCounter label="on" />
		} @else {
			@if (state.away) {
				<i>{'away'}</i>
			}
		}
	</p>
}

function ShownComponent({ state }: { state: State }) @{
	<p>
		@if (state.on) {
			<BranchCounter v-show={state.shown} label="on" />
		}
		{state.name}
	</p>
}

const state = ref<State>({ on: true, away: false, shown: true, name: 'Ann' });

const states = {
	on: { on: true, away: false, shown: true, name: 'Ann' },
	away: { on: false, away: true, shown: true, name: 'Ann' },
	off: { on: false, away: false, shown: true, name: 'Ann' },
} as const;

type StateName = keyof typeof states;

function ChainHost() @{
	<Chain state={state.value} />
}

function ChainNoElseHost() @{
	<ChainNoElse state={state.value} />
}

function AloneHost() @{
	<Alone state={state.value} />
}

function ShownHost() @{
	<Shown state={state.value} />
}

function LaterCounterHost() @{
	<LaterCounter state={state.value} />
}

function NestedElseHost() @{
	<NestedElse state={state.value} />
}

function ShownComponentHost() @{
	<ShownComponent state={state.value} />
}

const hosts = {
	Chain: ChainHost,
	ChainNoElse: ChainNoElseHost,
	Alone: AloneHost,
	Shown: ShownHost,
	LaterCounter: LaterCounterHost,
	NestedElse: NestedElseHost,
	ShownComponent: ShownComponentHost,
} as const;

type Shape = keyof typeof hosts;

/** What each state renders, as text, with the counter at `0`. */
const shown: Record<Shape, Record<StateName, string>> = {
	Chain: { on: 'on:0Ann', away: 'awayAnn', off: 'offAnn' },
	ChainNoElse: { on: 'Annon:0', away: 'Annaway', off: 'Ann' },
	Alone: { on: 'on:0', away: 'away', off: 'off' },
	Shown: { on: 'on:0Ann', away: 'Ann', off: 'Ann' },
	LaterCounter: { on: 'onAnn', away: 'away:0Ann', off: 'offAnn' },
	NestedElse: { on: 'Annon:0', away: 'Annaway', off: 'Ann' },
	ShownComponent: { on: 'on:0Ann', away: 'Ann', off: 'Ann' },
};

const server_markup: Record<Shape, Record<StateName, string>> = {
	Chain: {
		on: '<p><button class="counter">on:0</button>Ann</p>',
		away: '<p><i>away</i>Ann</p>',
		off: '<p><b>off</b>Ann</p>',
	},
	ChainNoElse: {
		on: '<p>Ann<button class="counter">on:0</button></p>',
		away: '<p>Ann<i>away</i></p>',
		off: '<p>Ann<!----></p>',
	},
	Alone: {
		on: '<p><button class="counter">on:0</button></p>',
		away: '<p><i>away</i></p>',
		off: '<p><b>off</b></p>',
	},
	Shown: {
		on: '<p><span><button class="counter">on:0</button></span>Ann</p>',
		away: '<p><!---->Ann</p>',
		off: '<p><!---->Ann</p>',
	},
	LaterCounter: {
		on: '<p><i>on</i>Ann</p>',
		away: '<p><button class="counter">away:0</button>Ann</p>',
		off: '<p><b>off</b>Ann</p>',
	},
	NestedElse: {
		on: '<p>Ann<button class="counter">on:0</button></p>',
		away: '<p>Ann<i>away</i></p>',
		off: '<p>Ann<!----></p>',
	},
	ShownComponent: {
		on: '<p><button class="counter">on:0</button>Ann</p>',
		away: '<p><!---->Ann</p>',
		off: '<p><!---->Ann</p>',
	},
};

const cases = (Object.keys(hosts) as Shape[]).flatMap((shape) =>
	(Object.keys(states) as StateName[]).map((start) => [shape, start] as const),
);

describe("tsrx-vue hydrating an element's @else if chain or v-show branch (#1402)", () => {
	it.each(cases)('hydrates %s rendered %s, keeps its state, then follows', async (shape, start) => {
		state.value = { ...states[start] };
		container.innerHTML = server_markup[shape][start];
		const server_nodes = Array.from(container.querySelectorAll('b, i, span, button'));
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
			expect(container.textContent).toBe(shown[shape][start]);

			// The branch stays while its condition does, with its state.
			const counter = container.querySelector('.counter');
			if (counter) {
				(counter as HTMLElement).click();
				await flush();
				state.value = { ...state.value, name: 'Bo' };
				await flush();
				expect(container.textContent).toBe(
					shown[shape][start].replace(':0', ':1').replace('Ann', 'Bo'),
				);
				expect(container.querySelector('.counter')).toBe(counter);
			}

			for (const next of ['off', 'away', 'on', 'off', 'away'] as const) {
				state.value = { ...states[next] };
				await flush();
				expect(container.textContent).toBe(shown[shape][next]);
			}
			expect(errors).toEqual([]);
			expect(warnings).toEqual([]);
		} finally {
			app.unmount();
		}
	});

	it('hydrates a v-show branch hidden on the server with a style mismatch, then follows', async () => {
		// vue-jsx-vapor's server build renders a hidden `v-show` element shown
		// (vapor-for-ssr.test.js), so Vue reports the style and hides it.
		state.value = { ...states.on, shown: false };
		container.innerHTML = server_markup.Shown.on;
		const span = container.querySelector('span') as HTMLElement;
		const errors: unknown[] = [];
		const warnings: string[] = [];
		const app = createVaporSSRApp(ShownHost);
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
			expect(warnings.map((warning) => warning.split(' on')[0])).toEqual([
				'Hydration style mismatch',
			]);
			expect(container.querySelector('span')).toBe(span);
			expect(span.style.display).toBe('none');
			state.value = { ...state.value, shown: true };
			await flush();
			expect(container.querySelector('span')).toBe(span);
			expect(span.style.display).toBe('');
		} finally {
			app.unmount();
		}
	});
});
