import type { StoryObj } from '@storybook/vue3-vite';
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

type NativeProps = InstanceType<typeof Counter>['$props'];
export const typedNativeProps = {
	label: 'Add',
	step: 2,
	disabled: false,
} satisfies NativeProps;
export const wrongNativeProps = {
	label: 'Add',
	// @ts-expect-error -- the imported native component preserves number props.
	step: '2',
	disabled: false,
} satisfies NativeProps;
// @ts-expect-error -- the imported native component preserves required props.
export const missingNativeProps = { label: 'Add', step: 2 } satisfies NativeProps;
// @ts-expect-error -- component metadata requires the native Vapor component type.
export const wrongComponent: typeof meta.component = () => null;
