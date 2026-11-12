/** @import { ComponentChildren } from 'preact' */
/** @import { TsrxErrorBoundaryProps, TsrxErrorBoundaryState } from '../types/error-boundary' */

import { Component } from 'preact';

/**
 * A reusable Preact error boundary class component.
 *
 * Used by the `@tsrx/preact` compiler to implement `try/catch` blocks.
 * The `fallback` prop receives the caught error and a `reset` function
 * that clears the error state to re-render the children.
 *
 * @extends {Component<TsrxErrorBoundaryProps, TsrxErrorBoundaryState>}
 */
export class TsrxErrorBoundary extends Component {
	/** @param {TsrxErrorBoundaryProps} props */
	constructor(props) {
		super(props);
		/** @type {TsrxErrorBoundaryState} */
		this.state = { hasError: false, error: null };
	}

	/**
	 * @param {unknown} error
	 * @returns {TsrxErrorBoundaryState}
	 */
	static getDerivedStateFromError(error) {
		// Any value can be thrown, `null` included, so the error itself cannot
		// say whether one was caught.
		return { hasError: true, error };
	}

	/** @returns {ComponentChildren} */
	render() {
		const { hasError, error } = this.state;
		if (hasError) {
			const reset = () => this.setState({ hasError: false, error: null });
			return this.props.fallback(error, reset);
		}
		return this.props.children;
	}
}
