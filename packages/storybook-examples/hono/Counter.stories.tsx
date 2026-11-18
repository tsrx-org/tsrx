/** @jsxImportSource hono/jsx/dom */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { useEffect, useMemo } from 'storybook/preview-api';
import { createRoot } from 'hono/jsx/dom/client';
import { Counter, type CounterProps } from './Counter.tsrx';
const meta = {
	title: 'TSRX/Counter',
	render: (props: CounterProps) => {
		const { host, root } = useMemo(() => {
			const host = document.createElement('div');
			return { host, root: createRoot(host) };
		}, []);
		useEffect(() => () => root.unmount(), [root]);
		root.render(<Counter {...props} />);
		return host;
	},
	args: { label: 'Increment', step: 1, disabled: false },
	argTypes: {
		label: { control: 'text' },
		step: { control: 'number' },
		disabled: { control: 'boolean' },
	},
} satisfies Meta<CounterProps>;
export default meta;
type Story = StoryObj<CounterProps>;
export const Default: Story = {};
export const LargeStep: Story = { args: { label: 'Add five', step: 5 } };
