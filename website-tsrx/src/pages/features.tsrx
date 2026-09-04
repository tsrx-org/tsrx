// Code snippets

import { highlight_tsrx } from '../lib/code-highlight.ts';

const COMPONENT_HTML = highlight_tsrx(
	`export function Button({ label, onClick }: {
  label: string;
  onClick: () => void;
}) @{
  <>
    // Ripple, Preact, Solid, and Vue host elements:
    <button class="btn" {onClick}>{label}</button>

    // React host elements:
    // <button className="btn" {onClick}>{label}</button>

    <style>
      .btn {
        padding: 0.5rem 1rem;
        border-radius: 4px;
      }
    </style>
  </>
}`,
);

const BAILOUT_HTML = highlight_tsrx(
	`export function Counter() @{
  let count = 0;

  // Plain JS/TS control flow can live in nested functions.
  function increment() {
    if (count >= 10) {
      count = 0;
    } else {
      count += 1;
    }
  }

  <button onClick={increment}>Count: {count}</button>
}`,
);

const TEMPLATE_STRUCTURE_HTML = highlight_tsrx(
	`function ProductCard({ product }: { product: Product }) @{
  const name = product.name.trim();
  const price = money(product.price);

  <article>
    <h2>{name}</h2>

    <footer>@{
      const hasDiscount = product.discount > 0;

      <>
        <strong>{price}</strong>
        @if (hasDiscount) {
          <span>Sale</span>
        }
      </>
    }</footer>
  </article>
}`,
);

const COMMENTS_HTML = highlight_tsrx(
	`function Menu({ showAdmin }: { showAdmin: boolean }) @{
  <nav>
    // Comments can sit between template children.
    <a href="/">Home</a>

    /*
     * Block comments stay comments too.
     */
    @if (showAdmin) {
      // Branch comments are allowed too.
      <a href="/admin">Admin</a>
    }
  </nav>
}`,
);

const IF_HTML = highlight_tsrx(
	`function StatusBadge({ status }: { status: 'active' | 'idle' | 'offline' }) @{
  @if (status === 'active') {
    <span class="badge active">Online</span>
  } @else if (status === 'idle') {
    <span class="badge idle">Away</span>
  } @else {
    <span class="badge">Offline</span>
  }
}`,
);

const FOR_HTML = highlight_tsrx(
	`function TodoList({ items }: { items: Todo[] }) @{
  const visibleItems = items.filter((item) => !item.hidden);

  <ul>
    @for (const item of visibleItems; index i; key item.id) {
      <li>{i + 1}. {item.text}</li>
    } @empty {
      <li>No todos yet</li>
    }
  </ul>
}`,
);

const TRY_HTML = highlight_tsrx(
	`function SafeProfile({ userId }: { userId: string }) @{
  @try {
    <UserProfile id={userId} />
  } @catch (error) {
    <div class="error">
      <p>Something went wrong.</p>
    </div>
  }
}`,
);

const TRY_RESET_HTML = highlight_tsrx(
	`export function RetryBoundary() @{
  @try {
    <ComponentThatMightFail />
  } @catch (e, reset) {
    <div>
      <p>Error: {e.message}</p>
      <button onClick={() => reset()}>Try again</button>
    </div>
  }
}`,
);

const SWITCH_HTML = highlight_tsrx(
	`function StatusMessage({ status }: { status: string }) @{
  @switch (status) {
    @case 'loading': {
      <p>Loading...</p>
    }
    @case 'success': {
      <p class="success">Done!</p>
    }
    @default: {
      <p>Unknown status.</p>
    }
  }
}`,
);

const SHORTHAND_HTML = highlight_tsrx(
	`// Instead of repeating the name:
<Input value={value} onChange={onChange} />

// Use the shorthand:
<Input {value} {onChange} />`,
);

const SCOPING_HTML = highlight_tsrx(
	`function App() @{
  const name = 'World';

  <div>@{
    // This is a new scope - you can declare variables here
    const greeting = 'Hello, ' + name + '!';

    <h1>{greeting}</h1>
  }</div>
}`,
);

const CHILDREN_HTML = highlight_tsrx(
	`// Children as nested JSX - this works:
<Card>
  <h2>Title</h2>
  <p>Content goes here.</p>
</Card>

// Passing an array or function? Use the children prop:
<List children={items.map(renderItem)} />`,
);

const RENDER_PROPS_HTML = highlight_tsrx(
	`function App({ items }: { items: Item[] }) @{
  function renderItem(item: Item) {
    return <li>{item.label}</li>;
  }

  <List items={items} render={renderItem} />
}`,
);

const ASYNC_BOUNDARY_HTML = highlight_tsrx(
	`const UserProfile = lazy(() => import('./UserProfile.tsrx'));

export function App() @{
  @try {
    <UserProfile id={1} />
  } @pending {
    <p>Loading...</p>
  } @catch (e) {
    <p>Something went wrong.</p>
  }
}`,
);

const DYNAMIC_HTML = highlight_tsrx(
	`type PanelProps = {
  as?: 'section' | 'article';
  item: Item;
  expanded: boolean;
};

function Summary({ item }: { item: Item }) @{
  <p>{item.summary}</p>
}

function Details({ item }: { item: Item }) @{
  <article>{item.body}</article>
}

export function Panel({ as = 'section', item, expanded }: PanelProps) @{
  const Body = expanded ? Details : Summary;

  <{as} className="panel">
    <{Body} item={item} />
  </{as}>
}`,
);

const SCOPED_STYLES_HTML = highlight_tsrx(
	`function Panel() @{
  <>
    <style>
      /* scope A: this fragment's children list */
      div { color: black; }
    </style>
    <div class="outer">Black</div>

    <section>
      <style>
        /* scope B: the section's children list, nested inside A.
           It styles the items beside it, never <section> itself. */
        div { font-weight: bold; }
      </style>
      <div class="inner">Black and bold</div>
    </section>

    <style>
      /* still scope A: shares the first block's hash */
      p { margin: 0; }
    </style>
    <p>No margin</p>
  </>
}`,
);

