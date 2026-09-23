import { describe, expect, it } from 'vitest';
import { check_types } from '../shared/type-diagnostics.js';

/**
 * The published types augment the shared `estree` module, so they merge with
 * every other augmentation in a consumer's program. Merged interface members
 * must agree on their modifiers and types, so a member core declares
 * differently from another package fails that consumer's typecheck.
 */

// Verbatim from rollup 4's `dist/rollup.d.ts` (4.59 through 4.63). Rollup's
// parser always emits `decorators`, so it declares the property required.
const ROLLUP_ESTREE_AUGMENTATION = `import type * as estree from 'estree';

declare module 'estree' {
	export interface Decorator extends estree.BaseNode {
		type: 'Decorator';
		expression: estree.Expression;
	}
	interface PropertyDefinition {
		decorators: estree.Decorator[];
	}
	interface MethodDefinition {
		decorators: estree.Decorator[];
	}
	interface BaseClass {
		decorators: estree.Decorator[];
	}
}`;

describe('estree augmentation compatibility', () => {
	it("merges with rollup's estree augmentation", () => {
		const { errors } = check_types(`import type {} from './types/index';
${ROLLUP_ESTREE_AUGMENTATION}`);

		expect(errors).toEqual([]);
	});
});
