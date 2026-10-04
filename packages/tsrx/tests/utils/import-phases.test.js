/** @import * as AST from 'estree' */
import { print } from 'esrap';
import tsx from 'esrap/languages/tsx';
import { describe, expect, it } from 'vitest';
import { parseModule, withDeferredImports } from '../../src/index.js';

/**
 * Parse ordinary imports and give each import the phase, which is the tree
 * that a parser with source phase imports (such as `@tsrx/oxc`) builds.
 *
 * @param {string} source
 * @param {unknown} phase
 * @returns {AST.Program}
 */
function with_phase(source, phase) {
	const ast = /** @type {AST.Program} */ (parseModule(source, 'App.tsrx'));
	/** @param {unknown} node */
	const visit = (node) => {
		if (node === null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		const candidate = /** @type {{ type?: string, phase?: unknown }} */ (node);
		if (candidate.type === 'ImportDeclaration' || candidate.type === 'ImportExpression') {
			candidate.phase = phase;
		}
		for (const [key, value] of Object.entries(node)) {
			if (key !== 'loc' && key !== 'metadata') visit(value);
		}
	};
	visit(ast.body);
	return ast;
}

/** @param {AST.Program} ast */
function print_module(ast) {
	return print(ast, withDeferredImports(tsx())).code;
}

describe('import phases in printed output', () => {
	it('keeps the source phase of an import declaration and an import call', () => {
		const ast = with_phase(
			`import module from './module.wasm';
export const loadSource = import('./later.wasm');`,
			'source',
		);

		expect(print_module(ast)).toBe(
			`import source module from './module.wasm';

export const loadSource = import.source('./later.wasm');`,
		);
	});

	it('keeps the attributes and options of a source phase import', () => {
		const ast = with_phase(
			`import module from './module.wasm' with { type: 'wasm' };
const later = import('./later.wasm', { with: { type: 'wasm' } });`,
			'source',
		);

		expect(print_module(ast)).toBe(
			`import source module from './module.wasm' with { type: 'wasm' };

const later = import.source('./later.wasm', { with: { type: 'wasm' } });`,
		);
	});

	it('keeps the defer phase', () => {
		const ast = /** @type {AST.Program} */ (
			parseModule(
				`import defer * as feature from './feature.js';
const lazy = import.defer('./lazy.js');`,
				'App.tsrx',
			)
		);

		expect(print_module(ast)).toBe(
			`import defer * as feature from './feature.js';

const lazy = import.defer('./lazy.js');`,
		);
	});

	it('prints an import with a null phase as an ordinary import', () => {
		const ast = with_phase(
			`import module from './module.js';
const later = import('./later.js');`,
			null,
		);

		expect(print_module(ast)).toBe(
			`import module from './module.js';

const later = import('./later.js');`,
		);
	});

	it('throws for a source phase import that is not a single default import', () => {
		for (const source of [
			"import { module } from './module.wasm';",
			"import * as module from './module.wasm';",
			"import module, { other } from './module.wasm';",
			"import './module.wasm';",
		]) {
			expect(() => print_module(with_phase(source, 'source')), source).toThrow(
				'`import source` only supports a default import.',
			);
		}
	});

	it('throws for a phase it does not know, instead of printing an ordinary import', () => {
		expect(() => print_module(with_phase("import module from './module.js';", 'module'))).toThrow(
			'Unsupported import phase `module`.',
		);
		expect(() => print_module(with_phase("const later = import('./later.js');", 'module'))).toThrow(
			'Unsupported import phase `module`.',
		);
	});
});
