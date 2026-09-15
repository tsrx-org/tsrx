import { defineConfig } from 'vite';
import tsrxHono from '@tsrx/vite-plugin-hono';

export default defineConfig({
	plugins: [tsrxHono({ mode: 'dom' })],
	build: {
		minify: false,
	},
});
