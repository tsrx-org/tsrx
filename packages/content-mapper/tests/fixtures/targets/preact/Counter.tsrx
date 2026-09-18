import { useState } from 'preact/hooks';

export interface CounterProps {
	start: number;
	label?: string;
}

export function Counter({ start, label = 'Count' }: CounterProps) @{
	const [count, setCount] = useState(start);
	<button type="button" onClick={() => setCount(count + 1)}>
		{label}:
		{count}
	</button>
}
