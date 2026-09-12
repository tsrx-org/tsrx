import type { FC } from 'hono/jsx/dom';
import type { JSX } from 'hono/jsx/dom/jsx-runtime';

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

/** Type-only helper used by TSRX's Hono DOM Volar output for dynamic tags. */
export declare function Dynamic<T extends DynamicIntrinsicElement>(
	props: DynamicIntrinsicElements[T] & {
		is: T | null | undefined | false;
	},
): JSX.Element;
export declare function Dynamic<T extends DynamicElementType>(
	props: DynamicComponentProps<DynamicTarget<NoInfer<T>>> & {
		is: T | null | undefined | false;
	},
): JSX.Element;
