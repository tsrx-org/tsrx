#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const package_dir = path.resolve(__dirname, '..');
const repo_root = path.resolve(package_dir, '../..');
const specification_path = path.join(repo_root, 'website-tsrx/src/pages/specification.tsrx');
const features_path = path.join(repo_root, 'website-tsrx/src/pages/features.tsrx');
const getting_started_path = path.join(repo_root, 'website-tsrx/src/pages/getting-started.tsrx');

export const generated_docs_path = path.join(package_dir, 'src/generated/docs.js');

/**
 * @param {string} name
 * @param {string} specification_source
 */
function extract_string_array_constant(name, specification_source) {
	const start_marker = `const ${name} = [`;
	const start = specification_source.indexOf(start_marker);
	if (start === -1) {
		throw new Error(`Could not find ${name} in ${path.relative(repo_root, specification_path)}`);
	}
	const body_start = start + start_marker.length;
	const end = specification_source.indexOf("].join('\\n');", body_start);
	if (end === -1) {
		throw new Error(
			`Could not find end of ${name} in ${path.relative(repo_root, specification_path)}`,
		);
	}
	const body = specification_source.slice(body_start, end);
	const values = [];
	const literal_pattern = /'((?:\\'|[^'])*)'/g;
	let literal_match;
	while ((literal_match = literal_pattern.exec(body))) {
		values.push(literal_match[1].replaceAll("\\'", "'"));
	}
	return values.join('\n');
}

export async function generate_docs_index() {
	const specification_source = fs.readFileSync(specification_path, 'utf8');
	fs.accessSync(features_path);
	fs.accessSync(getting_started_path);

	const expression_value_grammar = extract_string_array_constant(
		'EXPRESSION_VALUE_GRAMMAR',
		specification_source,
	);
	const template_expression_grammar = extract_string_array_constant(
		'TEMPLATE_EXPRESSION_GRAMMAR',
		specification_source,
	);
	const lazy_grammar = extract_string_array_constant('LAZY_GRAMMAR', specification_source);
	const style_grammar = extract_string_array_constant('STYLE_GRAMMAR', specification_source);
	const style_scope_example = extract_string_array_constant(
		'STYLE_SCOPE_EXAMPLE',
		specification_source,
	);
	const style_theme_example = extract_string_array_constant(
		'STYLE_THEME_EXAMPLE',
		specification_source,
	);
	const style_static_constraints = extract_string_array_constant(
		'STYLE_STATIC_CONSTRAINTS',
		specification_source,
	);
	const server_extension_grammar = extract_string_array_constant(
		'SERVER_EXTENSION_GRAMMAR',
		specification_source,
	);

	const docs = [
		{
			slug: 'overview',
			title: 'TSRX Overview',
			use_cases:
				'always, introduction, explain tsrx, compare jsx, language model context, runtime targets',
			content: `# TSRX Overview

TSRX is a TypeScript language extension for authoring declarative UI in .tsrx files. It adds a small set of syntax forms on top of TypeScript, while letting each target compiler define the runtime semantics.

Core ideas:
- Components are ordinary TypeScript functions. Use a JSX statement container, \`@{ ... }\`, when the function body is mostly TSRX setup plus one rendered output.
- JSXElement, JSXFragment, JSXText, JSXExpressionContainer, attributes, and spreads use the standard JSX node family.
- A mixed setup/template scope must finish with exactly one output node: a JSXElement, JSXFragment, or JSX control-flow expression. Wrap plain text, expression containers, or multiple siblings in a fragment.
- Template control flow uses directive expressions: \`@if\`, \`@for\`, \`@switch\`, and \`@try\`; every directive body uses a \`{...}\` template block.
- lazy destructuring uses &[] and &{} for by-reference bindings.

The core language docs should stay target-neutral. After identifying the active runtime target, use target-specific docs, prompts, or skills for runtime imports, bundler setup, and semantics that are not defined by TSRX itself.

Source: website-tsrx/src/pages/specification.tsrx`,
		},
		{
			slug: 'components',
			title: 'Function Components',
			use_cases: 'components, functions, props, authoring .tsrx files, jsx return syntax',
			content: `# Function Components

Author UI as ordinary TypeScript functions. Components can return JSX directly, or use a JSX statement container when setup and output should live together.

\`\`\`tsx
export function Button({ label }: { label: string }) @{
  <button>{label}</button>
}
\`\`\`

Inside \`@{ ... }\`, put any setup statements first and end with one rendered output node. No JavaScript setup can appear after that output.

If a normal function body contains setup statements followed by bare TSRX output, add the missing \`@\` before the opening brace. Plain \`{ ... }\` is JavaScript; \`@{ ... }\` is the statement-container form.

Source: website-tsrx/src/pages/specification.tsrx#components`,
		},
		{
			slug: 'text-and-template-expressions',
			title: 'Text and Template Expressions',
			use_cases: 'text children, jsx text, comments, string literals, expression containers',
			content: `# Text and Template Expressions

Static text is JSXText and can be written directly between tags. Dynamic values use normal JSX expression containers.

\`\`\`tsx
function Greeting({ name }: { name: string }) @{
  <>
  <h1>Hello</h1>
  <p>{name}</p>
  </>
}
\`\`\`

JavaScript comments are also allowed between template children and are not rendered. Use braces for JavaScript expressions, including string literals that should be evaluated as JavaScript.

Specification grammar:

\`\`\`text
${template_expression_grammar}
\`\`\`

Source: website-tsrx/src/pages/specification.tsrx#templates`,
		},
		{
			slug: 'expression-values',
			title: 'Expression Values',
			use_cases:
				'fragments, pass template as prop, return template from helper, render props, expression position jsx',
			content: `# Expression Values

TSRX uses JSX-shaped expression values. A single JSXElement can be assigned, passed, or returned directly. Use a JSXFragment when the value needs multiple children, or use a JSX statement container when setup needs to produce one final output.

\`\`\`tsx
function App() @{
  const title = <span class="title">Settings</span>;
  const badge = (label: string) => @{
    const normalized = label.trim();

    <span class="badge">{normalized}</span>
  };

  <Card title={title}>{badge('New')}</Card>
}
\`\`\`

\`@{ ... }\` is a JSX statement container. A normal JSX fragment, element body, or control-flow branch can also contain setup before output, but that scope must still end with one output node. Use a fragment when the output is text, an expression container, or multiple siblings.

When generating code, prefer \`function Component(props) @{ ... }\` for component bodies that need hooks, setup, guard returns, and final template output together. Do not silently drop the \`@\`; the compiler treats plain braces as a normal JavaScript function body.

Specification grammar:

\`\`\`text
${expression_value_grammar}
\`\`\`

Source: website-tsrx/src/pages/specification.tsrx#expression-values`,
		},
		{
			slug: 'control-flow',
			title: 'Control Flow',
			use_cases:
				'if else, for loops, switch, try catch, conditional rendering, lists, guard returns',
			content: `# Control Flow

Template control flow uses directive-prefixed expressions inside JSX children.

\`\`\`tsx
function List({ items }: { items: string[] }) @{
  <>
  @if (items.length === 0) {
    <p>No items</p>
  } @else {
    <ul>
      @for (const item of items.filter(Boolean); index i; key item) {
        <li>{item}</li>
      } @empty {
        <li>No items</li>
      }
    </ul>
  }
  </>
}
\`\`\`

Use normal function returns for guard exits before entering template output. Filter a collection before passing it to \`@for\` when some items should not render, and use \`@empty { ... }\` for the no-items fallback.

\`return\` statements are not template output. Put guard returns before the JSX statement container or return value, or render conditionally with \`@if\`. Inside TSRX \`@if\` branches and \`@for ... of\` loops, direct \`continue\`, \`break\`, and \`return\` statements are invalid. Inside a TSRX \`@switch\` case body, both \`break\` and \`return\` are invalid because cases are isolated template blocks.

TSRX rendering supports \`@for ... of\` list loops. Regular \`for\`, \`for...in\`, \`while\`, and \`do...while\` loops are not rendering constructs. Move imperative loops into setup code, a nested function, event handler, effect, or helper where normal JavaScript control-flow rules apply.

Source: website-tsrx/src/pages/features.tsrx#for`,
		},
		{
			slug: 'lazy-destructuring',
			title: 'Lazy Destructuring',
			use_cases: 'reactivity, lazy binding, ampersand destructuring, &[], &{}',
			content: `# Lazy Destructuring

TSRX supports lazy binding patterns prefixed with \`&\`. They bind by reference rather than by value. The target compiler provides the runtime semantics.

\`\`\`tsx
let &[count] = source;
let &{ name, age } = props;
\`\`\`

The language defines the syntax and AST shape. Target-specific docs should explain what source values are valid and how reads and writes are lowered for the active runtime.

Specification grammar:

\`\`\`text
${lazy_grammar}
\`\`\`

Source: website-tsrx/src/pages/specification.tsrx#lazy`,
		},
		{
			slug: 'style-and-server',
			title: 'Style and Server Extensions',
			use_cases:
				'style expressions, scoped css, scoped style blocks, sibling scope, sibling-scoped styles, $class, apply, themes, class maps, :global, global selectors, unscoped selectors, escape scoping, third-party component styles, page-level styles, style diagnostics, module server, submodule imports, compile-time identifiers, ripple server modules, octane rpc, server functions',
			content: `# Style and Server Extensions

A \`<style>\` block written as template content is a standalone block. It is a child of an element or fragment, and that children list is its sibling scope: the block styles its siblings and everything below them, and it never styles the element that contains it. The compiler rewrites every selector in the block to require a hash class: a class it adds to each element the block reaches, so the selectors match only there. Sibling blocks share one hash class; a nested children list with blocks of its own gets a hash class of its own. Every element gets the hash class of each scope around it, outer first. A \`<style>\` block is an output node, so in a \`@{ ... }\` or control-flow body wrap it with its output in a fragment (\`<><style>...</style><div /></>\`); a lone block there is an error. A block inside an \`@if\` or \`@for\` branch styles only the elements that branch renders. Its CSS is still always part of the file's stylesheet, whether or not the branch ever renders, because CSS is static. Raw CSS in \`<style>\` is TSRX template syntax: a block with CSS in it outside every \`@{ ... }\` and control-flow body is an error; in plain TSX write \`<style>{css}</style>\`, an ordinary element. A standalone block at module scope is an error: assign it instead.

\`\`\`tsx
${style_scope_example}
\`\`\`

Assign a \`<style>\` block to get an object: \`$class\` (the block's hash class, preceded by the \`$class\` of every block it applies) plus one property per class name (\`styles.card\`). An assigned block that is exported, applied, or whose \`$class\` is read is a theme and keeps every selector; otherwise it is a class map and keeps only its class selectors. \`<style apply={theme} />\` adds \`theme.$class\` to every element of a scope, \`<style apply={theme}>...</style>\` also declares local rules that come after the theme's and so win at equal specificity, and \`class={theme.$class}\` adds it to one element. \`apply\` takes an identifier, a member expression, or an array of those, and every target must be an assigned block that is imported or declared before the applying block.

\`\`\`tsx
${style_theme_example}
\`\`\`

Later rules win: CSS is output in source order, outer first. Outer before inner: a scope's sheets come before the sheets of the scopes nested in it. Applied theme before the block that applies it: an applied block's CSS always comes before the CSS of the block that applies it. Source order within a scope: the later block wins.

\`:global(...)\` marks the wrapped part of a selector as unscoped: it gets no hash class, everything outside the parentheses is still scoped, and it may only start or end a selector (\`tsrx-css-global-placement\` otherwise). Bare \`:global(.toast)\` outputs \`.toast\`, a page-wide rule that matches anywhere on the page. Prefixed \`.card :global(.note)\` outputs \`.card.<hash> .note\`: only elements below the scoped \`.card\`, a child component's internals included, never upward. Leading \`:global(.theme-dark) .card\` outputs \`.theme-dark .card.<hash>\`, and compound \`.card:global(.is-open)\` outputs \`.card.<hash>.is-open\`. A scoped rule adds one hash class to its first compound only; later compounds get \`:where(.<hash>)\`, which adds no specificity. So a scoped \`.note.<hash>\` (0,2,0) beats a bare \`:global(.note)\` (0,1,0) from anywhere, a \`theme.$class\` or class-map rule carries its hash and beats a bare global too, and a prefixed \`.card.<hash> .note\` (0,3,0) beats a child's own \`.note.<hash>\`.

Prefer passing \`theme.$class\` (or a class-map entry) as a prop over \`:global\` for a child you own: the dependency is a visible prop, the child decides which elements receive it, renaming a class inside the child cannot silently break the parent, and the hash keeps the rule on the elements that carry it. With \`:global\` the child has no say and cannot see who styles it. Never write a bare \`:global\` selector for anything but page-level elements.

| I want to ... | Use ... |
| --- | --- |
| Style my own elements | A \`<style>\` block beside them; nothing global |
| Let a child component pick up my styles | Pass \`theme.$class\` or \`theme.card\` as a prop |
| Style a child I cannot change (third-party, rendered HTML) | \`.wrapper :global(.their-class)\`; scoped prefix first, keep it narrow |
| React to page-level state | \`:global(.theme-dark) .card\` or \`:global([data-theme='dark']) .card\` |
| Style my element with a class another library toggles | \`.card:global(.is-open)\` |
| Page-wide rules (\`body\`, resets, fonts) | A \`.css\` file; a bare \`:global(body)\` works but hides a global sheet in a component |

\`module server { ... }\` declares an explicit server-oriented submodule in the Ripple and Octane host profiles. Ripple exposes proposal-aligned imports such as \`import { load } from server\`; Octane uses the file-local module specifier \`import { load } from 'server'\` for RPC imports. Transport, serialization, and runtime behavior remain target-defined.

For Octane compiler, runtime, and validation guidance, use the Octane target documentation at https://octanejs.dev/llms.txt. The MCP \`compile-tsrx\` tool does not expose an Octane target.

The nested module scope gives host compilers and tooling a structural boundary for isolation and static analysis, including rejecting implicit cross-boundary captures and keeping server-only dependencies out of client output. It is not interchangeable with a target-specific \`"use server"\` directive.

Specification grammar:

\`\`\`text
${style_grammar}

${server_extension_grammar}
\`\`\`

Static constraints on style blocks, with their diagnostic codes:

\`\`\`text
${style_static_constraints}
\`\`\`

The identifier-source import production describes Ripple's proposal-aligned form. Octane's quoted \`'server'\` specifier uses the ordinary TypeScript import grammar.

Source: website-tsrx/src/pages/specification.tsrx#server-profile`,
		},
		{
			slug: 'dynamic-elements-and-components',
			title: 'Dynamic Elements and Components',
			use_cases:
				'dynamic elements, dynamic components, dynamic tag syntax, runtime tag, runtime component, removed <@tag syntax, removed Dynamic component',
			content: `# Dynamic Elements and Components

Use the dynamic tag syntax \`<{expression}>\` when the element tag or component constructor is chosen at runtime. The expression can evaluate to a string tag name or a component value, and a non-self-closing element repeats the same expression in its closing tag: \`</{expression}>\`. No import is required; each target compiler lowers the form to its own runtime helper.

\`\`\`tsx
type Tag = 'section' | 'article';

export function Panel({ as = 'section', title }: { as?: Tag; title: string }) @{
  <{as} className="panel">
    <h2>{title}</h2>
  </{as}>
}
\`\`\`

The tag expression can be a string tag name or a component value:

\`\`\`tsx
const Body = expanded ? ExpandedBody : CompactBody;

<{Body} item={item} />
\`\`\`

The tag expression must resolve to an element name: an identifier, member access, static string, or a runtime expression composed of those. Calls, spreads, string concatenation, string interpolation, and static non-string literals are not valid dynamic tag expressions.

For React host classes, use \`className\`. For Preact, Solid, Vue, and Ripple host classes, use \`class\`.

Do not use removed dynamic tag syntax such as \`<@tag />\` or \`<@Component />\`, and do not import a runtime \`Dynamic\` component with an \`is\` prop. Use \`<{tag}>\` instead.

Source: website-tsrx/src/pages/features.tsrx#dynamic`,
		},
		{
			slug: 'target-integration',
			title: 'Target Integration',
			use_cases:
				'runtime target, compiler package, target-specific setup, runtimeImports, direct runtime dependency, skills, runtime semantics',
			content: `# Target Integration

TSRX authoring syntax is shared, but output and runtime semantics are target-defined.

The core MCP server should detect the target, then hand off runtime-specific questions to a target-specific skill, prompt, resource set, or compiler-backed tool.

Target-specific layers should own:
- package installation and bundler setup
- runtime imports and helper APIs
- compiler warnings and semantic restrictions
- examples that depend on a specific rendering runtime

Compiler-package helper imports are the default. If a target compiler or build integration uses \`runtimeImports: 'direct'\`, the package that owns the source or generated modules must declare the matching standalone runtime as a direct production dependency:

- React: \`@tsrx/react-runtime\`
- Preact: \`@tsrx/preact-runtime\`
- Solid: \`@tsrx/solid-runtime\`
- Vue: \`@tsrx/vue-runtime\`

Build tools may bundle these helpers or leave their bare imports external, but they do not provide the runtime package. It must be resolvable during the build; do not rely on hoisting or on a compiler's transitive dependency.

When helping in an existing project, detect the target before generating code. If no target-specific layer is available, stay within target-neutral TSRX syntax and ask for confirmation before assuming runtime APIs.

Source: website-tsrx/src/pages/getting-started.tsrx#direct-runtime-imports`,
		},
		{
			slug: 'tooling',
			title: 'Tooling',
			use_cases:
				'typescript plugin, typecheck, prettier, eslint, vscode, editor setup, diagnostics',
			content: `# Tooling

Common TSRX tooling packages:

- \`@tsrx/typescript-plugin\` for TypeScript integration and \`tsrx-tsc\`.
- \`@tsrx/prettier-plugin\` for formatting .tsrx files.
- \`@tsrx/eslint-plugin\` for linting.
- language server and editor integration packages for diagnostics, hover, completion, and definitions.

Use the project package manager and match the active target runtime's compiler and bundler integration.

Source: website-tsrx/src/pages/getting-started.tsrx#tooling-install`,
		},
	];

	const output = `// This file is generated by packages/tsrx-mcp/scripts/generate-docs-index.js.
// Do not edit it directly.

/** @typedef {{ slug: string, title: string, use_cases: string, content: string }} DocumentationSection */

/** @type {DocumentationSection[]} */
export const documentation_sections = ${JSON.stringify(docs, null, '\t')};
`;

	return prettier.format(output, {
		parser: 'babel',
		singleQuote: true,
		useTabs: true,
	});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	fs.writeFileSync(generated_docs_path, await generate_docs_index());
}
