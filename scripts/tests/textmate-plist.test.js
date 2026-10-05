import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const plist = readFileSync(
	new URL('../../assets/TSRX.tmbundle/Syntaxes/tsrx.tmLanguage', import.meta.url),
	'utf8',
);

describe('TextMate plist', () => {
	// GitHub Linguist reads this plist and warns about keys a grammar does not
	// define. The JSON grammar keeps them as metadata from VS Code's grammar.
	it.each(['version', 'information_for_contributors'])('leaves out the `%s` key', (key) => {
		expect(plist).not.toContain(`<key>${key}</key>`);
	});
});
