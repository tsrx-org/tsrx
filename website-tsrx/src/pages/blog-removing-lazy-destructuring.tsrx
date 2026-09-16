import { highlight_tsrx } from '../lib/code-highlight.ts';

const LAZY_BEFORE_HTML = highlight_tsrx(
	`const UserCard = (&{ name, age }: { name: string; age: number }) => <div>
  <h2>{name}</h2>
  <p>Age: {age}</p>
</div>;

let &[count, setCount] = createSignal(0);`,
);

const TWO_BINDINGS_HTML = highlight_tsrx(
	`let &[count, countT] = track(0);

countT.value++; // the tracked object
count++;        // secretly the same write, spelled like a local`,
);

const NOT_A_VARIABLE_HTML = highlight_tsrx(
	`function Profile(&{ name }: Props) @{
  // Reads as "copy a local into an object".
  // Compiled to { name: __lazy0.name }: a property read from props.
  const snapshot = { name };

  <p>{snapshot.name}</p>
}`,
);

const REACT_AFTER_HTML = highlight_tsrx(
	`function UserCard({ name, age }: { name: string; age: number }) @{
  <div>
    <h2>{name}</h2>
    <p>Age: {age}</p>
  </div>
}`,
);

const SOLID_AFTER_HTML = highlight_tsrx(
	`function UserCard(props: { name: string; age: number }) @{
  <div>
    <h2>{props.name}</h2>
    <p>Age: {props.age}</p>
  </div>
}`,
);

const VUE_AFTER_HTML = highlight_tsrx(
	`function Counter() @{
  const state = reactive({ count: 0 });

  <button onClick={() => state.count++}>{state.count}</button>
}`,
);

const RIPPLE_AFTER_HTML = highlight_tsrx(
	`export function Counter() @{
  const count = track(0);

  <button onClick={() => count.value++}>{count.value}</button>
  <Child {count} />
}`,
);

const MIGRATION_HTML = highlight_tsrx(
	`// Ripple
let &[count] = track(0); count++;        →  const count = track(0); count.value++;
let &[c, cT] = track(0); <Child count={cT} />  →  const count = track(0); <Child {count} />
function Card({ count: &[count] }: P)    →  function Card({ count }: P) and count.value

// Solid
(&{ name }: Props) => <p>{name}</p>      →  (props: Props) => <p>{props.name}</p>

// Vue
let &{ count } = state                   →  state.count, or toRefs(state)

// React, Preact, Octane
(&{ name }: Props)                       →  ({ name }: Props)`,
);

