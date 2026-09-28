const MODIFIED_PRODUCTIONS = [
	'PrimaryExpression :',
	'  JSXElement',
	'  JSXFragment',
	'  JSXStyleElement',
	'  JSXCodeBlock',
	'  JSXIfExpression',
	'  JSXForExpression',
	'  JSXSwitchExpression',
	'  JSXTryExpression',
	'',
	'TemplateChild :',
	'  JSXText',
	'  JSXElement',
	'  JSXFragment',
	'  JSXStyleElement',
	'  JSXExpressionContainer',
	'  JSXCodeBlock',
	'  JSXIfExpression',
	'  JSXForExpression',
	'  JSXSwitchExpression',
	'  JSXTryExpression',
	'',
	'TemplateChildren :',
	'  TemplateChildList',
	'',
	'TemplateChildList :',
	'  TemplateChild',
	'  TemplateChildList TemplateChild',
	'',
	'TemplateOutput :',
	'  JSXElement',
	'  JSXFragment',
	'  JSXIfExpression',
	'  JSXForExpression',
	'  JSXSwitchExpression',
	'  JSXTryExpression',
	'',
	'JSXFragment :',
	'  <> TemplateChildrenopt </>',
].join('\n');

const FUNCTION_ENTRY_GRAMMAR = [
	'FunctionDeclaration :',
	'  function BindingIdentifier ( FormalParametersopt ) { FunctionBody }',
	'  function BindingIdentifier ( FormalParametersopt ) JSXCodeBlock',
	'',
	'FunctionExpression :',
	'  function BindingIdentifieropt ( FormalParametersopt ) { FunctionBody }',
	'  function BindingIdentifieropt ( FormalParametersopt ) JSXCodeBlock',
	'',
	'ReturnStatement :',
	'  return JSXElement ;',
	'  return JSXFragment ;',
	'  return JSXCodeBlock ;',
	'  return Expression ;',
].join('\n');

const EXPRESSION_VALUE_GRAMMAR = [
	'PrimaryExpression :',
	'  JSXElement',
	'  JSXFragment',
	'  JSXStyleElement',
	'  JSXCodeBlock',
	'  JSXIfExpression',
	'  JSXForExpression',
	'  JSXSwitchExpression',
	'  JSXTryExpression',
].join('\n');

const TEMPLATE_EXPRESSION_GRAMMAR = [
	'JSXTextChild :',
	'  JSXTextCharacters',
	'',
	'JSXExpressionContainer :',
	'  { AssignmentExpression }',
	'',
	'JSXCodeBlock :',
	'  @{ TemplateSetupListopt TemplateOutput JSXStyleElementListopt }',
	'',
	'TemplateSetupList :',
	'  TemplateSetupItem',
	'  TemplateSetupList TemplateSetupItem',
	'',
	'TemplateSetupItem :',
	'  StatementListItem',
	'  JSXStyleElement',
	'',
	'JSXStyleElementList :',
	'  JSXStyleElement',
	'  JSXStyleElementList JSXStyleElement',
	'',
	'TemplateBlock :',
	'  { TemplateChildrenopt }',
	'  { TemplateSetupList TemplateOutput JSXStyleElementListopt }',
	'',
	'JSXIfExpression :',
	'  @if ( Expression ) TemplateBlock',
	'  @if ( Expression ) TemplateBlock @else TemplateBlock',
	'  @if ( Expression ) TemplateBlock @else JSXIfExpression',
	'',
	'JSXForExpression :',
	'  @for ( ForHeader TemplateForOptionsopt ) TemplateBlock',
	'  @for ( ForHeader TemplateForOptionsopt ) TemplateBlock @empty TemplateBlock',
	'',
	'JSXSwitchExpression :',
	'  @switch ( Expression ) { JSXSwitchCaseListopt }',
	'',
	'JSXSwitchCase :',
	'  @case Expression : TemplateBlock',
	'  @default : TemplateBlock',
	'',
	'JSXTryExpression :',
	'  @try TemplateBlock @pending TemplateBlock',
	'  @try TemplateBlock @catch ( CatchParameteropt ) TemplateBlock',
].join('\n');

const STYLE_GRAMMAR = [
	'JSXStyleElement :',
	'  <style JSXAttributesopt> CSSSource </style>',
	'  <style JSXAttributesopt />',
	'',
	'StyleApplyValue :',
	'  { StyleApplyTarget }',
	'  { [ StyleApplyTargetListopt ] }',
	'',
	'StyleApplyTargetList :',
	'  StyleApplyTarget',
	'  StyleApplyTargetList , StyleApplyTarget',
	'',
	'StyleApplyTarget :',
	'  IdentifierReference',
	'  StyleApplyTarget . IdentifierName',
].join('\n');

const SCRIPT_GRAMMAR = [
	'JSXElement :',
	'  <script JSXAttributesopt> ScriptSourceopt ScriptEndTag',
	'  <script JSXAttributesopt />',
	'',
	'ScriptEndTag :',
	'  </script HTMLWhitespaceopt >',
	'',
	'ScriptSource :',
	'  any source text that does not contain </script, in any letter case',
].join('\n');

const SCRIPT_EXAMPLE = [
	'export function Page() @{',
	'  <>',
	'    <script type="importmap">',
	'      { "imports": { "app": "/app.js" } }',
	'    </script>',
	'    <script>',
	'      // The body is text: {code} is not an expression container,',
	'      // and a < or an &amp; stays as written.',
	'      if (a < b) log("&amp;");',
	'    </script>',
	'    <script type="module" src="/app.js" />',
	'  </>',
	'}',
].join('\n');

const STYLE_SCOPE_EXAMPLE = [
	'export function Panel() @{',
	'  <>',
	'    <style>',
	'      /* sibling scope A: the children list of this fragment */',
	'      div { color: black; }',
	'    </style>',
	'    <div>Black</div>',
	'',
	'    <style>',
	'      /* still scope A: shares the hash of the first block */',
	'      p { margin: 0; }',
	'    </style>',
	'    <p>No margin</p>',
	'',
	'    <section>',
	'      <style>',
	'        /* sibling scope B: the children list of <section>, nested in A. It',
	'           styles its siblings and everything below them, never <section>. */',
	'        div { font-weight: bold; }',
	'      </style>',
	'      <div>Black and bold: A and B both reach here</div>',
	'    </section>',
	'  </>',
	'}',
	'',
	'// Stamped classes: the outer div, p, and section carry "<A>"; the nested div carries "<A> <B>".',
	'// Emitted CSS order: div.<A>, p.<A>, div.<B>.',
].join('\n');

const STYLE_THEME_EXAMPLE = [
	'// theme.tsrx',
	'export const base = <style>',
	'  div { font-family: system-ui; }',
	'  .muted { color: gray; }',
	'</style>;',
	'// base is { $class: "<base>", muted: "<base> muted" }',
	'',
	'export const theme = <style apply={base}>',
	'  div { color: green; }',
	'  .dark { color: purple; }',
	'</style>;',
	'// theme.$class is "<base> <theme>"; theme.dark is "<theme> dark"',
	'',
	'// panel.tsrx',
	'import { theme } from "./theme.tsrx";',
	'',
	'export function Panel() @{',
	'  <>',
	'    <style apply={theme}>',
	'      /* scope A; every element of A also carries theme.$class */',
	'      div { color: black; }',
	'    </style>',
	'    <span class={theme.dark}>Purple</span>',
	'    <div>Black: the local rule follows the sheet of theme</div>',
	'    @{',
	'      <>',
	'        <style>div { font-weight: bold; }</style>',
	'        <div>Carries "<A> <B> " + theme.$class</div>',
	'      </>',
	'    }',
	'  </>',
	'}',
	'// Emitted CSS order: base, theme (theme.tsrx); then scope A, scope B (panel.tsrx).',
	'',
	'// card.tsrx: opting elements in with $class',
	'function Card({ parentClass }: { parentClass: string }) @{',
	'  <>',
	'    <style>.local { padding: 0; }</style>',
	'    <article class={`local ${parentClass}`}>',
	'      <h2 class={parentClass}>Title</h2>',
	'    </article>',
	'  </>',
	'}',
	'',
	'export function App() @{',
	'  const palette = <style>',
	'    div { color: blue; }',
	'    .card { color: red; }',
	'  </style>;',
	'  <>',
	'    <Card parentClass={palette.$class} />',
	'    <div class={palette.$class}>Blue: carries palette.$class</div>',
	'    <div class={palette.card}>Red: carries palette.card</div>',
	'    <p>Untouched: carries nothing from palette</p>',
	'  </>',
	'}',
	'// palette is assigned, so it is a theme and div { color: blue } is kept.',
	'// <article> and <h2> carry palette.$class, then the hash of the scope of Card.',
].join('\n');

const STYLE_STATIC_CONSTRAINTS = [
	'TSRX3007',
	'  A standalone <style> block must sit inside a template scope. At module scope',
	'  assign it: const theme = <style>...</style>.',
	'TSRX3009',
	'  A standalone <style> block must be a child of an element or a fragment. As the',
	'  lone output of a @{ ... } body or a control-flow body, or as a statement, it',
	'  styles nothing: wrap it with the output it styles in a fragment. Beside another',
	'  output node it is the ordinary multiple-outputs error.',
	'TSRX3008',
	'  Raw CSS in <style> is TSRX template syntax. A standalone block with CSS text',
	'  must sit lexically inside a @{ ... } body or an @if/@for/@switch/@try body, at',
	'  any depth. In plain TSX give <style> an expression child (<style>{css}</style>)',
	'  or assign the block. Head styles and resource styles are exempt.',
	'TSRX3010',
	'  A scoped <style> block admits only the attributes ref and apply. Head styles',
	'  and resource styles (href) admit any attribute.',
	'TSRX3001',
	'  apply requires an expression container: apply={theme} or apply={[a, b]}.',
	'  A bare attribute, a string value, or an empty container is an error.',
	'TSRX3004',
	'  A <style> block carries at most one apply attribute; pass several targets',
	'  as an array.',
	'TSRX3005',
	'  apply is not admitted on a <head> style or on a resource style.',
	'TSRX3002',
	'  Every apply entry is an identifier or non-computed member chain that resolves',
	'  by lexical scoping to an assigned <style> block: a binding initialized with a',
	'  block, an import, or a member of an import or of a module-local object literal',
	'  whose property holds a block. Calls, conditionals, spreads, and holes are errors.',
	'TSRX3003',
	'  A same-module target must be declared before the block that applies it, by',
	'  source position; stricter than the temporal dead zone because same-module CSS',
	'  is emitted in lexical order.',
	'TSRX3006',
	'  An assigned block must not declare a class selector named $class.',
	'TSRX3011',
	'  :global(...) may begin or end a selector sequence but not sit in its middle,',
	'  and a bare :global must not be nested inside another pseudo-class.',
	'TSRX3012',
	'  A style body must not contain an @import rule; the imported rules would not',
	'  be scoped.',
	'',
	'Emission order (normative): outer scope before inner scope; applied block',
	'before the block that applies it; source order within one scope, later wins.',
].join('\n');

const DYNAMIC_TAG_GRAMMAR = [
	'JSXElementName :',
	'  JSXIdentifier',
	'  JSXMemberExpression',
	'  JSXNamespacedName',
	'  JSXExpressionContainer',
	'',
	'JSXExpressionContainer :',
	'  { AssignmentExpression }',
].join('\n');

