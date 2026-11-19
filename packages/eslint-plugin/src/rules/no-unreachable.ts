import type { Rule } from 'eslint';
import { get_core_rule, merge_listeners, wrapper_meta } from '../utils/core-rule.js';
import { suspension_check } from '../utils/try-blocks.js';

const core = get_core_rule('no-unreachable');

const FUNCTION_TYPES = new Set([
	'FunctionDeclaration',
	'FunctionExpression',
	'ArrowFunctionExpression',
]);

const LOOP_TYPES = [
	'WhileStatement',
	'DoWhileStatement',
	'ForStatement',
	'ForInStatement',
	'ForOfStatement',
];

const SEGMENT_EVENTS = [
	'onCodePathSegmentStart',
	'onUnreachableCodePathSegmentStart',
	'onCodePathSegmentEnd',
	'onUnreachableCodePathSegmentEnd',
] as const;

/** The fields of a code path segment this rule reads. */
interface Segment {
	reachable: boolean;
	allPrevSegments: Segment[];
}

interface SwitchState {
	/** Whether the `@switch` is reached. */
	entry: boolean;
	has_default: boolean;
	/** Whether some arm reaches its end. */
	completes: boolean;
}

interface TryExpressionState {
	/** Whether the `@try` is reached. */
	entry: boolean;
	/**
	 * Whether the body, or `@pending`, awaits or yields outside a function. The
	 * compiler then runs that block in the function that holds the `@try`,
	 * `@pending` first, where a throw leaves the function. Otherwise it runs the
	 * block in a callback of the `@try`'s boundaries, as it always runs
	 * `@catch`, and the function goes on past the `@try`.
	 */
	inline_body: boolean;
	inline_pending: boolean;
	/** Whether the body, or `@pending`, reaches its end. */
	body_completes: boolean;
	pending_completes: boolean;
	/** Whether an inline `@pending` was revived though the body doesn't end. */
	pending_first: boolean;
}

interface TryState {
	has_handler: boolean;
	/** Whether the `try` block, the `catch` block or the `finally` block reaches its end. */
	block?: boolean;
	handler?: boolean;
	finalizer?: boolean;
	/**
	 * Whether something that can throw runs in the `try` block, which leads to
	 * the `catch` block, or something that leaves early (a `return` too) runs
	 * in the `try` statement, which leads to the `finally` block.
	 */
	block_throws: boolean;
	throws: boolean;
	in_block: boolean;
}

/** The expressions code path analysis counts as able to throw, with identifier references. */
const THROWING_TYPES = ['CallExpression', 'NewExpression', 'MemberExpression', 'ImportExpression'];

/**
 * Core `no-unreachable`, with the arms of a `@switch` as alternatives, and the
 * blocks of a `@try` run apart from the code around it.
 *
 * ESLint's code path analysis knows only the standard node types, so it runs
 * the arms of a `@switch` one after another: after an arm that throws, it
 * marks the other arms and the code after the `@switch` unreachable. It runs
 * the blocks of a `@try` one after another too, though `@pending` shows while
 * the body suspends, `@catch` renders when the body throws, and all three run
 * in callbacks of the `@try`'s boundaries, while the function goes on past the
 * `@try`. The core rule here sees each segment through a proxy whose
 * `reachable` revives those paths: at the start of each arm of a reached
 * `@switch`, and after the `@switch` when an arm reaches its end or there is no
 * `@default` arm; at the start of `@pending` and `@catch` of a reached `@try`,
 * and after it. A body or `@pending` that awaits or yields runs in the function
 * instead, `@pending` first, so the rest then also needs it to reach its end.
 *
 * Code path analysis records nothing for an exit inside code it already holds
 * unreachable, so in a revived path this rule follows `throw`, `return`,
 * `break`, `continue`, `try` and endless loops itself. Elsewhere, every answer
 * is the core rule's.
 */
