const list = <ul title={viewModel.title} />;
const count = <p>{visibleItems.length}</p>;
const items = <p>{visibleItems.map(renderItem)}</p>;
const keyed = <li key={item.text}>{item.label}</li>;
const empty = <li className="no-todos">No todos</li>;
