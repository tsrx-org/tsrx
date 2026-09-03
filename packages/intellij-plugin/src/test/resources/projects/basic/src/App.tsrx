import { component, useState } from 'tsrx';

export const App = component(() => {
	const [count, setCount] = useState(0);
	return <button onClick={() => setCount(count + 1)}>Count: {count}</button>;
});
