import type { ReactNode } from 'react';

export interface TsrxTryBodyProps {
	render: () => ReactNode;
}

export function TsrxTryBody(props: TsrxTryBodyProps): ReactNode;
