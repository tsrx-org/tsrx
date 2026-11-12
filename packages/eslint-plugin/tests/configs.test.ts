import { describe, expect, it } from 'vitest';
import { Linter } from 'eslint';
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

	it('keeps tsrx/jsx-curly-brace-presence out of the target-neutral configs', () => {
		for (const config of [...plugin.configs.recommended, ...plugin.configs.strict]) {
			expect(Object.keys(config.rules ?? {})).not.toContainEqual(
				expect.stringMatching(/jsx-curly-brace-presence/),
			);
		}
	});

	it('swaps in tsrx/jsx-curly-brace-presence for .tsrx files in the react config', () => {
		const [react_config] = plugin.configs.react;
		expect(react_config.files).toEqual(['**/*.tsrx']);
		expect(react_config.plugins).toHaveProperty('tsrx', plugin);
		expect(react_config.rules).toEqual({
			'tsrx/jsx-curly-brace-presence': 'error',
			'react/jsx-curly-brace-presence': 'off',
		});

		// A rule that is off needs no plugin, so the config works without
		// eslint-plugin-react.
		const messages = new Linter().verify(
			`export function A() @{
	<>
		<p>{'plain'}</p>
		<code>{'@for (item of items)'}</code>
	</>
}`,
			[...plugin.configs.recommended, ...plugin.configs.react],
			'App.tsrx',
		);
		expect(messages.map((message) => `${message.line}: ${message.ruleId}`)).toEqual([
			'3: tsrx/jsx-curly-brace-presence',
		]);
	});
});
