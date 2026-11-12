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
}

export const TsrxErrorBoundary: TsrxErrorBoundaryComponent;
