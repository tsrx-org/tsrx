import type { Compiler, RspackPluginInstance } from '@rspack/core';
import type { Platform, RuntimeImportMode } from '@tsrx/vue';

export interface TsrxVueRspackVaporOptions {
	macros?: boolean | object;
	compiler?: {
		runtimeModuleName?: string;
	};
}

export interface TsrxVueRspackPluginOptions {
	vapor?: TsrxVueRspackVaporOptions;
	/** Direct mode requires `@tsrx/vue-runtime` as a direct production dependency. */
	runtimeImports?: RuntimeImportMode;
	/** Must match `tsrx.platform` in the active tsconfig. */
	platform?: Platform;
}

export declare class TsrxVueRspackPlugin implements RspackPluginInstance {
	constructor(options?: TsrxVueRspackPluginOptions);
	options: Pick<TsrxVueRspackPluginOptions, 'vapor' | 'platform'> &
		Required<Pick<TsrxVueRspackPluginOptions, 'runtimeImports'>>;
	apply(compiler: Compiler): void;
}

export default TsrxVueRspackPlugin;
