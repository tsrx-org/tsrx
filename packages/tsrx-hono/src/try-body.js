/** @import { Child } from 'hono/jsx' */
/** @import { TsrxTryBodyProps } from '../types/try-body' */

/**
 * Renders a `@try` body as its own component, so a throw or suspend in the
 * body's setup statements reaches the enclosing `ErrorBoundary` or `Suspense`
 * instead of escaping while the parent builds its JSX. Works with both the
 * server and the DOM renderer.
 *
 * @param {TsrxTryBodyProps} props
 * @returns {Child}
 */
export function TsrxTryBody(props) {
	return props.render();
}
