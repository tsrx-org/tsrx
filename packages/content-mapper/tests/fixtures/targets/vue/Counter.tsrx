import { ref } from 'vue';

export interface CounterProps {
	start: number;
	label?: string;
}

export function Counter(props: CounterProps) @{
	const count = ref(props.start);
	<button type="button" onClick={() => count.value++}>
		{props.label ?? 'Count'}:
		{count.value}
	</button>
}