const DYNAMIC_TAG_EXAMPLE = [
	"type Tag = 'section' | 'article';",
	'',
	"export function Panel({ as = 'section', title }: { as?: Tag; title: string }) @{",
	'  <{as} className="panel">',
	'    <h2>{title}</h2>',
	'  </{as}>',
	'}',
].join('\n');

const SERVER_EXTENSION_GRAMMAR = [
	'SubmoduleDeclaration :',
	'  module Identifier { ModuleItemListopt }',
	'',
	'SubmoduleImportDeclaration :',
	'  import ImportClause from Identifier ;',
	'',
].join('\n');

const AST_NODE_MAPPING = [
	'Informative grammar-to-node correspondence',
	'',
	'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression -> ESTree function nodes',
	'function ... @{ ... } -> ESTree function node with body: JSXCodeBlock',
	'return JSXElement -> ReturnStatement(argument: JSXElement)',
	'return JSXFragment -> ReturnStatement(argument: JSXFragment)',
	'return JSXCodeBlock -> ReturnStatement(argument: JSXCodeBlock)',
	'JSXElement -> ESTree JSXElement',
	'JSXFragment -> ESTree JSXFragment',
	'JSXText -> ESTree JSXText',
	'{ AssignmentExpression } in template position -> JSXExpressionContainer',
	'@{ StatementListItemListopt TemplateOutput } -> JSXCodeBlock',
	'JSXAttributeName JSXAttributeInitializeropt -> JSXAttribute',
	'{ ... AssignmentExpression } in attribute position -> JSXSpreadAttribute',
	'<style> CSSSource </style> -> JSXStyleElement',
	'<style JSXAttributesopt /> -> JSXStyleElement with a self-closing opening element and no StyleSheet child',
	'<style> { AssignmentExpression } </style> -> JSXElement (an ordinary element whose children are expression containers)',
	'<script> ScriptSourceopt </script> -> JSXElement with content: ScriptSource ("" when empty) and no children',
	'@if -> JSXIfExpression',
	'@for -> JSXForExpression',
	'@switch -> JSXSwitchExpression',
	'@try -> JSXTryExpression',
	'module Identifier { ModuleItemListopt } -> TSModuleDeclaration',
	'import ImportClause from Identifier -> ImportDeclaration with Identifier source',
].join('\n');

const FUNCTION_AST_SHAPE = [
	'interface FunctionDeclaration {',
	"  type: 'FunctionDeclaration';",
	'  id: Identifier | null;',
	'  params: Pattern[];',
	'  body: BlockStatement | JSXCodeBlock;',
	'  typeParameters?: TSTypeParameterDeclaration;',
	'}',
	'',
	'interface ReturnStatement {',
	"  type: 'ReturnStatement';",
	'  argument: Expression | null;',
	'}',
].join('\n');

const TEMPLATE_AST_SHAPE = [
	'interface JSXElement {',
	"  type: 'JSXElement';",
	'  openingElement: JSXOpeningElement;',
	'  closingElement: JSXClosingElement | null;',
	'  children: TemplateChild[];',
	'  // A <script> with a closing tag: its body as written; children is empty.',
	'  content?: string;',
	'  metadata?: { native_tsrx?: true };',
	'}',
	'',
	'interface JSXOpeningElement {',
	"  type: 'JSXOpeningElement';",
	'  name: JSXIdentifier | JSXMemberExpression | JSXNamespacedName | JSXExpressionContainer;',
	'  attributes: Array<JSXAttribute | JSXSpreadAttribute>;',
	'  selfClosing: boolean;',
	'}',
	'',
	'interface JSXExpressionContainer {',
	"  type: 'JSXExpressionContainer';",
	'  expression: Expression | JSXEmptyExpression;',
	'}',
	'',
	'interface JSXText {',
	"  type: 'JSXText';",
	'  value: string;',
	'}',
].join('\n');

const EXPRESSION_AST_SHAPE = [
	'interface JSXFragment {',
	"  type: 'JSXFragment';",
	'  openingFragment: JSXOpeningFragment;',
	'  closingFragment: JSXClosingFragment;',
	'  children: TemplateChild[];',
	'  metadata?: { native_tsrx?: true };',
	'}',
	'',
	'type TSRXExpressionValue =',
	'  | JSXElement',
	'  | JSXFragment',
	'  | JSXStyleElement',
	'  | JSXCodeBlock',
	'  | JSXIfExpression',
	'  | JSXForExpression',
	'  | JSXSwitchExpression',
	'  | JSXTryExpression;',
	'',
	'type TemplateOutput =',
	'  | JSXElement',
	'  | JSXFragment',
	'  | JSXIfExpression',
	'  | JSXForExpression',
	'  | JSXSwitchExpression',
	'  | JSXTryExpression;',
	'',
	'type TemplateChild =',
	'  | JSXText',
	'  | JSXExpressionContainer',
	'  | JSXCodeBlock',
	'  | TemplateOutput',
	'  | JSXStyleElement;',
].join('\n');

const TSRX_EXTENSION_AST_SHAPE = [
	'interface JSXCodeBlock {',
	"  type: 'JSXCodeBlock';",
	'  body: StatementListItem[];',
	'  render: TemplateOutput;',
	'}',
	'',
	'interface JSXStyleElement {',
	"  type: 'JSXStyleElement';",
	'  openingElement: JSXOpeningElement;',
	'  closingElement: JSXClosingElement | null;',
	'  children: StyleSheet[];',
	'  css?: string;',
	'  metadata?: {',
	'    native_tsrx?: true;',
	'    styleScopeHash?: string;',
	"    styleKind?: 'theme';",
	'    styleApplies?: StyleApplyResolution[];',
	'  };',
	'}',
	'',
	'interface StyleApplyResolution {',
	'  expression: Identifier | MemberExpression;',
	'  target: JSXStyleElement | null;',
	"  kind: 'local' | 'import';",
	'}',
	'',
	'interface ProgramStyleMetadata {',
	'  assigned: JSXStyleElement[];',
	'  standalone: JSXStyleElement[];',
	'}',
	'',
	'interface JSXIfExpression {',
	"  type: 'JSXIfExpression';",
	"  statementType: 'IfStatement';",
	'  test: Expression;',
	'  consequent: Statement;',
	'  alternate: Statement | null;',
	'}',
	'',
	'interface JSXForExpression {',
	"  type: 'JSXForExpression';",
	"  statementType: 'ForStatement' | 'ForInStatement' | 'ForOfStatement';",
	'  body: Statement;',
	'  init?: VariableDeclaration | Expression | null;',
	'  test?: Expression | null;',
	'  update?: Expression | null;',
	'  left?: VariableDeclaration | Pattern;',
	'  right?: Expression;',
	'  await?: boolean;',
	'  index?: Identifier | null;',
	'  key?: Expression | null;',
	'  empty?: BlockStatement | null;',
	'}',
	'',
	'interface JSXSwitchExpression {',
	"  type: 'JSXSwitchExpression';",
	"  statementType: 'SwitchStatement';",
	'  discriminant: Expression;',
	'  cases: SwitchCase[];',
	'}',
	'',
	'interface JSXTryExpression {',
	"  type: 'JSXTryExpression';",
	"  statementType: 'TryStatement';",
	'  block: BlockStatement;',
	'  handler: CatchClause | null;',
	'  finalizer: BlockStatement | null;',
	'  pending?: BlockStatement | null;',
	'}',
].join('\n');

const SPECIAL_AST_SHAPE = [
	'interface TSModuleDeclaration {',
	"  type: 'TSModuleDeclaration';",
	'  id: Identifier;',
	'  body: TSModuleBlock;',
	'}',
	'',
	'interface TSModuleBlock {',
	"  type: 'TSModuleBlock';",
	'  body: Array<Statement | ImportDeclaration | ExportNamedDeclaration>;',
	'}',
	'',
	'interface CSSStyleSheet {',
	"  type: 'StyleSheet';",
	'  children: Array<Atrule | Rule>;',
	'  source: string;',
	'  hash: string;',
	'}',
].join('\n');

