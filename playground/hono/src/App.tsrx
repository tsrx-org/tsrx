import { Suspense, use, useRef, useState } from 'hono/jsx/dom';

const greeting = new Promise<string>((resolve) => {
	window.setTimeout(() => resolve('The async greeting resolved.'), 900);
});

function Greeting() @{
	const message = use(greeting);
	<p class="notice">{message}</p>
}

export function App() @{
	const [count, setCount] = useState(0);
	const input = useRef<HTMLInputElement | null>(null);
	const milestones = [1, 2, 3];

	<>
		<main>
			<p class="eyebrow">Dedicated Hono DOM target</p>
			<h1>TSRX + Hono JSX DOM</h1>
			<p>
				This playground explicitly compiles with
				<code>@tsrx/hono/dom</code>
				and renders with
				<code>hono/jsx/dom</code>.
			</p>

			<section class="card">
				<h2>Interactive state and control flow</h2>
				<button type="button" onClick={() => setCount((value) => value + 1)}>
					Count:
					{count}
				</button>
				@if (count === 0) {
					<p>Press the button to start.</p>
				} @else {
					<ul>
						@for (const milestone of milestones; key milestone) {
							@if (milestone <= count) {
								<li>Reached {milestone}</li>
							}
						}
					</ul>
				}
			</section>

			<section class="card">
				<h2>Suspense and refs</h2>
				<Suspense fallback={<p class="notice">Loading a promise with Hono use()…</p>}>
					<Greeting />
				</Suspense>
				<label>
					Focus target
					<input ref={input} value="Hono owns this DOM node" readOnly />
				</label>
				<button type="button" onClick={() => input.current?.focus()}>Focus the input ref</button>
			</section>
		</main>

		<style>
			:global(body) {
				margin: 0;
				background: #f4f7fb;
				color: #15202b;
				font-family: ui-sans-serif, system-ui, sans-serif;
			}

			main {
				box-sizing: border-box;
				display: grid;
				gap: 1rem;
				width: min(48rem, calc(100% - 2rem));
				margin: 3rem auto;
			}

			.eyebrow {
				margin: 0;
				color: #176b5b;
				font-weight: 700;
				letter-spacing: 0.08em;
				text-transform: uppercase;
			}

			h1,
			h2,
			p {
				margin-block: 0;
			}

			.card {
				display: grid;
				gap: 0.8rem;
				padding: 1.25rem;
				border: 1px solid #cbd7e6;
				border-radius: 0.9rem;
				background: white;
				box-shadow: 0 0.8rem 2rem rgb(34 57 83 / 8%);
			}

			button,
			input {
				box-sizing: border-box;
				width: fit-content;
				padding: 0.65rem 0.85rem;
				border: 1px solid #8fa3b8;
				border-radius: 0.55rem;
				font: inherit;
			}

			button {
				background: #176b5b;
				color: white;
				cursor: pointer;
			}

			label {
				display: grid;
				gap: 0.4rem;
			}

			input:focus {
				outline: 3px solid #7bd7c5;
				outline-offset: 2px;
			}

			.notice {
				color: #176b5b;
			}
		</style>
	</>
}
