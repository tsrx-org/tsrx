import type { StorybookConfig } from '@storybook/react-vite';

export default {
	framework: '@storybook/react-vite',
	typescript: { reactDocgen: false },
	stories: ['../*.stories.@(ts|tsx)'],
} satisfies StorybookConfig;
