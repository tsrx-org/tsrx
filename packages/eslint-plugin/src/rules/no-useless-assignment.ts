import type { Rule } from 'eslint';
import { get_core_rule, with_report, wrapper_meta } from '../utils/core-rule.js';
import { suspension_check } from '../utils/try-blocks.js';

const core = get_core_rule('no-useless-assignment');

type Listeners = Record<string, (...args: any[]) => void>;

/** The fields of a code path segment the core rule reads. */
interface Segment {
	id: string;
	nextSegments: Segment[];
}

/** A part of a segment, from one `@try` block boundary to the next. */
interface Piece {
	segment: Segment;
	index: number;
}

/** The pieces a `@try`'s boundaries end and start. */
interface TryPieces {
	/** Whether each boundary had one current segment, so its pieces line up. */
	single: boolean;
	entry: Piece[];
	body_start: Piece[];
	body_end: Piece[];
	pending_start: Piece[];
	pending_end: Piece[];
	handler_start: Piece[];
}

/** Nodes whose code starts a code path of its own. */
const CODE_PATH_STARTS = new Set([
	'FunctionDeclaration',
	'FunctionExpression',
	'ArrowFunctionExpression',
	'StaticBlock',
]);

/**
 * The parts of each node that run in the order code path analysis follows,
 * and only in that order, so that the code it runs after a `@try` in one of
 * them can really run after it.
 */
const ORDERED_PARTS: Record<string, string[]> = {
	Program: ['body'],
	BlockStatement: ['body'],
	ExpressionStatement: ['expression'],
	ReturnStatement: ['argument'],
	VariableDeclaration: ['declarations'],
	VariableDeclarator: ['init'],
	ExportNamedDeclaration: ['declaration'],
	ExportDefaultDeclaration: ['declaration'],
	IfStatement: ['consequent', 'alternate'],
	LabeledStatement: ['body'],
	TryStatement: ['block', 'handler', 'finalizer'],
	CatchClause: ['body'],
	WhileStatement: ['body'],
	DoWhileStatement: ['body'],
	ForStatement: ['init', 'body'],
	ForInStatement: ['right', 'body'],
	ForOfStatement: ['right', 'body'],
	AssignmentExpression: ['right'],
	CallExpression: ['arguments'],
	NewExpression: ['arguments'],
	ChainExpression: ['expression'],
	ArrayExpression: ['elements'],
	ObjectExpression: ['properties'],
	Property: ['value'],
	SpreadElement: ['argument'],
	ConditionalExpression: ['consequent', 'alternate'],
	LogicalExpression: ['left', 'right'],
	SequenceExpression: ['expressions'],
	TemplateLiteral: ['expressions'],
	TaggedTemplateExpression: ['quasi'],
	AwaitExpression: ['argument'],
	YieldExpression: ['argument'],
	TSAsExpression: ['expression'],
	TSSatisfiesExpression: ['expression'],
	TSNonNullExpression: ['expression'],
	JSXElement: ['openingElement', 'children'],
	JSXOpeningElement: ['attributes'],
	JSXFragment: ['children'],
	JSXExpressionContainer: ['expression'],
	JSXAttribute: ['value'],
	JSXSpreadAttribute: ['argument'],
	JSXCodeBlock: ['body', 'render'],
	JSXIfExpression: ['statement'],
	JSXTryExpression: ['block', 'pending', 'handler'],
	JSXSwitchCase: ['consequent'],
};

const NOT_CHILDREN = new Set([
	'parent',
	'metadata',
	'loc',
	'range',
	'leadingComments',
	'trailingComments',
	'innerComments',
]);

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

/**
 * Whether a node, outside the functions in it, assigns or updates anything. A
 * class's static block and field values count, since they run with it or
 * later.
 */
function writes(node: any): boolean {
	if (!node || typeof node.type !== 'string' || FUNCTIONS.has(node.type)) return false;
	if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') return true;
	return Object.entries(node).some(
		([key, value]) =>
			!NOT_CHILDREN.has(key) && (Array.isArray(value) ? value.some(writes) : writes(value)),
	);
}

