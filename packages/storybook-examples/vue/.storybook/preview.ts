import { setup } from '@storybook/vue3-vite';
import { vaporInteropPlugin } from 'vue';

setup((app) => app.use(vaporInteropPlugin));