export function BlogRemovingLazyDestructuringPage() @{
	<>
		<head>
			<title>Removing lazy destructuring | TSRX Blog</title>
			<meta
				name="description"
				content="TSRX no longer has &{ ... } and &[ ... ] lazy destructuring. Destructuring is ordinary destructuring again, and reactive state is read through each framework's own API."
			/>
		</head>
		<div class="app-shell">
			<div class="page-shell">
				<header class="masthead">
					<a class="brand-lockup" href="/" aria-label="TSRX home">
						<img class="header-logo" src="/images/tsrx-mark.svg?v=4" alt="TSRX logo" />
					</a>
					<nav class="masthead-nav">
						<a href="/getting-started">Getting Started</a>
						<a href="/features">Features</a>
						<a href="/specification">Specification</a>
						<a href="/playground">Playground</a>
						<a href="/blog" aria-current="page">Blog</a>
						<a href="https://discord.gg/HCYpT5QHQR" target="_blank" rel="noopener noreferrer">
							Discord
						</a>
						<a href="https://github.com/tsrx-org/tsrx" target="_blank" rel="noopener noreferrer">
							GitHub
						</a>
						<a href="/llms.txt" target="_blank" rel="noopener noreferrer">llms.txt</a>
					</nav>
				</header>
				<main class="article-shell">
					<a class="back-link" href="/blog">Back to blog</a>
					<article>
						<header class="article-header">
							<p class="eyebrow">September 14, 2026</p>
							<h1>Removing lazy destructuring</h1>
							<p class="lead">
								TSRX no longer has
								<code>{'&{ ... }'}</code>
								and
								<code>{'&[ ... ]'}</code>
								. Destructuring is ordinary destructuring again, and reactive state is read through
								your framework's own API.
							</p>
						</header>
						<p>
							Since the beginning, TSRX has carried one extension to the ECMAScript binding grammar:
							a pattern prefixed with
							<code>{'&'}</code>
							that looked like destructuring but deferred every property or index access until the
							binding was read. Each reference compiled back to a member expression on a hidden
							source object.
						</p>
						<pre class="code-block">
							<code innerHTML={LAZY_BEFORE_HTML} />
						</pre>
						<p>
							As of today's release it is gone from the language. Writing
							<code>{'&'}</code>
							before
							<code>{'{'}</code>
							or
							<code>[</code>
							in a binding position is a syntax error, exactly as it is in TypeScript. There is no
							replacement syntax. The full reasoning is in
							<a href="https://github.com/tsrx-org/tsrx/discussions/106">RFC #106</a>
							; this post is the short version.
						</p>
						<h2>Why it existed</h2>
						<p>
							Lazy destructuring was built for Ripple. Ripple props used to be objects with accessor
							properties, so a plain
							<code>{'{ name }'}</code>
							would read the accessor once and snapshot the value, breaking per-access reactivity
							across the component boundary. The
							<code>{'&'}</code>
							kept the ergonomics of destructuring while compiling every read back to
							<code>props.name</code>
							. The same trick was then applied to
							<code>track()</code>
							so a bare
							<code>count</code>
							could read and write a tracked value.
						</p>
						<p>
							Ripple has since made props plain objects. Reactivity crosses the component boundary
							explicitly, as a
							<code>Tracked</code>
							or
							<code>Derived</code>
							that the child reads through
							<code>.value</code>
							. With prop getters gone, the only remaining use was sugar over
							<code>track()</code>
							, and no other target ever needed the feature: React, Preact, and Octane re-run the
							component body on every render, Solid's own guidance is to read
							<code>props.name</code>
							rather than destructure, and Vue's reactive proxy already makes
							<code>state.count</code>
							reactive on its own.
						</p>
						<h2>What was wrong with it</h2>
						<p>
							One pattern produced two different kinds of binding, and nothing at the use site told
							you which one you were holding.
						</p>
						<pre class="code-block">
							<code innerHTML={TWO_BINDINGS_HTML} />
						</pre>
						<p>
							Hovering
							<code>count</code>
							in an editor showed
							<code>number</code>
							. The type checker, and every tool built on it, believed it was a plain value. To make
							the declaration type-check at all, Ripple's
							<code>{'Tracked<V>'}</code>
							had to claim it was also a
							<code>{'[V, Tracked<V>]'}</code>
							tuple, and the compiler then needed two dedicated errors to stop people from indexing
							it. Reactivity was invisible in the type system exactly where it mattered most.
						</p>
						<p>
							A lazy binding was also not a variable, and JavaScript treats bindings as values in
							places you might not think about.
						</p>
						<pre class="code-block">
							<code innerHTML={NOT_A_VARIABLE_HTML} />
						</pre>
						<p>
							The same applied to
							<code>val++</code>
							, which mutated someone else's array. Each case was handled correctly by the compiler;
							the cost fell on the reader, who had to remember that an
							<code>{'&'}</code>
							many lines above changed the meaning of every later occurrence of the name.
						</p>
						<p>
							Finally, the syntax was whitespace sensitive and not TypeScript.
							<code>{'&{'}</code>
							introduced a pattern only when the bracket followed the ampersand directly;
							<code>{'& {'}</code>
							did not. Every tool in the chain had to reproduce that rule: the parser, Prettier,
							ESLint, the TextMate and Tree-sitter grammars, the editor queries, the language
							server's source mappings, and the OXC and Yuku ports. Most TSRX code is now written or
							edited by language models, whose prior is TypeScript plus the target framework's own
							idioms. A model that forgot the
							<code>{'&'}</code>
							produced code that compiled and rendered once, silently. One explicit way to read
							reactive state, spelled the way the framework's own docs spell it, is the safer
							design.
						</p>
						<h2>What to write instead</h2>
						<p>
							Each target's own state API is the replacement. For React, Preact, and Octane, the
							output for a former lazy parameter is the plain destructure you would have written
							anyway.
						</p>
						<pre class="code-block">
							<code innerHTML={REACT_AFTER_HTML} />
						</pre>
						<p>
							For Solid, read props through the props object, or use
							<code>splitProps</code>
							when you want to pull some of them apart. This is the idiom Solid's own tooling
							recommends.
						</p>
						<pre class="code-block">
							<code innerHTML={SOLID_AFTER_HTML} />
						</pre>
						<p>
							For Vue, read through the reactive proxy, or use
							<code>toRefs</code>
							when destructuring is what you want.
						</p>
						<pre class="code-block">
							<code innerHTML={VUE_AFTER_HTML} />
						</pre>
						<p>
							For Ripple, hold the tracked object and read and write
							<code>.value</code>
							. Passing
							<code>count</code>
							to a child passes the tracked object; passing
							<code>count.value</code>
							passes a number. The two spellings look different because they are different.
						</p>
						<pre class="code-block">
							<code innerHTML={RIPPLE_AFTER_HTML} />
						</pre>
						<h2>Migrating</h2>
						<p>
							The rewrites are mechanical. A file that still uses the sigils fails to compile with a
							syntax error pointing at the
							<code>{'&'}</code>
							, so nothing changes meaning silently.
						</p>
						<pre class="code-block">
							<code innerHTML={MIGRATION_HTML} />
						</pre>
						<p>
							Alongside the language change, the
							<code>tsrx/no-lazy-destructuring-in-modules</code>
							ESLint rule is removed since it has nothing left to check, Prettier no longer prints
							the prefix, and the editor grammars no longer highlight it. The
							<code>{'Tracked<V>'}</code>
							types in Ripple become honest
							<code>{'{ value: V }'}</code>
							shapes in Ripple's next release, which also drops the tracked-index errors.
						</p>
						<h2>What this means for TSRX</h2>
						<p>
							This is the last of the early TSRX-only ideas that predated the current design. The
							language now adds statement containers, marked control flow, scoped styles, and
							submodules on top of TypeScript and JSX, and nothing else. Every binding is a
							TypeScript binding; every destructure is a TypeScript destructure. That is a smaller
							language to learn, a smaller language for tools to implement, and a language that
							matches what people and models already expect.
						</p>
					</article>
				</main>
				<footer class="site-footer">
					<p>Released under the MIT License.</p>
					<p>Copyright © 2025-present Dominic Gannaway</p>
				</footer>
			</div>
		</div>
		<style>
			.page-shell {
				width: min(1040px, calc(100vw - 2rem));
				margin: 0 auto;
				padding: 1rem 0 4rem;
			}

			.masthead-nav a:hover,
			.back-link:hover,
			article a:hover {
				color: #5e2cff;
			}

			h1 {
				margin: 0;
				font-size: clamp(2.6rem, 8vw, 5.5rem);
				line-height: 0.95;
				letter-spacing: 0;
			}

			.lead {
				margin: 1.2rem 0 0;
				font-size: 1.25rem;
				line-height: 1.65;
				color: rgba(26, 22, 64, 0.72);
			}

			article p {
				margin: 1rem 0 0;
				font-size: 1.08rem;
				line-height: 1.75;
				color: rgba(26, 22, 64, 0.76);
			}

			article h2 {
				margin: 2.25rem 0 0;
				font-size: clamp(1.55rem, 4vw, 2.05rem);
				line-height: 1.15;
				letter-spacing: 0;
			}

			article a {
				display: inline-block;
				margin: 0 0.18em;
				color: #5e2cff;
				font-weight: 700;
			}

			article p code,
			.lead code {
				display: inline-block;
				background: rgba(94, 44, 255, 0.1);
				color: #5e2cff;
				padding: 0.16em 0.48em;
				margin: 0 0.18em;
				border-radius: 4px;
				font-size: 0.92em;
			}

			.code-block {
				margin: 1rem 0 0;
			}

			.article-shell {
				width: min(760px, 100%);
				margin: 0;
				padding-top: 2.5rem;
			}
			.article-header {
				margin-bottom: 2rem;
			}
			.back-link {
				display: inline-flex;
				margin-bottom: 2rem;
				font-size: 0.95rem;
				font-weight: 700;
				color: #5e2cff;
			}
			.eyebrow {
				margin: 0 0 0.75rem;
				font-size: 0.78rem;
				font-weight: 700;
				text-transform: uppercase;
				letter-spacing: 0.08em;
				color: #5e2cff;
			}
			@media (max-width: 720px) {
				.page-shell {
					width: calc(100vw - 1.5rem);
					padding: 0.5rem 0 2rem;
				}

				.article-shell {
					padding-top: 2rem;
				}

				.lead,
				article p {
					font-size: 1rem;
				}
			}
		</style>
	</>
}
