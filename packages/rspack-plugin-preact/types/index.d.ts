import type { Compiler, RspackPluginInstance } from '@rspack/core';
import type { Platform, RuntimeImportMode } from '@tsrx/preact';

export interface TsrxPreactRspackPluginOptions {
	jsxImportSource?: string;
	suspenseSource?: string;
	/** Direct mode requires `@tsrx/preact-runtime` as a direct production dependency. */
	runtimeImports?: RuntimeImportMode;
	/** Must match `tsrx.platform` in the active tsconfig. */
	platform?: Platform;
}

export declare class TsrxPreactRspackPlugin implements RspackPluginInstance {
	constructor(options?: TsrxPreactRspackPluginOptions);
	options: Required<Pick<TsrxPreactRspackPluginOptions, 'jsxImportSource'>> &
		Pick<TsrxPreactRspackPluginOptions, 'suspenseSource' | 'platform'> &
		Required<Pick<TsrxPreactRspackPluginOptions, 'runtimeImports'>>;
	apply(compiler: Compiler): void;
}

export default TsrxPreactRspackPlugin;