const STYLE_FRAGMENT_HTML = highlight_tsrx(
	`function Note({ open }: { open: boolean }) @{
  <div>
    @if (open) {
      // Error: two output nodes in one branch.
      <style>
        p { color: red; }
      </style>
      <p>Red</p>
    }
  </div>
}

function Note({ open }: { open: boolean }) @{
  <div>
    @if (open) {
      // Works: one output node, a fragment holding the block and the <p>.
      <>
        <style>
          p { color: red; }
        </style>
        <p>Red</p>
      </>
    }
  </div>
}`,
);

const CONTROL_FLOW_STYLES_HTML = highlight_tsrx(
	`function Status({ ready }: { ready: boolean }) @{
  <>
    <style>
      .status { padding: 0.5rem; }
    </style>
    <section class="status">
      @if (ready) {
        <>
          <style>
            .ok { color: green; }
          </style>
          <p class="ok">Ready</p>
        </>
      } @else {
        <>
          <style>
            .wait { color: gray; }
          </style>
          <p class="wait">Waiting</p>
        </>
      }
    </section>
  </>
}`,
);

const THEME_CLASS_HTML = highlight_tsrx(
	`export const theme = <style>
  div { color: green; }
  .dark { color: purple; }
</style>;

// theme.$class -> 'tsrx-1a2b3c4d'
// theme.dark   -> 'tsrx-1a2b3c4d dark'

function Badge({ class: className }: { class?: string }) @{
  <span class={'badge ' + (className ?? '')}>New</span>
}

function App() @{
  <>
    // Ripple, Preact, Solid, and Vue component props:
    <Badge class={theme.dark} />

    // React component props:
    // <Badge className={theme.dark} />
  </>
}`,
);

const STYLE_APPLY_HTML = highlight_tsrx(
	`import { theme } from './theme.tsrx';

export function Panel() @{
  <>
    <style apply={theme}>
      /* scope A; also stamps theme.$class on every element of A */
      div { color: black; }
    </style>

    <span class={theme.dark}>Purple</span>
    <div>Black: the local rule beats the theme's green</div>

    @{
      <>
        <style>
          /* scope B, nested inside A */
          div { font-weight: bold; }
        </style>
        <div>Black and bold: A, B, and the theme all reach here</div>
      </>
    }
  </>
}

export function Card() @{
  <>
    // Self-closed: applies the theme, declares no rules of its own.
    <style apply={theme} />
    <article>
      <h2>Green system-ui</h2>
    </article>
  </>
}`,
);

const THEME_COMPOSITION_HTML = highlight_tsrx(
	`// theme.tsrx
const base = <style>
  div { font-family: system-ui; }
</style>;

export const accent = <style apply={base}>
  div { color: blue; }
</style>;

// accent.$class -> base's hash, then accent's own hash

const spacing = <style>
  p { margin: 0; }
</style>;

// A self-closed assigned block bundles themes without CSS of its own.
export const bundle = <style apply={[spacing, accent]} />;

export function Composed() @{
  <style apply={[spacing, accent]} />
  <div>
    <p>Blue system-ui, no margin</p>
  </div>
}`,
);

const THEME_OPT_IN_HTML = highlight_tsrx(
	`function Card({ parentClass }: { parentClass: string }) @{
  <>
    <style>
      .local { padding: 0; }
    </style>
    <article class={parentClass}>
      <h2 class={parentClass}>Title</h2>
    </article>
  </>
}

export function App() @{
  const theme = <style>
    div { color: blue; }
    .card { color: red; }
  </style>;

  <>
    <Card parentClass={theme.$class} />
    <div class={theme.$class}>Blue: opted in</div>
    <div class={theme.card}>Red: theme.card</div>
    <p>Untouched</p>
  </>
}

// theme.$class is read, so theme keeps div { color: blue }.
// Card's <article> and <h2> carry theme.$class, then Card's own scope hash.`,
);

const STYLE_LAYER_HTML = highlight_tsrx(
	`function Card() @{
  <>
    <style>
      @layer components {
        .card { padding: 1rem; }
      }
    </style>
    <div class="card">Layered</div>
  </>
}

// Emitted CSS keeps the layer and scopes the selector inside it:
// @layer components { .card.tsrx-1a2b3c4d { padding: 1rem; } }`,
);

const GLOBAL_STYLES_HTML = highlight_tsrx(
	`function Card({ html }: { html: string }) @{
  <>
    <style>
      /* Bare: a page-wide rule. Matches anywhere on the page. */
      :global(.toast) { position: fixed; }
      /* → .toast */

      /* Prefixed: only below your scoped .card, never above it. */
      .card :global(.footnote) { font-size: 0.85em; }
      /* → .card.tsrx-1a2b3c4d .footnote */

      /* Leading: your element, when an ancestor carries the class. */
      :global(.theme-dark) .card { background: black; }
      /* → .theme-dark .card.tsrx-1a2b3c4d */

      /* Compound: your element, with a class another library toggles. */
      .card:global(.is-open) { border-color: blue; }
      /* → .card.tsrx-1a2b3c4d.is-open */

      /* Block form: several page-wide rules at once. */
      :global {
        body { margin: 0; }
        .toast { position: fixed; }
      }
      /* → body { … } .toast { … } */

      /* Nested block: several classes below .card, prefix written once. */
      .card {
        :global {
          .footnote { font-size: 0.85em; }
          .caption { color: gray; }
        }
      }
      /* → .card.tsrx-1a2b3c4d { .footnote { … } .caption { … } } */

      /* Plain nesting, for contrast: both parts scoped. */
      .card { .title { font-weight: bold; } }
      /* → .card.tsrx-1a2b3c4d { .title.tsrx-1a2b3c4d { … } } */

      /* Error tsrx-css-global-placement: :global in the middle. */
      /* .card :global(.footnote) .title { } */
    </style>
    <div class="card" innerHTML={html} />
  </>
}`,
);

