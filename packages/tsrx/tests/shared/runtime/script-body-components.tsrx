// Shared runtime fixtures for raw-text `<script>` bodies (#708). Each
// platform's vite plugin compiles this file with its own compiler when the
// platform's `runtime.test.tsrx` imports it. A body renders as written: each
// script's `textContent` is its source text, line breaks, comments, `<`, `>`,
// character references, and braces included.

export function ScriptBodyApp() @{
	<div>
		<div class="script-code">
			<script>
				// c
				var tsrxScriptBody = 1 < 2 && 2 > 1 ? '&amp;' : { a: 1 };
			</script>
		</div>
		<div class="script-json">
			<script type="application/json">
				{ "a": 1, "b": "<b>&amp;</b>" }
			</script>
		</div>
		<div class="script-importmap">
			<script type="importmap">
				{ "imports": { "x": "./x.js" } }
			</script>
		</div>
	</div>
}

// `{typeof code}` is the text of the body, as it would be in an `.html` file,
// not an expression container. (A target that runs a script on a client render
// runs it as a block, which reads no undeclared name.)
export function ScriptBracesApp() {
	return (
		<div class="script-braces">
			{/* prettier-ignore */}
			<script>{typeof code}</script>
		</div>
	);
}

/** Each case: its label, the selector of the script's parent, and the script's text. */
export const script_body_cases: Array<[string, string, string]> = [
	[
		'a code body with a line comment, `<`, `>`, a character reference, and braces',
		'.script-code',
		`
				// c
				var tsrxScriptBody = 1 < 2 && 2 > 1 ? '&amp;' : { a: 1 };
			`,
	],
	[
		'a JSON body',
		'.script-json',
		`
				{ "a": 1, "b": "<b>&amp;</b>" }
			`,
	],
	[
		'an import map',
		'.script-importmap',
		`
				{ "imports": { "x": "./x.js" } }
			`,
	],
	['braces, as text', '.script-braces', '{typeof code}'],
];
