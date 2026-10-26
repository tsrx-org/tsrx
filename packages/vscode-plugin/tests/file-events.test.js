import { describe, expect, it, vi } from 'vitest';
import { forward_needed_file_events, is_needed_file_event } from '../src/file-events.js';

describe('file events sent to the TSRX language server', () => {
	it('keeps events from node_modules and build output in the extension host', () => {
		for (const path of [
			'node_modules/.vite/deps/package.json',
			'apps/web/node_modules/.vite/deps_temp_1a2b/package.json',
			'node_modules/.pnpm/react@19.0.0/node_modules/react/package.json',
			'node_modules/react/node_modules/scheduler/package.json',
			'node_modules/react/cjs/react.development.json',
			'apps/site/.next/server/app-paths-manifest.json',
			'apps/site/.next/package.json',
			'apps/shop/.output/server/package.json',
			'apps\\site\\.svelte-kit\\output\\server\\manifest.json',
		]) {
			expect(is_needed_file_event(path), path).toBe(false);
		}
	});

	it('forwards project files, configs, lockfiles, and files that show an install finished', () => {
		for (const path of [
			'package.json',
			'pnpm-lock.yaml',
			'apps/web/tsconfig.json',
			'apps/web/src/App.tsrx',
			// A project can extend a generated config.
			'.nuxt/tsconfig.json',
			'apps/web/.svelte-kit/tsconfig.json',
			// The lockfile can change before the install (`git pull`).
			'node_modules/.modules.yaml',
			'node_modules/.package-lock.json',
			'node_modules/.yarn-state.yml',
			'node_modules/.yarn-integrity',
			'apps/web/node_modules/@tsrx/react/package.json',
			'node_modules/typescript/package.json',
		]) {
			expect(is_needed_file_event(path), path).toBe(true);
		}
	});

	it('reads the path relative to the workspace folder', async () => {
		const folder = 'file:///home/me/node_modules/my-app/';
		const next = vi.fn(async () => {});
		const forward = forward_needed_file_events((uri) => uri.replace(folder, ''));
		await forward({ uri: `${folder}pnpm-lock.yaml`, type: 2 }, next);
		await forward({ uri: `${folder}node_modules/.vite/deps/package.json`, type: 1 }, next);
		expect(next.mock.calls).toEqual([[{ uri: `${folder}pnpm-lock.yaml`, type: 2 }]]);
	});
});
