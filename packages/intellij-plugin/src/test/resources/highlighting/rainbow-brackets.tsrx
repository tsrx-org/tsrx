function View() @{
	const compared = value < limit;
	type Box<T> = T;
	<>
		<Panel value={{ items: [call()] }} />
		<span>{value}</span>
	</>
}
