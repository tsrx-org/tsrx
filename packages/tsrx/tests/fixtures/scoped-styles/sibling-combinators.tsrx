// Sibling combinators between the items of one scope, and between the items
// of a branch fragment: both siblings carry the scope hash, so the rules are
// kept. Only the descendant chain through `.wrap` had a parent element to find
// siblings in before; the others sit at the top of their list.
export function SiblingCombinators({ open }: { open: boolean }) @{
	<>
		<style>
			.scope {
				--label: scope;
			}
			.a + .b {
				color: red;
			}
			.a ~ .c {
				color: blue;
			}
			.wrap .x + .y {
				color: green;
			}
			.d + .e {
				color: black;
			}
			.f + .g {
				color: gray;
			}
		</style>
		<div class="a scope">{'a'}</div>
		<div class="b">{'b'}</div>
		<div class="c">{'c'}</div>
		<div class="wrap">
			<span class="x">{'x'}</span>
			<span class="y">{'y'}</span>
		</div>
		@if (open) {
			<>
				<i class="d">{'d'}</i>
				<i class="e">{'e'}</i>
			</>
		}
		<i class="g">{'g'}</i>
	</>
}
