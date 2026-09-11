import type { BunPlugin } from 'bun';
import type { Platform, RuntimeImportMode } from '@tsrx/solid';

export interface TsrxSolidBunPluginOptions {
	/** Direct mode requires `@tsrx/solid-runtime` as a direct production dependency. */
	runtimeImports?: RuntimeImportMode;
	/** Must match `tsrx.platform` in the active tsconfig. */
	platform?: Platform;
	include?: RegExp;
	exclude?: RegExp | RegExp[];
	emitCss?: boolean;
	solid?: object;
}

export function tsrxSolid(options?: TsrxSolidBunPluginOptions): BunPlugin;
export default tsrxSolid;
