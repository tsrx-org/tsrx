import { describe, expect, it } from 'vitest';
import {
	review_tsrx_accessibility,
	review_tsrx_components,
	review_tsrx_styles,
} from '../src/index.js';

describe('@tsrx/mcp authoring reviews', () => {
	it('flags source patterns that commonly become Axe failures', () => {
		const result = review_tsrx_accessibility({
			target: 'react',
			filename: 'App.tsrx',
			code: `export function App() { return <>
				<form>
					<button type="submit"></button>
					<input id={\`todo-\${todo.id}\`} type="checkbox" />
				</form>
			}`,
		});

		expect(result.ok).toBe(false);
		expect(result.issues.map((issue) => issue.kind)).toEqual(
			expect.arrayContaining(['button-accessible-name', 'input-accessible-name']),
		);
	});

	it('accepts JSX text and directly named form controls', () => {
		const result = review_tsrx_accessibility({
			target: 'react',
			filename: 'App.tsrx',
			code: `export function App() { return <>
				<form>
					<label htmlFor="todo-input">Todo title</label>
					<input id="todo-input" type="text" />
					<input type="checkbox" aria-label="Mark task as complete" />
					<button type="submit">Add task</button>
				</form>
			</>; }`,
		});

		expect(result.ok).toBe(true);
		expect(result.issues).toEqual([]);
	});

	it('flags style patterns that can hide contrast or produce invalid CSS', () => {
		const result = review_tsrx_styles({
			target: 'react',
			filename: 'App.tsrx',
			code: `export function App() { return <>
				<main class="app-shell">
					<p class="eyebrow">{'Daily Flow'}</p>
				</main>
				<style>
					:scope {
						background: #0f172a;
						color: #7dd3fc;
					}
					* {
						box-sizing: border-box;
					}
				</style>
			</>; }`,
		});

		expect(result.ok).toBe(false);
		expect(result.issues.map((issue) => issue.kind)).toEqual(
			expect.arrayContaining([
				'scope-root-style',
				'contrast-risk-with-scope-background',
				'universal-selector',
			]),
		);
	});

	it('treats a self-closed apply block as style usage', () => {
		const result = review_tsrx_styles({
			target: 'react',
			filename: 'App.tsrx',
			code: `import { theme } from './theme.tsrx';
			export function App() @{
				<style apply={theme} />
				<main class="app-shell">{'Daily Flow'}</main>
			}`,
		});

		expect(result.ok).toBe(true);
		expect(result.issues.map((issue) => issue.kind)).not.toContain('missing-style-block');
		expect(result.issues).toEqual([
			expect.objectContaining({
				kind: 'style-theme',
				severity: 'info',
				snippet: '<style apply={theme} />',
			}),
		]);
		expect(result.issues[0].message).toContain('theme');
		expect(result.issues[0].message).toContain('$class');
	});

	it('does not let a self-closed block swallow a later bodied block', () => {
		const result = review_tsrx_styles({
			target: 'react',
			filename: 'App.tsrx',
			code: `export function App({ dark }) @{
				<style apply={dark ? night : day} />
				<style apply={(t) => t}>
					.title { font-weight: 700; }
				</style>
				<style>
					* { box-sizing: border-box; }
				</style>
				<h1 class="title">{'Daily Flow'}</h1>
			}`,
		});

		const kinds = result.issues.map((issue) => issue.kind);
		expect(kinds).not.toContain('missing-style-block');
		expect(kinds).not.toContain('style-expression-body');
		// The universal selector lives in the third (bodied, un-applied) block; it
		// is only found if the two apply blocks were delimited correctly.
		expect(kinds.filter((kind) => kind === 'universal-selector')).toHaveLength(1);
		expect(kinds.filter((kind) => kind === 'style-theme')).toHaveLength(2);
		expect(result.issues.find((issue) => issue.kind === 'style-theme')?.message).toContain(
			'dark ? night : day',
		);
	});

	it('describes an exported style block as a theme exposing $class', () => {
		const result = review_tsrx_styles({
			target: 'react',
			filename: 'theme.tsrx',
			code: `export const theme = <style>
				.card { padding: 1rem; }
			</style>;`,
		});

		expect(result.ok).toBe(true);
		expect(result.issues).toEqual([
			expect.objectContaining({
				kind: 'style-theme',
				severity: 'info',
				title: 'Exported style block is a theme',
			}),
		]);
		expect(result.issues[0].message).toContain('$class');
	});

	it('does not report a plain assigned class map as a theme', () => {
		const result = review_tsrx_styles({
			target: 'react',
			filename: 'App.tsrx',
			code: `const classes = <style>
				.card { padding: 1rem; }
			</style>;
			export function App() { return <div class={classes.card} />; }`,
		});

		expect(result.issues).toEqual([]);
	});

	it('recommends component extraction for dense generated components', () => {
		const repeated_items = Array.from(
			{ length: 18 },
			(_, index) => `<div class="row-${index}">{'Row ${index}'}</div>`,
		).join('\n');
		const result = review_tsrx_components({
			target: 'react',
			filename: 'App.tsrx',
			code: `export function App() { return <>
				@if (items.length === 0) {
					<p>{'Empty'}</p>
				} @else {
					<ul>
						@for (const item of items; key item.id) {
							@if (item.visible) {
								<li>{item.label}</li>
							}
						}
					</ul>
				}
				@switch (mode) {
					@case 'grid': {
						<section>${repeated_items}</section>
					}
				}
			</>; }`,
		});

		expect(result.ok).toBe(true);
		expect(result.issues.map((issue) => issue.kind)).toContain('control-flow-depth');
	});
});
