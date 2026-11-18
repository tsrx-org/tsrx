import { useState } from 'preact/hooks';

export interface CounterProps {
	label: string;
	step: number;
	disabled: boolean;
}

export function Counter(props: CounterProps) @{
	const [count, setCount] = useState(0);
	<>
		<style>
			.counter {
				display: grid;
				gap: 1rem;
				background: rgb(15, 23, 42);
				color: white;
				padding: 1rem;
			}
		</style>
		<section class="counter" aria-label="TSRX counter">
			<h2>Native preact counter</h2>
			<output aria-live="polite">{'Count: ' + count}</output>
			<p>{'Step: ' + props.step}</p>
			<button
				type="button"
				disabled={props.disabled}
				onClick={() => setCount((current) => current + props.step)}
			>
				{props.label}
			</button>
			@if (props.disabled) {
				<p>{'Paused'}</p>
			}
			<ul>
				@for (const item of [1, 2]; key item) {
					<li>{item}</li>
				}
			</ul>
		</section>
	</>
}
