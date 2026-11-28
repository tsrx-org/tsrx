import type { Block } from 'vue';

export interface TsrxErrorBoundaryProps {
	/**
	 * Renders the `try` body. Returns whatever the Vapor JSX runtime produced —
	 * the boundary narrows it to a mountable block, stringifying anything that
	 * isn't already a node, fragment, or component instance.
	 */
	content: () => unknown;
	/** Renders the `catch` body for a caught error. See {@link content}. */
	fallback: (error: unknown, reset: () => void) => unknown;
	/**
	 * Whether the nearest boundary around this one renders the same `catch`
	 * body: the boundary inside a `@pending` boundary's `Suspense`. An error
	 * thrown by that body then goes past both.
	 */
	sharesCatch?: boolean;
}

export interface TsrxErrorBoundaryComponent {
	/**
	 * Returns a one-item block that the boundary patches in place: the rendered
	 * `content`, or the `fallback` once an error is caught. Typed as Vue's
	 * `Block` so the component is a valid element under `vue-jsx-vapor`'s JSX.
	 */
	(props: TsrxErrorBoundaryProps, ctx?: unknown): Block;
	props: string[];
	__setup(props?: unknown, ctx?: unknown): void;
	/**
	 * Marks it a Vapor component, also to an app with Vue's VDOM interop:
	 * `true` where Vue's Vapor renderer and a DOM are present, not on a server.
	 */
	__vapor?: boolean;
}

export const TsrxErrorBoundary: TsrxErrorBoundaryComponent;

export interface TsrxPendingBodyProps {
	/** Renders the `@pending` body. See {@link TsrxErrorBoundaryProps.content}. */
	content: () => unknown;
}

export interface TsrxPendingBodyComponent {
	/**
	 * Returns what `content` rendered, or an empty text node when it threw and
	 * the error went to Vue's error handling.
	 */
	(props: TsrxPendingBodyProps, ctx?: unknown): Block;
	props: string[];
	/**
	 * Marks it a Vapor component, also to an app with Vue's VDOM interop:
	 * `true` where Vue's Vapor renderer and a DOM are present, not on a server.
	 */
	__vapor?: boolean;
}

export const TsrxPendingBody: TsrxPendingBodyComponent;

export interface TsrxScopeProps {
	/** Runs a branch's setup statements and returns what it renders. */
	content: () => unknown;
}

export interface TsrxScopeComponent {
	/** Returns what `content` rendered; `content` runs once per mount. */
	(props: TsrxScopeProps, ctx?: unknown): Block;
	props: string[];
	/**
	 * Marks it a Vapor component, also to an app with Vue's VDOM interop:
	 * `true` where Vue's Vapor renderer and a DOM are present, not on a server.
	 */
	__vapor?: boolean;
}

export const TsrxScope: TsrxScopeComponent;
