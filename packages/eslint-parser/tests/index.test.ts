import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '@tsrx/core';
import { parseForESLint } from '../src/index.ts';

describe('eslint-parser', () => {
	it('throws collected broken-markup diagnostics as ESLint parse errors', () => {
		expect(() =>
			parseForESLint(`export function App() { return <div><span></div>; }`, {
				filePath: 'App.tsrx',
			}),
		).toThrow(/Expected closing tag to match opening tag/);
	});

	it('reports an unclosed tag at its name, the innermost one first', () => {
		let thrown: any;
		try {
			parseForESLint('export function App() @{\n\t<main><section>\n}\n', {
				filePath: 'App.tsrx',
			});
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(SyntaxError);
		expect(thrown.message).toContain("Unclosed tag '<section>'");
		expect([thrown.lineNumber, thrown.column]).toEqual([2, 9]);
	});

	it('keeps forgotten statement-container hints available to ESLint rules', () => {
		const result = parseForESLint(
			`export function UserBadge({ user }: UserBadgeProps): JSX.Element {
				const initials = user.name.slice(0, 2).toUpperCase();

				<button title={user.name}>{initials}</button>
			}`,
			{ filePath: 'App.tsrx' },
		);

		expect(result.ast.type).toBe('Program');
		expect(result.services?.tsrxDiagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: DIAGNOSTIC_CODES.FORGOTTEN_STATEMENT_CONTAINER,
				}),
			]),
		);
	});
});
