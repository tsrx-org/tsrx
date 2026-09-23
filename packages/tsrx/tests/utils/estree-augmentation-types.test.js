import { describe, expect, it } from 'vitest';
import { check_types } from '../shared/type-diagnostics.js';

/**
 * ESTree's decorators extension gives classes, methods, and properties a
 * `decorators` array. The published types add it to the shared `estree`
 * module, where it merges with every other declaration of the extension in a
 * consumer's program. Merged members must match exactly, so declaring the
 * property optional fails any program that also declares the array.
 */

// The extension's array, declared on the shared estree interfaces.
const DECORATORS_EXTENSION = `import type * as estree from 'estree';

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

describe('estree decorators extension types', () => {
	it('merges with another declaration of the decorators extension', () => {
		const { errors } = check_types(`import type {} from './types/index';
${DECORATORS_EXTENSION}`);

		expect(errors).toEqual([]);
	});
});