const GLOBAL_VS_CLASS_HTML = highlight_tsrx(
	`// Preferred for a child you own: the child takes a class through a prop.
function Note({ class: className }: { class?: string }) @{
  <p class={'note ' + (className ?? '')}>...</p>
}

function Card() @{
  const theme = <style>
    .note { color: gray; }
  </style>;
  /* → .note.tsrx-1a2b3c4d; only elements carrying theme.note match */

  <Note class={theme.note} />
}

// For a child you cannot change: a scoped prefix, then a :global block.
function Article({ html }: { html: string }) @{
  <>
    <style>
      .body {
        :global {
          .footnote { font-size: 0.85em; }
          .caption { color: gray; }
        }
      }
      /* → .body.tsrx-5e6f7a8b { .footnote { … } .caption { … } } */
    </style>
    <div class="body" innerHTML={html} />
  </>
}`,
);

const LAZY_PROPS_HTML = highlight_tsrx(
	`function UserCard(&{ name, age }: { name: string; age: number }) {
  return <div>
    <h2>{name}</h2>
    <p>Age: {age}</p>
  </div>;
}`,
);

const NAV_ITEMS = [
	{ id: 'components', label: 'Components' },
	{ id: 'template-structure', label: 'Statement containers' },
	{ id: 'comments', label: 'JS comments' },
	{ id: 'lazy-destructuring', label: 'Lazy destructuring' },
	{ id: 'prop-shorthands', label: 'Prop shorthands' },
	{ id: 'scoping', label: 'Lexical scoping' },
	{ id: 'if', label: 'Conditional rendering' },
	{ id: 'for', label: 'List rendering' },
	{ id: 'switch', label: 'Switch statements' },
	{ id: 'try', label: 'Error boundaries' },
	{ id: 'async-boundaries', label: 'Async boundaries' },
	{ id: 'dynamic', label: 'Dynamic rendering' },
	{ id: 'scoped-styles', label: 'Scoped styles' },
	{ id: 'style-composition', label: 'Style composition' },
];

