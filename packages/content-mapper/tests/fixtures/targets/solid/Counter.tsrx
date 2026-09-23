import { createSignal } from 'solid-js';

export interface CounterProps {
	start: number;
	label?: string;
}

export function Counter(props: CounterProps) @{
	const [count, setCount] = createSignal(props.start);
	<button type="button" onClick={() => setCount(count() + 1)}>
		{props.label ?? 'Count'}:
		{count()}
	</button>
}
