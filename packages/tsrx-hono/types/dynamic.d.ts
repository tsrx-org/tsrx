import type { FC, JSX } from 'hono/jsx';

type DynamicIntrinsicElements = JSX.IntrinsicElements;
type DynamicIntrinsicElement = Extract<keyof DynamicIntrinsicElements, string>;
export type DynamicElementType = DynamicIntrinsicElement | FC<any> | (string & {});
type DynamicTarget<T> = Exclude<T, null | undefined | false>;
type DynamicComponentProps<T> = [T] extends [never]
	? Record<string, unknown>
	: T extends FC<infer P>
		? Omit<P, 'is'>
		: T extends DynamicIntrinsicElement
			? DynamicIntrinsicElements[T]
			: Record<string, unknown>;

export type DynamicProps<T extends DynamicElementType> = DynamicComponentProps<
	DynamicTarget<NoInfer<T>>
> & {
	is: T | null | undefined | false;
};

/**
 * What a Hono function component returns. Hono 4.13's `JSX.ElementType` only
 * accepts a component that returns it, so `Dynamic` can be a JSX tag.
 */
type DynamicResult = ReturnType<FC>;

/** Type-only helper used by TSRX's Volar output for dynamic tags. */
export declare function Dynamic<T extends DynamicIntrinsicElement>(
	props: DynamicIntrinsicElements[T] & {
		is: T | null | undefined | false;
	},
): DynamicResult;
export declare function Dynamic<T extends DynamicElementType>(
	props: DynamicComponentProps<DynamicTarget<NoInfer<T>>> & {
		is: T | null | undefined | false;
	},
): DynamicResult;