const TSRX_ERROR_CODES = [
	"TSRX1001  Unclosed tag '<div>'. Expected '</div>' before end of template.",
	'          const a = <div><b>text</b>;',
	"TSRX1002  Expected closing tag to match opening tag. Expected '</div>' but found '</span>'",
	'          const a = <div></span>;',
	'TSRX1003  Unexpected closing tag',
	'          @{ <div></span> }  (when recovering)',
	"TSRX1004  '</script' can end a script in HTML, so a '<script>' body can't contain it.",
	'          <script>s = "</scripts>";</script>',
	'TSRX1005  Namespaced elements are not supported in TSRX templates: <foo:bar>.',
	'          <foo:bar />',
	'TSRX1006  Attribute values cannot be spread. Use a spread attribute (`{...props}`) instead.',
	'          <div a={...b} />',
	'TSRX1007  TSRX expression containers do not use semicolons. Remove this semicolon.',
	'          <div>{a;}</div>  (when recovering)',
	'TSRX1008  Expected `{` after JSX control-flow directive.',
	'          <div>@if (x) <b /></div>',
	'TSRX1009  Expected `@else` after `@if` block. (also `@empty`, `@pending`, `@catch`)',
	'          <div>@if (x) { <b /> } else { <i /> }</div>',
	'TSRX1010  Missing `@catch` or `@pending` after `@try` block.',
	'          <div>@try { <b /> }</div>',
	'TSRX1011  Expected identifier after "index" keyword; "index" must come before "key"',
	'          @for (const x of xs; key x index i) { <li /> }',
	'TSRX2001  Return statements are not allowed inside TSRX templates.',
	'          @try { return; } @catch (e) { <p /> }',
	'TSRX2002  Return statements are not allowed inside TSRX template @if blocks.',
	'          @if (x) { return; }',
	'TSRX2003  Break statements are not allowed inside TSRX template @if blocks.',
	'          @if (x) { for (const y of ys) { break; } <p /> }',
	'TSRX2004  Continue statements are not allowed inside TSRX template @if blocks.',
	'          @if (x) { for (const y of ys) { continue; } <p /> }',
	'TSRX2005  Return statements are not allowed inside TSRX template for...of loops.',
	'          @for (const x of xs) { return; }',
	'TSRX2006  Break statements are not allowed inside TSRX template for...of loops.',
	'          @for (const x of xs) { break; }',
	'TSRX2007  Continue statements are not allowed inside TSRX template for...of loops.',
	'          @for (const x of xs) { continue; }',
	'TSRX2008  `break` is invalid inside `@switch` cases.',
	'          @switch (x) { @case 1: { break; } }',
	'TSRX2009  `return` is invalid inside `@switch` cases.',
	'          @switch (x) { @case 1: { return; } }',
	'TSRX2010  This TSRX template output is unused.',
	'          function App() { <div />; }',
	"TSRX2011  A code block renders a single node; wrap multiple nodes or text in a fragment '<>…</>'.",
	'          @{ <a /> <b /> }',
	"TSRX2012  Code must be at the top of '@{ }'; statements cannot follow the rendered output.",
	'          @{ <a /> const x = 1; }',
	'TSRX2013  JSX spread children (`{...items}`) are not supported.',
	'          <div>{...items}</div>',
	'TSRX2014  A dynamic tag expression must be an identifier, a member access such as `props.as` or `registry[name]`, or a string literal.',
	'          <{x ? A : B} />',
	'TSRX2015  TSRX `@for` currently supports `for...of` loops in template output.',
	'          @for (const k in o) { <li /> }',
	'TSRX2016  Element has multiple `ref={...}` attributes; an element may have at most one.',
	'          <div ref={a} ref={b} />',
	'TSRX2017  Invalid HTML nesting: <p> cannot be a descendant of <p>.',
	'          <p><p /></p>  (on targets that check nesting)',
	'TSRX2018  <target> TSRX does not support JavaScript `try/finally` in TSRX templates.',
	'          a template try with a finally block, in a tree from another parser',
	'TSRX2019  TSRX try statements must have a `pending` or `catch` block.',
	'          a template try with neither, in a tree from another parser',
	'TSRX2020  <target> TSRX does not support `@pending`.',
	'          @try { <p /> } @pending { <p /> }  (on targets without it)',
	'TSRX2021  <target> TSRX does not support `await` here.',
	'          @catch (e) { <p>{await f(e)}</p> }',
	'TSRX2022  <target> TSRX does not support `yield` here.',
	'          <ul>{@for (const x of xs) { <li title={yield x} /> }}</ul>',
	'TSRX2023  <target> TSRX does not support `super` here.',
	'          *f(p) { return p ? <i ref={r} {...s} t={yield super.x} /> : null; }',
	'TSRX2024  <target> TSRX does not support `for await...of` in TSRX templates.',
	'          @for await (const x of xs) { <p /> }',
	'TSRX2025  Top-level `await` in TSRX functions requires a module-level `"use server"` directive.',
	'          async function App() @{ const x = await f(); <p>{x}</p> }',
	'TSRX2026  <target> ErrorBoundary does not provide a reset callback.',
	'          @catch (e, reset) { <p /> }  (Hono)',
	"TSRX3001  The 'apply' attribute of a <style> block requires an expression value.",
	'          <style apply="a" />',
	"TSRX3002  'a' is not a style block.",
	'          <style apply={a} />',
	"TSRX3003  'a' is applied before its declaration.",
	'          <style apply={a} /> … const a = <style>.x {}</style>;',
	"TSRX3004  A <style> block accepts a single 'apply' attribute.",
	'          <style apply={a} apply={a} />',
	"TSRX3005  The 'apply' attribute is only supported on scoped <style> blocks.",
	'          <style href="x.css" apply={a} />',
	"TSRX3006  '$class' is reserved on assigned <style> blocks.",
	'          const t = <style>.\\$class {}</style>;',
	'TSRX3007  A standalone <style> block is only allowed inside a template scope.',
	'          <style>.a {}</style>;  (at module scope)',
	'TSRX3008  A standalone <style> block with CSS text is TSRX template syntax and needs an enclosing @{ … } body.',
	'          return <div><style>p {}</style></div>;',
	'TSRX3009  A standalone <style> block must be a child of an element or a fragment.',
	'          @{ <style>p {}</style> }',
	"TSRX3010  Unknown <style> attribute 'id'.",
	'          <style id="x">p {}</style>',
	'TSRX3011  :global(...) can be at the start or end of a selector sequence, but not in the middle.',
	'          a :global(b) c {}',
	'TSRX3012  @import is not supported in <style> blocks.',
	"          <style>@import 'a.css';</style>",
	"TSRX3013  The CSS parser's message, such as: Expected }",
	'          <style>p { color: red; </style>',
	'TSRX4001  Platform flag usage requires a configured TSRX platform.',
	'          import.meta.env.platform.web  (without tsrx.platform)',
	'TSRX4002  Cannot declare a variable named "_$_x" as identifiers starting with "_$_" are reserved',
	'          const _$_x = 1;',
	"TSRX4003  A JavaScript syntax error TypeScript doesn't report, with the parser's message.",
	"          import a from 'a' with { type: 'json', type: 'json' };",
].join('\n');

const TYPESCRIPT_ERROR_CODES = [
	'TS1002  Unterminated string literal.',
	'TS1003  Identifier expected.',
	"TS1005  '{0}' expected.",
	'TS1009  Trailing comma not allowed.',
	"TS1010  '*/' expected.",
	'TS1012  Unexpected token.',
	'TS1013  A rest parameter or binding pattern may not have a trailing comma.',
	"TS1024  'readonly' modifier can only appear on a property declaration or index signature.",
	'TS1028  Accessibility modifier already seen.',
	"TS1029  '{0}' modifier must precede '{1}' modifier.",
	"TS1030  '{0}' modifier already seen.",
	"TS1031  '{0}' modifier cannot appear on class elements of this kind.",
	"TS1038  A 'declare' modifier cannot be used in an already ambient context.",
	'TS1039  Initializers are not allowed in ambient contexts.',
	"TS1040  '{0}' modifier cannot be used in an ambient context.",
	"TS1042  '{0}' modifier cannot be used here.",
	"TS1044  '{0}' modifier cannot appear on a module or namespace element.",
	'TS1047  A rest parameter cannot be optional.',
	'TS1048  A rest parameter cannot have an initializer.',
	"TS1049  A 'set' accessor must have exactly one parameter.",
	"TS1051  A 'set' accessor cannot have an optional parameter.",
	"TS1053  A 'set' accessor cannot have rest parameter.",
	"TS1054  A 'get' accessor cannot have parameters.",
	"TS1070  '{0}' modifier cannot appear on a type member.",
	"TS1071  '{0}' modifier cannot appear on an index signature.",
	"TS1079  A '{0}' modifier cannot be used with an import declaration.",
	"TS1089  '{0}' modifier cannot appear on a constructor declaration.",
	'TS1092  Type parameters cannot appear on a constructor declaration.',
	'TS1094  An accessor cannot have type parameters.',
	"TS1095  A 'set' accessor cannot have a return type annotation.",
	"TS1097  '{0}' list cannot be empty.",
	'TS1098  Type parameter list cannot be empty.',
	'TS1099  Type argument list cannot be empty.',
	"TS1100  Invalid use of '{0}' in strict mode.",
	"TS1101  'with' statements are not allowed in strict mode.",
	"TS1102  'delete' cannot be called on an identifier in strict mode.",
	"TS1103  'for await' loops are only allowed within async functions and at the top levels of modules.",
	"TS1104  A 'continue' statement can only be used within an enclosing iteration statement.",
	"TS1105  A 'break' statement can only be used within an enclosing iteration or switch statement.",
	"TS1108  A 'return' statement can only be used within a function body.",
	'TS1109  Expression expected.',
	"TS1111  Private field '{0}' must be declared in an enclosing class.",
	"TS1113  A 'default' clause cannot appear more than once in a 'switch' statement.",
	"TS1114  Duplicate label '{0}'.",
	'TS1117  An object literal cannot have multiple properties with the same name.',
	'TS1123  Variable declaration list cannot be empty.',
	'TS1124  Digit expected.',
	'TS1125  Hexadecimal digit expected.',
	'TS1127  Invalid character.',
	'TS1128  Declaration or statement expected.',
	'TS1134  Variable declaration expected.',
	'TS1136  Property assignment expected.',
	'TS1141  String literal expected.',
	'TS1142  Line break not permitted here.',
	"TS1145  '{' or JSX element expected.",
	'TS1146  Declaration expected.',
	"TS1155  '{0}' declarations must be initialized.",
	"TS1156  '{0}' declarations can only be declared inside a block.",
	'TS1160  Unterminated template literal.',
	'TS1161  Unterminated regular expression literal.',
	'TS1177  Binary digit expected.',
	'TS1178  Octal digit expected.',
	'TS1182  A destructuring declaration must have an initializer.',
	'TS1183  An implementation cannot be declared in ambient contexts.',
	'TS1184  Modifiers cannot appear here.',
	'TS1186  A rest element cannot have an initializer.',
	'TS1187  A parameter property may not be declared using a binding pattern.',
	"TS1189  The variable declaration of a 'for...in' statement cannot have an initializer.",
	"TS1190  The variable declaration of a 'for...of' statement cannot have an initializer.",
	'TS1198  An extended Unicode escape value must be between 0x0 and 0x10FFFF inclusive.',
	'TS1206  Decorators are not valid here.',
	"TS1209  Invalid optional chain from new expression. Did you mean to call '{0}()'?",
	"TS1212  Identifier expected. '{0}' is a reserved word in strict mode.",
	'TS1231  An export assignment must be at the top level of a file or module declaration.',
	'TS1232  An import declaration can only be used at the top level of a namespace or module.',
	'TS1233  An export declaration can only be used at the top level of a namespace or module.',
	'TS1235  A namespace declaration is only allowed at the top level of a namespace or module.',
	"TS1242  'abstract' modifier can only appear on a class, method, or property declaration.",
	"TS1243  '{0}' modifier cannot be used with '{1}' modifier.",
	'TS1244  Abstract methods can only appear within an abstract class.',
	"TS1245  Method '{0}' cannot have an implementation because it is marked abstract.",
	"TS1254  A 'const' initializer in an ambient context must be a string or numeric literal or literal enum reference.",
	'TS1257  A required element cannot follow an optional element.',
	'TS1258  A default export must be at the top level of a file or module declaration.',
	'TS1260  Keywords cannot contain escape characters.',
	"TS1262  Identifier expected. '{0}' is a reserved word at the top-level of a module.",
	"TS1267  Property '{0}' cannot have an initializer because it is marked abstract.",
	"TS1273  '{0}' modifier cannot appear on a type parameter",
	"TS1274  '{0}' modifier can only appear on a type parameter of a class, interface or type alias",
	"TS1275  'accessor' modifier can only appear on a property declaration.",
	"TS1308  'await' expressions are only allowed within async functions and at the top levels of modules.",
	"TS1312  Did you mean to use a ':'? An '=' can only follow a property name when the containing object literal is part of a destructuring pattern.",
	'TS1316  Global module exports may only appear at top level.',
	'TS1317  A parameter property cannot be declared using a rest parameter.',
	'TS1341  Class constructor may not be an accessor.',
	"TS1347  'use strict' directive cannot be used with non-simple parameter list.",
	'TS1351  An identifier or keyword cannot immediately follow a numeric literal.',
	"TS1354  'readonly' type modifier is only permitted on array and tuple literal types.",
	'TS1358  Tagged template expressions are not permitted in an optional chain.',
	"TS1359  Identifier expected. '{0}' is a reserved word that cannot be used here.",
	'TS1363  A type-only import can specify a default import or named bindings, but not both.',
	'TS1368  Class constructor may not be a generator.',
	"TS1381  Unexpected token. Did you mean `{'}'}` or `&rbrace;`?",
	"TS1382  Unexpected token. Did you mean `{'>'}` or `&gt;`?",
	"TS1392  An import alias cannot use 'import type'",
	'TS1438  Interface must be given a name.',
	"TS1451  Private identifiers are only allowed in class bodies and may only be used as part of a class member declaration, property access, or on the left-hand-side of an 'in' expression",
	"TS1472  'catch' or 'finally' expected.",
	'TS1477  An instantiation expression cannot be followed by a property access.',
	'TS1478  Identifier or string literal expected.',
	"TS1487  Octal escape sequences are not allowed. Use the syntax '{0}'.",
	"TS1488  Escape sequence '{0}' is not allowed.",
	"TS1491  '{0}' modifier cannot appear on a 'using' declaration.",
	"TS1493  The left-hand side of a 'for...in' statement cannot be a 'using' declaration.",
	"TS1494  The left-hand side of a 'for...in' statement cannot be an 'await using' declaration.",
	"TS1495  '{0}' modifier cannot appear on an 'await using' declaration.",
	'TS1499  Unknown regular expression flag.',
	'TS1500  Duplicate regular expression flag.',
	'TS1504  Subpattern flags must be present when there is a minus sign.',
	'TS1506  Numbers out of order in quantifier.',
	'TS1507  There is nothing available for repetition.',
	"TS1508  Unexpected '{0}'. Did you mean to escape it with backslash?",
	"TS1510  '\\k' must be followed by a capturing group name enclosed in angle brackets.",
	"TS1512  '\\c' must be followed by an ASCII letter.",
	'TS1514  Expected a capturing group name.',
	'TS1515  Named capturing groups with the same name must be mutually exclusive to each other.',
	'TS1516  A character class range must not be bounded by another character class.',
	'TS1517  Range out of order in character class.',
	'TS1518  Anything that would possibly match more than a single character is invalid inside a negated character class.',
	'TS1526  Unknown Unicode property value.',
	'TS1529  Unknown Unicode property name or value.',
	"TS1532  There is no capturing group named '{0}' in this regular expression.",
	'TS1535  This character cannot be escaped in a regular expression.',
	"TS2206  The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.",
	"TS2207  The 'type' modifier cannot be used on a named export when 'export type' is used on its export statement.",
	"TS2300  Duplicate identifier '{0}'.",
	"TS2304  Cannot find name '{0}'.",
	'TS2337  Super calls are not permitted outside constructors or in nested functions inside constructors.',
	'TS2364  The left-hand side of an assignment expression must be a variable or a property access.',
	'TS2369  A parameter property is only allowed in a constructor implementation.',
	'TS2371  A parameter initializer is only allowed in a function or constructor implementation.',
	'TS2392  Multiple constructor implementations are not allowed.',
	"TS2451  Cannot redeclare block-scoped variable '{0}'.",
	'TS2463  A binding pattern parameter cannot be optional in an implementation signature.',
	"TS2480  'let' is not allowed to be used as a name in 'let' or 'const' declarations.",
	"TS2523  'yield' expressions cannot be used in a parameter initializer.",
	"TS2524  'await' expressions cannot be used in a parameter initializer.",
	'TS2657  JSX expressions must have one parent element.',
	"TS2660  'super' can only be referenced in members of derived classes or object literal expressions.",
	"TS2668  'export' modifier cannot be applied to ambient modules and module augmentations since they are always visible.",
	"TS2699  Static property '{0}' conflicts with built-in property 'Function.{0}' of constructor function '{1}'.",
	'TS2779  The left-hand side of an assignment expression may not be an optional property access.',
	"TS2784  'get' and 'set' accessors cannot declare 'this' parameters.",
	"TS2815  'arguments' cannot be referenced in property initializers or class static initialization blocks.",
	"TS2852  'await using' statements are only allowed within async functions and at the top levels of modules.",
	'TS2858  Import attribute values must be string literal expressions.',
	"TS4112  This member cannot have an 'override' modifier because its containing class '{0}' does not extend another class.",
	"TS5076  '{0}' and '{1}' operations cannot be mixed without parentheses.",
	'TS6188  Numeric separators are not allowed here.',
	'TS6189  Multiple consecutive numeric separators are not permitted.',
	'TS7059  This syntax is reserved in files with the .mts or .cts extension. Use an `as` expression instead.',
	'TS7060  This syntax is reserved in files with the .mts or .cts extension. Add a trailing comma or explicit constraint.',
	"TS17000  JSX attributes must only be assigned a non-empty 'expression'.",
	"TS17002  Expected corresponding JSX closing tag for '{0}'.",
	"TS17008  JSX element '{0}' has no corresponding closing tag.",
	"TS17012  '{0}' is not a valid meta-property for keyword '{1}'. Did you mean '{2}'?",
	"TS17013  Meta-property '{0}' is only allowed in the body of a function declaration, function expression, or constructor.",
	"TS18006  Classes may not have a field named 'constructor'.",
	'TS18010  An accessibility modifier cannot be used with a private identifier.',
	"TS18011  The operand of a 'delete' operator cannot be a private identifier.",
	"TS18012  '#constructor' is a reserved word.",
	'TS18016  Private identifiers are not allowed outside class bodies.',
	"TS18019  '{0}' modifier cannot be used with a private identifier.",
	"TS18037  'await' expression cannot be used inside a class static block.",
	'TS18059  Named imports are not allowed in a deferred import.',
].join('\n');

