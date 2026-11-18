import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { strip_platform_globals } from '../src/declaration-output.js';

/** @param {string} web @param {string} ios @param {string} android */
const generated = (web, ios, android) => `declare global {
    interface ImportMetaEnv {
        readonly platform: string & {
            readonly web: ${web};
            readonly ios: ${ios};
            readonly android: ${android};
        };
    }
    interface ImportMeta {
        readonly [key: \`env\${string}\`]: ImportMetaEnv;
    }
}
`;

const exports = 'export declare function value(): "native" | "web";\nexport {};\n';

describe('strip_platform_globals', () => {
	it('removes the generated block for each flag value type', () => {
		for (const block of [
			generated('true', 'false', 'false'),
			generated('false', 'false', 'true'),
			generated('boolean', 'boolean', 'boolean'),
		]) {
			expect(strip_platform_globals(ts, exports + block)).toBe(exports);
		}
	});

	it('keeps authored augmentations of the same interfaces', () => {
		for (const block of [
			// A library's own platform types, with a plain string index signature.
			`declare global {
    interface ImportMetaEnv {
        readonly platform: 'web' | 'ios';
    }
    interface ImportMeta {
        readonly [key: string]: unknown;
    }
}
`,
			// The generated names with a different platform type.
			generated('true', 'false', 'false').replace('string & {', 'object & {'),
			// The generated block plus an authored member.
			generated('true', 'false', 'false').replace(
				'    interface ImportMeta {',
				'    interface ImportMeta {\n        readonly url: string;',
			),
			`declare global {
    interface Window {
        app: string;
    }
}
`,
		]) {
			expect(strip_platform_globals(ts, exports + block)).toBe(exports + block);
		}
	});
});
