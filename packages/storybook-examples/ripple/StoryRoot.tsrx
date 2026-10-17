import { RippleObject, type Component } from 'ripple';
import type { CounterProps } from './Counter.tsrx';

export function StoryRoot(props: {
	component: Component<CounterProps>;
	initial: CounterProps;
	onReady: (live: CounterProps) => void;
}) @{
	const live = new RippleObject({ ...props.initial });
	props.onReady(live);
	<>{props.component(live)}</>
}