/**
 * Whether a part of a node that code path analysis runs before the child,
 * though it really runs after it, assigns something: a destructuring target
 * runs after its value, and a `@for`'s index and key after the iterable and
 * around the body. Code path analysis runs a `for…in` or `for…of` target
 * after the iterable, but the core rule doesn't see the loop assign it.
 */
function writes_late(parent: any, child: unknown): boolean {
	switch (parent.type) {
		case 'VariableDeclarator':
			return child === parent.init && writes(parent.id);
		case 'AssignmentExpression':
			return child === parent.right && writes(parent.left);
		case 'ForInStatement':
		case 'ForOfStatement':
			return child === parent.right && parent.left.type !== 'VariableDeclaration';
		case 'JSXForExpression':
			return child === parent.loop && (writes(parent.index) || writes(parent.key));
		default:
			return false;
	}
}

/**
 * Whether the code that code path analysis runs after a node, in its code
 * path, can really run after it. It can't in a `@switch` arm before the last,
 * since the arms run one after another for code path analysis but only one
 * renders, nor in the body of a `@for` with `@empty`, which renders only when
 * the body doesn't, nor in a `@for`'s index or key, which run before the loop
 * for code path analysis but after the iterable, nor in a destructuring
 * default, which code path analysis runs before the value it defaults. Nor
 * can it when code path analysis runs an assignment before the node that
 * really runs after it, as in a computed key of a destructuring target.
 */
function runs_in_order(node: any): boolean {
	for (
		let previous = undefined, child = node, parent = node.parent;
		parent;
		previous = child, child = parent, parent = parent.parent
	) {
		if (
			CODE_PATH_STARTS.has(parent.type) ||
			(parent.type === 'PropertyDefinition' && parent.value === child)
		) {
			return true;
		}
		if (writes_late(parent, child)) return false;
		if (parent.type === 'JSXForExpression') {
			if (child === parent.loop) {
				if (parent.empty && previous === child.body) return false;
			} else if (child !== parent.empty) {
				return false;
			}
		} else if (parent.type === 'JSXSwitchExpression') {
			if (parent.cases.at(-1) !== child) return false;
		} else if (
			!ORDERED_PARTS[parent.type]?.some((part) =>
				Array.isArray(parent[part]) ? parent[part].includes(child) : parent[part] === child,
			)
		) {
			return false;
		}
	}
	return true;
}

/**
 * Core `no-useless-assignment`, with the blocks of a `@try` as alternatives.
 *
 * ESLint's code path analysis runs the blocks of a `@try` one after another,
 * so a value a block overwrites counts as unused even when a later block or
 * the code after the `@try` reads it. The compiled output runs the body,
 * `@pending` and `@catch` in callbacks of the `@try`'s boundaries, and the
 * `@catch` or `@pending` can render without the blocks before them.
 *
 * The rule runs the core rule three times. One copy sees the code paths as
 * they are; its reports are the candidates. The other two see each segment cut
 * at the boundaries of every `@try` whose body and `@pending` neither await nor
 * yield and whose code path goes on as the code does, and one of them also
 * sees edges that run forward, in source order:
 * from the start of the `@try` and from the end of each block to each block
 * after it and to the code after the `@try`. A candidate is dropped only when
 * the cut copy reports it and the copy with the edges doesn't, so only the
 * edges drop reports, never the cutting. The rule reports nothing the core
 * rule doesn't, and in a file without `@try` it is the core rule.
 */
