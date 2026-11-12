import type { Program } from 'estree';
import type { BaseCompileOptions, CompileFn, ParseOptions, VolarCompileFn } from '@tsrx/core/types';

export type { Platform, RuntimeImportMode, TsrxPlatformFlags } from '@tsrx/core/types';

/**
 * Per-call compile options for tsrx-solid. Exposed publicly so build plugins
 * can pass them on.
 */
export interface CompileOptions {
	/**
	 * Compile for a server build that babel-preset-solid compiles with
	 * `generate: 'ssr'` and `hydratable: true`, as `vite-plugin-solid` does with
	 * its `ssr` option on. A `yield` in a template value that this output moves
	 * into an arrow is then reported too (TSRX2034), as well as one the
	 * client's DOM output moves. The output is the same either way. Defaults to
	 * `false`: only the DOM output's rules apply.
	 */
	ssr?: boolean;
}

export function parse(source: string, filename?: string, options?: ParseOptions): Program;

export { Dynamic, type DynamicProps } from './dynamic.js';
export { isRefProp } from './ref.js';

export const compile: CompileFn<CompileOptions & BaseCompileOptions>;

export const compile_to_volar_mappings: VolarCompileFn<ParseOptions & BaseCompileOptions>;
