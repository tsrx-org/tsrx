// Shared runtime fixtures for static JSX in expression containers (#81). React,
// Preact and Hono hoist each static element that a container renders to a
// module-level constant, so every instance and every render shares it. It must
// render as it does written inline: in each instance, and after each update.
// The keyed elements and the elements that read props stay in place. A
// fragment that is static as a whole is one constant (#1352).

function StaticCard(props: { header: unknown; count: number; children?: unknown }) {
	return (
		<section class="card" data-count={props.count}>
			<header class="card-header">{props.header}</header>
			{props.children}
		</section>
	);
}

// Returns one static: the fragment and the fragment in its container
function StaticFragment() {
	return (
		<>
			<b class="whole-static">one</b>
			{
				<>
					<b class="whole-static">two</b>
					<b class="whole-static">three</b>
				</>
			}
		</>
	);
}

// The fragment in the container is one static, and the fragment around it
// stays
function MixedFragment(props: { count: number }) {
	return (
		<>
			<i class="mixed-static">one</i>
			<i class="mixed-count">{props.count}</i>
			{
				<>
					<u class="mixed-static">two</u>
					<u class="mixed-static">three</u>
				</>
			}
		</>
	);
}

// Module state that `Counted` reads, and how many times it rendered
export const counted = { label: 'before', renders: 0 };

function Counted(props: { active: boolean }) {
	counted.renders += 1;
	return <span class="counted">{props.active ? counted.label : ''}</span>;
}

// A fragment that holds a component no static holds stays in place, so the
// component renders again with the one around it
function CountedFragment(props: { count: number }) {
	return (
		<>
			{props.count}
			<>
				<Counted active />
				<i>sibling</i>
			</>
		</>
	);
}

function CountedStatic() {
	return (
		<>
			<>
				<Counted active />
				<i>sibling</i>
			</>
		</>
	);
}

// The static beside it would let the fragment be hoisted, but `Counted` is in
// no static
function CountedBeside() {
	return (
		<>
			{<b>static</b>}
			<>
				<Counted active />
				<i>sibling</i>
			</>
		</>
	);
}

// The input is in no static, so each render sets its literal `value` again
function LiteralInput(props: { count: number }) {
	return (
		<div class="literal" data-count={props.count}>
			<>
				{<b>value</b>}
				<input class="literal-input" value="v" readOnly />
			</>
		</div>
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
			<StaticFragment />
			<MixedFragment count={props.count} />
			<CountedFragment count={props.count} />
			<CountedStatic />
			<CountedBeside />
			<LiteralInput count={props.count} />
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
