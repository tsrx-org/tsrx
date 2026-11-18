/** @import { ComponentChildren } from 'preact' */
/** @import { TsrxTryBodyProps } from '../types/try-body' */

/**
 * Renders a `@try` body as its own component, so a throw or suspend in the
 * body's setup statements reaches the enclosing error boundary or `Suspense`
 * instead of escaping from the parent's render. A `@pending` body renders
 * through it too, as the `Suspense` fallback, so on the client it runs only
 * while the body suspends and its throw reaches the error boundary. A body that
 * awaits or yields stays inline, since the enclosing function has to settle it.
 * It imports nothing, so a `@try` with only `@pending` also works where class
 * components are unavailable.
 *
 * @param {TsrxTryBodyProps} props
 * @returns {ComponentChildren}
 */
export function TsrxTryBody(props) {
	return props.render();
}
