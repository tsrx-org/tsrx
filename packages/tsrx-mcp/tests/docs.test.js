import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generate_docs_index, generated_docs_path } from '../scripts/generate-docs-index.js';
import {
	find_documentation_section,
	find_similar_documentation_sections,
	list_documentation_sections,
} from '../src/index.js';

describe('@tsrx/mcp documentation index', () => {
	it('contains the core target-neutral sections', () => {
		const slugs = list_documentation_sections().map((section) => section.slug);

		expect(slugs).toEqual(
			expect.arrayContaining(['overview', 'components', 'expression-values', 'target-integration']),
		);
	});

	it('includes generated specification grammar in language sections', () => {
		const legacy_expression_node = ['Tsrx', 'Expression'].join('');
		expect(find_documentation_section('components')?.content ?? '').toContain(
			'export function Button',
		);
		expect(find_documentation_section('components')?.content ?? '').toContain('@{');
		expect(find_documentation_section('components')?.content ?? '').toContain(
			'add the missing `@` before the opening brace',
		);
		expect(find_documentation_section('expression-values')?.content ?? '').toContain(
			'PrimaryExpression',
		);
		expect(find_documentation_section('expression-values')?.content ?? '').toContain('JSXElement');
		expect(find_documentation_section('expression-values')?.content ?? '').not.toContain('tsx:');
		expect(find_documentation_section('expression-values')?.content ?? '').not.toContain(
			legacy_expression_node,
		);
		expect(find_documentation_section('overview')?.content ?? '').toContain(
			'every directive body uses a `{...}` template block',
		);
	});

	it('documents component loop control-flow rules', () => {
		const content = find_documentation_section('control-flow')?.content ?? '';

		expect(content).toContain(' { ... }');
		expect(content).toContain('`return` statements are not template output');
		expect(content).toContain('Inside TSRX `@if` branches and `@for ... of` loops');
		expect(content).toContain('direct `continue`, `break`, and `return` statements are invalid');
		expect(content).toContain('both `break` and `return` are invalid');
		expect(content).toContain('Regular `for`, `for...in`, `while`, and `do...while`');
	});

	it('documents the dynamic tag syntax and removed dynamic forms', () => {
		const content = find_documentation_section('dynamic-elements-and-components')?.content ?? '';

		expect(content).toContain('`<{expression}>`');
		expect(content).toContain('`</{expression}>`');
		expect(content).toContain('No import is required');
		expect(content).toContain('The tag expression can be a string tag name or a component value');
		expect(content).toContain('Do not use removed dynamic tag syntax');
		expect(content).toContain('do not import a runtime `Dynamic` component with an `is` prop');
		expect(content).not.toContain('<Dynamic is=');
	});

	it('makes host server profiles discoverable to MCP clients', () => {
		for (const query of ['octane', 'octane rpc', 'server functions']) {
			expect(find_similar_documentation_sections(query).map((section) => section.slug)).toContain(
				'style-and-server',
			);
		}

		const content = find_documentation_section('style-and-server')?.content ?? '';
		expect(content).toContain('Ripple and Octane host profiles');
		expect(content).toContain('https://octanejs.dev/llms.txt');
		expect(content).toContain('does not expose an Octane target');
	});

	it('documents sibling-scoped style blocks, $class, and apply', () => {
		for (const query of [
			'scoped css',
			'sibling scope',
			'$class',
			'apply',
			'themes',
			'style diagnostics',
		]) {
			expect(find_similar_documentation_sections(query).map((section) => section.slug)).toContain(
				'style-and-server',
			);
		}

		const content = find_documentation_section('style-and-server')?.content ?? '';

		// Grammar extracted from the specification.
		expect(content).toContain('<style JSXAttributesopt> CSSSource </style>');
		expect(content).toContain('<style JSXAttributesopt />');
		expect(content).toContain('StyleApplyValue :');
		expect(content).toContain('StyleApplyTarget . IdentifierName');

		// Scope model.
		expect(content).toContain('that children list is its sibling scope');
		expect(content).toContain('never styles the element that contains it');
		expect(content).toContain('require a hash class');
		expect(content).toContain('share one hash class');
		expect(content).toContain('outer first');
		expect(content).toContain('always part of the file');
		expect(content).toContain('A standalone block at module scope is an error');

		// $class, themes, and apply.
		expect(content).toContain('`$class`');
		expect(content).toContain('<style apply={theme} />');
		expect(content).toContain('class={theme.$class}');
		// Opting elements in with $class (the spec's STYLE_THEME_EXAMPLE card.tsrx section).
		expect(content).toContain('<Card parentClass={palette.$class} />');
		expect(content).toContain('palette.$class is read, so palette is a theme');
		expect(content).toContain('is a theme and keeps every selector');
		expect(content).toContain('declared before the applying block');

		// Static constraints with their diagnostic codes.
		for (const code of [
			'tsrx-style-standalone-at-module-scope',
			'tsrx-style-standalone-outside-template',
			'tsrx-style-unknown-attribute',
			'tsrx-style-apply-value',
			'tsrx-style-apply-duplicate',
			'tsrx-style-apply-unsupported-host',
			'tsrx-style-apply-target',
			'tsrx-style-apply-before-declaration',
			'tsrx-style-reserved-class-key',
			'tsrx-css-global-placement',
		]) {
			expect(content).toContain(code);
		}

		// Precedence rules.
		expect(content).toContain('Outer before inner');
		expect(content).toContain('Applied theme before the block that applies it');
		expect(content).toContain('Source order within a scope');
	});

	it('documents direct runtime dependencies for every standalone target runtime', () => {
		const content = find_documentation_section('target-integration')?.content ?? '';

		expect(content).toContain("`runtimeImports: 'direct'`");
		expect(content).toContain('`@tsrx/react-runtime`');
		expect(content).toContain('`@tsrx/preact-runtime`');
		expect(content).toContain('`@tsrx/solid-runtime`');
		expect(content).toContain('`@tsrx/vue-runtime`');
		expect(content).toContain('direct production dependency');
		expect(content).toContain('do not provide the runtime package');
	});

	it('keeps the checked-in generated docs fresh', async () => {
		expect(readFileSync(generated_docs_path, 'utf8')).toBe(await generate_docs_index());
	});
});
