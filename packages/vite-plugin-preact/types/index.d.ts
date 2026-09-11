import type { Plugin } from 'vite';
import type { Platform, RuntimeImportMode } from '@tsrx/preact';

export interface TsrxPreactPluginOptions {
	jsxImportSource?: string;
	suspenseSource?: string;
	/** Direct mode requires `@tsrx/preact-runtime` as a direct production dependency. */
	runtimeImports?: RuntimeImportMode;
	/** Must match `tsrx.platform` in the active tsconfig. */
	platform?: Platform;
}

export function tsrxPreact(options?: TsrxPreactPluginOptions): Plugin;
export default tsrxPreact;
