import { describe, expect, it } from 'vitest';
import { Linter } from 'eslint';
import * as parser from '@tsrx/eslint-parser';
import plugin from '../src/index.ts';

const WRAPPED_CORE_RULES = ['no-unused-vars', 'no-await-in-loop', 'no-unreachable'];

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

	it('leaves the core rules and their TSRX versions out of recommended and strict', () => {
		for (const config of [...plugin.configs.recommended, ...plugin.configs.strict]) {
			for (const name of WRAPPED_CORE_RULES) {
				expect(config.rules ?? {}).not.toHaveProperty(name);
				expect(config.rules ?? {}).not.toHaveProperty(`tsrx/${name}`);
			}
		}
	});

	it('swaps the core rules js.configs.recommended turns on in the js config', () => {
		expect(plugin.configs.js).toEqual([
			{
				name: 'tsrx/js-tsrx-files',
				files: ['**/*.tsrx'],
				plugins: { tsrx: plugin },
				rules: {
					'no-unused-vars': 'off',
					'tsrx/no-unused-vars': 'error',
					'no-unreachable': 'off',
					'tsrx/no-unreachable': 'error',
				},
			},
		]);
	});

	const code = `export async function List({ items, n, load }) @{
	<ul>
		@for (const item of items; index i; key await load(item)) { <li>{item}</li> }
		@switch (n) {
			@case 1: { throw new Error('one'); }
			@default: { <i /> }
		}
	</ul>
}
export function f() { return 1; f(); }`;
	const lint = (configs: Linter.Config[]) =>
		new Linter()
			.verify(code, [...configs, { files: ['**/*.tsrx'], languageOptions: { parser } }], 'App.tsrx')
			.map((message) => `${message.line}:${message.column} ${message.ruleId}`);
	// The two rules `js.configs.recommended` turns on that have TSRX versions.
	const base: Linter.Config = {
		rules: { 'no-unused-vars': 'error', 'no-unreachable': 'error' },
	};

	it('reports each problem once when listed after js.configs.recommended', () => {
		expect(lint([base, ...plugin.configs.recommended, ...plugin.configs.js])).toEqual([
			'3:36 tsrx/no-unused-vars',
			'10:33 tsrx/no-unreachable',
		]);
	});

	it('reports problems twice when listed before js.configs.recommended', () => {
		expect(lint([...plugin.configs.recommended, ...plugin.configs.js, base])).toEqual([
			'3:36 no-unused-vars',
			'3:36 tsrx/no-unused-vars',
			'6:14 no-unreachable',
			'10:33 no-unreachable',
			'10:33 tsrx/no-unreachable',
		]);
	});

	it('adds the two TSRX rules on its own', () => {
		expect(lint(plugin.configs.js)).toEqual([
			'3:36 tsrx/no-unused-vars',
			'10:33 tsrx/no-unreachable',
		]);
	});

	it('takes tsrx/no-await-in-loop in place of no-await-in-loop as the README shows', () => {
		expect(
			lint([
				base,
				...plugin.configs.recommended,
				...plugin.configs.js,
				{ rules: { 'no-await-in-loop': 'error' } },
				{
					files: ['**/*.tsrx'],
					rules: { 'no-await-in-loop': 'off', 'tsrx/no-await-in-loop': 'error' },
				},
			]),
		).toEqual([
			'3:36 tsrx/no-unused-vars',
			'3:43 tsrx/no-await-in-loop',
			'10:33 tsrx/no-unreachable',
		]);
	});
});
