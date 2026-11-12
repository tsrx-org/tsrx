/** @import { ComponentChildren } from 'preact' */
/** @import { TsrxTryBodyProps } from '../types/try-body' */

/**
 * Renders a `@try` body as its own component, so a throw or suspend in the
 * body's setup statements reaches the enclosing error boundary or `Suspense`
 * instead of escaping from the parent's render. It imports nothing, so a
 * `@try` with only `@pending` also works where class components are
 * unavailable, such as React Server Components.
 *
 * @param {TsrxTryBodyProps} props
 * @returns {ComponentChildren}
 */
export function TsrxTryBody(props) {
	return props.render();
}
