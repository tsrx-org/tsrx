import type { ComponentChildren } from 'preact';

export interface TsrxTryBodyProps {
	render: () => ComponentChildren;
}

export function TsrxTryBody(props: TsrxTryBodyProps): ComponentChildren;
