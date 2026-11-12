import type { Meta, StoryObj } from '@storybook/vue3-vite';
import type { DefineVaporSetupFnComponent } from 'vue-jsx-vapor';
import { Counter, type CounterProps } from './Counter.tsrx';

// Storybook 10's component slot accepts VDOM components; retain the native Vapor type.
type CounterMeta = Omit<Meta<CounterProps>, 'component'> & {
	component: DefineVaporSetupFnComponent<CounterProps>;
};

const meta = {
	title: 'TSRX/Counter',
	component: Counter,
	args: { label: 'Increment', step: 1, disabled: false },
	argTypes: {
		label: { control: 'text' },
		step: { control: 'number' },
		disabled: { control: 'boolean' },
	},
} satisfies CounterMeta;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const LargeStep: Story = { args: { label: 'Add five', step: 5 } };
