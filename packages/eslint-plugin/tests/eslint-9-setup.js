// Setup for `vitest.eslint-9.config.js`: fail at once if its alias didn't take,
// so the run can't pass against the catalog's ESLint 10 instead.
import { Linter } from 'eslint';

if (!Linter.version.startsWith('9.')) {
	throw new Error(`Expected ESLint 9 through the eslint-9 alias, got ${Linter.version}`);
}
