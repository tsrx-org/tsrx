import type { BunPlugin } from 'bun';
import type { Platform, RuntimeImportMode } from '@tsrx/react';

export interface TsrxReactBunPluginOptions {
	/** Direct mode requires `@tsrx/react-runtime` as a direct production dependency. */
	runtimeImports?: RuntimeImportMode;
	/** Optional override; inferred from tsconfig by default and must agree when both exist. */
	platform?: Platform;
	include?: RegExp;
	exclude?: RegExp | RegExp[];
	jsxImportSource?: string;
	emitCss?: boolean;
}

export function tsrxReact(options?: TsrxReactBunPluginOptions): BunPlugin;
export default tsrxReact;
