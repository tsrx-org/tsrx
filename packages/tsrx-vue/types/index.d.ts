import type { Program } from 'estree';
import type { BaseCompileOptions, CompileFn, ParseOptions, VolarCompileFn } from '@tsrx/core/types';

export type { Platform, RuntimeImportMode, TsrxPlatformFlags } from '@tsrx/core/types';

/**
 * Per-call compile options for tsrx-vue. Exposed publicly so build plugins
 * can pass them on.
 */
export interface CompileOptions {
	/**
	 * Compile for a server build that vue-jsx-vapor compiles with `ssr` on, as
	 * `@tsrx/vite-plugin-vue` does for Vite's server build. A server render
	 * runs once, so a component whose only output is an `@if`, a `@switch` or
	 * an `@for` returns it as it is, which the client output hydrates; the
	 * client output puts it in a fragment, so it follows its props. Defaults
	 * to `false`.
	 */
	ssr?: boolean;
}

export function parse(source: string, filename?: string, options?: ParseOptions): Program;

export { isRefProp } from './ref.js';
export { Dynamic, type DynamicElementType, type DynamicProps } from './dynamic.js';

export const compile: CompileFn<CompileOptions & BaseCompileOptions>;

export const compile_to_volar_mappings: VolarCompileFn<ParseOptions & BaseCompileOptions>;
