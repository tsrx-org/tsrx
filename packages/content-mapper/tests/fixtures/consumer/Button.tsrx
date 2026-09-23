import type { PanelProps } from './Panel.tsrx';

export interface ButtonProps {
	label: PanelProps['title'];
	onPress?: () => void;
}

export default function Button({ label, onPress }: ButtonProps) @{
	<button type="button" onClick={onPress}>{label}</button>
}
