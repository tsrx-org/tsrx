import { createRequire } from 'module';
import noReturnInComponent from './rules/no-return-in-component.js';
import controlFlowJsx from './rules/control-flow-jsx.js';
import noLazyDestructuringInModules from './rules/no-lazy-destructuring-in-modules.js';
import noStyleInControlFlow from './rules/no-style-in-control-flow.js';
import validForOfKey from './rules/valid-for-of-key.js';
import requireStatementContainerBody from './rules/require-statement-container-body.js';

const plugin = {
	meta: {
		name: '@tsrx/eslint-plugin',
		version: '0.1.3',
	},
	rules: {
		'no-return-in-component': noReturnInComponent,
		'control-flow-jsx': controlFlowJsx,
		'no-lazy-destructuring-in-modules': noLazyDestructuringInModules,
		'no-style-in-control-flow': noStyleInControlFlow,
		'valid-for-of-key': validForOfKey,
		'require-statement-container-body': requireStatementContainerBody,
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
		'tsrx/no-lazy-destructuring-in-modules': 'error',
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

export default plugin;
