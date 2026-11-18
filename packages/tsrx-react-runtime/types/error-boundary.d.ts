import { Component, type ReactNode } from 'react';

export interface TsrxErrorBoundaryProps {
	fallback: (error: unknown, reset: () => void) => ReactNode;
	children?: ReactNode;
}

export interface TsrxErrorBoundaryState {
	hasError: boolean;
	error: unknown;
}

export class TsrxErrorBoundary extends Component<TsrxErrorBoundaryProps, TsrxErrorBoundaryState> {
	static getDerivedStateFromError(error: unknown): TsrxErrorBoundaryState;
	render(): ReactNode;
}
