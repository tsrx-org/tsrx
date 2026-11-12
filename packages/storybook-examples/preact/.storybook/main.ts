import type { StorybookConfig } from '@storybook/preact-vite';

export default {
	framework: '@storybook/preact-vite',
	stories: ['../*.stories.@(ts|tsx)'],
} satisfies StorybookConfig;
