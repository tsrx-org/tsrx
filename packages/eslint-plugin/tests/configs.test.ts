import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import plugin from '../src/index.ts';

describe('eslint-plugin configs', () => {
	it('includes .tsrx files in TSRX configs', () => {
		const recommended_tsrx_config = plugin.configs.recommended[0];
		const strict_tsrx_config = plugin.configs.strict[0];

		expect(recommended_tsrx_config.files).toContain('**/*.tsrx');
		expect(strict_tsrx_config.files).toContain('**/*.tsrx');
		expect(recommended_tsrx_config.plugins).toHaveProperty('tsrx', plugin);
		expect(recommended_tsrx_config.rules).toHaveProperty('tsrx/control-flow-jsx');
		for (const config of [...plugin.configs.recommended, ...plugin.configs.strict]) {
			expect(config.name).not.toMatch(/ripple/i);
			expect(Object.keys(config.rules ?? {})).not.toContainEqual(expect.stringMatching(/ripple/i));
		}
	});

	it('lints a file that compiles with a TSRX warning', () => {
		// `@{user.name}` is TSRX2035, a warning, which mustn't fail the parse.
		const messages = new Linter().verify(
			`export function UserName({ user }: { user: { name: string } }) @{
	<p>@{user.name}</p>
}
`,
			plugin.configs.recommended,
			'UserName.tsrx',
		);

		expect(messages).toEqual([]);
	});
});
