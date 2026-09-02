import { RuleTester } from 'eslint';
import rule from '../../src/rules/require-statement-container-body.js';
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

ruleTester.run('require-statement-container-body', rule, {
	valid: [
		{
			code: `
				export function UserBadge({ user }: UserBadgeProps): JSX.Element @{
					const initials = user.name.slice(0, 2).toUpperCase();

					<button title={user.name}>{initials}</button>
				}
			`,
		},
		{
			code: `
				export function UserBadge({ user }: UserBadgeProps): JSX.Element {
					return <span>{user.name}</span>;
				}
			`,
		},
		{
			code: `
				export function runTask() {
					const value = 1;
					console.log(value);
				}
			`,
		},
		{
			code: `
				export function UserBadge({ user }: UserBadgeProps): JSX.Element {
					<span>{user.name}</span>;

					const initials = user.name.slice(0, 2).toUpperCase();
					console.log(initials);
				}
			`,
		},
		{
			code: `
				export function UserBadge({ user }: UserBadgeProps): JSX.Element {
					<span>{user.name}</span>;
					<strong>{user.role}</strong>;
				}
			`,
		},
		{
			code: `
				export function UserBadge({ user }: UserBadgeProps): JSX.Element @{
					const initials = user.name.slice(0, 2).toUpperCase();
					<style>
						button { color: red; }
					</style>
					<button title={user.name}>{initials}</button>
				}
			`,
		},
		{
			code: `
				export function UserBadge({ user }: UserBadgeProps): JSX.Element @{
					const initials = user.name.slice(0, 2).toUpperCase();
					<button title={user.name}>{initials}</button>
					<style>
						button { color: red; }
					</style>
				}
			`,
		},
		{
			code: `
				const theme = <style>button { color: red; }</style>;
				export function UserBadge({ user }: UserBadgeProps): JSX.Element @{
					const initials = user.name.slice(0, 2).toUpperCase();
					<style apply={theme} />
					<button title={user.name}>{initials}</button>
				}
			`,
		},
		{
			code: `
				export function UserBadge({ user }: UserBadgeProps): JSX.Element @{
					const initials = user.name.slice(0, 2).toUpperCase();
					@if (user) {
						<style>
							button { color: red; }
						</style>
						<button title={user.name}>{initials}</button>
					}
				}
			`,
		},
		{
			code: `
				export function UserBadge({ user }: UserBadgeProps): JSX.Element @{
					const initials = user.name.slice(0, 2).toUpperCase();
					console.log(initials);
					<style>
						button { color: red; }
					</style>
				}
			`,
		},
		{
			// A plain block with only style blocks has no template output to report.
			code: `
				export function UserBadge({ user }: UserBadgeProps): JSX.Element {
					const initials = user.name.slice(0, 2).toUpperCase();
					console.log(initials);
					<style>
						button { color: red; }
					</style>
				}
			`,
		},
	],
	invalid: [
		{
			code: `
				export function UserBadge({ user }: UserBadgeProps): JSX.Element {
					if (!user) {
						return <span class="muted">Signed out</span>;
					}

					const initials = user.name.slice(0, 2).toUpperCase();

					<button title={user.name}>{initials}</button>
				}
			`,
			output: `
				export function UserBadge({ user }: UserBadgeProps): JSX.Element @{
					if (!user) {
						return <span class="muted">Signed out</span>;
					}

					const initials = user.name.slice(0, 2).toUpperCase();

					<button title={user.name}>{initials}</button>
				}
			`,
			errors: [
				{
					messageId: 'requireStatementContainerBody',
				},
			],
		},
		{
			code: `
				const UserBadge = ({ user }: UserBadgeProps): JSX.Element => {
					const initials = user.name.slice(0, 2).toUpperCase();

					<button title={user.name}>{initials}</button>
				};
			`,
			output: `
				const UserBadge = ({ user }: UserBadgeProps): JSX.Element => @{
					const initials = user.name.slice(0, 2).toUpperCase();

					<button title={user.name}>{initials}</button>
				};
			`,
			errors: [
				{
					messageId: 'requireStatementContainerBody',
				},
			],
		},
		{
			code: `
				export function UserBadge({ user }: UserBadgeProps): JSX.Element {
					const initials = user.name.slice(0, 2).toUpperCase();
					<style>
						button { color: red; }
					</style>
					<button title={user.name}>{initials}</button>
				}
			`,
			output: `
				export function UserBadge({ user }: UserBadgeProps): JSX.Element @{
					const initials = user.name.slice(0, 2).toUpperCase();
					<style>
						button { color: red; }
					</style>
					<button title={user.name}>{initials}</button>
				}
			`,
			errors: [
				{
					messageId: 'requireStatementContainerBody',
				},
			],
		},
		{
			code: `
				const theme = <style>button { color: red; }</style>;
				export function UserBadge({ user }: UserBadgeProps): JSX.Element {
					const initials = user.name.slice(0, 2).toUpperCase();
					<button title={user.name}>{initials}</button>;
					<style apply={theme} />;
				}
			`,
			output: `
				const theme = <style>button { color: red; }</style>;
				export function UserBadge({ user }: UserBadgeProps): JSX.Element @{
					const initials = user.name.slice(0, 2).toUpperCase();
					<button title={user.name}>{initials}</button>;
					<style apply={theme} />;
				}
			`,
			errors: [
				{
					messageId: 'requireStatementContainerBody',
				},
			],
		},
	],
});
