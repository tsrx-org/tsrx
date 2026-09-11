import type { Platform, RuntimeImportMode } from '@tsrx/react';

export interface NextTurbopackConfig {
	typescript?: {
		tsconfigPath?: string;
	};
	turbopack?: {
		root?: string;
		rules?: Record<string, unknown>;
		resolveAlias?: Record<string, unknown>;
		resolveExtensions?: string[];
		debugIds?: boolean;
	};
	[key: string]: unknown;
}

export interface TsrxReactTurbopackOptions {
	/** Direct mode requires `@tsrx/react-runtime` as a direct production dependency. */
	runtimeImports?: RuntimeImportMode;
	/** Optional override; inferred from tsconfig by default and must agree when both exist. */
	platform?: Platform;
	/** Optional tsconfig path override, resolved from the Turbopack project root. */
	tsconfig?: string;
}

export interface TsrxReactTurbopackLoader {
	loader: string;
	options: TsrxReactTurbopackOptions;
}

export interface TsrxReactTurbopackRule {
	condition: {
		all: Array<unknown>;
	};
	loaders: Array<string | TsrxReactTurbopackLoader>;
	as: '*.tsx';
}

export interface TsrxReactTurbopackCssRule {
	condition: {
		all: Array<unknown>;
	};
	loaders: Array<string | TsrxReactTurbopackLoader>;
	type: 'css';
}

export declare function create_tsrx_react_turbopack_rule(
	options?: TsrxReactTurbopackOptions,
): TsrxReactTurbopackRule;

export declare function create_tsrx_react_turbopack_css_rule(
	options?: TsrxReactTurbopackOptions,
): TsrxReactTurbopackCssRule;

export declare function tsrxReactTurbopack(
	next_config?: NextTurbopackConfig,
	options?: TsrxReactTurbopackOptions,
): NextTurbopackConfig;

export default tsrxReactTurbopack;