const rule: Rule.RuleModule = {
	meta: wrapper_meta(
		core,
		'Disallow unreachable code after `return`, `throw`, `continue`, and `break` statements, with the arms of a `@switch` as alternatives, and the blocks of a `@try` run apart from the code around it',
	),
	create(context) {
		const listeners = core.create(context) as Record<string, any>;

		// Revived segments, and segments an exit in a revived path ended. Both
		// change as the traversal goes on: a segment can span several arms.
		const revived = new WeakSet<Segment>();
		const exited = new WeakSet<Segment>();
		// Answers of `is_reachable`. Reviving or ending a current segment changes
		// only its own answer: the segments after it don't exist yet.
		const answers = new Map<Segment, boolean>();

		const outer_segments: Set<Segment>[] = [];
		let current = new Set<Segment>();
		const switches = new Map<unknown, SwitchState>();
		const try_expressions = new Map<unknown, TryExpressionState>();
		const tries = new Map<unknown, TryState>();
		// The `try` statements of the current code path the traversal is in.
		const outer_try_stacks: TryState[][] = [];
		let try_stack: TryState[] = [];
		// Statements a `break` or `continue` in a revived path leaves or repeats.
		const broken = new WeakSet<object>();
		const continued = new WeakSet<object>();
		const proxies = new WeakMap<Segment, { readonly reachable: boolean }>();

		function is_reachable(segment: Segment, seen?: Set<Segment>): boolean {
			const known = answers.get(segment);
			if (known !== undefined) return known;
			if (segment.reachable || revived.has(segment)) return true;
			if (exited.has(segment) || seen?.has(segment)) return false;
			const top = !seen;
			seen ??= new Set();
			seen.add(segment);
			const previous = segment.allPrevSegments;
			// Code path analysis made it unreachable after an exit.
			const result =
				!previous.some((segment) => segment.reachable) &&
				previous.some((segment) => is_reachable(segment, seen));
			// Below the top, `false` may only mean the path loops back.
			if (result || top) answers.set(segment, result);
			return result;
		}

		const any_reachable = () => [...current].some((segment) => is_reachable(segment));
		const in_revived_path = () =>
			[...current].some((segment) => !segment.reachable && is_reachable(segment));

		const revive = () => {
			for (const segment of current) {
				answers.delete(segment);
				exited.delete(segment);
				revived.add(segment);
			}
		};

		const exit = () => {
			for (const segment of current) {
				if (segment.reachable) continue;
				answers.delete(segment);
				revived.delete(segment);
				exited.add(segment);
			}
		};

		// `@pending` shows while the body suspends and `@catch` renders when it
		// throws, and the function goes on past the `@try` while they wait: each
		// is reached whenever the `@try` is, once the blocks that run inline in the
		// function reach their end. An inline `@pending` runs before the body.
		const revive_try_path = (try_expression: unknown, at: 'pending' | 'handler' | 'after') => {
			const state = try_expressions.get(try_expression)!;
			const body_ends = !state.inline_body || state.body_completes;
			const reached =
				at === 'pending'
					? state.inline_pending || body_ends
					: body_ends && (!state.inline_pending || state.pending_completes);
			if (state.entry && reached && !any_reachable()) {
				revive();
				state.pending_first = at === 'pending' && !body_ends;
			}
		};
		const suspends = suspension_check(context);

		const proxy = (segment: Segment) => {
			let result = proxies.get(segment);
			if (!result) {
				result = {
					get reachable() {
						return is_reachable(segment);
					},
				};
				proxies.set(segment, result);
			}
			return result;
		};

		const wrapped: Record<string, (...args: any[]) => void> = {
			onCodePathStart(...args: any[]) {
				outer_segments.push(current);
				current = new Set();
				outer_try_stacks.push(try_stack);
				try_stack = [];
				listeners.onCodePathStart?.(...args);
			},
			onCodePathEnd(...args: any[]) {
				current = outer_segments.pop()!;
				try_stack = outer_try_stacks.pop()!;
				listeners.onCodePathEnd?.(...args);
			},
			// A loop adds a predecessor to an earlier segment.
			onCodePathSegmentLoop() {
				answers.clear();
			},
			// Before the core rule checks the block.
			BlockStatement(node: any) {
				const parent = node.parent;
				const state = tries.get(parent);
				if (
					parent.finalizer === node &&
					state &&
					(state.block || state.handler || state.throws) &&
					!any_reachable()
				) {
					revive();
				}
				if (parent.type === 'JSXTryExpression' && parent.pending === node) {
					revive_try_path(parent, 'pending');
				}
				listeners.BlockStatement(node);
			},
		};
		for (const event of SEGMENT_EVENTS) {
			const starts = event.endsWith('Start');
			wrapped[event] = (segment: Segment, node: Rule.Node) => {
				if (starts) current.add(segment);
				else current.delete(segment);
				listeners[event]?.(proxy(segment), node);
			};
		}

		// Something that can throw runs here, or with `throws_to_catch` false, a
		// `return`, which reaches a `finally` block but no `catch` block. Code
		// path analysis records it where it holds the code reachable.
		// From the innermost `try` out, a throw goes on until a `catch` takes it.
		const may_throw = (throws_to_catch = true) => {
			if (!try_stack.length || !in_revived_path()) return;
			for (let index = try_stack.length - 1; index >= 0; index--) {
				const state = try_stack[index];
				state.throws = true;
				if (throws_to_catch && state.in_block) {
					state.block_throws = true;
					if (state.has_handler) return;
				}
			}
		};

		// A loop's exits in a revived path. Code path analysis records the others.
		const leave_loop = (node: any) => {
			if (broken.has(node) || (continued.has(node) && !is_endless(node))) {
				if (!any_reachable()) revive();
			} else if (is_endless(node)) {
				exit();
			}
		};
		const leave_breakable = (node: object) => {
			if (broken.has(node) && !any_reachable()) revive();
		};

		return merge_listeners(
			{ ...listeners, ...wrapped },
			{
				...Object.fromEntries(LOOP_TYPES.map((type) => [`${type}:exit`, leave_loop])),
				'SwitchStatement:exit': leave_breakable,
				'LabeledStatement:exit': leave_breakable,
				'BreakStatement:exit'(node: any) {
					if (!in_revived_path()) return;
					const target = jump_target(node, true);
					if (target) broken.add(target);
					exit();
				},
				'ContinueStatement:exit'(node: any) {
					if (!in_revived_path()) return;
					const target = jump_target(node, false);
					if (target) continued.add(target);
					exit();
				},
				// A `continue` leads to the test of a `do` loop, after its body.
				'DoWhileStatement > .test'(node: any) {
					if (continued.has(node.parent) && !any_reachable()) revive();
				},
				'ThrowStatement:exit'() {
					may_throw();
					exit();
				},
				'ReturnStatement:exit'() {
					may_throw(false);
					exit();
				},
				...Object.fromEntries(THROWING_TYPES.map((type) => [`${type}:exit`, () => may_throw()])),
				'Identifier:exit'(node: any) {
					if (is_reference(node)) may_throw();
				},
				// A `try` entered in reachable code can hold a revived path too.
				TryStatement(node: any) {
					const state = {
						has_handler: Boolean(node.handler),
						block_throws: false,
						throws: false,
						in_block: true,
					};
					tries.set(node, state);
					try_stack.push(state);
				},
				'BlockStatement:exit'(node: any) {
					const state = tries.get(node.parent);
					if (!state) return;
					if (node.parent.block === node) {
						state.block = any_reachable();
						state.in_block = false;
					}
					if (node.parent.finalizer === node) state.finalizer = any_reachable();
				},
				// As code path analysis has it, a `catch` block runs when something in
				// the `try` block can throw, or the `try` block reaches its end.
				CatchClause(node: any) {
					const state = tries.get(node.parent);
					if (state && (state.block_throws || state.block) && !any_reachable()) revive();
				},
				'CatchClause:exit'(node: any) {
					const state = tries.get(node.parent);
					if (state) state.handler = any_reachable();
				},
				'TryStatement:exit'(node: any) {
					const state = tries.get(node);
					if (!state) return;
					try_stack.pop();
					const completes = (state.block || state.handler) && (!node.finalizer || state.finalizer);
					if (completes && !any_reachable()) revive();
					else if (!completes && any_reachable()) exit();
				},
				JSXSwitchExpression(node: any) {
					switches.set(node, {
						entry: any_reachable(),
						has_default: node.cases.some((switch_case: any) => !switch_case.test),
						completes: false,
					});
				},
				JSXSwitchCase(node: any) {
					if (switches.get(node.parent)!.entry && !any_reachable()) revive();
				},
				'JSXSwitchCase:exit'(node: any) {
					const state = switches.get(node.parent)!;
					state.completes ||= any_reachable();
				},
				'JSXSwitchExpression:exit'(node: any) {
					const state = switches.get(node)!;
					if (state.entry && (state.completes || !state.has_default) && !any_reachable()) {
						revive();
					}
				},
				JSXTryExpression(node: any) {
					try_expressions.set(node, {
						entry: any_reachable(),
						inline_body: suspends(node.block),
						inline_pending: suspends(node.pending),
						body_completes: false,
						pending_completes: false,
						pending_first: false,
					});
				},
				'JSXTryExpression > BlockStatement:exit'(node: any) {
					const state = try_expressions.get(node.parent)!;
					if (node.parent.block === node) state.body_completes = any_reachable();
					if (node.parent.pending === node) {
						state.pending_completes = any_reachable();
						// What follows `@pending` follows the body, which doesn't end.
						if (state.pending_first) exit();
					}
				},
				'JSXTryExpression > CatchClause'(node: any) {
					revive_try_path(node.parent, 'handler');
				},
				'JSXTryExpression:exit'(node: unknown) {
					revive_try_path(node, 'after');
				},
			},
		);
	},
};

