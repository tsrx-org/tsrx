// RFC problem 4: an element assigned to a variable inside a `@{ … }` body keeps
// its block. The block sits in the element's children list, so it styles the
// children and never the element that contains it. (Outside a `@{ … }` or
// control-flow body a bodied standalone block is an error.)
export function Templates() @{
	const card = <div class="card-root">
		<style>
			.card {
				--label: card;
			}
			div {
				margin: 0;
			}
		</style>
		<p class="card-text card">{'card'}</p>
	</div>;
	const chip = <span class="chip-root">
		<style>
			.chip {
				--label: chip;
			}
			b {
				font-weight: bold;
			}
		</style>
		<b class="chip-text chip">{'chip'}</b>
	</span>;
	<>
		{card}
		{chip}
		<p class="outside">{'outside'}</p>
	</>
}
