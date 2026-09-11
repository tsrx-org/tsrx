import type { BunPlugin } from 'bun';
import type { Platform, RuntimeImportMode } from '@tsrx/preact';

export interface TsrxPreactBunPluginOptions {
	include?: RegExp;
	exclude?: RegExp | RegExp[];
	jsxImportSource?: string;
	suspenseSource?: string;
	/** Direct mode requires `@tsrx/preact-runtime` as a direct production dependency. */
	runtimeImports?: RuntimeImportMode;
	/** Optional override; inferred from tsconfig by default and must agree when both exist. */
	platform?: Platform;
	emitCss?: boolean;
}

export function tsrxPreact(options?: TsrxPreactBunPluginOptions): BunPlugin;
export default tsrxPreact;