const rule: Rule.RuleModule = {
	meta: wrapper_meta(
		core,
		'Disallow variable assignments when the value is not used, with the blocks of a `@try` as alternatives',
	),
	create(context) {
		if (!context.sourceCode.text.includes('@try')) return core.create(context);

		const candidates: Rule.ReportDescriptor[] = [];
		const cut_reports = new Set<unknown>();
		const joined_reports = new Set<unknown>();
		const node_of = (descriptor: Rule.ReportDescriptor) => (descriptor as { node?: unknown }).node;
		const plain = core.create(
			with_report(context, (descriptor) => candidates.push(descriptor)),
		) as Listeners;
		const cut = core.create(
			with_report(context, (descriptor) => cut_reports.add(node_of(descriptor))),
		) as Listeners;
		const joined = core.create(
			with_report(context, (descriptor) => joined_reports.add(node_of(descriptor))),
		) as Listeners;
		const suspends = suspension_check(context);

		const pieces = new Map<Segment, Piece[]>();
		// Edges between pieces of different `@try` blocks.
		const alternatives = new Map<Piece, Set<Piece>>();
		const outer_segments: Set<Segment>[] = [];
		let current = new Set<Segment>();
		// For each code path: the end of the last identifier the cut copies saw,
		// and how many `@for`s it is in the index or key of. Those come after the
		// iterable in the source, but the traversal visits them before the loop,
		// so the cut copies don't see their identifiers; a `@try` there isn't
		// cut. A nested function can be visited after code that follows it, so
		// each code path starts over.
		interface Position {
			end: number;
			for_heads: number;
		}
		const outer_positions: Position[] = [];
		let position: Position = { end: -1, for_heads: 0 };
		const start_loop = (node: any) => {
			if (node.parent?.type === 'JSXForExpression' && node.parent.loop === node) {
				position.for_heads--;
			}
		};
		const tries = new Map<unknown, TryPieces>();

		// The segment each copy sees for a piece, with or without the edges, one
		// object per piece. It is the real segment with its own `id` and
		// `nextSegments`, the only fields the core rule reads.
		const view = (with_edges: boolean) => {
			const objects = new Map<Piece, Segment>();
			const get = (piece: Piece): Segment => {
				let object = objects.get(piece);
				if (!object) {
					object = Object.create(piece.segment, {
						id: { value: `${piece.segment.id}~${piece.index}` },
						nextSegments: {
							get() {
								const list = pieces.get(piece.segment)!;
								const next =
									piece.index < list.length - 1
										? [list[piece.index + 1]]
										: piece.segment.nextSegments.flatMap(
												(segment) => pieces.get(segment)?.[0] ?? [],
											);
								const edges = with_edges ? [...(alternatives.get(piece) ?? [])] : [];
								return [...next, ...edges].map(get);
							},
						},
					}) as Segment;
					objects.set(piece, object);
				}
				return object;
			};
			return get;
		};
		const cut_view = view(false);
		const joined_view = view(true);

		const start_piece = (segment: Segment, node: unknown) => {
			const list = pieces.get(segment) ?? [];
			pieces.set(segment, list);
			const piece = { segment, index: list.length };
			list.push(piece);
			cut.onCodePathSegmentStart?.(cut_view(piece), node);
			joined.onCodePathSegmentStart?.(joined_view(piece), node);
			return piece;
		};
		const end_piece = (segment: Segment, node: unknown) => {
			const piece = pieces.get(segment)!.at(-1)!;
			cut.onCodePathSegmentEnd?.(cut_view(piece), node);
			joined.onCodePathSegmentEnd?.(joined_view(piece), node);
			return piece;
		};
		// Ends the current pieces and starts new ones.
		const cut_here = (node: unknown) => {
			const ended: Piece[] = [];
			const started: Piece[] = [];
			for (const segment of current) {
				ended.push(end_piece(segment, node));
				started.push(start_piece(segment, node));
			}
			return { ended, started };
		};
		const join = (from: Piece[], ...to: Piece[][]) => {
			for (const piece of from) {
				const set = alternatives.get(piece) ?? new Set();
				alternatives.set(piece, set);
				for (const list of to) for (const target of list) set.add(target);
			}
		};

		const listeners: Listeners = {
			onCodePathStart(...args) {
				outer_segments.push(current);
				current = new Set();
				outer_positions.push(position);
				position = { end: -1, for_heads: 0 };
				plain.onCodePathStart?.(...args);
				cut.onCodePathStart?.(...args);
				joined.onCodePathStart?.(...args);
			},
			onCodePathEnd(...args) {
				current = outer_segments.pop()!;
				const inner = position;
				position = outer_positions.pop()!;
				if (!position.for_heads) position.end = Math.max(position.end, inner.end);
				plain.onCodePathEnd?.(...args);
				cut.onCodePathEnd?.(...args);
				joined.onCodePathEnd?.(...args);
				for (const descriptor of candidates) {
					const node = node_of(descriptor);
					if (!cut_reports.has(node) || joined_reports.has(node)) context.report(descriptor);
				}
				candidates.length = 0;
				cut_reports.clear();
				joined_reports.clear();
			},
			onCodePathSegmentStart(segment: Segment, node: unknown) {
				current.add(segment);
				plain.onCodePathSegmentStart?.(segment, node);
				start_piece(segment, node);
			},
			onCodePathSegmentEnd(segment: Segment, node: unknown) {
				current.delete(segment);
				plain.onCodePathSegmentEnd?.(segment, node);
				end_piece(segment, node);
			},
			JSXForExpression() {
				position.for_heads++;
			},
			ForStatement: start_loop,
			ForInStatement: start_loop,
			ForOfStatement: start_loop,
			JSXTryExpression(node: any) {
				if (suspends(node.block) || suspends(node.pending) || !runs_in_order(node)) return;
				const { ended, started } = cut_here(node);
				tries.set(node, {
					single: ended.length === 1,
					entry: ended,
					body_start: started,
					body_end: [],
					pending_start: [],
					pending_end: [],
					handler_start: [],
				});
			},
			BlockStatement(node: any) {
				const state = tries.get(node.parent);
				if (!state || node.parent.pending !== node) return;
				const { ended, started } = cut_here(node);
				state.single &&= ended.length === 1;
				state.body_end = ended;
				state.pending_start = started;
			},
			CatchClause(node: any) {
				const state = tries.get(node.parent);
				if (!state) return;
				const { ended, started } = cut_here(node);
				state.single &&= ended.length === 1;
				if (node.parent.pending) state.pending_end = ended;
				else state.body_end = ended;
				state.handler_start = started;
			},
			'JSXTryExpression:exit'(node: any) {
				const state = tries.get(node);
				if (!state) return;
				const { ended, started: after } = cut_here(node);
				if (!node.handler) state.pending_end = ended;
				// Code path analysis can keep a segment for each way into a `finally`
				// block; joining them would mix those paths up.
				if (!state.single || ended.length !== 1) return;
				// Only forward, in source order: an edge back to an earlier block would
				// let a value reach a read before it in its own block.
				const { body_start, pending_start, handler_start } = state;
				join(state.entry, body_start, pending_start, handler_start, after);
				join(state.body_end, pending_start, handler_start, after);
				join(state.pending_end, handler_start, after);
			},
		};

		// The core rule listens to none of the keys above but the code path
		// events, which they pass on themselves.
		const merged: Listeners = { ...listeners };
		for (const key of new Set([...Object.keys(plain), ...Object.keys(cut)])) {
			if (key in listeners) continue;
			merged[key] = (...args) => {
				plain[key]?.(...args);
				// The core rule places each read by the first and last identifier it
				// visits in a segment. The traversal visits a few identifiers after
				// code that follows them (a label after its block, type arguments
				// after the call's arguments). Such an identifier could stretch a
				// piece over code across a `@try` boundary, so the cut copies see an
				// identifier only when it comes after the last one they saw in the
				// code path, outside a `@for`'s index and key. Leaving one out only
				// narrows a piece, which can keep a report but never drop one. (The
				// parser's name for a dynamic tag spans the tag expression, but a
				// `@try` there isn't cut.)
				const node = args[0];
				if (node?.type === 'Identifier' || node?.type === 'JSXIdentifier') {
					if (position.for_heads || node.range[0] < position.end) return;
					position.end = node.range[1];
				}
				cut[key]?.(...args);
				joined[key]?.(...args);
			};
		}
		return merged as Rule.RuleListener;
	},
};

export default rule;
