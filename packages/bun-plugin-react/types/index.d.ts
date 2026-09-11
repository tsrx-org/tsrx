import type { BunPlugin } from 'bun';
import type { Platform, RuntimeImportMode } from '@tsrx/react';

export interface TsrxReactBunPluginOptions {
	/** Direct mode requires `@tsrx/react-runtime` as a direct production dependency. */
	runtimeImports?: RuntimeImportMode;
	/** Must match `tsrx.platform` in the active tsconfig. */
	platform?: Platform;
	include?: RegExp;
	exclude?: RegExp | RegExp[];
	jsxImportSource?: string;
	emitCss?: boolean;
}

export function tsrxReact(options?: TsrxReactBunPluginOptions): BunPlugin;
export default tsrxReact;
