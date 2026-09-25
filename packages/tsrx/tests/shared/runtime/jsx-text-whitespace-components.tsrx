// Shared runtime fixtures for JSX whitespace in template text. Each platform's
// vite plugin transforms this file with its own compiler when the platform's
// runtime tests import the components. `// prettier-ignore` keeps the layout
// each case is about.

function SpaceAfterNestedCloseInFragment() @{
	// prettier-ignore
	<>
		<span>
			<b>1</b>
		</span> 2
	</>
}

export function JsxTextWhitespaceApp() @{
	<>
		// prettier-ignore
		<div class="ws-space-after-nested-close">
			<span>
				<b>1</b>
			</span> 2
		</div>
		<p class="ws-fragment-space-after-nested-close">
			<SpaceAfterNestedCloseInFragment />
		</p>
		// prettier-ignore
		<div class="ws-text-after-close-next-line">
			<b>1</b>
			two
		</div>
		// prettier-ignore
		<div class="ws-block-comment-after-close">
			<b>t</b>
			/* c */ <i />
		</div>
		// prettier-ignore
		<div class="ws-block-comment-after-self-close">
			<b />
			/* c */ <i />
		</div>
		// prettier-ignore
		<div class="ws-line-comment-after-close">
			<b>t</b> // c
			two
		</div>
		// prettier-ignore
		<div class="ws-inline-comment-between-children"><b>t</b> /* c */<i /></div>
		// The text before `<b>x</b>` here, and the line after it in the next
		// case, is a non-breaking space (U+00A0)
		// prettier-ignore
		<div class="ws-nbsp-at-line-start">
			 <b>x</b>
		</div>
		// prettier-ignore
		<div class="ws-nbsp-own-line">
			<b>x</b>
			 
			<i />
		</div>
	</>
}

/**
 * What each case renders: what React renders for the same TSX, with the
 * comments left out. A comment adds nothing to the text around it, so the
 * whitespace on its two sides is one run.
 */
export const jsx_text_whitespace_cases = [
	[
		'a space after a closing tag whose body ends in a line break',
		'.ws-space-after-nested-close',
		'<span><b>1</b></span> 2',
	],
	['the same in a fragment', '.ws-fragment-space-after-nested-close', '<span><b>1</b></span> 2'],
	['text on the line after a closing tag', '.ws-text-after-close-next-line', '<b>1</b>two'],
	[
		'a block comment on the line after a closing tag',
		'.ws-block-comment-after-close',
		'<b>t</b><i></i>',
	],
	[
		'a block comment on the line after a self-closing tag',
		'.ws-block-comment-after-self-close',
		'<b></b><i></i>',
	],
	['a line comment after a closing tag', '.ws-line-comment-after-close', '<b>t</b>two'],
	[
		'a block comment between children on one line',
		'.ws-inline-comment-between-children',
		'<b>t</b> <i></i>',
	],
] as const;

/**
 * Text that is a non-breaking space next to a line break. JSX whitespace is
 * ASCII, so TSRX keeps it as text and gives it to the target's JSX compiler,
 * which decides: like Babel, vue-jsx-vapor renders it (`kept`); like
 * TypeScript, oxc and Solid's compiler trim it at the edge of a line
 * (`trimmed`).
 */
export const jsx_text_nbsp_cases = [
	[
		'a non-breaking space at the start of a line',
		'.ws-nbsp-at-line-start',
		'&nbsp;<b>x</b>',
		'<b>x</b>',
	],
	[
		'a non-breaking space on its own line',
		'.ws-nbsp-own-line',
		'<b>x</b>&nbsp;<i></i>',
		'<b>x</b><i></i>',
	],
] as const;
