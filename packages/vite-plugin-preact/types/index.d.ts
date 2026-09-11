import type { Plugin } from 'vite';
import type { Platform, RuntimeImportMode } from '@tsrx/preact';

export interface TsrxPreactPluginOptions {
	jsxImportSource?: string;
	suspenseSource?: string;
	/** Direct mode requires `@tsrx/preact-runtime` as a direct production dependency. */
	runtimeImports?: RuntimeImportMode;
	/** Optional override; inferred from tsconfig by default and must agree when both exist. */
	platform?: Platform;
	/** Optional tsconfig path override, resolved from Vite's project root. */
	tsconfig?: string;
}

export function tsrxPreact(options?: TsrxPreactPluginOptions): Plugin;
export default tsrxPreact;
