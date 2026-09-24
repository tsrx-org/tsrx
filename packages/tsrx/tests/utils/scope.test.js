import { describe, expect, it } from 'vitest';
import { walk } from 'zimmerframe';
import { createScopes, isSubmoduleDeclaration, parseModule, ScopeRoot } from '../../src/index.js';

/** @param {string} source */
function module_scopes(source) {
	const ast = parseModule(source, 'App.tsrx');
	const { scopes } = createScopes(ast, new ScopeRoot(), null, {
		filename: 'App.tsrx',
		collect: false,
		errors: [],
	});
	/** @type {string[]} */
	const found = [];
	for (const [node, scope] of scopes) {
		if (node.type !== 'TSModuleDeclaration' || node.id.type !== 'Identifier') continue;
		const binding = scope.parent?.declarations.get(node.id.name);
		found.push(
			`${node.id.name}: server_block=${scope.server_block}, binding=${binding?.declaration_kind ?? 'none'}`,
		);
	}
	return found;
}

/** @param {string} source */
function submodule_names(source) {
	/** @type {string[]} */
	const names = [];
	walk(/** @type {import('estree').Node} */ (parseModule(source, 'App.tsrx')), null, {
		TSModuleDeclaration(node, { path, next }) {
			if (isSubmoduleDeclaration(node, path) && node.id.type === 'Identifier') {
				names.push(node.id.name);
			}
			next();
		},
	});
	return names;
}

describe('createScopes module declarations', () => {
	it('merges two `module` blocks in a declare namespace like `namespace` blocks', () => {
		const expected = [
			'A: server_block=false, binding=none',
			'B: server_block=false, binding=none',
			'B: server_block=false, binding=none',
		];

		expect(
			module_scopes(
				'declare namespace A { module B { const x: number; } module B { const y: number; } }',
			),
		).toEqual(expected);
		expect(
			module_scopes(
				'declare namespace A { namespace B { const x: number; } namespace B { const y: number; } }',
			),
		).toEqual(expected);
	});

	it.each([
		['declare module A.B { const x: number; }', ['A', 'B']],
		['declare module A.B.C { const x: number; }', ['A', 'B', 'C']],
		['declare namespace A { module B { const x: number; } }', ['A', 'B']],
		['declare namespace A { namespace B { module C { const x: number; } } }', ['A', 'B', 'C']],
		['declare global { module B { const x: number; } }', ['global', 'B']],
	])('scopes the `module` parts of %s as namespaces', (source, names) => {
		expect(module_scopes(source)).toEqual(
			names.map((name) => `${name}: server_block=false, binding=none`),
		);
		expect(submodule_names(source)).toEqual([]);
	});

	it.each([
		['module server { const x = 1; }', ['server: server_block=true, binding=module']],
		[
			'module A.B { const x = 1; }',
			['A: server_block=true, binding=module', 'B: server_block=false, binding=none'],
		],
		[
			'namespace A { module B { const x = 1; } }',
			['A: server_block=false, binding=none', 'B: server_block=true, binding=module'],
		],
	])('keeps the submodule in %s', (source, expected) => {
		expect(module_scopes(source)).toEqual(expected);
	});

	it('reports only the outermost part of a dotted non-ambient `module` as a submodule', () => {
		expect(submodule_names('module A.B.C { const x = 1; }')).toEqual(['A']);
		expect(submodule_names('namespace A { module B.C { const x = 1; } }')).toEqual(['B']);
	});
});
