import type { StoryObj } from '@storybook/html-vite';
import { Counter, type CounterProps } from './Counter.tsrx';

export const typedStory = {
	args: { label: 'Add two', step: 2, disabled: false },
} satisfies StoryObj<CounterProps>;
export const wrongStory = {
	args: {
		// @ts-expect-error -- story args preserve native number props.
		step: '2',
	},
} satisfies StoryObj<CounterProps>;

export const typedNative = Counter({ label: 'Add', step: 2, disabled: false });

// @ts-expect-error -- the imported native component preserves number props.
Counter({ label: 'Add', step: '2', disabled: false });
// @ts-expect-error -- the imported native component preserves required props.
Counter({ label: 'Add', step: 2 });
