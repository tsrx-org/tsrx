// #1291's shape: a host spread beside another attribute, with a `yield` in
// the attribute. The DOM output evaluates it in place; the SSR output merges
// the props in an arrow.
export function* field(bag: any) {
	return <input {...bag} title={yield 1} />;
}
