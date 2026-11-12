import { createRequire } from 'module';
import noReturnInComponent from './rules/no-return-in-component.js';
import controlFlowJsx from './rules/control-flow-jsx.js';
import validForOfKey from './rules/valid-for-of-key.js';
import requireStatementContainerBody from './rules/require-statement-container-body.js';
import jsxCurlyBracePresence from './rules/jsx-curly-brace-presence.js';

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
		'jsx-curly-brace-presence': jsxCurlyBracePresence,
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

// For eslint-plugin-react users, listed after react's configurations: its
// `jsx-curly-brace-presence` unwraps strings that TSRX text reads as syntax, so
// `.tsrx` files get the TSRX version. A rule that is off needs no plugin.
plugin.configs.react = [
	{
		name: 'tsrx/react-tsrx-files',
		files: ['**/*.tsrx'],
		plugins: {
			tsrx: plugin,
		},
		rules: {
			'tsrx/jsx-curly-brace-presence': 'error',
			'react/jsx-curly-brace-presence': 'off',
		},
	},
];

export default plugin;
