/**
 * Preload (`node --require`) that makes any load of the `typescript` package
 * fail, to prove that a process runs without TypeScript's JavaScript API: the
 * native TypeScript 7 path must work in a project whose only `typescript` is
 * the native compiler's launcher package.
 */
const Module = require('node:module');

/** @param {string} specifier */
const is_typescript = (specifier) =>
	specifier === 'typescript' ||
	specifier.startsWith('typescript/') ||
	/[\\/]node_modules[\\/]typescript[\\/]/.test(specifier);

Module.registerHooks({
	resolve(specifier, context, next) {
		if (is_typescript(specifier)) {
			throw new Error(
				`The typescript package must not be loaded here (requested ${specifier} from ${context.parentURL ?? 'the entry'})`,
			);
		}
		return next(specifier, context);
	},
});
