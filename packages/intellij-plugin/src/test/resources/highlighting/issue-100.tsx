const output = (
	<ul title={viewModel.title}>
		{visibleItems.length > 0
			? visibleItems.map((item) => (
					<li key={item.text}>{item.label}</li>
				))
			: (
					<li className="no-todos">No todos</li>
			)}
	</ul>
);
