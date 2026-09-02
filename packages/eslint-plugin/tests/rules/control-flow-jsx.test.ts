import { RuleTester } from 'eslint';
import rule from '../../src/rules/control-flow-jsx.js';
import * as parser from '@tsrx/eslint-parser';

const ruleTester = new RuleTester({
	languageOptions: {
		parser,
		parserOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			ecmaFeatures: {
				jsx: true,
			},
		},
	},
});

ruleTester.run('control-flow-jsx', rule, {
	valid: [
		{
			code: `
				const App = () => @{
					const items = ['Item 1', 'Item 2'];
					@for (const item of items) {
						<div>{item}</div>
					}
				};
			`,
		},
		{
			code: `
				const App = () => @{
					const items = [1, 2, 3];
					@for (const item of items) {
						<>
							{item}
						</>
					}
				};
			`,
		},
		{
			code: `
				function utility() {
					for (const item of [1, 2, 3]) {
						console.log(item);
					}
				}
			`,
		},
		{
			code: `
				const App = () => @{
					const items = ['Item 1', 'Item 2'];
					@for (const item of items) {
						<style>
							div { color: red; }
						</style>
						<div>{item}</div>
					}
				};
			`,
		},
		{
			code: `
				const App = () => @{
					const items = ['Item 1', 'Item 2'];
					@for (const item of items) {
						<div>{item}</div>
						<style>
							div { color: red; }
						</style>
					}
				};
			`,
		},
		{
			code: `
				const theme = <style>div { color: red; }</style>;
				const App = () => @{
					const items = ['Item 1', 'Item 2'];
					@for (const item of items) {
						<style apply={theme} />
						<div>{item}</div>
					}
				};
			`,
		},
		{
			code: `
				const App = () => @{
					const items = ['Item 1', 'Item 2'];
					@for (const item of items) {
						@if (item) {
							<style>
								div { color: red; }
							</style>
							<div>{item}</div>
						}
					}
				};
			`,
		},
		{
			code: `
				const App = () => @{
					const items = ['Item 1', 'Item 2'];
					@for (const item of items) {
						<style>
							div { color: red; }
						</style>
					}
				};
			`,
		},
	],
	invalid: [
		{
			code: `
				const App = () => @{
					const items = ['Item 1', 'Item 2'];
					@for (const item of items) {
					}
				};
			`,
			errors: [{ messageId: 'requireJsxInLoop' }],
		},
		{
			code: `
				const App = () => @{
					const items = [1, 2, 3];
					@for (const item of items) {
						const doubled = item * 2;
					}
				};
			`,
			errors: [{ messageId: 'requireJsxInLoop' }],
		},
	],
});
