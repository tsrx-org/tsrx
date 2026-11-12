import type { StorybookConfig } from '@storybook/html-vite';

export default {
	framework: '@storybook/html-vite',
	stories: ['../*.stories.@(ts|tsx)'],
} satisfies StorybookConfig;
