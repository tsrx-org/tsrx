import type { Child, FC, PropsWithChildren } from 'hono/jsx';

/**
 * Hono's `ErrorBoundary` from `hono/jsx/dom`. Hono types the caught error as
 * `Error`, but `fallbackRender` and `onError` receive the thrown value as it is,
 * which can be anything.
 */
export declare const TsrxErrorBoundary: FC<
	PropsWithChildren<{
		fallback?: Child;
		fallbackRender?: (error: unknown) => Child;
		onError?: (error: unknown) => void;
	}>
>;