const NAV_ITEMS = [
	{ id: 'status', label: 'Status' },
	{ id: 'introduction', label: 'Introduction' },
	{ id: 'rationale', label: 'Rationale' },
	{ id: 'conformance', label: 'Conformance' },
	{ id: 'notation', label: 'Notational Conventions' },
	{ id: 'lexical', label: 'Lexical Conventions' },
	{ id: 'productions', label: 'Modified Productions' },
	{ id: 'components', label: 'Function Bodies' },
	{ id: 'templates', label: 'Template Elements' },
	{ id: 'expression-values', label: 'Expression Values' },
	{ id: 'style', label: 'Style Elements' },
	{ id: 'script', label: 'Script Elements' },
	{ id: 'server-profile', label: 'Server Extensions' },
	{ id: 'early-errors', label: 'Early Errors' },
	{ id: 'host-defined', label: 'Host-defined Semantics' },
	{ id: 'appendices', label: 'Appendices' },
	{ id: 'error-codes', label: 'Error Codes' },
];

export function SpecificationPage() @{
	<>
		<head>
			<title>TSRX | Specification</title>
			<meta
				name="description"
				content="Draft TSRX language specification: TypeScript-compatible JSX extensions, statement containers, control-flow expressions, style identifiers, and host-defined server extensions."
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
						<a href="/specification" aria-current="page">
							Specification
						</a>
						<a href="/playground">Playground</a>
						<a href="/blog">Blog</a>
						<a href="https://discord.gg/HCYpT5QHQR" target="_blank" rel="noopener noreferrer">
							Discord
						</a>
						<a href="https://github.com/tsrx-org/tsrx" target="_blank" rel="noopener noreferrer">
							GitHub
						</a>
						<a href="/llms.txt" target="_blank" rel="noopener noreferrer">
							llms.txt
						</a>
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
							<p class="side-nav-heading">Draft Spec</p>
							@for (const item of NAV_ITEMS) {
								<a class="side-nav-link" href={`#${item.id}`}>
									{item.label}
								</a>
							}
						</nav>
					</aside>

					<main class="docs-content">
						<section class="doc-section" id="status">
							<p class="section-kicker">Draft / June 7, 2026</p>
							<h1 class="page-heading">TSRX</h1>
							<p class="section-body lead">
								This page is the working language specification for TSRX. It is written for
								implementors of parsers, language tooling, compilers, and hosts that need a precise
								account of the syntax and static constraints of the language.
							</p>
							<div class="status-panel">
								<p class="status-chip">First-edition scope</p>
								<p class="section-body compact">
									The current draft fixes the syntax and early-error surface for JSX-shaped TSRX
									values, JSX statement containers, template control flow, sibling-scoped style
									blocks with themes and apply, and proposal-aligned submodule declarations.
								</p>
							</div>
						</section>

						<section class="doc-section" id="introduction">
							<h2 class="section-heading">Introduction</h2>
							<p class="section-body">
								TSRX is a TypeScript-compatible syntax extension to ECMAScript for authoring
								component-oriented user interface programs. It extends the TypeScript source
								language with JSX-shaped template values, JSX statement containers, template
								control-flow directives, sibling-scoped style elements, and style identifiers.
							</p>
							<p class="section-body">
								This specification defines the syntax of TSRX and the static constraints that a
								conforming implementation is expected to enforce. It does not propose incorporation
								of TSRX into the ECMAScript standard, and it does not require JavaScript engines or
								browsers to parse TSRX directly. Instead, it defines a source language intended for
								compilers, preprocessors, editors, formatters, and other tooling.
							</p>
							<p class="section-body">
								Unless this document explicitly states otherwise, a construct that is valid in the
								TypeScript baseline grammar remains valid in TSRX source text. The grammar additions
								in this document are therefore additive and TypeScript-compatible.
							</p>
						</section>

						<section class="doc-section" id="rationale">
							<h2 class="section-heading">Rationale</h2>
							<p class="section-body">
								TSRX exists to define a predictable syntax for component-oriented source code while
								preserving the familiar JSX AST shape. Elements, fragments, text, expression
								containers, attributes, and spread attributes use the standard JSX node family; TSRX
								adds only the nodes needed for statement containers, style blocks, and template
								control flow.
							</p>
							<ul class="spec-list">
								<li>
									Returned TSRX templates are represented with JSXElement and JSXFragment nodes.
								</li>
								<li>
									Native TSRX values can be assigned, returned, or passed as props using ordinary
									JSX-shaped nodes.
								</li>
								<li>
									Host features such as server execution and stylesheet composition can be specified
									cleanly on top of a shared grammar.
								</li>
							</ul>
						</section>

						<section class="doc-section" id="conformance">
							<h2 class="section-heading">1 Conformance</h2>
							<p class="section-body">
								An implementation of core TSRX conforms to this specification if it accepts
								TypeScript source text together with the additional TSRX constructs defined here,
								rejects source texts that violate the listed early-error rules, and documents any
								host-defined or profile-defined semantics that are not fixed by the core language.
							</p>
							<p class="section-body">
								This specification distinguishes between core TSRX and host profiles. Core TSRX
								defines the syntax and static rules common to all conforming implementations. A host
								profile may add profile-specific constructs or strengthen restrictions on core
								constructs.
							</p>
						</section>

						<section class="doc-section" id="notation">
							<h2 class="section-heading">2 Notational Conventions</h2>
							<p class="section-body">
								The syntactic and lexical grammar of ECMAScript are incorporated by reference as
								already extended by a TypeScript-compatible baseline grammar. When this document
								presents a modified production, it should be read as a delta against that baseline
								rather than as a complete restatement of the surrounding grammar.
							</p>
						</section>

						<section class="doc-section" id="lexical">
							<h2 class="section-heading">3 Modified Lexical Conventions</h2>
							<p class="section-body">
								TSRX introduces module declarations that can be imported by identifier source. It
								adds no other lexical forms; every other TSRX construct is built from tokens that
								the TypeScript-compatible baseline grammar already defines.
							</p>
						</section>

						<section class="doc-section" id="productions">
							<h2 class="section-heading">4.1 Modified Productions</h2>
							<p class="section-body">
								The following productions define the normative core additions for the first edition.
								They are additive over the TypeScript-compatible baseline grammar used by TSRX
								implementations.
							</p>
							<pre class="code-block plain">
								<code>{MODIFIED_PRODUCTIONS}</code>
							</pre>
						</section>

						<section class="doc-section" id="components">
							<h2 class="section-heading">4.2 Function Bodies and Returns</h2>
							<p class="section-body">
								TSRX does not define a component declaration form. Components are ordinary
								functions. A function can return a TSRX expression from a normal return statement,
								or use the statement-container body shorthand when the whole body is TypeScript
								setup followed by one rendered output.
							</p>
							<pre class="code-block plain">
								<code>{FUNCTION_ENTRY_GRAMMAR}</code>
							</pre>
							<p class="section-body muted">
								Class methods, object methods, arrow functions, and function expressions all remain
								ordinary TypeScript constructs. Hosts may choose which TSRX-producing functions are
								considered components.
							</p>
						</section>

						<section class="doc-section" id="templates">
							<h2 class="section-heading">4.3 Template Elements</h2>
							<p class="section-body">
								Within a returned TSRX template, direct element, fragment, style, text, and
								expression-container children use the standard JSX node family. JavaScript line and
								block comments are permitted between the children of every element and fragment in a
								TSRX source text, in a template or not (A.4), and do not render. A comment between
								children renders like
								<code class="inline-code">{'{/* … */}'}</code>
								in TSX: the text on each side of it follows JSX's whitespace rules on its own. A
								<code class="inline-code">{'/*'}</code>
								starts a comment anywhere. A<code class="inline-code">{'//'}</code>
								starts a line comment where whitespace comes right before it, at the start of a
								line, or right after a tag, an expression container, or a block, and the comment
								runs to the end of the line, a closing tag on it included. A
								<code class="inline-code">{'//'}</code>
								that touches other text, as in
								<code class="inline-code">{'https://example.com'}</code>
								or
								<code class="inline-code">{'a//b'}</code>, is text. So is a character reference or a
								string expression: only
								<code class="inline-code">{'/*'}</code>
								and
								<code class="inline-code">{'//'}</code>
								start a comment, so
								<code class="inline-code">{'&#47;*'}</code>,
								<code class="inline-code">{'&#47;/'}</code>
								and
								<code class="inline-code">{"{'/* … */'}"}</code>
								render as text. This differs from TSX, where
								<code class="inline-code">{'/* … */'}</code>
								and a line starting with
								<code class="inline-code">{'//'}</code>
								between children are text. Template control flow uses directive-prefixed
								<code class="inline-code">@if</code>,<code class="inline-code">@for</code>,
								<code class="inline-code">@switch</code>, and
								<code class="inline-code">@try</code>
								blocks whose bodies render template children.
							</p>
							<p class="section-body">
								Every JSX control-flow body is an implicit statement container and must use a
								<code class="inline-code">{'{}'}</code>
								template block after the directive header.
							</p>
							<p class="section-body">
								Each
								<code class="inline-code">@switch</code>
								<code class="inline-code">@case</code>
								and
								<code class="inline-code">@default</code>
								must use a<code class="inline-code">{'{}'}</code>
								template block. Cases are isolated: they do not fall through to later cases, and
								<code class="inline-code">break</code>
								and
								<code class="inline-code">return</code>
								are syntax errors inside a JSX switch case.
							</p>
							<p class="section-body">
								Plain JSX children are the default. When an expression position, function body,
								element child, or fragment child needs local TypeScript statements before rendering,
								those statements must be contained in a JSX statement container written as
								<code class="inline-code">{'@{...}'}</code>. A statement container places setup
								statements first and then exactly one output node: a JSX element, JSX fragment, or
								JSX control-flow expression. If the output needs text, expression containers, or
								multiple siblings after setup, wrap them in a JSX fragment. Standalone style
								elements are not output nodes: any number may sit among the setup statements or
								after the output node, and they scope the container (4.5).
							</p>
							<p class="section-body">
								Control-flow block bodies follow the same structural rule as statement containers:
								TypeScript first (although optional), then an optional rendered template output. The
								ordinary JSX form
								<code class="inline-code">{'{ AssignmentExpression }'}</code>
								contributes a JSXExpressionContainer node and is not itself a statement container. A
								function exit remains an ordinary
								<code class="inline-code">return</code>
								statement.
							</p>
							<pre class="code-block plain">
								<code>{TEMPLATE_EXPRESSION_GRAMMAR}</code>
							</pre>
							<p class="section-body">
								Runtime dynamic element and component selection uses the dynamic tag syntax: a JSX
								expression container in element-name position, written
								<code class="inline-code">{'<{expression}>'}</code>. The expression can evaluate to
								a string tag name or a component constructor, and a non-self-closing element repeats
								the same expression in its closing tag:
								<code class="inline-code">{'</{expression}>'}</code>. No runtime import is required;
								each target compiler lowers the form to its own runtime helper.
							</p>
							<pre class="code-block plain">
								<code>{DYNAMIC_TAG_GRAMMAR}</code>
							</pre>
							<pre class="code-block plain">
								<code>{DYNAMIC_TAG_EXAMPLE}</code>
							</pre>
							<p class="section-body">The tag expression must be one of three forms:</p>
							<ul class="spec-list">
								<li>
									an identifier, such as
									<code class="inline-code">tag</code>;
								</li>
								<li>
									a member access, including chains, such as
									<code class="inline-code">props.as</code>,
									<code class="inline-code">this.tag</code>,
									<code class="inline-code">registry[name]</code>
									or
									<code class="inline-code">items[0]</code>. The chain starts at an identifier or
									<code class="inline-code">this</code>, and each computed key is an identifier, a
									string or number literal, or a member access;
								</li>
								<li>
									a string literal, such as
									<code class="inline-code">'section'</code>.
								</li>
							</ul>
							<p class="section-body">
								Any other expression parses, and is reported as an early error (5). That includes a
								conditional,
								<code class="inline-code">||</code>,<code class="inline-code">??</code>
								and
								<code class="inline-code">&&</code>, even when every branch or operand is one of the
								three forms; parentheses and the type-only wrappers
								<code class="inline-code">as</code>,<code class="inline-code">satisfies</code>
								and
								<code class="inline-code">!</code>; optional member access; calls,
								<code class="inline-code">new</code>, string concatenation, template literals,
								assignments and sequences; functions, elements and fragments; and every literal
								other than a string. A non-self-closing element repeats the expression in its
								closing tag, so anything more is computed above the element and the result used as
								the tag:
								<code class="inline-code">{'const Tag = c ? Child : Fallback;'}</code>
								followed by
								<code class="inline-code">{'<{Tag} />'}</code>. Forms such as
								<code class="inline-code">{'<@tag />'}</code>
								and
								<code class="inline-code">{'<@Component />'}</code>
								are not dynamic tag syntax in current TSRX.
							</p>
							<ul class="spec-list">
								<li>
									A JSX text child is represented by
									<code class="inline-code">JSXText</code>
									and contributes escaped static text. Character references such as
									<code class="inline-code">{'&quot;'}</code>
									are decoded before the text value is stored. A comment between children is not
									part of any JSXText: text ends before it and starts again after it, and the
									comment is the inner comment of an empty
									<code class="inline-code">{'{}'}</code>
									of its own (a
									<code class="inline-code">JSXExpressionContainer</code>
									holding a<code class="inline-code">JSXEmptyExpression</code>, with no braces in
									the source), as
									<code class="inline-code">{'{/* … */}'}</code>
									is in TSX.
								</li>
								<li>
									<code class="inline-code">{'{ AssignmentExpression }'}</code>
									is the generic template-expression form and is represented by
									<code class="inline-code">JSXExpressionContainer</code>.
								</li>
								<li>
									<code class="inline-code">{'@{...}'}</code>
									is the template statement form and is represented by
									<code class="inline-code">JSXCodeBlock</code>.
								</li>
								<li>
									Identifiers named
									<code class="inline-code">text</code>
									are ordinary identifiers in braced template expressions.
								</li>
							</ul>
							<h3 class="appendix-heading">4.3.1 Whitespace</h3>
							<p class="section-body">
								Whitespace in template syntax follows ordinary ECMAScript token-separation rules
								except at a small number of JSX-like boundaries where the delimiter itself is
								whitespace-sensitive.
							</p>
							<ul class="spec-list">
								<li>
									Within
									<code class="inline-code">{'{ AssignmentExpression }'}</code>, whitespace and line
									terminators are admitted wherever the embedded ECMAScript grammar permits them.
									Thus forms such as
									<code class="inline-code">{'{ expr }'}</code>
									are well-formed.
								</li>
								<li>
									The statement-container introducer must be written as the contiguous sequence
									<code class="inline-code">{'@{'}</code>. Whitespace between
									<code class="inline-code">@</code>
									and
									<code class="inline-code">{'{'}</code>
									does not form a JSXCodeBlock.
								</li>
								<li>
									A tag or fragment introducer must be written as a contiguous delimiter sequence.
									Implementations must not treat
									<code class="inline-code">{'< div>'}</code>,
									<code class="inline-code">{'< /div>'}</code>,
									<code class="inline-code">{'</ div>'}</code>,
									<code class="inline-code">{'< >'}</code>, or
									<code class="inline-code">{'< / >'}</code>
									as TSRX template delimiters.
								</li>
								<li>
									Whitespace and comments are not admitted within a single tag name. Source texts
									such as
									<code class="inline-code">{'<Foo . Bar>'}</code>
									do not form a single TSRX tag name.
								</li>
								<li>
									Indentation and line breaks between adjacent template children are permitted as
									layout. They do not require explicit expression containers merely to separate one
									element child from the next.
								</li>
							</ul>
							<p class="section-body">
								The raw style and script elements are also part of this syntax. A style body is
								captured as raw text for host-defined stylesheet processing, and a script body as
								raw text (4.6), rather than being parsed as nested template children.
							</p>
						</section>

						<section class="doc-section" id="expression-values">
							<h2 class="section-heading">4.4 Expression Values</h2>
							<p class="section-body">
								TSRX elements, fragments, style elements, and JSX control-flow expressions are
								expression values by default. A single element can be returned or assigned directly,
								and JSX control flow can be assigned directly when the branch or loop itself is the
								value.
							</p>
							<pre class="code-block plain">
								<code>{EXPRESSION_VALUE_GRAMMAR}</code>
							</pre>
							<p class="section-body">
								Use a fragment when an expression value needs text, dynamic expression children, or
								multiple emitted elements. Use a JSX statement container when local declarations
								must precede that output, including in arrow expression bodies and
								statement-container function bodies. Use a single element when the value is already
								compact.
							</p>
						</section>

						<section class="doc-section" id="style">
							<h2 class="section-heading">4.5 Style Elements and Style Identifiers</h2>
							<p class="section-body">
								The syntax of style elements, where a style block may be placed, the sibling scope a
								standalone block styles, the value an assigned block evaluates to, the meaning of
								the
								<code class="inline-code">apply</code>
								attribute, and the order in which a module's stylesheets are output are part of core
								TSRX. A conforming implementation rewrites every selector of a scoped block to
								require a hash class: a class it adds to each element the block reaches, so that the
								block's selectors match only there. The host is responsible for the text of
								generated hash classes, the name of the class attribute it adds them to, selector
								rewriting, stylesheet registration, and for injecting a module's CSS before the CSS
								of every module that imports it. The selector form
								<code class="inline-code">:global(...)</code>
								marks the wrapped part of a selector as unscoped and may appear only at the start or
								end of a selector sequence (<code class="inline-code">TSRX3011</code>); the block
								form
								<code class="inline-code">{':global { ... }'}</code>
								marks every rule inside it as unscoped.
							</p>
							<pre class="code-block plain">
								<code>{STYLE_GRAMMAR}</code>
							</pre>
							<p class="section-body">
								Keyframe names in a scoped style block are scoped by default. The implementation
								renames each local
								<code class="inline-code">@keyframes</code>
								declaration using the block's hash and rewrites matching names in
								<code class="inline-code">animation</code>
								and
								<code class="inline-code">animation-name</code>
								declarations within that block. A keyframe name beginning with
								<code class="inline-code">-global-</code>
								is emitted with that prefix removed and no hash added: for example,
								<code class="inline-code">@keyframes -global-fadeIn</code>
								becomes
								<code class="inline-code">@keyframes fadeIn</code>. References use the unprefixed
								name, including in other components or style blocks once the defining stylesheet is
								loaded. Keyframes declared inside a
								<code class="inline-code">{':global { ... }'}</code>
								block also retain unscoped names. These rules apply to vendor-prefixed keyframe
								at-rules and animation properties as well. Making a keyframe name global does not
								change the scope of selectors that reference it.
							</p>
							<p class="section-body">
								A style body is captured as raw CSS text. A self-closing style element has no body,
								no stylesheet, and no hash class of its own; it exists to carry an
								<code class="inline-code">apply</code>
								attribute. A scoped style block admits exactly two attributes:
								<code class="inline-code">ref</code>, whose value receives the class-map object of
								the block's scope (4.5.3), and
								<code class="inline-code">apply</code>, whose value must be a StyleApplyValue. Style
								elements inside a<code class="inline-code">{'<head>'}</code>
								element and style elements carrying an
								<code class="inline-code">href</code>
								attribute (resource styles) are outside the scope model of this section: they admit
								any attribute, are not scoped, and do not admit
								<code class="inline-code">apply</code>.
							</p>
							<h3 class="appendix-heading">4.5.1 A block is standalone or assigned</h3>
							<p class="section-body">
								A style element is standalone when it is written as template content: a child of a
								native element or fragment, the output node of a JSXCodeBlock or of a control-flow
								body, or a bare statement. Only the first placement is valid. A style element is an
								output node like any other. A block beside the output node of a JSXCodeBlock or a
								control-flow body is the ordinary multiple-outputs error. A block that is the lone
								output of such a body, or a statement, is an early error (5.1): wrap it with the
								output it styles in a fragment. Any number of standalone blocks may appear in one
								children list. A style element in any other position is assigned: a variable
								initializer, an object property value, a default export, or any other expression
								value. Assigned blocks are legal wherever a JavaScript expression is legal,
								including module scope, function bodies, and nested code blocks. A standalone block
								at module scope is an early error (5.1).
							</p>
							<p class="section-body">
								Raw CSS in a style element is TSRX template syntax. A standalone block with CSS in
								it must sit lexically inside a JSXCodeBlock body or a control-flow body, at any
								depth of native elements, fragments, expression containers, callbacks, or templates
								assigned inside such a body; anywhere else it is an early error (5.1). Plain TSX
								keeps the TSX rule: a<code class="inline-code">{'<style>'}</code>
								element whose first child is an expression container, written
								<code class="inline-code">{'<style>{css}</style>'}</code>, is an ordinary JSXElement
								with no stylesheet, no scope, and no hash class, and the implementation adds nothing
								to it. Head styles and resource styles remain exempt.
							</p>
							<h3 class="appendix-heading">
								4.5.2 A block styles its siblings and everything below them
							</h3>
							<p class="section-body">
								A standalone block is scoped to its siblings. A sibling scope is the children list
								of a native element or fragment that holds at least one standalone block, and a
								standalone block belongs to the children list it is written in. It styles the other
								children of that list and their descendants, and it never styles the element that
								contains it, nor any ancestor. To style an element, make the block and the element
								siblings in a fragment. Children lists nested in a scope that hold blocks are nested
								scopes, whether they sit directly below or inside a nested JSXCodeBlock or a
								control-flow body. Every
								<code class="inline-code">@if</code>
								branch, the
								<code class="inline-code">@for</code>
								body and its
								<code class="inline-code">@empty</code>
								block, every
								<code class="inline-code">@case</code>
								and
								<code class="inline-code">@default</code>
								body, and the
								<code class="inline-code">@try</code>,<code class="inline-code">@pending</code>, and
								<code class="inline-code">@catch</code>
								blocks render one output node, and a fragment there is a scope of its own.
							</p>
							<p class="section-body">
								Sibling blocks share one hash class. All standalone blocks of one list share one
								scope hash: the position-derived hash of the first block in source order that has a
								body. Two blocks in one element's children list share a hash class; a block in an
								enclosing fragment and a block in that element's children list do not. The
								implementation adds the scope's hash class to every native element among the list's
								items and their descendants, through nested scopes, so an element carries the hash
								class of every enclosing scope, outermost first. A composite component element
								receives no classes of its own, although native elements written as its children
								still belong to the scope, and no hash class is added past a function boundary. A
								scope whose blocks are all self-closing has no hash class of its own.
							</p>
							<pre class="code-block plain">
								<code>{STYLE_SCOPE_EXAMPLE}</code>
							</pre>
							<p class="section-body">
								Unused selectors are removed per scope, against the list's other children and their
								subtrees: a selector of a standalone block that matches no element the block reaches
								is unused, including a selector that matches only the element containing the block.
								A block inside an
								<code class="inline-code">@if</code>
								or
								<code class="inline-code">@for</code>
								branch styles only the elements that branch renders: its hash class is added only to
								the elements of its own branch. Its CSS is still always part of the module's
								stylesheet, whether or not the branch ever renders, because CSS is static.
							</p>
							<h3 class="appendix-heading">
								4.5.3 An assigned block evaluates to an object with $class
							</h3>
							<p class="section-body">
								An assigned block evaluates to an object. Its first property is
								<code class="inline-code">$class</code>, a string, followed by one property for
								every class selector that stands alone as a complete selector in the block; the
								value of such a property is the block's hash class, a space, and the class name. A
								class selector named
								<code class="inline-code">$class</code>
								in an assigned block is an early error.
							</p>
							<p class="section-body">
								Every assigned block is a theme. A theme keeps every selector, each scoped under the
								block's hash class, and an implementation must not remove any selector of an
								assigned block as unused. The block's
								<code class="inline-code">$class</code>
								and class properties are ordinary strings that any JavaScript use may carry to any
								element, and
								<code class="inline-code">apply</code>
								may stamp its
								<code class="inline-code">$class</code>
								on scopes in other modules, so no set of elements bounds what the block can match.
								An element that carries a class property such as
								<code class="inline-code">styles.card</code>
								carries the hash class too, so the block's element selectors match it as well.
							</p>
							<p class="section-body">
								<code class="inline-code">$class</code>
								is the space-separated concatenation of the
								<code class="inline-code">$class</code>
								of every applied block, in
								<code class="inline-code">apply</code>
								order, followed by the block's own hash class. A block without a body exposes
								<code class="inline-code">$class</code>
								only and contributes no hash class. A repeated hash class in a class list has no CSS
								effect, and an implementation may drop repeats it can resolve statically. A
								same-module target whose
								<code class="inline-code">$class</code>
								is fully static may be written into the output as a string literal; an imported
								target is a runtime read of its
								<code class="inline-code">$class</code>
								property.
							</p>
							<p class="section-body">
								Reading
								<code class="inline-code">$class</code>
								opts elements into a theme one at a time. An element whose class attribute includes
								a theme's
								<code class="inline-code">$class</code>
								matches the theme's element and descendant selectors exactly as an element of an
								applying scope does (4.5.4), and no other element is affected. The value is an
								ordinary string, so it may be passed to a component as a prop and placed on that
								component's elements; it is then an authored class of those elements and precedes
								the hash classes of their own enclosing scopes.
								<code class="inline-code">$class</code>
								is the selective counterpart of
								<code class="inline-code">apply</code>, which reaches every element of a scope, and
								the two may be combined. Listing the
								<code class="inline-code">$class</code>
								of several themes on one element composes them there as
								<code class="inline-code">{'apply={[a, b]}'}</code>
								composes them on a scope.
							</p>
							<pre class="code-block plain">
								<code>{STYLE_THEME_EXAMPLE}</code>
							</pre>
							<h3 class="appendix-heading">
								4.5.4 apply adds a theme's $class to every element of a scope
							</h3>
							<p class="section-body">
								<code class="inline-code">apply</code>
								on a standalone block adds the
								<code class="inline-code">$class</code>
								of each listed block to every element the block's scope reaches, after every
								enclosing scope's hash class, outer scopes' entries first and each scope's entries
								in source order.
								<code class="inline-code">apply</code>
								on an assigned block merges into that block's
								<code class="inline-code">$class</code>. Each entry resolves with ordinary lexical
								scoping from the position of the style element and must name an assigned block: a
								binding whose initializer is a style element, an import, or a non-computed member
								chain rooted at an import or at a module-local object literal whose named property
								holds a style element. Any other entry, including a call, a conditional, a spread
								element, or an array hole, is an early error.
							</p>
							<p class="section-body">
								A same-module target must be declared before the block that applies it, by source
								position. This is deliberately stricter than the ECMAScript temporal dead zone:
								same-module CSS is output in source order, so a target declared after the block that
								applies it would win the cascade instead of losing it. Imports are moved to the top
								of the module by the language, so they always satisfy the rule.
							</p>
							<h3 class="appendix-heading">
								4.5.5 Later rules win: stylesheets are output in source order, outer first
							</h3>
							<p class="section-body">
								Every generated hash class is a single class, so all scoped rules have equal
								specificity and document order decides. A conforming implementation outputs a
								module's stylesheets in source order, outer scopes first, and the following rules
								are normative.
							</p>
							<ul class="spec-list">
								<li>
									Outer before inner. A scope's sheets form one contiguous group in source order,
									placed where the scope's first block sits and before the groups of the scopes
									nested inside it, even when one of its blocks is written after a nested scope.
									Sibling scopes are output in source order, and an assigned block is output at its
									declaration position.
								</li>
								<li>
									Applied theme before the block that applies it. A same-module target precedes the
									block that applies it because it must be declared first, and a host must inject an
									imported module's CSS before the CSS of the module that imports it. The array
									position of an
									<code class="inline-code">apply</code>
									entry decides which classes are added, not their precedence.
								</li>
								<li>Source order within a scope. Of two blocks in one scope, the later wins.</li>
							</ul>
						</section>

						<section class="doc-section" id="script">
							<h2 class="section-heading">4.6 Script Elements</h2>
							<p class="section-body">
								A<code class="inline-code">{'<script>'}</code>
								element with a closing tag is a raw-text element, like a style element, in a
								template and in plain TSX alike. Its body is every character up to its end tag, kept
								as written. None of the rules of JSX text apply to it: it has no comments, no
								character references, and no expression containers, and its line breaks and
								whitespace stay. So
								<code class="inline-code">{'<script>{code}</script>'}</code>
								is a script whose text is
								<code class="inline-code">{'{code}'}</code>, as it would be in an HTML file, and
								<code class="inline-code">&amp;amp;</code>
								in a body is those five characters.
							</p>
							<pre class="code-block plain">
								<code>{SCRIPT_GRAMMAR}</code>
							</pre>
							<p class="section-body">
								A body ends where HTML ends it: at
								<code class="inline-code">{'</script'}</code>, optional HTML whitespace, and
								<code class="inline-code">{'>'}</code>. Any other
								<code class="inline-code">{'</script'}</code>
								in the body, in any letter case, would end the script in a browser, and is an early
								error (5.2). Write it as
								<code class="inline-code">{'<\\/script'}</code>, which is the same string, regular
								expression, or JSON text.
							</p>
							<p class="section-body">
								A self-closing script element has no body and is an ordinary element. Its code comes
								from its attributes, such as
								<code class="inline-code">src</code>, or from the host's property for a dynamic
								body, such as
								<code class="inline-code">{'dangerouslySetInnerHTML={{ __html: code }}'}</code>
								or<code class="inline-code">{'innerHTML={code}'}</code>.
							</p>
							<pre class="code-block plain">
								<code>{SCRIPT_EXAMPLE}</code>
							</pre>
							<p class="section-body">
								A host outputs a body so that the rendered script's text is the body as written, on
								the client and in server HTML; a body of only whitespace may render as an empty
								script. Whether the script runs, on a client render and from server HTML, is the
								host's decision (6).
							</p>
						</section>

						<section class="doc-section" id="server-profile">
							<h2 class="section-heading">4.7 Host-defined Server Extensions</h2>
							<p class="section-body">
								Submodule declarations are documented in the first edition as a generic extension
								surface aligned with the TC39 module declarations proposal. Ripple and Octane both
								define host profiles around a module server declaration. Ripple exposes
								proposal-aligned imports from server, while Octane uses the file-local module
								specifier
								<code class="inline-code">'server'</code>
								for RPC imports. The transport, serialization, and runtime behavior remain
								host-defined.
							</p>
							<p class="section-body">
								A server submodule is a structural boundary, not a directive annotation. Its nested
								module scope gives host compilers and tooling an explicit region for isolation and
								static analysis, including rejecting implicit cross-boundary captures and keeping
								server-only dependencies out of client output. A host-specific
								<code class="inline-code">"use server"</code>
								directive, when supported, has separate semantics and is not interchangeable with
								module server.
							</p>
							<pre class="code-block plain">
								<code>{SERVER_EXTENSION_GRAMMAR}</code>
							</pre>
							<p class="section-body">
								The identifier-source import production above describes the proposal-aligned form.
								Octane's quoted
								<code class="inline-code">'server'</code>
								specifier uses the ordinary TypeScript import grammar.
							</p>
						</section>

						<section class="doc-section" id="early-errors">
							<h2 class="section-heading">5 Static Semantics: Early Errors</h2>
							<ul class="spec-list">
								<li>
									A tag or fragment delimiter must not be split by intervening whitespace at the
									points described in 4.3.1.
								</li>
								<li>Opening and closing tags for TSRX elements and fragments must match.</li>
								<li>
									A dynamic tag expression must be one of the three forms listed in 4.3; any other
									expression is
									<code class="inline-code">TSRX2014</code>, reported once for each element at the
									part of the expression that isn't one of them. The check doesn't change the parse.
								</li>
								<li>
									A JSXCodeBlock or template control-flow block that contains TypeScript setup
									statements and rendered output must place those statements before the output node
									and must have exactly one output node.
								</li>
								<li>
									A statement-container function body follows the same structural rule as any other
									JSXCodeBlock.
								</li>
								<li>
									A standalone
									<code class="inline-code">JSXExpressionContainer</code>
									is not a template output node. Use a JSX fragment when a statement container or
									control-flow block needs to render text, expression containers, or multiple
									siblings.
								</li>
								<li>
									In hosts that enable server-oriented submodules, server exports must be imported
									before use using the host profile's import form, for example
									<code class="inline-code">import &#123; load &#125; from server</code>
									in Ripple or
									<code class="inline-code">import &#123; load &#125; from 'server'</code>
									in Octane.
								</li>
								<li>
									Host profiles may restrict which submodule names are supported and may impose
									additional restrictions on referenced bindings.
								</li>
								<li>
									TSRX template children must not appear outside a JSXElement or JSXFragment body.
								</li>
							</ul>
							<h3 class="appendix-heading">5.1 Style blocks</h3>
							<p class="section-body">
								The following static constraints apply to style elements (4.5). Each is reported
								with the diagnostic code shown. None of them changes the parse, and a
								diagnostic-collecting implementation may still produce best-effort output, but that
								output is not conforming TSRX.
							</p>
							<ul class="spec-list">
								<li>
									A standalone style block must sit inside a template scope. A standalone block at
									module scope is
									<code class="inline-code">TSRX3007</code>.
								</li>
								<li>
									A standalone style block must be a child of a native element or fragment. A block
									that is the lone output node of a JSXCodeBlock or a control-flow body, or a
									statement, is
									<code class="inline-code">TSRX3009</code>.
								</li>
								<li>
									A standalone style block with CSS text must sit lexically inside a JSXCodeBlock
									body or a control-flow body (4.5.1). Anywhere else, such as a plain TSX return or
									an assigned template outside those bodies, it is
									<code class="inline-code">TSRX3008</code>. Head styles, resource styles, and
									self-closing blocks are exempt.
								</li>
								<li>
									A scoped style block admits only the attributes
									<code class="inline-code">ref</code>
									and
									<code class="inline-code">apply</code>; any other attribute is
									<code class="inline-code">TSRX3010</code>. Head styles and resource styles admit
									any attribute.
								</li>
								<li>
									<code class="inline-code">apply</code>
									requires an expression container, written
									<code class="inline-code">{'apply={theme}'}</code>
									or
									<code class="inline-code">{'apply={[a, b]}'}</code>. A bare attribute, a string
									value, or an empty container is
									<code class="inline-code">TSRX3001</code>.
								</li>
								<li>
									A style element carries at most one
									<code class="inline-code">apply</code>
									attribute; each further one is
									<code class="inline-code">TSRX3004</code>
									and is ignored.
								</li>
								<li>
									<code class="inline-code">apply</code>
									on a head style or a resource style is
									<code class="inline-code">TSRX3005</code>.
								</li>
								<li>
									Every
									<code class="inline-code">apply</code>
									entry must be an identifier or non-computed member chain that resolves, by lexical
									scoping, to an assigned style block, to an import, or to a member of an import or
									of a module-local object literal whose property holds a style block. Any other
									entry is
									<code class="inline-code">TSRX3002</code>. Shadowing counts: a binding that hides
									a style block with another value is not a target.
								</li>
								<li>
									A same-module target declared after the block that applies it is
									<code class="inline-code">TSRX3003</code>, reported at the entry.
								</li>
								<li>
									An assigned block whose stylesheet declares a class selector named
									<code class="inline-code">$class</code>
									is
									<code class="inline-code">TSRX3006</code>.
								</li>
								<li>
									Within a style body,
									<code class="inline-code">:global(...)</code>
									may begin or end a selector sequence but not sit in its middle, and a bare
									<code class="inline-code">:global</code>
									must not be nested inside another pseudo-class; both are
									<code class="inline-code">TSRX3011</code>.
								</li>
								<li>
									A style body containing an
									<code class="inline-code">@import</code>
									rule is
									<code class="inline-code">TSRX3012</code>: the imported rules would not be scoped.
								</li>
							</ul>
							<p class="section-body">
								The precedence rules of 4.5.5 are constraints on the output stylesheets: outer
								before inner, applied theme before the block that applies it, and source order
								within a scope. An implementation that outputs sheets in any other order does not
								conform.
							</p>
							<pre class="code-block plain">
								<code>{STYLE_STATIC_CONSTRAINTS}</code>
							</pre>
							<h3 class="appendix-heading">5.2 Script elements</h3>
							<ul class="spec-list">
								<li>
									A script body containing
									<code class="inline-code">{'</script'}</code>, in any letter case, anywhere but
									its end tag (4.6) is
									<code class="inline-code">TSRX1004</code>: a browser would end the script there.
								</li>
							</ul>
						</section>

						<section class="doc-section" id="host-defined">
							<h2 class="section-heading">6 Host-defined Semantics</h2>
							<p class="section-body">
								The purpose of the core specification is to make parsers, tooling, and language
								consumers agree on what TSRX source text means as syntax. The purpose of host
								documentation is to explain how that syntax is executed, lowered, or bound to
								runtime facilities.
							</p>
							<ul class="spec-list">
								<li>How functions returning TSRX lower into executable host code.</li>
								<li>
									The text of generated scope hashes, the name of the stamped class attribute, and
									how hashed selectors are rewritten.
								</li>
								<li>
									How stylesheets are registered and injected, provided that a module's CSS precedes
									the CSS of every module that imports it and that sheets keep the emission order of
									4.5.5.
								</li>
								<li>
									How the object of an assigned block and the value handed to a style
									<code class="inline-code">ref</code>
									are delivered at runtime.
								</li>
								<li>
									How the dynamic tag syntax
									<code class="inline-code">{'<{expression}>'}</code>
									is lowered, and how the resolved value selects between string tags and component
									constructors at runtime.
								</li>
								<li>
									How a script body is output, provided that the rendered script's text is the body
									as written (4.6), whether a script runs on a client render and from server HTML,
									and which property sets a dynamic body.
								</li>
								<li>
									How submodule declarations and their associated import forms are compiled or
									executed by a host profile that enables them.
								</li>
							</ul>
						</section>

						<section class="doc-section" id="appendices">
							<h2 class="section-heading">Appendices</h2>
							<p class="section-body">
								The TSRX AST contract exposes ESTree-compatible function nodes and standard
								JSX-shaped nodes such as JSXElement, JSXFragment, JSXExpressionContainer, JSXText,
								JSXAttribute, and JSXSpreadAttribute. TSRX-specific additions are limited to
								JSXCodeBlock, JSXStyleElement, JSXIfExpression, JSXForExpression,
								JSXSwitchExpression, JSXTryExpression, TSModuleDeclaration, and TSModuleBlock. The
								grammar in sections 4.1 through 4.7 is normative; the node shapes in this appendix
								are informative and describe the parser contract exposed to tooling.
							</p>
							<h3 class="appendix-heading">A.1 Grammar-to-node correspondence</h3>
							<p class="section-body">
								The reference parser follows the same broad editorial pattern used by the JSX
								specification: grammar productions define the accepted source forms, and a separate
								AST layer records those forms in a stable shape for downstream tools. The following
								correspondence summarizes the first-edition mappings.
							</p>
							<pre class="code-block plain">
								<code>{AST_NODE_MAPPING}</code>
							</pre>
							<h3 class="appendix-heading">A.2 Function body and return nodes</h3>
							<p class="section-body">
								Functions remain ordinary ESTree function nodes. TSRX structure begins where a
								JSXElement, JSXFragment, JSXStyleElement, JSXCodeBlock, or JSX control-flow
								expression appears as an expression value, most commonly as a ReturnStatement
								argument. The statement-container function body shorthand stores a JSXCodeBlock
								directly in the function node's body field without introducing a separate component
								node kind.
							</p>
							<pre class="code-block plain">
								<code>{FUNCTION_AST_SHAPE}</code>
							</pre>
							<ul class="spec-list">
								<li>
									The function id and params fields preserve the ordinary TypeScript function
									surface, including type annotations, after parsing.
								</li>
								<li>
									Ordinary function bodies remain BlockStatement nodes. A statement-container
									function body is represented as a JSXCodeBlock in the function body's place.
								</li>
								<li>
									A returned or expression-position statement container is represented as a
									JSXCodeBlock expression.
								</li>
								<li>
									A returned native fragment is represented by a JSXFragment node whose children
									store template children in source order.
								</li>
								<li>
									Local template setup is represented by JSXCodeBlock nodes rather than by placing
									ordinary statement nodes directly in JSXElement or JSXFragment children.
								</li>
								<li>
									A style element with a body carries a parsed StyleSheet child and
									<code class="inline-code">metadata.styleScopeHash</code>, the position-derived
									hash of that block. Head styles and self-closing blocks carry no hash. A
									standalone block is emitted under the hash of its scope (4.5.2), which the
									transform takes from the scope's first bodied block.
								</li>
								<li>
									Default exports are represented through the ordinary ESTree
									ExportDefaultDeclaration wrapping the function declaration or expression.
								</li>
								<li>
									Implementation metadata may additionally record topScopedClasses for downstream
									style-ref analysis. The style analyzer sets
									<code class="inline-code">metadata.styleKind</code>
									to theme on every assigned block, sets
									<code class="inline-code">metadata.styleApplied</code>
									on each block that an
									<code class="inline-code">apply</code>
									in its module resolves to, records
									<code class="inline-code">metadata.styleApplies</code>
									on every style element, and summarizes the module's assigned and standalone
									blocks, in source order, on
									<code class="inline-code">program.metadata.styles</code>.
								</li>
							</ul>
							<h3 class="appendix-heading">A.3 Template and attribute nodes</h3>
							<p class="section-body">
								Template children reuse the JSX AST shape. This appendix distinguishes the element
								node itself from the JSX opening-tag and attribute nodes that refine it.
							</p>
							<pre class="code-block plain">
								<code>{TEMPLATE_AST_SHAPE}</code>
							</pre>
							<ul class="spec-list">
								<li>
									JSXOpeningElement.name is a JSXIdentifier for ordinary tag names, a
									JSXMemberExpression for dotted names, a JSXNamespacedName for namespaced names,
									and a JSXExpressionContainer for dynamic tags written as
									<code class="inline-code">{'<{expression}>'}</code>. Dynamic tags additionally
									mark the element, its opening element, and the name container with an
									<code class="inline-code">isDynamic</code>
									flag for downstream tooling.
								</li>
								<li>
									openingElement and closingElement preserve the original tag delimiters so
									formatters and source-mapping tools can recover the authored shape.
								</li>
								<li>
									JSXOpeningElement.selfClosing records self-closing syntax, while unclosed recovery
									metadata may be attached by the parser in loose scenarios.
								</li>
								<li>
									JSXExpressionContainer wraps the embedded ECMAScript expression from the ordinary
									&#123;expr&#125; template form.
								</li>
								<li>
									JSXText records a raw text child. Static text children decode JSX character
									references before the text value is stored. A comment between children is in
									neither a JSXText's value nor its raw: it is the inner comment of a
									JSXExpressionContainer whose expression is a JSXEmptyExpression (4.3).
								</li>
								<li>
									JSXAttribute.value is null for boolean-style attributes with no initializer.
									Shorthand attributes are represented as JSXAttribute nodes with parser metadata.
								</li>
								<li>
									JSXSpreadAttribute.argument preserves the original ECMAScript expression payload
									carried by the attribute form.
								</li>
								<li>
									A<code class="inline-code">{'<style>'}</code>
									tag whose content is CSS text is a JSXStyleElement rather than a JSXElement. Its
									captured stylesheet source text and its styleScopeHash, styleKind, and
									styleApplies metadata are described in A.5 and are not part of the general
									JSXElement shape described here. A<code class="inline-code">{'<style>'}</code>
									tag whose first non-whitespace child character is
									<code class="inline-code">{'{'}</code>
									is an ordinary JSXElement named style with expression-container children.
								</li>
								<li>
									A<code class="inline-code">{'<script>'}</code>
									tag with a closing tag is a JSXElement whose content field holds its body as
									written (4.6), an empty string for an empty body, and whose children array is
									empty. A self-closing script tag has no content field.
								</li>
							</ul>
							<h3 class="appendix-heading">A.4 Expression value nodes</h3>
							<p class="section-body">
								Expression-position TSRX values use JSXElement, JSXFragment, JSXStyleElement,
								JSXCodeBlock, JSXIfExpression, JSXForExpression, JSXSwitchExpression, and
								JSXTryExpression nodes. Native fragments use the standard JSXFragment shape.
							</p>
							<pre class="code-block plain">
								<code>{EXPRESSION_AST_SHAPE}</code>
							</pre>
							<ul class="spec-list">
								<li>
									JSXFragment corresponds to &lt;&gt; ... &lt;/&gt; when that form appears in
									expression position. Its children array follows the TSRX template-child model.
								</li>
								<li>
									openingFragment and closingFragment preserve fragment delimiters for formatter and
									source-mapping tools.
								</li>
							</ul>
							<h3 class="appendix-heading">A.5 TSRX extension nodes</h3>
							<p class="section-body">
								The following nodes are the TSRX-specific additions. Statement containers are
								represented by JSXCodeBlock nodes in expression, child, and function-body positions.
								Style blocks are represented as JSXStyleElement nodes. Control-flow directives are
								represented directly by JSXIfExpression, JSXForExpression, JSXSwitchExpression, and
								JSXTryExpression nodes.
							</p>
							<pre class="code-block plain">
								<code>{TSRX_EXTENSION_AST_SHAPE}</code>
							</pre>
							<ul class="spec-list">
								<li>
									The AST contract emits
									<code class="inline-code">JSXIfExpression</code>,
									<code class="inline-code">JSXForExpression</code>,
									<code class="inline-code">JSXSwitchExpression</code>, and
									<code class="inline-code">JSXTryExpression</code>
									for template control flow.
								</li>
								<li>
									<code class="inline-code">JSXCodeBlock</code>
									is a template child and expression value, not a general ECMAScript statement node.
									Its render field is the one node produced by the container after setup; standalone
									style elements stay in body, in source order, whether they precede or follow the
									output.
								</li>
								<li>
									A bodied
									<code class="inline-code">JSXStyleElement</code>
									holds exactly one StyleSheet child and carries styleScopeHash unless it sits in a
									head element. A self-closing style element has an empty children array and an
									empty css string. styleKind is set on assigned blocks only; styleApplies is set on
									every style element and is empty when the element has no apply attribute. The
									analyzed Program carries a ProgramStyleMetadata object as metadata.styles.
								</li>
							</ul>
							<h3 class="appendix-heading">A.6 Submodules, special identifiers, and stylesheets</h3>
							<p class="section-body">
								TSRX reuses TypeScript-compatible module declaration node shapes for submodules and
								extends ImportDeclaration sources so a source may be an Identifier. These nodes are
								intentionally narrow: most of their semantics come from surrounding grammar or from
								host-defined analysis, not from a wide intrinsic property surface.
							</p>
							<pre class="code-block plain">
								<code>{SPECIAL_AST_SHAPE}</code>
							</pre>
							<ul class="spec-list">
								<li>
									TSModuleDeclaration represents module Identifier &#123; ... &#125; submodules.
								</li>
								<li>
									ImportDeclaration.source may be an Identifier for imports from a declared
									submodule.
								</li>
								<li>
									Ripple records exported names from module server declarations for downstream RPC
									analysis.
								</li>
								<li>
									Octane associates string-literal imports from
									<code class="inline-code">'server'</code>
									with the file-local module server declaration for server exports or client RPC
									stubs.
								</li>
								<li>
									A StyleSheet child is attached to every style element with a body, wherever it
									sits, and stores the original source text and the position-derived hash.
									Standalone blocks of one scope are emitted under the scope's hash; assigned blocks
									are emitted under their own.
								</li>
							</ul>
							<p class="section-body">
								The reference parser is built on Acorn with @sveltejs/acorn-typescript and extended
								by a custom TSRXPlugin. This is why the grammar in this draft is framed as additive
								over a TypeScript-compatible baseline rather than as a language unrelated to
								TypeScript source syntax.
							</p>
						</section>

						<section class="doc-section" id="error-codes">
							<h2 class="section-heading">B Error codes</h2>
							<p class="section-body">
								Every error a conforming implementation reports carries a code. A mistake TypeScript
								also reports carries TypeScript's own code for it (such as
								<code class="inline-code">TS1005</code>), so an editor shows the same code
								TypeScript would. A mistake only TSRX reports carries a{' '}
								<code class="inline-code">TSRX</code> code:{' '}
								<code class="inline-code">TSRX1xxx</code> for markup syntax,{' '}
								<code class="inline-code">TSRX2xxx</code> for template rules,{' '}
								<code class="inline-code">TSRX3xxx</code> for style elements and CSS, and{' '}
								<code class="inline-code">TSRX4xxx</code> for everything else. The messages below
								are the reference implementation's; <code class="inline-code">&lt;target&gt;</code>{' '}
								is the name of the target, such as React.
							</p>
							<h3 class="appendix-heading">B.1 TSRX codes</h3>
							<pre class="code-block plain">
								<code>{TSRX_ERROR_CODES}</code>
							</pre>
							<h3 class="appendix-heading">B.2 TypeScript codes</h3>
							<p class="section-body">
								The TypeScript codes the reference implementation reports, with TypeScript's message
								for each; <code class="inline-code">{'{0}'}</code> stands for a name or token.
							</p>
							<pre class="code-block plain">
								<code>{TYPESCRIPT_ERROR_CODES}</code>
							</pre>
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

			.docs-layout {
				display: grid;
				grid-template-columns: 220px 1fr;
				gap: 3rem;
				align-items: start;
			}

			.doc-section {
				margin-top: 3rem;
			}

			.page-heading {
				margin: 0;
				font-size: clamp(2.4rem, 5vw, 4rem);
				line-height: 1;
				letter-spacing: -0.05em;
			}

			.section-kicker {
				margin: 0 0 0.75rem;
				font-size: 0.82rem;
				font-weight: 700;
				text-transform: uppercase;
				letter-spacing: 0.12em;
				color: #5e2cff;
			}

			.section-heading {
				margin: 0 0 0.75rem;
				font-size: clamp(1.5rem, 3vw, 2rem);
				line-height: 1.1;
				letter-spacing: -0.03em;
			}

			.appendix-heading {
				margin: 1.75rem 0 0.65rem;
				font-size: clamp(1.1rem, 2vw, 1.35rem);
				line-height: 1.2;
				letter-spacing: -0.02em;
			}

			.section-body.lead {
				font-size: 1.15rem;
			}

			.section-body.compact {
				font-size: 0.98rem;
			}

			.status-panel {
				margin-top: 1rem;
				padding: 1rem 1.1rem;
				border: 1px solid rgba(94, 44, 255, 0.14);
				border-radius: 16px;
				background: rgba(94, 44, 255, 0.04);
			}

			.status-chip {
				margin: 0;
				font-size: 0.78rem;
				font-weight: 700;
				text-transform: uppercase;
				letter-spacing: 0.1em;
				color: #5e2cff;
			}

			.spec-list {
				margin: 0.9rem 0 0;
				padding-left: 1.2rem;
				color: rgba(26, 22, 64, 0.76);
			}

			.spec-list li {
				margin-top: 0.5rem;
				font-size: 1rem;
				line-height: 1.7;
			}

			.code-block {
				border-radius: 18px;
			}

			.code-block.plain {
				color: #dbe6ff;
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

				.side-nav-link {
					display: inline-block;
					padding: 0.25rem 0.6rem;
					font-size: 0.82rem;
				}

				.doc-section {
					margin-top: 2rem;
				}

				.section-heading {
					font-size: clamp(1.3rem, 5vw, 1.65rem);
				}

				.section-body,
				.spec-list li {
					font-size: 0.95rem;
				}

				.site-footer {
					margin-top: 2rem;
					padding: 1.5rem 0;
				}
			}
		</style>
	</>
}
