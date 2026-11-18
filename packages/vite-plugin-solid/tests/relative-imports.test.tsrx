// The test file imports a `.tsrx` module by a relative path, which must
// resolve against this file rather than the project root.
import { Parent } from './fixtures/relative-imports/parent.tsrx';

describe('relative .tsrx imports', () => {
	it('resolves a relative import from a test file and from the module it imports', async () => {
		await render(Parent);
		expect(container.querySelector('.relative-parent .relative-child')?.textContent).toBe('child');
	});
});
