import type { StorybookConfig } from 'storybook-solidjs-vite';

export default {
	framework: { name: 'storybook-solidjs-vite', options: { docgen: false } },
	stories: ['../*.stories.@(ts|tsx)'],
} satisfies StorybookConfig;
