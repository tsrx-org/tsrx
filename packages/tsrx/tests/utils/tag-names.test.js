import { describe, expect, it } from 'vitest';
import { createElementRefTargetTypeForName, isMathmlTagName, isSvgTagName } from '@tsrx/core';

describe('tag-name predicates', () => {
	it.each(['svg', 'circle', 'foreignObject', 'linearGradient', 'feGaussianBlur'])(
		'recognizes SVG tag %s through the package entry',
		(name) => {
			expect(isSvgTagName(name)).toBe(true);
			expect(isMathmlTagName(name)).toBe(false);
		},
	);

	it.each(['math', 'mi', 'mrow', 'msqrt', 'annotation-xml'])(
		'recognizes MathML tag %s through the package entry',
		(name) => {
			expect(isMathmlTagName(name)).toBe(true);
			expect(isSvgTagName(name)).toBe(false);
		},
	);

	it.each(['a', 'title', 'script', 'style'])(
		'includes shared SVG name %s while preserving HTML-first ref inference',
		(name) => {
			expect(isSvgTagName(name)).toBe(true);
			expect(isMathmlTagName(name)).toBe(false);
			expect(createElementRefTargetTypeForName(name)).toMatchObject({
				objectType: { typeName: { name: 'HTMLElementTagNameMap' } },
			});
			expect(createElementRefTargetTypeForName(name, 'svg')).toMatchObject({
				objectType: { typeName: { name: 'SVGElementTagNameMap' } },
			});
		},
	);

	it.each([
		'div',
		'input',
		'my-element',
		'unknown',
		'',
		'Circle',
		'SVG',
		'foreignobject',
		'Math',
		'MI',
	])('rejects nonmembers and incorrect casing: %s', (name) => {
		expect(isSvgTagName(name)).toBe(false);
		expect(isMathmlTagName(name)).toBe(false);
	});
});
