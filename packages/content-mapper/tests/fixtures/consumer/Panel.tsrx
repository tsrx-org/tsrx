import Button from './Button.tsrx';

export interface PanelProps {
	title: string;
	count: number;
}

export default function Panel({ title, count }: PanelProps) @{
	const label = `${title} (${count})`;
	<>
		<head>
			<script type="text/typescript">
				const analyticsEnabled: boolean = true;
			</script>
		</head>
		<section className="panel">
			<style>
				.panel {
					padding: 1rem;
				}
				.heading {
					font-weight: bold;
				}
			</style>
			<h2 className="heading">{label}</h2>
			<Button label={title} onPress={() => console.log(count)} />
		</section>
	</>
}
