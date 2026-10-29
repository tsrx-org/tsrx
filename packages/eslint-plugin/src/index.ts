import { createRequire } from 'module';
import noReturnInComponent from './rules/no-return-in-component.js';
import controlFlowJsx from './rules/control-flow-jsx.js';
import validForOfKey from './rules/valid-for-of-key.js';
import requireStatementContainerBody from './rules/require-statement-container-body.js';
import noUnusedVars from './rules/no-unused-vars.js';
import noAwaitInLoop from './rules/no-await-in-loop.js';
import noUnreachable from './rules/no-unreachable.js';

const plugin = {
	meta: {
		name: '@tsrx/eslint-plugin',
		version: '0.1.3',
	},
	rules: {
		'no-return-in-component': noReturnInComponent,
		'control-flow-jsx': controlFlowJsx,
		'valid-for-of-key': validForOfKey,
		'require-statement-container-body': requireStatementContainerBody,
		'no-unused-vars': noUnusedVars,
		'no-await-in-loop': noAwaitInLoop,
		'no-unreachable': noUnreachable,
	},
	configs: {} as any,
};

// Try to load optional parsers
const require = createRequire(import.meta.url);

let tsrxParser: any;
let tsParser: any;

try {
	tsrxParser = require('@tsrx/eslint-parser');
} catch {
	// @tsrx/eslint-parser is optional
	tsrxParser = null;
}

try {
	tsParser = require('@typescript-eslint/parser');
} catch {
	// @typescript-eslint/parser is optional
	tsParser = null;
}

// Helper to create config objects
function createConfig(name: string, files: string[], parser: any, isTsrx: boolean) {
	const rules: Record<string, string> = {
		'tsrx/control-flow-jsx': 'error',
		'tsrx/valid-for-of-key': 'error',
	};

	if (isTsrx) {
		rules['tsrx/require-statement-container-body'] = 'error';
	}

	const config: any = {
		name,
		files,
		plugins: {
			tsrx: plugin,
		},
		rules,
	};

	// Only add parser if it's available
	if (parser) {
		config.languageOptions = {
			parser,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
			},
		};
	}

	return config;
}

// Recommended configuration (flat config format)
plugin.configs.recommended = [
	createConfig('tsrx/recommended-tsrx-files', ['**/*.tsrx'], tsrxParser, true),
	createConfig('tsrx/recommended-typescript-files', ['**/*.ts', '**/*.tsx'], tsParser, false),
	{
		name: 'tsrx/ignores',
		ignores: ['**/*.d.ts', '**/node_modules/**', '**/dist/**', '**/build/**'],
	},
];

// Strict configuration (flat config format)
plugin.configs.strict = [
	createConfig('tsrx/strict-tsrx-files', ['**/*.tsrx'], tsrxParser, true),
	createConfig('tsrx/strict-typescript-files', ['**/*.ts', '**/*.tsx'], tsParser, false),
	{
		name: 'tsrx/ignores',
		ignores: ['**/*.d.ts', '**/node_modules/**', '**/dist/**', '**/build/**'],
	},
];

// For `js.configs.recommended` users, listed after it: the TSRX versions of the
// core rules it turns on. A config can't read the severity another gives the
// core rule, so each is an error, as `js.configs.recommended` has it.
plugin.configs.js = [
	{
		name: 'tsrx/js-tsrx-files',
		files: ['**/*.tsrx'],
		plugins: {
			tsrx: plugin,
		},
		rules: {
			'no-unused-vars': 'off',
			'tsrx/no-unused-vars': 'error',
			'no-unreachable': 'off',
			'tsrx/no-unreachable': 'error',
		},
	},
];

export default plugin;
