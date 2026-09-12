import type { BunPlugin } from 'bun';
import type { Platform, RuntimeImportMode } from '@tsrx/hono';
import type { HonoTargetMode } from '@tsrx/hono/target';

export type TsrxHonoMode = HonoTargetMode;

export interface TsrxHonoBunPluginOptions {
	/** Selects `hono/jsx` or `hono/jsx/dom`; defaults to `server`. */
	mode?: TsrxHonoMode;
	/** Direct mode requires `@tsrx/core` as a direct production dependency. */
	runtimeImports?: RuntimeImportMode;
	/** Optional override; inferred from tsconfig by default and must agree when both exist. */
	platform?: Platform;
	include?: RegExp;
	exclude?: RegExp | RegExp[];
	emitCss?: boolean;
}

export function tsrxHono(options?: TsrxHonoBunPluginOptions): BunPlugin;
export default tsrxHono;