export const FeaturesPage = () => @{
	<>
		<head>
			<title>TSRX | Features</title>
			<meta
				name="description"
				content="TSRX language features: function components, statement containers, JSX control flow, dynamic rendering, error boundaries, and more."
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
						<a href="/features" aria-current="page">Features</a>
						<a href="/specification">Specification</a>
						<a href="/playground">Playground</a>
						<a href="/blog">Blog</a>
						<a href="https://discord.gg/HCYpT5QHQR" target="_blank" rel="noopener noreferrer">
							Discord
						</a>
						<a href="https://github.com/tsrx-org/tsrx" target="_blank" rel="noopener noreferrer">
							GitHub
						</a>
						<a href="/llms.txt" target="_blank" rel="noopener noreferrer">llms.txt</a>
					</nav>
				</header>
				<div class="docs-layout">
					<aside class="side-nav">
						<label class="side-nav-dropdown">
							<span class="side-nav-dropdown-label">Jump to section</span>
							<select
								class="side-nav-select"
								onChange={(event) => {
									const select = event.currentTarget as HTMLSelectElement;
									if (typeof window !== 'undefined' && select.value) {
										window.location.hash = select.value;
									}
								}}
							>
								<option value="">Jump to section</option>
								@for (const item of NAV_ITEMS) {
									<option value={item.id}>{item.label}</option>
								}
							</select>
						</label>
						<nav>
							<p class="side-nav-heading">Features</p>
							@for (const item of NAV_ITEMS) {
								<a class="side-nav-link" href={`#${item.id}`}>{item.label}</a>
							}
						</nav>
					</aside>
					<main class="docs-content">
						<section class="doc-section" id="components">
							<h2 class="section-heading">Components</h2>
							<p class="section-body">
								A TSRX component is just a TypeScript function that produces JSX. Use a
								statement-container body for component-shaped templates, especially when local
								setup, comments, scoped styles, or multiple rendered children belong with the
								markup.
							</p>
							<p class="section-body">
								In practice, components are ordinary TypeScript functions or
								{' '}
								<code class="inline-code">const</code>
								{' '}
								values. A component can use
								{' '}
								<code class="inline-code">{'@{...}'}</code>
								{' '}
								as the function body, giving you one place for local state, derived values, template
								control flow, rendered elements, and scoped styles.
							</p>
							<pre class="code-block">
								<code innerHTML={COMPONENT_HTML} />
							</pre>
							<p class="section-body">
								Export them like any other function:
								{' '}
								<code class="inline-code">{'export function Name() @{ <div /> }'}</code>
								. The compiler turns that into the right component shape for the target you're
								using.
							</p>
							<p class="section-body">
								When a bit of logic should stay plain JavaScript rather than render into the
								template, put it in a normal function beside the markup. Use
								{' '}
								<code class="inline-code">{'function fn() { ... }'}</code>
								{' '}
								for ordinary control flow, then call helpers from event handlers or expressions:
								{' '}
								<code class="inline-code">{'onClick={fn}'}</code>
								.
							</p>
							<pre class="code-block">
								<code innerHTML={BAILOUT_HTML} />
							</pre>
						</section>
						<section class="doc-section" id="template-structure">
							<h2 class="section-heading">Statement containers</h2>
							<p class="section-body">
								When a template scope mixes TypeScript setup with rendered output, wrap the setup in
								<code class="inline-code">{'@{...}'}</code>
								. TSRX treats everything before the final renderable child as script, then the
								container must finish with exactly one output node.
							</p>
							<p class="section-body muted">
								That final output can be a JSX element, a JSX fragment, or JSX control flow like
								{' '}
								<code class="inline-code">{'@if'}</code>
								,
								{' '}
								<code class="inline-code">{'@for'}</code>
								,
								{' '}
								<code class="inline-code">{'@switch'}</code>
								, or
								{' '}
								<code class="inline-code">{'@try'}</code>
								. It cannot be a bare expression container, and no script statements can appear
								after it.
							</p>
							<p class="section-body muted">
								If the rendered part needs multiple siblings or text next to elements, wrap those
								children in a fragment so they become one output. The rule applies locally to
								component bodies, element children, and control-flow branches, so setup can stay
								close to the markup that uses it without turning ordinary template text into
								JavaScript.
							</p>
							<p class="section-body muted">
								Control-flow bodies are implicit statement containers too:
								<code class="inline-code">@if</code>
								,
								<code class="inline-code">@for</code>
								,
								<code class="inline-code">@switch</code>
								, and
								<code class="inline-code">@try</code>
								arms all use
								<code class="inline-code">{'{}'}</code>
								blocks.
							</p>
							<p class="section-body muted">
								If you write setup statements and then a bare JSX element inside a normal
								<code class="inline-code">{'{}'}</code>
								function body, the compiler will ask you to add the missing
								<code class="inline-code">@</code>
								. Plain braces are JavaScript; statement-container braces are
								<code class="inline-code">{'@{...}'}</code>
								.
							</p>
							<pre class="code-block">
								<code innerHTML={TEMPLATE_STRUCTURE_HTML} />
							</pre>
						</section>
						<section class="doc-section" id="comments">
							<h2 class="section-heading">JS comments</h2>
							<p class="section-body">
								JavaScript line and block comments are valid inside template children. They are
								comments, not rendered text, so you can annotate element bodies and control-flow
								branches without wrapping the note in braces.
							</p>
							<pre class="code-block">
								<code innerHTML={COMMENTS_HTML} />
							</pre>
						</section>
						<section class="doc-section" id="lazy-destructuring">
							<h2 class="section-heading">Lazy destructuring</h2>
							<p class="section-body">
								TSRX adds two sigils —
								<code class="inline-code">{'&{ ... }'}</code>
								for objects and
								<code class="inline-code">{'&[ ... ]'}</code>
								for arrays — that look like destructuring but defer the actual property access until
								each binding is read. Every reference to a lazy binding is compiled back to a
								property lookup on the source object, so downstream readers pick up the latest value
								without a manual getter.
							</p>
							<p class="section-body">
								The most common use is in component parameters. Regular object destructuring would
								snapshot each prop at call time and break any target runtime that relies on
								per-access reactivity (Ripple, Solid, Vue).
								<code class="inline-code">{'&{ ... }'}</code>
								preserves that reactivity while keeping the ergonomic destructuring syntax:
							</p>
							<pre class="code-block">
								<code innerHTML={LAZY_PROPS_HTML} />
							</pre>
							<p class="section-body muted">
								Lazy destructuring is supported across every target. In React and Preact it compiles
								to direct property access on the source object; in Ripple, Solid, and Vue it
								preserves tracked, signal, or proxy-backed reactivity without needing a wrapper
								call.
							</p>
						</section>
						<section class="doc-section" id="prop-shorthands">
							<h2 class="section-heading">Prop shorthands</h2>
							<p class="section-body">
								When a prop name matches the variable you're passing, you can use the shorthand
								<code class="inline-code">{'{name}'}</code>
								instead of
								<code class="inline-code">{'name={name}'}</code>
								. This works for any attribute or prop — including event handlers like
								<code class="inline-code">{'{onClick}'}</code>
								.
							</p>
							<pre class="code-block">
								<code innerHTML={SHORTHAND_HTML} />
							</pre>
						</section>
						<section class="doc-section" id="scoping">
							<h2 class="section-heading">Lexical scoping</h2>
							<p class="section-body">
								Every statement container and control-flow block creates its own lexical scope. You
								can declare variables, compute derived values, or call functions there — they're
								scoped to that block and won't leak into the surrounding function.
							</p>
							<pre class="code-block">
								<code innerHTML={SCOPING_HTML} />
							</pre>
							<p class="section-body">
								This applies to all block-like contexts: statement containers and control flow
								branches (
								<code class="inline-code">@if</code>
								,
								<code class="inline-code">@for</code>
								,
								<code class="inline-code">@switch</code>
								,
								<code class="inline-code">@try</code>
								). Each one has its own scope.
							</p>
						</section>
						<section class="doc-section" id="if">
							<h2 class="section-heading">Conditional rendering</h2>
							<p class="section-body">
								Use
								<code class="inline-code">@if</code>
								/
								<code class="inline-code">else if</code>
								/
								<code class="inline-code">else</code>
								template expressions directly inside templates, or return them directly from a
								component. Branches render their template output, while ordinary
								<code class="inline-code">if</code>
								statements in setup stay plain JavaScript for guard returns. Direct
								<code class="inline-code">return</code>
								,
								<code class="inline-code">continue</code>
								, and
								<code class="inline-code">break</code>
								are not allowed inside
								<code class="inline-code">@if</code>
								template branches.
							</p>
							<pre class="code-block">
								<code innerHTML={IF_HTML} />
							</pre>
						</section>
						<section class="doc-section" id="for">
							<h2 class="section-heading">List rendering</h2>
							<p class="section-body">
								Render lists with
								<code class="inline-code">{'@for (... of ...)'}</code>
								loops. TSRX extends the syntax with optional
								<code class="inline-code">index</code>
								and
								<code class="inline-code">key</code>
								clauses so you don't need separate counters or key-extraction boilerplate. The
								optional
								<code class="inline-code">@empty</code>
								branch renders when the iterable has no items.
							</p>
							<p class="section-body">
								Filter the collection before passing it to
								<code class="inline-code">@for</code>
								when some items should not render. Use
								<code class="inline-code">@empty</code>
								for the no-items branch. Direct
								<code class="inline-code">continue</code>
								,
								<code class="inline-code">break</code>
								, and
								<code class="inline-code">return</code>
								statements are not allowed in
								<code class="inline-code">@for</code>
								template loop bodies; nested functions keep ordinary JavaScript control flow.
							</p>
							<p class="section-body">
								Other JavaScript loops are not template rendering constructs: regular
								<code class="inline-code">for</code>
								,
								<code class="inline-code">for...in</code>
								,
								<code class="inline-code">while</code>
								, and
								<code class="inline-code">do...while</code>
								are rejected in TSRX template scope. Move imperative loops into a nested function or
								effect, or render collections with
								<code class="inline-code">{'@for (... of ...)'}</code>
								.
							</p>
							<pre class="code-block">
								<code innerHTML={FOR_HTML} />
							</pre>
						</section>
						<section class="doc-section" id="switch">
							<h2 class="section-heading">Switch statements</h2>
							<p class="section-body">
								Multi-branch rendering uses an
								<code class="inline-code">@switch</code>
								template expression. Each
								<code class="inline-code">case</code>
								or
								<code class="inline-code">default</code>
								has its own
								<code class="inline-code">{'{}'}</code>
								body, cases never fall through, and
								<code class="inline-code">break</code>
								and
								<code class="inline-code">return</code>
								are invalid inside the case body.
							</p>
							<pre class="code-block">
								<code innerHTML={SWITCH_HTML} />
							</pre>
						</section>
						<section class="doc-section" id="try">
							<h2 class="section-heading">Error boundaries</h2>
							<p class="section-body">
								Wrap components in
								<code class="inline-code">@try</code>
								/
								<code class="inline-code">catch</code>
								to create error boundaries. If a child component throws, the catch block renders its
								fallback children.
							</p>
							<pre class="code-block">
								<code innerHTML={TRY_HTML} />
							</pre>
							<p class="section-body">
								The
								<code class="inline-code">catch</code>
								block also receives a
								<code class="inline-code">reset</code>
								function as its second argument. Calling
								<code class="inline-code">reset()</code>
								clears the error state and re-renders the children, which is useful for building
								retry UIs:
							</p>
							<pre class="code-block">
								<code innerHTML={TRY_RESET_HTML} />
							</pre>
						</section>
						<section class="doc-section" id="async-boundaries">
							<h2 class="section-heading">Async boundaries</h2>
							<p class="section-body">
								Wrap a component subtree in
								<code class="inline-code">@try</code>
								/
								<code class="inline-code">pending</code>
								/
								<code class="inline-code">catch</code>
								to handle async children. While a lazy child or resource is in flight, the
								<code class="inline-code">pending</code>
								branch renders; when it resolves, the
								<code class="inline-code">@try</code>
								body takes over; if it rejects — or any child throws synchronously —
								<code class="inline-code">catch</code>
								runs. Both
								<code class="inline-code">pending</code>
								and
								<code class="inline-code">catch</code>
								are optional and can be used independently. Each branch follows the same
								setup-then-one-output rule as a statement container.
							</p>
							<p class="section-body">
								Async work itself is expressed using the target's own lazy-loading primitive —
								<code class="inline-code">lazy()</code>
								from
								<code class="inline-code">react</code>
								,
								<code class="inline-code">octane</code>
								,
								<code class="inline-code">preact/compat</code>
								, or
								<code class="inline-code">solid-js</code>
								,
								<code class="inline-code">defineVaporAsyncComponent()</code>
								on Vue Vapor, and
								<code class="inline-code">trackAsync()</code>
								on Ripple. In Solid, Vue, and Ripple targets, returned TSRX templates are
								synchronous and do not allow inline
								<code class="inline-code">await</code>
								. On React and Preact, template-body
								<code class="inline-code">await</code>
								is supported and TSRX emits an async component function.
							</p>
							<p class="section-body muted">
								React/Preact note:
								<code class="inline-code">for await...of</code>
								is not supported inside component templates. Use an upstream async helper and render
								the resolved data.
							</p>
							<pre class="code-block">
								<code innerHTML={ASYNC_BOUNDARY_HTML} />
							</pre>
						</section>
						<section class="doc-section" id="dynamic">
							<h2 class="section-heading">Dynamic elements and components</h2>
							<p class="section-body">
								Use the dynamic tag syntax
								<code class="inline-code">{'<{expression}>'}</code>
								when the host element tag or component constructor is selected at runtime. The
								expression can evaluate to a string tag name like
								<code class="inline-code">'section'</code>
								or a component value, and the closing tag repeats the same expression:
								<code class="inline-code">{'</{expression}>'}</code>
								. No import is required; each target compiler lowers the tag to its own runtime
								helper.
							</p>
							<p class="section-body">
								The tag expression must be able to resolve to an element name: an identifier, member
								access, static string, or a runtime expression composed of those. Calls, spreads,
								string concatenation, string interpolation, and static non-string literals are not
								valid tag names.
							</p>
							<pre class="code-block">
								<code innerHTML={DYNAMIC_HTML} />
							</pre>
							<p class="section-body muted">
								The example uses React's
								<code class="inline-code">className</code>
								prop. Ripple, Preact, Solid, and Vue use
								<code class="inline-code">class</code>
								for host classes. Removed dynamic tag forms like
								<code class="inline-code">{'<@tag />'}</code>
								and
								<code class="inline-code">{'<@Component />'}</code>
								are not part of current TSRX.
							</p>
						</section>
						<section class="doc-section" id="scoped-styles">
							<h2 class="section-heading">Scoped styles</h2>
							<p class="section-body">
								A
								<code class="inline-code">{'<style>'}</code>
								block styles only the elements next to it and below it. The compiler rewrites every
								selector in the block to also require a hash class: a class it adds to each element
								the block reaches, so the block's selectors match only there. Rules never leak into
								child components.
							</p>
							<h3 class="subsection-heading">
								A block styles its siblings and everything below them
							</h3>
							<p class="section-body">
								A
								<code class="inline-code">{'<style>'}</code>
								block is a child of an element or a fragment. It styles the other children of that
								list and everything below them. It never styles the element that contains it. To
								style an element, put the block and the element side by side in a fragment.
							</p>
							<pre class="code-block">
								<code innerHTML={SCOPED_STYLES_HTML} />
							</pre>
							<p class="section-body">
								Every element gets the hash class of each scope around it, outer first. The outer
								<code class="inline-code">div</code>, the
								<code class="inline-code">section</code>, and the trailing
								<code class="inline-code">p</code>
								get the hash class of scope A; the nested
								<code class="inline-code">div</code>
								gets A and B. Outer rules reach into nested scopes; inner rules never reach out.
								Elements returned from a callback such as
								<code class="inline-code">{'items.map((item) => <li />)'}</code>
								are outside the scope and get no hash class.
							</p>
							<h3 class="subsection-heading">Sibling blocks share one hash class</h3>
							<p class="section-body">
								Several blocks in one children list share one hash class, so the
								<code class="inline-code">{'p { margin: 0; }'}</code>
								block above is part of scope A. A nested children list with blocks of its own is a
								nested scope with its own hash class. A block can sit anywhere in its list; only the
								list it sits in decides what it styles.
							</p>
							<h3 class="subsection-heading">Put a block and its output in one fragment</h3>
							<p class="section-body">
								A
								<code class="inline-code">{'@{ ... }'}</code>
								body and every
								<code class="inline-code">@if</code>,
								<code class="inline-code">@for</code>,
								<code class="inline-code">@switch</code>, or
								<code class="inline-code">@try</code>
								branch render exactly one output node, and a
								<code class="inline-code">{'<style>'}</code>
								block counts as an output node. A block beside the output is an error, and a block
								that is the only output styles nothing. Wrap the block and the output it styles in a
								fragment.
							</p>
							<pre class="code-block">
								<code innerHTML={STYLE_FRAGMENT_HTML} />
							</pre>
							<h3 class="subsection-heading">Raw CSS needs a template around it</h3>
							<p class="section-body">
								Raw CSS in
								<code class="inline-code">{'<style>'}</code>
								is TSRX template syntax. A block with CSS in it needs a
								<code class="inline-code">{'@{ ... }'}</code>
								body or a control-flow branch somewhere above it. In plain TSX, write
								<code class="inline-code">{'<style>{css}</style>'}</code>: that is an ordinary
								element with an expression child. The compiler leaves it untouched, gives it no hash
								class, and never scopes it.
							</p>
							<h3 class="subsection-heading">Later rules win</h3>
							<p class="section-body">
								CSS is output in source order, outer scopes first, and at equal specificity the rule
								output last wins. Outer scopes come before the scopes nested in them, even when the
								nested scope is written first. A scope's blocks stay together as one group, in
								source order. Sibling scopes follow source order. An applied theme comes before the
								block that applies it. In the first example, the nested block makes its
								<code class="inline-code">div</code>
								bold without disturbing the color the outer block set.
							</p>
							<h3 class="subsection-heading">A block in a branch styles only that branch</h3>
							<p class="section-body">
								A
								<code class="inline-code">{'<style>'}</code>
								block inside an
								<code class="inline-code">@if</code>
								or
								<code class="inline-code">@for</code>
								branch applies only to the elements that branch renders. Its CSS is still always
								part of the file's stylesheet, whether or not the branch ever renders, because CSS
								is static. Rules you want everywhere belong outside the branch.
							</p>
							<pre class="code-block">
								<code innerHTML={CONTROL_FLOW_STYLES_HTML} />
							</pre>
							<p class="section-body">
								<code class="inline-code">.status</code>
								sits outside the branches and reaches both of them.
								<code class="inline-code">.ok</code>
								matches only the
								<code class="inline-code">p</code>
								in the ready branch and
								<code class="inline-code">.wait</code>
								only the
								<code class="inline-code">p</code>
								in the other one, and both rules are in the stylesheet at all times.
							</p>
							<h3 class="subsection-heading">Unused selectors are removed</h3>
							<p class="section-body">
								A selector that matches nothing the block can reach is removed from the output and
								left behind as a
								<code class="inline-code">
									/* (unused) */
								</code>
								comment. That includes a selector that only matches the element containing the
								block: the block cannot reach it.
							</p>
							<h3 class="subsection-heading">Escape the scope with :global()</h3>
							<p class="section-body">
								<code class="inline-code">:global(...)</code>
								marks the wrapped part of a selector as unscoped: it gets no hash class. Everything
								outside the parentheses is still scoped, so where the
								<code class="inline-code">:global</code>
								sits decides how far the rule can reach. The block form
								<code class="inline-code">{':global { ... }'}</code>
								does the same for every rule inside it, and both forms work with CSS nesting.
							</p>
							<pre class="code-block">
								<code innerHTML={GLOBAL_STYLES_HTML} />
							</pre>
							<p class="section-body">
								A bare
								<code class="inline-code">:global(.toast)</code>
								is a plain page-wide rule. It matches anywhere: ancestors, siblings, other
								components, exactly like a rule in a global stylesheet. A scoped prefix,
								<code class="inline-code">.card :global(.footnote)</code>, reaches only elements
								below your scoped
								<code class="inline-code">.card</code>, a child component's internals included; it
								can never climb up. A leading
								<code class="inline-code">:global(.theme-dark) .card</code>
								styles your own element only when an ancestor carries the class, and a compound
								<code class="inline-code">.card:global(.is-open)</code>
								styles your own element with a class another library toggles on it. A
								<code class="inline-code">:global</code>
								in the middle of a selector is the
								<code class="inline-code">tsrx-css-global-placement</code>
								error: it may only start or end a selector. A
								<code class="inline-code">{':global { ... }'}</code>
								block drops its wrapper, leaving a comment behind, and everything inside it is
								unscoped: at the top level it is several page-wide rules at once, and nested under a
								scoped rule such as
								<code class="inline-code">.card</code>
								it reaches only below that element, exactly like the prefixed
								<code class="inline-code">.card :global(.footnote)</code>. Plain nesting without
								<code class="inline-code">:global</code>
								scopes both parts.
							</p>
							<h3 class="subsection-heading">Scoped rules beat bare global rules</h3>
							<p class="section-body">
								A scoped rule adds one hash class to its first compound only; later compounds get
								<code class="inline-code">{':where(.<hash>)'}</code>, which adds no specificity, so
								<code class="inline-code">.card .title</code>
								becomes
								<code class="inline-code">{'.card.<hash> .title:where(.<hash>)'}</code>. That makes
								<code class="inline-code">:global</code>
								predictable: a scoped
								<code class="inline-code">.note</code>
								(0,2,0) beats a bare
								<code class="inline-code">:global(.note)</code>
								(0,1,0) from anywhere on the page; a
								<code class="inline-code">theme.$class</code>
								or class-map rule carries its hash too, so it also beats a bare global; and a
								prefixed
								<code class="inline-code">.card :global(.note)</code>
								(0,3,0) beats a child component's own
								<code class="inline-code">.note</code>
								rule (0,2,0). At equal specificity the later stylesheet in module order wins.
							</p>
							<h3 class="subsection-heading">Pass a class to a child instead of reaching in</h3>
							<p class="section-body">
								To let a child component pick up your styles, pass
								<code class="inline-code">theme.$class</code>
								or a class-map entry such as
								<code class="inline-code">theme.note</code>
								as a prop. The dependency is visible in code, the child decides which of its
								elements receive it, renaming a class inside the child cannot silently break the
								parent, and the hash keeps the rule on the elements that carry it. With
								<code class="inline-code">:global</code>
								the child has no say and cannot see who styles it. Keep
								<code class="inline-code">:global</code>
								for a child you cannot change: a third-party component, or rendered HTML and
								markdown. Always put a scoped selector in front so the rule cannot reach ancestors
								or unrelated components, and keep it narrow: it overrides the child's own rules by
								specificity. To style several of the child's classes, nest one
								<code class="inline-code">{':global { ... }'}</code>
								block under your scoped selector, so the prefix is written once.
							</p>
							<pre class="code-block">
								<code innerHTML={GLOBAL_VS_CLASS_HTML} />
							</pre>
							<p class="section-body">
								Page-wide rules such as
								<code class="inline-code">body</code>, resets, and fonts belong in a
								<code class="inline-code">.css</code>
								file. A bare
								<code class="inline-code">:global</code>
								selector or a top-level
								<code class="inline-code">{':global { ... }'}</code>
								block works, but it is a global stylesheet hidden inside a component. Never write a
								bare
								<code class="inline-code">:global</code>
								selector for anything but page-level elements.
							</p>
							<table class="decision-table">
								<thead>
									<tr>
										<th>I want to ...</th>
										<th>Use ...</th>
									</tr>
								</thead>
								<tbody>
									<tr>
										<td>Style my own elements</td>
										<td>
											A
											<code class="inline-code">{'<style>'}</code>
											block beside them; nothing global
										</td>
									</tr>
									<tr>
										<td>Let a child component pick up my styles</td>
										<td>
											Pass
											<code class="inline-code">theme.$class</code>
											or
											<code class="inline-code">theme.card</code>
											as a prop
										</td>
									</tr>
									<tr>
										<td>Style a child I cannot change (third-party component, rendered HTML)</td>
										<td>
											<code class="inline-code">.wrapper :global(.their-class)</code>, or
											<code class="inline-code">{'.wrapper { :global { ... } }'}</code>
											for several classes; scoped prefix first, keep it narrow
										</td>
									</tr>
									<tr>
										<td>React to page-level state</td>
										<td>
											<code class="inline-code">:global(.theme-dark) .card</code>
											or
											<code class="inline-code">{':global([data-theme=\'dark\']) .card'}</code>
										</td>
									</tr>
									<tr>
										<td>Style my element with a class another library toggles</td>
										<td>
											<code class="inline-code">.card:global(.is-open)</code>
										</td>
									</tr>
									<tr>
										<td>
											Page-wide rules:
											<code class="inline-code">body</code>, resets, fonts
										</td>
										<td>
											A
											<code class="inline-code">.css</code>
											file; a bare
											<code class="inline-code">:global(body)</code>
											only for page-level elements
										</td>
									</tr>
								</tbody>
							</table>
							<p class="section-body muted">
								React note: TSRX keeps authored attributes as written. Use
								<code class="inline-code">className</code>
								on React host elements and React component props, just like ordinary JSX. The hash
								class the compiler adds still goes out through React's
								<code class="inline-code">className</code>.
							</p>
						</section>
						<section class="doc-section" id="style-composition">
							<h2 class="section-heading">Style composition</h2>
							<p class="section-body">
								Assign a
								<code class="inline-code">{'<style>'}</code>
								block to a variable to get a theme you can hand to other scopes and components.
							</p>
							<h3 class="subsection-heading">Assigning a block gives you an object</h3>
							<p class="section-body">
								Assigning a
								<code class="inline-code">{'<style>'}</code>
								expression to a variable turns it into an object instead of a scoped block. The
								object has
								<code class="inline-code">$class</code>, the block's own hash class, plus one key
								per class selector whose value is the hash class and the class name together. Pass
								those strings to child components through
								<code class="inline-code">class</code>, or
								<code class="inline-code">className</code>
								for React components. The block can live at module scope or inside a component body.
							</p>
							<pre class="code-block">
								<code innerHTML={THEME_CLASS_HTML} />
							</pre>
							<h3 class="subsection-heading">
								A theme keeps every selector; a class map keeps only classes
							</h3>
							<p class="section-body">
								A block that is exported, applied, or whose
								<code class="inline-code">$class</code>
								is read is a theme. It keeps every selector, element and descendant selectors
								included. A block that is only read through class entries such as
								<code class="inline-code">styles.card</code>
								is a class map. It keeps only its standalone class selectors; the others are removed
								as unused, because no element can get its hash class.
							</p>
							<h3 class="subsection-heading">apply adds a theme to a whole scope</h3>
							<p class="section-body">
								<code class="inline-code">{'<style apply={theme} />'}</code>
								adds the theme's
								<code class="inline-code">$class</code>
								to every element of the scope it sits in, so the theme's element and descendant
								rules reach those elements as if the theme had been written there. A self-closed
								apply adds no hash class of its own.
								<code class="inline-code">{'<style apply={theme}>...</style>'}</code>
								does both: it applies the theme and declares a scoped block in one go.
							</p>
							<pre class="code-block">
								<code innerHTML={STYLE_APPLY_HTML} />
							</pre>
							<h3 class="subsection-heading">The local rule wins</h3>
							<p class="section-body">
								A theme's CSS is output before the block that applies it, and a theme must be
								declared before any block that applies it. So a rule written in the applying scope
								beats the theme's rule at equal specificity: the
								<code class="inline-code">div</code>
								above is black, not green. A theme from the same module is written into the output
								as a string literal; an imported theme is read at runtime through
								<code class="inline-code">theme.$class</code>.
							</p>
							<h3 class="subsection-heading">Themes compose</h3>
							<p class="section-body">
								A theme can apply another theme, and
								<code class="inline-code">{'apply={[a, b]}'}</code>
								applies several in order. The resulting
								<code class="inline-code">$class</code>
								lists the applied themes' classes first and the block's own hash class last, so a
								composed theme reaches an element with everything it was built from.
							</p>
							<pre class="code-block">
								<code innerHTML={THEME_COMPOSITION_HTML} />
							</pre>
							<h3 class="subsection-heading">
								Opt single elements in with
								<code class="inline-code">$class</code>
							</h3>
							<p class="section-body">
								<code class="inline-code">apply</code>
								is all or nothing for a scope. To pick elements instead, put
								<code class="inline-code">theme.$class</code>
								on them. Reading
								<code class="inline-code">$class</code>
								anywhere in the module makes the block a theme, so its element and descendant rules
								are kept, and only the elements that carry the class match them. The value is a
								plain string, so a child component can take it through a prop and put it on its own
								elements, where it comes before the child's own hash class.
							</p>
							<pre class="code-block">
								<code innerHTML={THEME_OPT_IN_HTML} />
							</pre>
							<p class="section-body">
								Prefer
								<code class="inline-code">$class</code>
								when a theme should reach a handful of elements, or elements the parent does not
								render itself, and
								<code class="inline-code">apply</code>
								when it should reach a whole scope. The two combine. Listing several themes'
								<code class="inline-code">$class</code>
								values on one element composes them there the way
								<code class="inline-code">{'apply={[a, b]}'}</code>
								composes them on a scope.
							</p>
							<h3 class="subsection-heading">Cascade layers pass through</h3>
							<p class="section-body">
								<code class="inline-code">@layer</code>
								rules inside a block are kept as written, and the selectors inside them are still
								scoped, so a codebase that already orders its layers can keep doing so.
							</p>
							<pre class="code-block">
								<code innerHTML={STYLE_LAYER_HTML} />
							</pre>
							<p class="section-body muted">
								Why not build scoping on
								<code class="inline-code">@layer</code>? Layers order rules globally: every
								participant has to agree on layer names and declare their order up front, and a
								layer cannot be attached to one subtree of elements. Sibling scoping gives an order
								you can read off the file, and
								<code class="inline-code">apply</code>
								adds classes, so a theme reaches exactly the elements of one scope.
							</p>
						</section>
					</main>
				</div>
				<footer class="site-footer">
					<p>Released under the MIT License.</p>
					<p>Copyright © 2025-present Dominic Gannaway</p>
				</footer>
			</div>
		</div>
		<style>
			.page-shell {
				width: min(1180px, calc(100vw - 2rem));
				margin: 0 auto;
				padding: 1rem 0 4rem;
			}

			/* Docs layout with side nav */

			.docs-layout {
				display: grid;
				grid-template-columns: 200px 1fr;
				gap: 3rem;
				align-items: start;
			}

			/* Content sections */

			.doc-section {
				margin-top: 3rem;
			}

			.section-heading {
				margin: 0 0 0.75rem;
				font-size: clamp(1.5rem, 3vw, 2rem);
				line-height: 1.1;
				letter-spacing: -0.03em;
			}

			.subsection-heading {
				margin: 1.75rem 0 0.5rem;
				font-size: clamp(1.1rem, 2vw, 1.35rem);
				line-height: 1.2;
				letter-spacing: -0.02em;
			}

			.section-body {
				margin: 0.5rem 0 0;
				font-size: 1.05rem;
				line-height: 1.7;
				color: rgba(26, 22, 64, 0.76);
			}
			.section-body.muted {
				color: rgba(26, 22, 64, 0.55);
				font-style: italic;
			}
			.section-body a:not(.cta-link) {
				display: inline-block;
				margin: 0 0.18em;
			}

			.decision-table {
				width: 100%;
				margin: 1rem 0 0;
				border-collapse: collapse;
				font-size: 0.98rem;
				line-height: 1.6;
				color: rgba(26, 22, 64, 0.76);
			}
			.decision-table th,
			.decision-table td {
				padding: 0.55rem 0.75rem;
				border-bottom: 1px solid rgba(26, 22, 64, 0.12);
				text-align: left;
				vertical-align: top;
			}
			.decision-table th {
				font-weight: 600;
				color: rgba(26, 22, 64, 0.9);
			}
			.doc-section:first-child {
				margin-top: 0.5rem;
			}
			@media (max-width: 720px) {
				.page-shell {
					width: calc(100vw - 1.5rem);
					padding: 0.5rem 0 2rem;
				}

				.docs-layout {
					display: block;
				}

				.side-nav {
					position: sticky;
					top: 0;
					z-index: 5;
					padding: 0.6rem 0;
					border-bottom: 1px solid rgba(26, 22, 64, 0.1);
					margin-bottom: 1rem;
				}

				.side-nav-dropdown {
					display: block;
				}

				.side-nav nav {
					display: none;
				}

				.side-nav-dropdown-label {
					margin-bottom: 0.35rem;
				}

				.side-nav-select {
					font-size: 0.95rem;
				}

				.doc-section {
					margin-top: 2rem;
				}

				.section-heading {
					font-size: clamp(1.3rem, 5vw, 1.65rem);
				}

				.section-body {
					font-size: 0.95rem;
				}

				.site-footer {
					margin-top: 2rem;
					padding: 1.5rem 0;
				}
			}
		</style>
	</>
};
