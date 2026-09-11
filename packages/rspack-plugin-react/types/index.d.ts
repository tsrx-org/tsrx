import type { Compiler, RspackPluginInstance } from '@rspack/core';
import type { Platform, RuntimeImportMode } from '@tsrx/react';

export interface TsrxReactRspackPluginOptions {
	jsxImportSource?: string;
	/** Direct mode requires `@tsrx/react-runtime` as a direct production dependency. */
	runtimeImports?: RuntimeImportMode;
	/** Optional override; inferred from tsconfig by default and must agree when both exist. */
	platform?: Platform;
}

export declare class TsrxReactRspackPlugin implements RspackPluginInstance {
	constructor(options?: TsrxReactRspackPluginOptions);
	options: Required<Pick<TsrxReactRspackPluginOptions, 'jsxImportSource' | 'runtimeImports'>> &
		Pick<TsrxReactRspackPluginOptions, 'platform'>;
	apply(compiler: Compiler): void;
}

export default TsrxReactRspackPlugin;
