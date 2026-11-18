// Shared runtime fixtures for static JSX in expression containers (#81). React,
// Preact and Hono hoist each static element that a container renders to a
// module-level constant, so every instance and every render shares it. It must
// render as it does written inline: in each instance, and after each update.
// The keyed elements and the elements that read props stay in place.

function StaticCard(props: { header: unknown; count: number; children?: unknown }) {
	return (
		<section class="card" data-count={props.count}>
			<header class="card-header">{props.header}</header>
			{props.children}
		</section>
	);
}

export function StaticContainers(props: { on: boolean; count: number }) {
	return (
		<div class="static-containers" data-count={props.count}>
			{<b class="child">child</b>}
			<StaticCard header={<h2 class="header">header</h2>} count={props.count}>
				{<i class="card-child">card child</i>}
			</StaticCard>
			{props.on ? <span class="on">on</span> : <span class="off">off</span>}
			{props.on && <em class="and">and</em>}
			{props.on || <s class="or">or</s>}
			{
				<p class="nested" data-count={props.count}>
					{<u class="nested-static">nested</u>}
				</p>
			}
			{
				<>
					<a class="fragment-child">one</a>
					<a class="fragment-child">two</a>
				</>
			}
			{props.on ? (
				<i key="on" class="keyed">
					keyed on
				</i>
			) : (
				<i key="off" class="keyed">
					keyed off
				</i>
			)}
			<span class="count">{props.count}</span>
		</div>
	);
}

export function StaticContainersPair(props: { on: boolean; count: number }) {
	return (
		<div class="static-containers-pair">
			<StaticContainers on={props.on} count={props.count} />
			<StaticContainers on={props.on} count={props.count} />
		</div>
	);
}
