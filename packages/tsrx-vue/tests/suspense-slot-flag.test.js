import { describe, expect, it } from 'vitest';
import { compile, compile_to_volar_mappings } from '../src/index.js';

describe('@tsrx/vue Suspense slot flag', () => {
	it.each([
		[
			'@try / @pending',
			`export function App() @{
				@try {
					<span>{'Loaded'}</span>
				} @pending {
					<span>{'Loading'}</span>
				}
			}`,
		],
		[
			'@try / @pending / @catch',
			`export function App() @{
				@try {
					<span>{'Loaded'}</span>
				} @pending {
					<span>{'Loading'}</span>
				} @catch (error) {
					<span>{'Failed'}</span>
				}
			}`,
		],
	])('is in compiled output and not in type-only output: %s', (_name, source) => {
		const type_only = compile_to_volar_mappings(source, 'App.tsrx');

		expect(compile(source, 'App.tsrx').code).toMatch(
			/<\w*Suspense v-slots=\{\{\s*_: 1,\s*default:/,
		);
		expect(type_only.errors).toEqual([]);
		expect(type_only.code).toMatch(/<\w*Suspense v-slots=\{\{\s*default:/);
		expect(type_only.code).not.toMatch(/\b_:/);
	});
});
