import type { SpreadFalsy } from '@tsrx/runtime/ref';

export * from '@tsrx/runtime/ref';

export function spread_ref_bags(...sources: Array<() => object | SpreadFalsy>): {
	bag(index: number): object | SpreadFalsy;
	readonly refs: { readonly ref: unknown[] };
};
