// Reading `theme.$class` opts single elements into a theme — every selector
// kept, like an applied block — without `apply` stamping the whole scope; a
// child component receives it through a prop and stamps it before its own
// scope hash. Elements that do not read it stay untouched.
function Card({ parentClass }: { parentClass: string }) @{
	<>
		<style>
			.local {
				--label: local;
			}
			article {
				padding: 0;
			}
		</style>
		<article class={`local ${parentClass}`}>
			<h2 class="l1 local">{'title'}</h2>
		</article>
	</>
}

export function ClassOptIn() @{
	const theme = <style>
		.theme {
			--label: theme;
		}
		div {
			color: blue;
		}
		.card {
			color: red;
		}
	</style>;
	<>
		<Card parentClass={theme.$class} />
		<div class={theme.$class}>{'opted in'}</div>
		<div class={theme.card}>{'card'}</div>
		<p>{'untouched'}</p>
	</>
}
