// A block styles the items beside it and everything below them; it never
// styles the element that contains it. The fragment's children list, the
// section's children list, and each branch's fragment are scopes of their
// own, and the `.status` rule of the section's scope is pruned because
// <section> is not a child of that list.
export function Status({ ready }: { ready: boolean }) @{
	<>
		<style>
			.status {
				--label: status;
			}
		</style>
		<section class="status">
			<style>
				.title {
					--label: title;
				}
				.status {
					margin: 0;
				}
			</style>
			<h2 class="title">{'Status'}</h2>
			@if (ready) {
				<>
					<style>
						.ok {
							--label: ok;
						}
					</style>
					<p class="ok">{'Ready'}</p>
				</>
			} @else {
				<>
					<style>
						.wait {
							--label: wait;
						}
					</style>
					<p class="wait">{'Waiting'}</p>
				</>
			}
		</section>
	</>
}
