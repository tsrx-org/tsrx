import type { StorybookConfig } from '@storybook/vue3-vite';

export default {
	framework: '@storybook/vue3-vite',
	stories: ['../*.stories.@(ts|tsx)'],
} satisfies StorybookConfig;
