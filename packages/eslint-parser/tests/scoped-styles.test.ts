import { describe, expect, it } from 'vitest';
import { Linter } from 'eslint';
import * as parser from '../src/index.ts';
import { parseForESLint } from '../src/index.ts';

const code = `const theme = <style>div{}</style>;
export function A() @{
	<style apply={theme} />
	<div/>
}`;

function find_style_elements(node: any, found: any[] = [], seen = new Set<any>()): any[] {
	if (!node || typeof node !== 'object' || seen.has(node)) return found;
	seen.add(node);
	if (node.type === 'JSXStyleElement') found.push(node);
	for (const key of Object.keys(node)) {
		if (key === 'parent' || key === 'loc' || key === 'range') continue;
		const value = node[key];
		if (Array.isArray(value)) {
			for (const child of value) find_style_elements(child, found, seen);
		} else if (value && typeof value === 'object') {
			find_style_elements(value, found, seen);
		}
	}
	return found;
}

describe('eslint-parser scoped styles', () => {
	it('parses a self-closed <style apply /> as a childless JSXStyleElement sibling', () => {
		const result = parseForESLint(code, { filePath: 'App.tsrx' });
		const component = (result.ast.body[1] as any).declaration;
		expect(component.type).toBe('FunctionDeclaration');
		expect(component.body.type).toBe('JSXCodeBlock');

		const applied = component.body.body.find((node: any) => node.type === 'JSXStyleElement');
		expect(applied).toBeDefined();
		expect(applied.openingElement.selfClosing).toBe(true);
		expect(applied.children).toEqual([]);
		expect(applied.openingElement.attributes).toHaveLength(1);
		expect(applied.openingElement.attributes[0].name.name).toBe('apply');
		expect(applied.openingElement.attributes[0].value.type).toBe('JSXExpressionContainer');
		expect(applied.openingElement.attributes[0].value.expression).toMatchObject({
			type: 'Identifier',
			name: 'theme',
		});

		// The <style> sibling stays in the code block body; the render node is the output.
		expect(component.body.render.type).toBe('JSXElement');
		expect(find_style_elements(result.ast)).toHaveLength(2);
	});

	it('records a scope reference to the apply target so no-unused-vars sees it', () => {
		const apply_start = code.indexOf('apply={theme}') + 'apply={'.length;
		const apply_end = apply_start + 'theme'.length;
		let apply_reference: any = null;
		let theme_variable: any = null;

		const linter = new Linter();
		const messages = linter.verify(
			code,
			{
				files: ['**/*.tsrx'],
				languageOptions: { parser },
				plugins: {
					test: {
						rules: {
							'capture-scope': {
								create(context: any) {
									return {
										Program() {
											for (const scope of context.sourceCode.scopeManager.scopes) {
												theme_variable = scope.set.get('theme');
												if (theme_variable) break;
											}
											apply_reference = theme_variable?.references.find(
												(reference: any) =>
													reference.identifier.range[0] === apply_start &&
													reference.identifier.range[1] === apply_end,
											);
										},
									};
								},
							},
						},
					},
				},
				rules: {
					'test/capture-scope': 'error',
					'no-unused-vars': 'error',
				},
			},
			'App.tsrx',
		);

		expect(theme_variable).toBeDefined();
		expect(apply_reference).toBeDefined();
		expect(apply_reference.identifier.name).toBe('theme');
		expect(apply_reference.isRead()).toBe(true);
		expect(messages.map((message) => message.message)).toEqual([]);

		// Control: without the apply reference the same setup reports the unused style.
		const unused_messages = linter.verify(
			code.replace('<style apply={theme} />', ''),
			{
				files: ['**/*.tsrx'],
				languageOptions: { parser },
				rules: { 'no-unused-vars': 'error' },
			},
			'App.tsrx',
		);
		expect(unused_messages.map((message) => message.message)).toEqual([
			"'theme' is assigned a value but never used.",
		]);
	});
});
