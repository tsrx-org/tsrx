import { RenderRoute, ServerRoute } from '@ripple-ts/vite-plugin';
import { compile as compile_preact } from '@tsrx/preact';
import * as tsrx_prettier_plugin from '@tsrx/prettier-plugin';
import { compile as compile_react } from '@tsrx/react';
import { compile as compile_ripple } from '@tsrx/ripple';
import { compile as compile_solid } from '@tsrx/solid';
import { compile as compile_vue } from '@tsrx/vue';
import { compile as compile_octane } from 'octane/compiler';
import { format } from 'prettier';

const MAX_SOURCE_LENGTH = 12000;
const VALID_TARGETS = ['octane', 'react', 'preact', 'ripple', 'solid', 'vue'] as const;

/**
 * Octane inlines every stylesheet as an `_$injectStyle(hash, css)` call instead
 * of returning `css` beside the code. Both arguments are plain string literals.
 */
const OCTANE_INJECT_STYLE_PATTERN =
	/_\$injectStyle\(\s*(?:"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*')\s*,\s*("(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*')\s*\)/g;
const STRING_ESCAPE_PATTERN =
	/\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|\r\n|([\s\S]))/g;
const SIMPLE_ESCAPES: Record<string, string> = {
	n: '\n',
	r: '\r',
	t: '\t',
	b: '\b',
	f: '\f',
	v: '\v',
	0: '\0',
	'\n': '',
	'\u2028': '',
	'\u2029': '',
};

type CompileTarget = (typeof VALID_TARGETS)[number];

function is_valid_target(target: string): target is CompileTarget {
	return VALID_TARGETS.includes(target as CompileTarget);
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function get_error_message(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return 'Compilation failed.';
}

/**
 * @param {string} code
 * @returns {Promise<string>}
 */
async function format_js(code: string) {
	try {
		return await format(code, {
			parser: 'babel-ts',
			useTabs: false,
			tabWidth: 2,
			singleQuote: true,
			printWidth: 80,
		});
	} catch {
		return code;
	}
}

/**
 * @param {string} css
 * @returns {Promise<string>}
 */
async function format_css(css: string) {
	if (!css.trim()) return '';
	try {
		return await format(css, { parser: 'css', useTabs: false, tabWidth: 2, printWidth: 80 });
	} catch {
		return css;
	}
}

/**
 * Decode a JavaScript string literal token, quotes included.
 *
 * @param {string} literal
 * @returns {string}
 */
function decode_string_literal(literal: string) {
	return literal
		.slice(1, -1)
		.replace(STRING_ESCAPE_PATTERN, (_match, code_point, utf16, hex, char) => {
			if (code_point !== undefined) return String.fromCodePoint(parseInt(code_point, 16));
			if (utf16 !== undefined) return String.fromCharCode(parseInt(utf16, 16));
			if (hex !== undefined) return String.fromCharCode(parseInt(hex, 16));
			if (char === undefined) return '';
			return SIMPLE_ESCAPES[char] ?? char;
		});
}

/**
 * The stylesheets Octane inlined into `code`, in injection order.
 *
 * @param {string} code
 * @returns {string}
 */
function extract_octane_css(code: string) {
	const sheets: string[] = [];
	for (const match of code.matchAll(OCTANE_INJECT_STYLE_PATTERN)) {
		sheets.push(decode_string_literal(match[1]));
	}
	return sheets.join('\n');
}

/**
 * @param {string} target
 * @param {string} source
 */
async function compile_target(target: CompileTarget, source: string) {
	if (target === 'octane') {
		const octane_result = compile_octane(source, 'LiveDemo.tsrx');

		return {
			target,
			output: {
				code: await format_js(octane_result.code),
				css: await format_css(extract_octane_css(octane_result.code)),
			},
		};
	}

	if (target === 'react') {
		const react_result = compile_react(source, 'LiveDemo.tsrx');

		return {
			target,
			output: {
				code: await format_js(react_result.code),
				css: await format_css(react_result.css),
			},
		};
	}

	if (target === 'preact') {
		const preact_result = compile_preact(source, 'LiveDemo.tsrx');

		return {
			target,
			output: {
				code: await format_js(preact_result.code),
				css: await format_css(preact_result.css),
			},
		};
	}

	if (target === 'solid') {
		const solid_result = compile_solid(source, 'LiveDemo.tsrx');

		return {
			target,
			output: {
				code: await format_js(solid_result.code),
				css: await format_css(solid_result.css),
			},
		};
	}

	if (target === 'vue') {
		const vue_result = compile_vue(source, 'LiveDemo.tsrx');

		return {
			target,
			output: {
				code: await format_js(vue_result.code),
				css: await format_css(vue_result.css),
			},
		};
	}

	const ripple_result = compile_ripple(source, 'LiveDemo.tsrx');

	return {
		target,
		output: {
			code: await format_js(ripple_result.code),
			css: await format_css(ripple_result.css),
		},
	};
}

/**
 * @param {string} source
 * @returns {Promise<string>}
 */
async function format_tsrx(source: string) {
	return await format(source, {
		parser: 'tsrx',
		plugins: [tsrx_prettier_plugin as any],
		useTabs: false,
		tabWidth: 2,
		singleQuote: true,
		printWidth: 100,
	});
}

const layout = '/src/components/layout.tsrx';

export const routes = [
	new RenderRoute({ path: '/', entry: '/src/pages/index.tsrx', layout }),
	new RenderRoute({ path: '/getting-started', entry: '/src/pages/getting-started.tsrx', layout }),
	new RenderRoute({ path: '/features', entry: '/src/pages/features.tsrx', layout }),
	new RenderRoute({ path: '/blog', entry: '/src/pages/blog.tsrx', layout }),
	new RenderRoute({
		path: '/blog/simplifying-tsrx-after-feedback',
		entry: '/src/pages/blog-simplifying-tsrx-after-feedback.tsrx',
		layout,
	}),
	new RenderRoute({
		path: '/blog/rethinking-tsrx',
		entry: '/src/pages/blog-rethinking-tsrx.tsrx',
		layout,
	}),
	new RenderRoute({ path: '/specification', entry: '/src/pages/specification.tsrx', layout }),
	new RenderRoute({ path: '/playground', entry: '/src/pages/playground.tsrx', layout }),
	new ServerRoute({
		path: '/api/format',
		methods: ['POST'],
		handler: async (context) => {
			let body;

			try {
				body = await context.request.json();
			} catch {
				return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
			}

			const source = typeof body?.source === 'string' ? body.source : '';
			if (!source.trim()) {
				return Response.json({ error: 'A non-empty source string is required.' }, { status: 400 });
			}

			if (source.length > MAX_SOURCE_LENGTH) {
				return Response.json(
					{ error: `Source exceeds the ${MAX_SOURCE_LENGTH} character demo limit.` },
					{ status: 413 },
				);
			}

			try {
				return Response.json({ source: await format_tsrx(source) });
			} catch (error) {
				return Response.json({ error: get_error_message(error) }, { status: 422 });
			}
		},
	}),
	new ServerRoute({
		path: '/api/compile',
		methods: ['POST'],
		handler: async (context) => {
			let body;

			try {
				body = await context.request.json();
			} catch {
				return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
			}

			const source = typeof body?.source === 'string' ? body.source : '';
			const target = typeof body?.target === 'string' ? body.target : 'react';
			if (!source.trim()) {
				return Response.json({ error: 'A non-empty source string is required.' }, { status: 400 });
			}

			if (!is_valid_target(target)) {
				return Response.json(
					{ error: 'Target must be one of: octane, react, preact, ripple, solid, vue.' },
					{ status: 400 },
				);
			}

			if (source.length > MAX_SOURCE_LENGTH) {
				return Response.json(
					{ error: `Source exceeds the ${MAX_SOURCE_LENGTH} character demo limit.` },
					{ status: 413 },
				);
			}

			try {
				return Response.json(await compile_target(target, source));
			} catch (error) {
				return Response.json({ error: get_error_message(error) }, { status: 422 });
			}
		},
	}),
];
