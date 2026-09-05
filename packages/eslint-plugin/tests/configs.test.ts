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
		expect(plugin.rules).toHaveProperty('no-style-in-control-flow');
		for (const config of [...plugin.configs.recommended, ...plugin.configs.strict]) {
			expect(config.name).not.toMatch(/ripple/i);
			expect(Object.keys(config.rules ?? {})).not.toContainEqual(expect.stringMatching(/ripple/i));
			expect(config.rules ?? {}).not.toHaveProperty('tsrx/no-style-in-control-flow');
		}
	});
});
