import type { StoryObj } from '@storybook/preact-vite';
import { Counter } from './Counter.tsrx';
import meta from './Counter.stories.ts';

export const typedStory = {
	args: { label: 'Add two', step: 2, disabled: false },
} satisfies StoryObj<typeof meta>;
export const wrongStory = {
	args: {
		// @ts-expect-error -- story args preserve native number props.
		step: '2',
	},
} satisfies StoryObj<typeof meta>;

export const typedNative = Counter({ label: 'Add', step: 2, disabled: false });

// @ts-expect-error -- the imported native component preserves number props.
Counter({ label: 'Add', step: '2', disabled: false });
// @ts-expect-error -- the imported native component preserves required props.
Counter({ label: 'Add', step: 2 });
