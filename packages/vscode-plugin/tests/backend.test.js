import { describe, expect, it } from 'vitest';
import {
	TYPESCRIPT_7_SETTING,
	TYPESCRIPT_7_SETTING_KEY,
	TYPESCRIPT_7_SETTING_SECTIONS,
	resolve_backend,
} from '../src/backend.js';

describe('TypeScript backend resolution', () => {
	it("follows VS Code's TypeScript 7 switch, with no setting of its own", () => {
		expect(resolve_backend(true)).toBe('native');
		expect(resolve_backend(false)).toBe('classic');
	});

	it('reads the setting VS Code itself uses', () => {
		// `js/ts.experimental.useTsgo` is declared by VS Code's built-in TypeScript
		// extension (extensions/typescript-language-features/package.json) and is what
		// its "Select TypeScript Version" picker writes; `typescript.experimental.useTsgo`
		// is the deprecated spelling still honoured.
		expect(TYPESCRIPT_7_SETTING_SECTIONS).toEqual(['js/ts', 'typescript']);
		expect(TYPESCRIPT_7_SETTING_KEY).toBe('experimental.useTsgo');
		expect(TYPESCRIPT_7_SETTING).toBe('js/ts.experimental.useTsgo');
	});
});
