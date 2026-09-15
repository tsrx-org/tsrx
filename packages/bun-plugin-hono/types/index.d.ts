import type { BunPlugin } from 'bun';
import type { Platform, RuntimeImportMode } from '@tsrx/hono';

export type TsrxHonoMode = 'server' | 'dom';

export interface TsrxHonoBunPluginOptions {
	/** Selects `hono/jsx` or `hono/jsx/dom`; defaults to `server`. */
	mode?: TsrxHonoMode;
	/**
	 * Direct mode uses `@tsrx/core/runtime/*` for shared helpers. Hono-specific
	 * adapters remain under `@tsrx/hono/*` because Hono has no standalone runtime.
	 */
	runtimeImports?: RuntimeImportMode;
	/** Optional override; inferred from the active Bun build tsconfig by default. */
	platform?: Platform;
	emitCss?: boolean;
}

export function tsrxHono(options?: TsrxHonoBunPluginOptions): BunPlugin;
export default tsrxHono;
