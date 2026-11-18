import type { Meta, StoryObj } from '@storybook/html-vite';
import { useMemo, useEffect } from 'storybook/preview-api';
import { mount } from 'ripple';
import { Counter, type CounterProps } from './Counter.tsrx';
import { StoryRoot } from './StoryRoot.tsrx';

const meta = {
	title: 'TSRX/Counter',
	args: { label: 'Increment', step: 1, disabled: false },
	argTypes: {
		label: { control: 'text' },
		step: { control: 'number' },
		disabled: { control: 'boolean' },
	},
	render: (args) => {
		const state = useMemo(() => {
			const host = document.createElement('div');
			const target = document.createElement('div');
			host.append(target);
			let live!: CounterProps;
			const dispose = mount(
				() =>
					StoryRoot({
						component: Counter,
						initial: args,
						onReady: (props: CounterProps) => {
							live = props;
						},
					}),
				{ target },
			);
			return { host, live, dispose };
		}, []);
		useEffect(() => () => state.dispose(), [state]);
		Object.assign(state.live, args);
		return state.host;
	},
} satisfies Meta<CounterProps>;

export default meta;
type Story = StoryObj<CounterProps>;

export const Default: Story = {};
export const LargeStep: Story = { args: { label: 'Add five', step: 5 } };
