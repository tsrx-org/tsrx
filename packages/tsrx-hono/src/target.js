const MODES = Object.freeze({
	server: Object.freeze({
		compiler: '@tsrx/hono',
		jsxImportSource: 'hono/jsx',
	}),
	dom: Object.freeze({
		compiler: '@tsrx/hono/dom',
		jsxImportSource: 'hono/jsx/dom',
	}),
});

/**
 * Closed Hono target contract shared by build integrations. Discovery always
 * selects `server`; consumers must request `dom` explicitly.
 */
export const honoTarget = Object.freeze({
	name: 'hono',
	defaultMode: 'server',
	modes: MODES,
});

/**
 * Resolve one supported Hono execution mode.
 *
 * @param {'server' | 'dom' | undefined} mode
 */
export function resolveHonoTarget(mode = honoTarget.defaultMode) {
	const target = honoTarget.modes[mode];
	if (!target) {
		throw new TypeError(`Invalid Hono target mode: ${String(mode)}. Expected "server" or "dom".`);
	}
	return target;
}
