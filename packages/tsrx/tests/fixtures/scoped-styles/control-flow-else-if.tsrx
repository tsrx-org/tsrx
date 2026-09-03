// An `@else if` body renders one output node like any other branch; a
// fragment there holds its own block and scope.
export function ElseIf({ a, b }: { a: boolean; b: boolean }) @{
	<>
		<style>
			.root {
				--label: root;
			}
		</style>
		<div class="e0 root">{'root'}</div>
		@if (a) {
			<b class="e1">{'a'}</b>
		} @else if (b) {
			<>
				<style>
					.elif {
						--label: elif;
					}
				</style>
				<b class="e2 elif">{'b'}</b>
			</>
		} @else {
			<b class="e3">{'neither'}</b>
		}
	</>
}
