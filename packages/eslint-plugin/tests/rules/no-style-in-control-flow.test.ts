import { RuleTester } from 'eslint';
import rule from '../../src/rules/no-style-in-control-flow.js';
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

ruleTester.run('no-style-in-control-flow', rule, {
	valid: [
		{
			code: `
				function App() @{
					<>
						<style>
							.status { padding: 0.5rem; }
						</style>
						<section class="status">Ready</section>
					</>
				}
			`,
		},
		{
			code: `
				const theme = <style>.ok { color: green; }</style>;
				function App({ ready }: { ready: boolean }) @{
					<>
						<style>
							.status { padding: 0.5rem; }
						</style>
						<section class="status">
							@if (ready) {
								<>
									<style apply={theme} />
									<p class="ok">Ready</p>
								</>
							}
						</section>
					</>
				}
			`,
		},
		{
			code: `
				function App({ items }: { items: string[] }) @{
					<>
						<style>
							.row { display: block; }
						</style>
						@for (const item of items) {
							<div class="row">{item}</div>
						}
					</>
				}
			`,
		},
		{
			code: `
				function App() @{
					@try {
						<div>Ok</div>
					} @catch (error) {
						<p>Failed</p>
					}
				}
			`,
		},
		{
			code: `
				function App({ ready }: { ready: boolean }) @{
					@if (ready) {
						const Inner = function Inner() @{
							<>
								<style>
									.ok { color: green; }
								</style>
								<p class="ok">Ready</p>
							</>
						};
						<Inner />
					}
				}
			`,
		},
	],
	invalid: [
		{
			code: `
				function App({ ready }: { ready: boolean }) @{
					<section>
						@if (ready) {
							<>
								<style>
									.ok { color: green; }
								</style>
								<p class="ok">Ready</p>
							</>
						}
					</section>
				}
			`,
			errors: [{ messageId: 'styleInControlFlow' }],
		},
		{
			code: `
				function App({ ready }: { ready: boolean }) @{
					@if (ready) {
						<p>Ready</p>
					} @else {
						<>
							<style>
								.wait { color: gray; }
							</style>
							<p class="wait">Waiting</p>
						</>
					}
				}
			`,
			errors: [{ messageId: 'styleInControlFlow' }],
		},
		{
			code: `
				function App({ status }: { status: string }) @{
					@if (status === 'ok') {
						<p>Ready</p>
					} @else if (status === 'wait') {
						<>
							<style>
								.wait { color: gray; }
							</style>
							<p class="wait">Waiting</p>
						</>
					}
				}
			`,
			errors: [{ messageId: 'styleInControlFlow' }],
		},
		{
			code: `
				function App({ items }: { items: string[] }) @{
					@for (const item of items) {
						<>
							<style>
								.row { color: blue; }
							</style>
							<div class="row">{item}</div>
						</>
					}
				}
			`,
			errors: [{ messageId: 'styleInControlFlow' }],
		},
		{
			code: `
				function App({ items }: { items: string[] }) @{
					@for (const item of items) {
						<div>{item}</div>
					} @empty {
						<>
							<style>
								.empty { color: gray; }
							</style>
							<p class="empty">None</p>
						</>
					}
				}
			`,
			errors: [{ messageId: 'styleInControlFlow' }],
		},
		{
			code: `
				function App() @{
					@try {
						<>
							<style>
								.ok { color: green; }
							</style>
							<div class="ok">Ok</div>
						</>
					} @catch (error) {
						<p>Failed</p>
					}
				}
			`,
			errors: [{ messageId: 'styleInControlFlow' }],
		},
		{
			code: `
				function App() @{
					@try {
						<div>Ok</div>
					} @catch (error) {
						<>
							<style>
								.err { color: red; }
							</style>
							<p class="err">Failed</p>
						</>
					}
				}
			`,
			errors: [{ messageId: 'styleInControlFlow' }],
		},
		{
			code: `
				function App({ ready }: { ready: boolean }) @{
					@if (ready) {
						const theme = <style>.ok { color: green; }</style>;
						<>
							<style apply={theme} />
							<p class="ok">Ready</p>
						</>
					}
				}
			`,
			errors: [{ messageId: 'styleInControlFlow' }],
		},
		{
			code: `
				function App({ ready }: { ready: boolean }) @{
					<section>
						@if (ready) {
							<div>
								<style>
									.ok { color: green; }
								</style>
								<p class="ok">Ready</p>
							</div>
						}
					</section>
				}
			`,
			errors: [{ messageId: 'styleInControlFlow' }],
		},
	],
});
