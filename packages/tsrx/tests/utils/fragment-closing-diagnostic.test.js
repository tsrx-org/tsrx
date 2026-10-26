import { describe, expect, it } from 'vitest';
import { parseModule } from '../../src/index.js';

describe('mismatched fragment closing tags', () => {
	it.each([
		['element value', 'const a = <b>x</>;', "Expected '</b>' but found '</>'"],
		['template', 'function App() @{ <div><b>x</></div> }', "Expected '</b>' but found '</>'"],
		['attribute value', 'const a = <div attr={<b>x</>} />;', "Expected '</b>' but found '</>'"],
		['reverse mismatch', 'const a = <>x</b>;', "Expected '</>' but found '</b>'"],
	])('reports the actual closing tag in %s', (_label, source, message) => {
		expect(() => parseModule(source, 'App.tsrx')).toThrow(message);
	});
});
