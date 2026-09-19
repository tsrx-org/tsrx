import { track } from 'ripple';

export interface CounterProps {
	start: number;
	label?: string;
}

export function Counter({ start, label = 'Count' }: CounterProps) @{
	const count = track(start);
	<button type="button" onClick={() => count.value++}>
		{label}:
		{count.value}
	</button>
}
