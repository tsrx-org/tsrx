import type { BunPlugin } from 'bun';
import type { Platform, RuntimeImportMode } from '@tsrx/vue';

export interface TsrxVueBunPluginVaporOptions {
	macros?: boolean | object;
	compiler?: {
		runtimeModuleName?: string;
	};
}

export interface TsrxVueBunPluginOptions {
	/** Direct mode requires `@tsrx/vue-runtime` as a direct production dependency. */
	runtimeImports?: RuntimeImportMode;
	/** Optional override; inferred from tsconfig by default and must agree when both exist. */
	platform?: Platform;
	include?: RegExp;
	exclude?: RegExp | RegExp[];
	emitCss?: boolean;
	vapor?: TsrxVueBunPluginVaporOptions;
}

export function tsrxVue(options?: TsrxVueBunPluginOptions): BunPlugin;
export default tsrxVue;
