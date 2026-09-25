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

function Slot(props: { content: any }) @{
	<p>{props.content}</p>
}

function SwitchText(props: { kind: string }) @{
	@switch (props.kind) {
		@case 'a': {
			// prettier-ignore
			<div>
				<span class="ws-switch-after-open"> 1</span>
				<span class="ws-switch-after-close"><b>2</b> 3</span>
				<span class="ws-switch-before-tag">4<b /></span>
				<span class="ws-switch-after-container">{'5'} 6</span>
				<span class="ws-switch-nbsp-own-line">
					<b>x</b>
					 
					<i />
				</span>
			</div>
		}
		@default: {
			// prettier-ignore
			<div class="ws-switch-default-space-after-nested-close">
				<span>
					<b>1</b>
				</span> 2
			</div>
		}
	}
}

function pickBySwitch(kind: string) {
	switch (kind) {
		case 'a':
			// prettier-ignore
			return <span class="ws-js-switch"> 1<b /></span>;
	}
	return null;
}

function SetupText(props: { kind: string }) @{
	// prettier-ignore
	const afterOpen = <span class="ws-setup-after-open"> 1</span>;
	// prettier-ignore
	const afterClose = <span class="ws-setup-after-close"><b>2</b> 3</span>;
	// prettier-ignore
	const beforeTag = <span class="ws-setup-before-tag">4<b /></span>;
	// prettier-ignore
	const afterContainer = <span class="ws-setup-after-container">{'5'} 6</span>;
	// prettier-ignore
	const nbspOwnLine = <span class="ws-setup-nbsp-own-line">
		<b>x</b>
		 
		<i />
	</span>;
	function inFunction() {
		// prettier-ignore
		return <span class="ws-setup-function">Hello<b /> 2</span>;
	}
	// prettier-ignore
	const inArrow = () => <span class="ws-setup-arrow"><b>1</b> 2</span>;
	const inIf = (
		@if (props.kind === 'a') {
			// prettier-ignore
			<span class="ws-setup-if">Hello<b /> 2</span>
		}
	);
	const inCodeBlock = (
		@{
			// prettier-ignore
			const inner = <span class="ws-setup-code-block"><b>1</b> 2</span>;
			<>{inner}</>
		}
	);

	<div>
		{afterOpen}
		{afterClose}
		{beforeTag}
		{afterContainer}
		{nbspOwnLine}
		{inFunction()}
		{inArrow()}
		{inIf}
		{inCodeBlock}
		@switch (props.kind) {
			@case 'a': {
				// prettier-ignore
				const inCase = <span class="ws-case-setup">Hello<b /> 2</span>;
				<>{inCase}</>
			}
		}
	</div>
}

export function JsxTextWhitespaceApp() @{
	const show = true;

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
		// An element in a `{…}` container, and in a `switch` case, reads its text
		// as anywhere else. The cases select the element in the container: the
		// targets render the container's own slot differently.
		// prettier-ignore
		<div>{show && <span class="ws-container-space-after-close"><b>1</b> 2</span>}</div>
		// prettier-ignore
		<Slot content={<span class="ws-attr-space-after-close"><b>1</b> 2</span>} />
		// prettier-ignore
		<div>{show && <section>@if (show) { <span class="ws-container-directive">{'1'} 2</span> }</section>}</div>
		// prettier-ignore
		<div>{show && <span class="ws-container-nbsp-own-line">
			<b>x</b>
			 
			<i />
		</span>}</div>
		<SwitchText kind="a" />
		<SwitchText kind="z" />
		<div>{pickBySwitch('a')}</div>
		// An element in a setup statement reads its text as anywhere else too
		<SetupText kind="a" />
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
	[
		'a space after a closing tag in an element in a container',
		'.ws-container-space-after-close',
		'<b>1</b> 2',
	],
	[
		'a space after a closing tag in an element in an attribute value',
		'.ws-attr-space-after-close',
		'<b>1</b> 2',
	],
	[
		'a space after a container in an element in a directive body in a container',
		'.ws-container-directive',
		'1 2',
	],
	['a space after an opening tag in an @switch case', '.ws-switch-after-open', ' 1'],
	['a space after a closing tag in an @switch case', '.ws-switch-after-close', '<b>2</b> 3'],
	['text before a tag in an @switch case', '.ws-switch-before-tag', '4<b></b>'],
	['a space after a container in an @switch case', '.ws-switch-after-container', '5 6'],
	[
		'a space after a closing tag whose body ends in a line break in an @default case',
		'.ws-switch-default-space-after-nested-close',
		'<span><b>1</b></span> 2',
	],
	['text before a tag in a switch case', '.ws-js-switch', ' 1<b></b>'],
	['a space after an opening tag in a setup statement', '.ws-setup-after-open', ' 1'],
	['a space after a closing tag in a setup statement', '.ws-setup-after-close', '<b>2</b> 3'],
	['text before a tag in a setup statement', '.ws-setup-before-tag', '4<b></b>'],
	['a space after a container in a setup statement', '.ws-setup-after-container', '5 6'],
	[
		'text before a tag in a function declared in a setup statement',
		'.ws-setup-function',
		'Hello<b></b> 2',
	],
	['a space after a closing tag in an arrow in a setup statement', '.ws-setup-arrow', '<b>1</b> 2'],
	['text before a tag in an @if in a setup statement', '.ws-setup-if', 'Hello<b></b> 2'],
	[
		'a space after a closing tag in a setup statement of a @{ … } in a setup statement',
		'.ws-setup-code-block',
		'<b>1</b> 2',
	],
	['text before a tag in a setup statement of an @case', '.ws-case-setup', 'Hello<b></b> 2'],
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
	[
		'a non-breaking space on its own line in an element in a container',
		'.ws-container-nbsp-own-line',
		'<b>x</b>&nbsp;<i></i>',
		'<b>x</b><i></i>',
	],
	[
		'a non-breaking space on its own line in an @switch case',
		'.ws-switch-nbsp-own-line',
		'<b>x</b>&nbsp;<i></i>',
		'<b>x</b><i></i>',
	],
	[
		'a non-breaking space on its own line in a setup statement',
		'.ws-setup-nbsp-own-line',
		'<b>x</b>&nbsp;<i></i>',
		'<b>x</b><i></i>',
	],
] as const;
