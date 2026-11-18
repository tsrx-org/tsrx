// Shared runtime fixtures for fragments hoisted as one static (#1352). Each
// fragment here holds a static, and is the only output of a body or of a
// fragment around it, where the walk prints the spaces at the edges of its
// text in different ways. A hoisted fragment must render the same markup as
// the fragment in place did, text node for text node. `// prettier-ignore`
// keeps the spaces each case is about.

export function LoneReturn() {
	// prettier-ignore
	return <>{<> y <i>z</i> </>}</>;
}

export function LoneTwice() {
	// prettier-ignore
	return <>{<>{<> y <i>z</i> </>}</>}</>;
}

export function LoneTemplate() @{
	const k = 1;
	// prettier-ignore
	<>{<>{<> y <i>z</i> </>}</>}</>
}

// prettier-ignore
export const LoneArrow = () => <>{<>{<> y <i>z</i> </>}</>}</>;

export function LoneIf(props: { flag: boolean }) @{
	<div>
		@if (props.flag) {
			// prettier-ignore
			<>{<> y <i>z</i> </>}</>
		}
	</div>
}

export function LoneIfSetup(props: { flag: boolean }) @{
	<div>
		@if (props.flag) {
			const k = 1;
			// prettier-ignore
			<>{<>{<> y <i>z</i> </>}</>}</>
		}
	</div>
}

export function LoneElse(props: { flag: boolean }) @{
	<div>
		@if (!props.flag) {
			<b>t</b>
		} @else {
			// prettier-ignore
			<>{<> y <i>z</i> </>}</>
		}
	</div>
}

export function LoneSwitch(props: { flag: boolean }) @{
	<div>
		@switch (props.flag) {
			@case true: {
				// prettier-ignore
				<>{<>{<> y <i>z</i> </>}</>}</>
			}
			@default: {
				<b>d</b>
			}
		}
	</div>
}

export function LoneTry() @{
	<div>
		@try {
			// prettier-ignore
			<>{<>{<> y <i>z</i> </>}</>}</>
		} @catch (e) {
			<p>err</p>
		}
	</div>
}

export function LoneFor(props: { items: string[] }) @{
	<ul>
		@for (const item of props.items) {
			// prettier-ignore
			<>{<>{<> y <i>z</i> </>}</>}</>
		}
	</ul>
}

export function LoneEmpty(props: { items: string[] }) @{
	<ul>
		@for (const item of props.items; key item) {
			<li>{item}</li>
		} @empty {
			// prettier-ignore
			<>{<>{<> y <i>z</i> </>}</>}</>
		}
	</ul>
}

export function LoneHelper() @{
	// prettier-ignore
	const render = () => <>{<>{<> y <i>z</i> </>}</>}</>;
	<div>{render()}</div>
}

function renderLone() {
	// prettier-ignore
	return <>{<> y <i>z</i> </>}</>;
}

export function LoneHelperFunction() @{
	<div>{renderLone()}</div>
}
