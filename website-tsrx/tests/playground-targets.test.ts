import { expect, it } from 'vitest';
import { DEFAULT_DEMO_SOURCE } from '../src/lib/demo.ts';
import { DEMO_TARGET_OPTIONS } from '../src/lib/demo-targets.ts';
import { routes } from '../src/routes.ts';

const route = routes.find((route) => route.type === 'server' && route.path === '/api/compile');
if (!route || route.type !== 'server') throw new Error('Missing playground compile endpoint');
const compile_handler = route.handler;

it.each(DEMO_TARGET_OPTIONS)('compiles the default example for $label', async ({ value }) => {
	const response = await compile_handler({
		request: new Request('http://localhost/api/compile', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ source: DEFAULT_DEMO_SOURCE, target: value }),
		}),
	} as Parameters<typeof compile_handler>[0]);
	const result = await response.json();

	expect(result.error).toBeUndefined();
	expect(response.status).toBe(200);
	expect(result.target).toBe(value);
	expect(result.output.code.trim()).not.toBe('');
	expect(result.output.css).toContain('.feature-card');
});
