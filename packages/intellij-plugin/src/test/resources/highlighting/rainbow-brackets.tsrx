function View() @{
	const compared = value < limit;
	type Box<T> = T;
	return <><Panel value={{ items: [call()] }} /><span>{value}</span></>;
}