/**
 * The statement a `break` leaves, or the loop a `continue` repeats.
 */
function jump_target(node: any, is_break: boolean): object | null {
	for (
		let parent = node.parent;
		parent && !FUNCTION_TYPES.has(parent.type);
		parent = parent.parent
	) {
		if (node.label) {
			if (parent.type === 'LabeledStatement' && parent.label.name === node.label.name) {
				return is_break ? parent : parent.body;
			}
		} else if (
			LOOP_TYPES.includes(parent.type) ||
			(is_break && parent.type === 'SwitchStatement')
		) {
			return parent;
		}
	}
	return null;
}

/** Whether an identifier is a reference, as code path analysis decides. */
function is_reference(node: any): boolean {
	const parent = node.parent;
	switch (parent.type) {
		case 'LabeledStatement':
		case 'BreakStatement':
		case 'ContinueStatement':
		case 'ArrayPattern':
		case 'RestElement':
		case 'ImportSpecifier':
		case 'ImportDefaultSpecifier':
		case 'ImportNamespaceSpecifier':
		case 'CatchClause':
			return false;
		case 'FunctionDeclaration':
		case 'FunctionExpression':
		case 'ArrowFunctionExpression':
		case 'ClassDeclaration':
		case 'ClassExpression':
		case 'VariableDeclarator':
			return parent.id !== node;
		case 'Property':
		case 'PropertyDefinition':
		case 'MethodDefinition':
			return parent.key !== node || parent.computed || parent.shorthand;
		case 'AssignmentPattern':
			return parent.key !== node;
		default:
			return true;
	}
}

/** Whether a loop's test is missing or a truthy literal, as code path analysis checks. */
function is_endless(node: any): boolean {
	if (node.type === 'ForStatement' && !node.test) return true;
	return (
		(node.type === 'WhileStatement' ||
			node.type === 'DoWhileStatement' ||
			node.type === 'ForStatement') &&
		node.test.type === 'Literal' &&
		Boolean(node.test.value)
	);
}

export default rule;
