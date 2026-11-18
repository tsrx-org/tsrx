import type { BunPlugin } from 'bun';
import type { Platform, RuntimeImportMode } from '@tsrx/solid';

export interface TsrxSolidBunPluginOptions {
	/** Direct mode requires `@tsrx/solid-runtime` as a direct production dependency. */
	runtimeImports?: RuntimeImportMode;
	/** Optional override; inferred from tsconfig by default and must agree when both exist. */
	platform?: Platform;
	include?: RegExp;
	exclude?: RegExp | RegExp[];
	emitCss?: boolean;
	/**
	 * Options forwarded to `babel-preset-solid`. With `generate: 'ssr'` and
	 * `hydratable: true`, TSRX2034 also follows the SSR output, which moves
	 * more template values into arrows than the DOM output does.
	 */
	solid?: object;
}

export function tsrxSolid(options?: TsrxSolidBunPluginOptions): BunPlugin;
export default tsrxSolid;
