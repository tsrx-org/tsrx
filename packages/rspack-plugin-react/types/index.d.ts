import type { Compiler, RspackPluginInstance } from '@rspack/core';
import type { Platform, RuntimeImportMode } from '@tsrx/react';

export interface TsrxReactRspackPluginOptions {
	jsxImportSource?: string;
	/** Direct mode requires `@tsrx/react-runtime` as a direct production dependency. */
	runtimeImports?: RuntimeImportMode;
	/** Must match `tsrx.platform` in the active tsconfig. */
	platform?: Platform;
}

export declare class TsrxReactRspackPlugin implements RspackPluginInstance {
	constructor(options?: TsrxReactRspackPluginOptions);
	options: Required<Pick<TsrxReactRspackPluginOptions, 'jsxImportSource' | 'runtimeImports'>> &
		Pick<TsrxReactRspackPluginOptions, 'platform'>;
	apply(compiler: Compiler): void;
}

export default TsrxReactRspackPlugin;
