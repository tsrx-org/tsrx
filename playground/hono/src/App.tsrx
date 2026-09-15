import { useState } from 'hono/jsx/dom';

export default function App() @{
	const [count, setCount] = useState(0);

	<main class="app">
		<h1>{'Hello from TSRX Hono'}</h1>
		<p>{'Hono JSX DOM with TSRX.'}</p>
		<button onClick={() => setCount((current) => current + 1)}>
			{'Count: '}
			{count}
		</button>
		<style>
			.app {
				font-family: sans-serif;
				padding: 2rem;
			}

			button {
				padding: 0.5rem 1rem;
			}
		</style>
	</main>
}
