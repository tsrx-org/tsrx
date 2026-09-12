import type { EnvironmentOptions, Plugin } from 'vite';
import type { Platform, RuntimeImportMode } from '@tsrx/hono';
import type { HonoTargetMode } from '@tsrx/hono/target';
import type { DepScanTransformPlugin } from '@tsrx/core/types/vite/dep-scan';

export interface TsrxHonoPluginOptions {
	/** Selects `hono/jsx` or `hono/jsx/dom`; defaults to `server`. */
	mode?: HonoTargetMode;
	/** Selects bundled or direct imports for compiler-generated TSRX helpers. */
	runtimeImports?: RuntimeImportMode;
	/** Optional override; inferred from tsconfig by default and must agree when both exist. */
	platform?: Platform;
	/** Optional tsconfig path override, resolved from Vite's project root. */
	tsconfig?: string;
}

export interface TsrxHonoTransformResult {
	code: string;
	map: unknown;
}

export interface TsrxHonoPlugin extends Omit<
	Plugin,
	'configEnvironment' | 'transform' | 'resolveId' | 'load'
> {
	configEnvironment: (
		name: string,
		config?: EnvironmentOptions,
	) =>
		| {
				define?: Record<string, unknown>;
				optimizeDeps?: {
					extensions: string[];
					rolldownOptions: {
						transform: { jsx: { importSource: string } };
						plugins: [DepScanTransformPlugin];
					};
				};
		  }
		| undefined;
	transform: {
		(code: string, id: `${string}.tsrx`): Promise<TsrxHonoTransformResult>;
		(code: string, id: string): Promise<TsrxHonoTransformResult | null>;
	};
	resolveId: {
		(source: `${string}?tsrx-css&lang.css`): `\0${string}?tsrx-css&lang.css` | null;
		(source: string): string | null;
	};
	load: {
		(id: `\0${string}?tsrx-css&lang.css`): string | null;
		(id: string): string | null;
	};
}

export function tsrxHono(options?: TsrxHonoPluginOptions): TsrxHonoPlugin;
export default tsrxHono;
