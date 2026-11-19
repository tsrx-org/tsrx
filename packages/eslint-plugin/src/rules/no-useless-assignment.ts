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
	readonly id: string;
	readonly nextSegments: Piece[];
}

/** The pieces a `@try`'s boundaries end and start. */
interface TryPieces {
	entry: Piece[];
	body_start: Piece[];
	body_end: Piece[];
	pending_start: Piece[];
	pending_end: Piece[];
	handler_start: Piece[];
	handler_end: Piece[];
}

/**
 * Core `no-useless-assignment`, with the blocks of a `@try` as alternatives.
 *
 * ESLint's code path analysis runs the blocks of a `@try` one after another,
 * so a value the body overwrites counts as unused even when `@pending` or
 * `@catch` reads it, or the code after the `@try`. The compiled output runs
 * the body, `@pending` and `@catch` in callbacks of the `@try`'s boundaries,
 * in any order and after the code that follows the `@try`.
 *
 * The rule runs the core rule twice. One copy sees the code paths as they are.
 * The other sees each segment cut at the boundaries of every `@try` whose body
 * and `@pending` neither await nor yield, with each block reachable from the
 * start of the `@try` and from the end of each other block, and the code after
 * the `@try` reachable from all of them. It reports what both copies report,
 * so it reports nothing the core rule doesn't, and in a file without `@try`
 * it is the core rule.
 */
const rule: Rule.RuleModule = {
	meta: wrapper_meta(
		core,
		'Disallow variable assignments when the value is not used, with the blocks of a `@try` as alternatives',
	),
	create(context) {
		if (!context.sourceCode.text.includes('@try')) return core.create(context);

		const reports: Rule.ReportDescriptor[] = [];
		const confirmed = new Set<unknown>();
		const plain = core.create(
			with_report(context, (descriptor) => reports.push(descriptor)),
		) as Listeners;
		const cut = core.create(
			with_report(context, (descriptor) => confirmed.add((descriptor as { node?: unknown }).node)),
		) as Listeners;
		const suspends = suspension_check(context);

		const pieces = new Map<Segment, Piece[]>();
		// Edges between pieces of different `@try` blocks.
		const alternatives = new Map<Piece, Set<Piece>>();
		const outer_segments: Set<Segment>[] = [];
		let current = new Set<Segment>();
		const tries = new Map<unknown, TryPieces>();

		const new_piece = (segment: Segment): Piece => {
			const list = pieces.get(segment) ?? [];
			pieces.set(segment, list);
			const index = list.length;
			const piece: Piece = {
				id: `${segment.id}~${index}`,
				get nextSegments() {
					const next =
						index < list.length - 1
							? [list[index + 1]]
							: segment.nextSegments.flatMap((next) => pieces.get(next)?.[0] ?? []);
					return [...next, ...(alternatives.get(piece) ?? [])];
				},
			};
			list.push(piece);
			return piece;
		};
		const last_piece = (segment: Segment) => pieces.get(segment)!.at(-1)!;

		// Ends the current pieces and starts new ones.
		const cut_here = (node: unknown) => {
			const ended: Piece[] = [];
			const started: Piece[] = [];
			for (const segment of current) {
				const piece = last_piece(segment);
				cut.onCodePathSegmentEnd?.(piece, node);
				ended.push(piece);
				const next = new_piece(segment);
				cut.onCodePathSegmentStart?.(next, node);
				started.push(next);
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
				plain.onCodePathStart?.(...args);
				cut.onCodePathStart?.(...args);
			},
			onCodePathEnd(...args) {
				current = outer_segments.pop()!;
				plain.onCodePathEnd?.(...args);
				cut.onCodePathEnd?.(...args);
				for (const descriptor of reports) {
					if (confirmed.has((descriptor as { node?: unknown }).node)) context.report(descriptor);
				}
				reports.length = 0;
				confirmed.clear();
			},
			onCodePathSegmentStart(segment: Segment, node: unknown) {
				current.add(segment);
				plain.onCodePathSegmentStart?.(segment, node);
				cut.onCodePathSegmentStart?.(new_piece(segment), node);
			},
			onCodePathSegmentEnd(segment: Segment, node: unknown) {
				current.delete(segment);
				plain.onCodePathSegmentEnd?.(segment, node);
				cut.onCodePathSegmentEnd?.(last_piece(segment), node);
			},
			JSXTryExpression(node: any) {
				if (suspends(node.block) || suspends(node.pending)) return;
				const { ended, started } = cut_here(node);
				tries.set(node, {
					entry: ended,
					body_start: started,
					body_end: [],
					pending_start: [],
					pending_end: [],
					handler_start: [],
					handler_end: [],
				});
			},
			BlockStatement(node: any) {
				const state = tries.get(node.parent);
				if (!state || node.parent.pending !== node) return;
				const { ended, started } = cut_here(node);
				state.body_end = ended;
				state.pending_start = started;
			},
			CatchClause(node: any) {
				const state = tries.get(node.parent);
				if (!state) return;
				const { ended, started } = cut_here(node);
				if (node.parent.pending) state.pending_end = ended;
				else state.body_end = ended;
				state.handler_start = started;
			},
			'JSXTryExpression:exit'(node: any) {
				const state = tries.get(node);
				if (!state) return;
				const { ended, started: after } = cut_here(node);
				if (node.handler) state.handler_end = ended;
				else state.pending_end = ended;
				const { body_start, pending_start, handler_start } = state;
				join(state.entry, body_start, pending_start, handler_start, after);
				join(state.body_end, pending_start, handler_start, after);
				join(state.pending_end, body_start, handler_start, after);
				join(state.handler_end, body_start, pending_start, after);
			},
		};

		// The core rule listens to none of the keys above but the code path
		// events, which they pass on themselves.
		const merged: Listeners = { ...listeners };
		for (const key of new Set([...Object.keys(plain), ...Object.keys(cut)])) {
			if (key in listeners) continue;
			const first = plain[key];
			const second = cut[key];
			merged[key] = (...args) => {
				first?.(...args);
				second?.(...args);
			};
		}
		return merged as Rule.RuleListener;
	},
};

export default rule;
