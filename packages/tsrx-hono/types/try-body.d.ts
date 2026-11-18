import type { Child } from 'hono/jsx';

export interface TsrxTryBodyProps {
	render: () => Child;
}

export function TsrxTryBody(props: TsrxTryBodyProps): Child;
