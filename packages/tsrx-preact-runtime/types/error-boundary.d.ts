import { Component, type ComponentChildren, type VNode } from 'preact';

export interface TsrxErrorBoundaryProps {
	fallback: (error: unknown, reset: () => void) => ComponentChildren;
	children?: ComponentChildren;
}

export interface TsrxErrorBoundaryState {
	hasError: boolean;
	error: unknown;
}

export class TsrxErrorBoundary extends Component<TsrxErrorBoundaryProps, TsrxErrorBoundaryState> {
	static getDerivedStateFromError(error: unknown): TsrxErrorBoundaryState;
	render(): ComponentChildren | VNode;
}
