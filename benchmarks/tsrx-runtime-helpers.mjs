import assert from 'node:assert/strict';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const options = parse_options(process.argv.slice(2));
const baseline_root = required_path(options, 'baseline');
const candidate_root = path.resolve(options.candidate ?? baseline_root);
const groups = number_option(options, 'groups', 9, 9);
const iterations = number_option(options, 'iterations', 25_000, 1);
const assertion = options.assert;

const baseline_runtime = await load_runtime(baseline_root, 'baseline-first-a');
const candidate_runtime = await load_runtime(candidate_root, 'baseline-first-a');
const candidate_runtime_alternate = await load_runtime(candidate_root, 'candidate-first-b');
const baseline_runtime_alternate = await load_runtime(baseline_root, 'candidate-first-b');

assert_runtime_semantics(baseline_runtime);
assert_runtime_semantics(candidate_runtime);
assert_runtime_semantics(candidate_runtime_alternate);
assert_runtime_semantics(baseline_runtime_alternate);

const baseline_cases = create_runtime_cases(baseline_runtime);
const candidate_cases = create_runtime_cases(candidate_runtime);
const baseline_cases_alternate = create_runtime_cases(baseline_runtime_alternate);
const candidate_cases_alternate = create_runtime_cases(candidate_runtime_alternate);
const control_cases = create_control_cases();

console.log(`Node ${process.version}`);
console.log(`baseline: ${baseline_root}`);
console.log(`candidate: ${candidate_root}`);
console.log(
	`groups: ${groups} (alternating order), iterations: ${iterations}, interleave chunk: ${Math.min(25_000, iterations)}`,
);

console.log('\nBaseline workload decomposition');
for (const profile of [
	['loop-workload', baseline_cases['loop-workload'], control_cases['loop-workload']],
	['spread-workload', baseline_cases['spread-workload'], control_cases['spread-workload']],
	['ref-workload', baseline_cases['ref-workload'], control_cases['ref-workload']],
]) {
	const [name, runtime_case, control_case] = profile;
	const result = compare_pair(runtime_case, control_case, iterations, groups);
	const runtime_ns = 1e9 / result.baseline.median;
	const control_ns = 1e9 / result.candidate.median;
	const helper_share = Math.max(0, (runtime_ns - control_ns) / runtime_ns);
	console.log(
		`${name}: runtime ${format_number(runtime_ns)} ns/op, control ${format_number(control_ns)} ns/op, runtime-owned share ${format_percent(helper_share)}`,
	);
}

console.log('\nSame-module negative control');
const negative_control = compare_pair(
	baseline_cases['loop-workload'],
	baseline_cases['loop-workload'],
	iterations,
	groups,
);
print_comparison('loop-workload', negative_control);
assert.equal(
	negative_control.accepted,
	false,
	'Same-module comparison produced a false accepted improvement',
);

console.log('\nBaseline versus candidate');
const comparisons = new Map();
for (const [name, baseline_case] of Object.entries(baseline_cases)) {
	const result = compare_pair(
		baseline_case,
		candidate_cases[name],
		iterations,
		groups,
		baseline_cases_alternate[name],
		candidate_cases_alternate[name],
	);
	comparisons.set(name, result);
	print_comparison(name, result);
}

if (assertion !== undefined) {
	assert_candidate(assertion, comparisons);
	console.log(`\n${assertion} acceptance gate passed.`);
}

/**
 * @param {string[]} args
 */
function parse_options(args) {
	/** @type {Record<string, string>} */
	const parsed = {};
	for (let index = 0; index < args.length; index += 2) {
		const token = args[index];
		const value = args[index + 1];
		if (!token?.startsWith('--') || value === undefined) {
			throw new Error(
				'Usage: node benchmarks/tsrx-runtime-helpers.mjs --baseline <repo> [--candidate <repo>] [--groups 9] [--iterations 25000] [--assert normalize-spread-props|map-iterable|merge-ref-props]',
			);
		}
		parsed[token.slice(2)] = value;
	}
	return parsed;
}

/**
 * @param {Record<string, string>} parsed
 * @param {string} name
 */
function required_path(parsed, name) {
	const value = parsed[name];
	if (value === undefined) {
		throw new Error(`Missing required --${name} path`);
	}
	return path.resolve(value);
}

/**
 * @param {Record<string, string>} parsed
 * @param {string} name
 * @param {number} fallback
 * @param {number} minimum
 */
function number_option(parsed, name, fallback, minimum) {
	if (parsed[name] === undefined) return fallback;
	const value = Number(parsed[name]);
	if (!Number.isSafeInteger(value) || value < minimum) {
		throw new Error(`--${name} must be an integer of at least ${minimum}`);
	}
	return value;
}

/**
 * @param {string} repo_root
 * @param {string} instance
 */
async function load_runtime(repo_root, instance) {
	const runtime_root = path.join(repo_root, 'packages/tsrx-runtime/src');
	const ref_url = `${pathToFileURL(path.join(runtime_root, 'ref.js')).href}?benchmark=${instance}`;
	const iterable_url = `${pathToFileURL(path.join(runtime_root, 'iterable.js')).href}?benchmark=${instance}`;
	const [ref, iterable] = await Promise.all([import(ref_url), import(iterable_url)]);
	return { ...ref, ...iterable };
}

/**
 * @param {Awaited<ReturnType<typeof load_runtime>>} runtime
 */
function assert_runtime_semantics(runtime) {
	const callback_log = [];
	const scalar = runtime.map_iterable([2, 4, 6], (item, index, is_last) => {
		callback_log.push([item, index, is_last]);
		return item + index;
	});
	assert.deepEqual(scalar, [2, 5, 8]);
	assert.deepEqual(callback_log, [
		[2, 0, false],
		[4, 1, false],
		[6, 2, true],
	]);
	assert.deepEqual(
		runtime.map_iterable(
			[1, 2],
			(item) => [item, item * 10],
			() => [99],
		),
		[1, 10, 2, 20, 99],
	);
	assert.deepEqual(
		runtime.map_iterable(
			new Set(['a', 'b']),
			(item, index, is_last) => `${item}:${index}:${is_last}`,
		),
		['a:0:false', 'b:1:true'],
	);
	assert.deepEqual(
		runtime.map_iterable([], String, null, () => ['empty']),
		['empty'],
	);

	const symbol = Symbol('spread');
	let getter_calls = 0;
	const props = {
		id: 'row',
		get title() {
			getter_calls++;
			return 'title';
		},
		[symbol]: 'symbol',
	};
	assert.equal(runtime.normalize_spread_props(props), props);
	assert.equal(getter_calls, 1);
	assert.equal(props[symbol], 'symbol');

	const ref_log = [];
	const ref_prop = runtime.create_ref_prop(() => (node) => {
		ref_log.push(node);
	});
	const ref_props = { id: 'input', forwarded: ref_prop };
	const normalized = runtime.normalize_spread_props(ref_props);
	assert.notEqual(normalized, ref_props);
	assert.deepEqual({ ...normalized }, { id: 'input', ref: normalized.ref });
	const node = { nodeType: 1, nodeName: 'INPUT' };
	const cleanup = normalized.ref(node);
	cleanup();
	assert.deepEqual(ref_log, [node, null]);
}

function create_inputs() {
	return {
		items: Array.from({ length: 32 }, (_, index) => index + 1),
		set: new Set(Array.from({ length: 32 }, (_, index) => index + 1)),
		props: Object.freeze({
			id: 'runtime-row',
			className: 'row selected',
			title: 'Runtime row',
			tabIndex: 0,
			'data-kind': 'benchmark',
		}),
		node: Object.freeze({ nodeType: 1, nodeName: 'DIV' }),
	};
}

/**
 * These functions mirror the small expressions emitted around runtime helpers:
 * a mapped JSX-like child array, a host-prop spread, and a merged ref callback.
 *
 * @param {Awaited<ReturnType<typeof load_runtime>>} runtime
 */
function create_runtime_cases(runtime) {
	const { items, set, props, node } = create_inputs();
	let callback_count = 0;
	const object_ref = { current: null };
	const callback_ref = () => {
		callback_count++;
	};

	return {
		'loop-workload'() {
			const children = runtime.map_iterable(items, render_row);
			return children.length + children[0].props.value + children.at(-1).props.value;
		},
		'loop-helper-scalar'() {
			const values = runtime.map_iterable(items, scalar_row);
			return values.length + values[0] + values.at(-1);
		},
		'loop-array-results'() {
			const values = runtime.map_iterable(items, array_row);
			return values.length + values[0] + values.at(-1);
		},
		'loop-with-tail'() {
			const values = runtime.map_iterable(items, scalar_row, () => [100, 101]);
			return values.length + values.at(-1);
		},
		'loop-generic-iterable'() {
			const values = runtime.map_iterable(set, scalar_row);
			return values.length + values[0] + values.at(-1);
		},
		'spread-workload'() {
			const rendered_props = { ...runtime.normalize_spread_props(props) };
			return rendered_props.id.length + rendered_props.className.length;
		},
		'spread-helper-normalize'() {
			const normalized = runtime.normalize_spread_props(props);
			return normalized === props ? normalized.id.length : 0;
		},
		'ref-workload'() {
			const ref = runtime.merge_ref_props(callback_ref, object_ref);
			const cleanup = ref(node);
			cleanup();
			return callback_count + (object_ref.current === null ? 1 : 0);
		},
		'ref-helper-merge'() {
			return typeof runtime.merge_ref_props(callback_ref, object_ref) === 'function' ? 1 : 0;
		},
	};
}

function create_control_cases() {
	const { items, props, node } = create_inputs();
	let callback_count = 0;
	const object_ref = { current: null };

	return {
		'loop-workload'() {
			const children = new Array(items.length);
			for (let index = 0; index < items.length; index++) {
				children[index] = render_row(items[index], index, index === items.length - 1);
			}
			return children.length + children[0].props.value + children.at(-1).props.value;
		},
		'spread-workload'() {
			const rendered_props = { ...props };
			return rendered_props.id.length + rendered_props.className.length;
		},
		'ref-workload'() {
			callback_count++;
			object_ref.current = node;
			callback_count++;
			object_ref.current = null;
			return callback_count + 1;
		},
	};
}

function render_row(item, index, is_last) {
	return {
		type: 'span',
		key: item,
		props: { value: item + index + (is_last ? 1 : 0) },
	};
}

function scalar_row(item, index, is_last) {
	return item + index + (is_last ? 1 : 0);
}

function array_row(item, index, is_last) {
	return [item, item + index + (is_last ? 1 : 0)];
}

/**
 * @param {() => number} fn
 * @param {number} iterations_per_group
 */
function run_chunk(fn, chunk_iterations) {
	let checksum = 0;
	const start = performance.now();
	for (let index = 0; index < chunk_iterations; index++) {
		checksum += fn();
	}
	const duration = performance.now() - start;
	assert.ok(Number.isFinite(checksum));
	return duration;
}

/**
 * Interleave short timed chunks so a scheduler or thermal shift affects both
 * sides of a group instead of an entire baseline or candidate sample.
 *
 * @param {() => number} baseline
 * @param {() => number} candidate
 * @param {number} iterations_per_group
 * @param {boolean} baseline_first
 */
function run_group_pair(baseline, candidate, iterations_per_group, baseline_first) {
	let baseline_duration = 0;
	let candidate_duration = 0;
	const chunk_size = Math.min(25_000, iterations_per_group);

	for (let offset = 0; offset < iterations_per_group; offset += chunk_size) {
		const chunk_iterations = Math.min(chunk_size, iterations_per_group - offset);
		if (baseline_first) {
			baseline_duration += run_chunk(baseline, chunk_iterations);
			candidate_duration += run_chunk(candidate, chunk_iterations);
		} else {
			candidate_duration += run_chunk(candidate, chunk_iterations);
			baseline_duration += run_chunk(baseline, chunk_iterations);
		}
	}

	return {
		baseline: (iterations_per_group * 1000) / baseline_duration,
		candidate: (iterations_per_group * 1000) / candidate_duration,
	};
}

/**
 * @param {() => number} baseline
 * @param {() => number} candidate
 * @param {number} iterations_per_group
 * @param {number} sample_groups
 * @param {() => number} [alternate_baseline]
 * @param {() => number} [alternate_candidate]
 */
function compare_pair(
	baseline,
	candidate,
	iterations_per_group,
	sample_groups,
	alternate_baseline = baseline,
	alternate_candidate = candidate,
) {
	const primary = compare_variant(baseline, candidate, iterations_per_group, sample_groups);
	if (alternate_baseline === baseline && alternate_candidate === candidate) {
		return primary;
	}

	const alternate = compare_variant(
		alternate_baseline,
		alternate_candidate,
		iterations_per_group,
		sample_groups,
	);
	const baseline_median = median([primary.baseline.median, alternate.baseline.median]);
	const candidate_median = median([primary.candidate.median, alternate.candidate.median]);
	const baseline_relative_mad = Math.max(
		primary.baseline.mad / primary.baseline.median,
		alternate.baseline.mad / alternate.baseline.median,
	);
	const candidate_relative_mad = Math.max(
		primary.candidate.mad / primary.candidate.median,
		alternate.candidate.mad / alternate.candidate.median,
	);

	return {
		baseline: {
			median: baseline_median,
			mad: baseline_median * baseline_relative_mad,
		},
		candidate: {
			median: candidate_median,
			mad: candidate_median * candidate_relative_mad,
		},
		improvement: median([primary.improvement, alternate.improvement]),
		threshold: Math.max(primary.threshold, alternate.threshold),
		accepted: primary.accepted && alternate.accepted,
		regressed: primary.regressed || alternate.regressed,
		variants: [primary, alternate],
	};
}

/**
 * @param {() => number} baseline
 * @param {() => number} candidate
 * @param {number} iterations_per_group
 * @param {number} sample_groups
 */
function compare_variant(baseline, candidate, iterations_per_group, sample_groups) {
	for (let index = 0; index < Math.max(2_000, Math.floor(iterations_per_group / 5)); index++) {
		baseline();
		candidate();
	}

	const baseline_samples = [];
	const candidate_samples = [];
	for (let group = 0; group < sample_groups; group++) {
		const sample = run_group_pair(baseline, candidate, iterations_per_group, group % 2 === 0);
		baseline_samples.push(sample.baseline);
		candidate_samples.push(sample.candidate);
	}

	const baseline_distribution = distribution(baseline_samples);
	const candidate_distribution = distribution(candidate_samples);
	const improvement = candidate_distribution.median / baseline_distribution.median - 1;
	const threshold =
		2 *
		Math.max(
			baseline_distribution.mad / baseline_distribution.median,
			candidate_distribution.mad / candidate_distribution.median,
		);

	return {
		baseline: baseline_distribution,
		candidate: candidate_distribution,
		improvement,
		threshold,
		accepted: improvement > threshold,
		regressed: improvement < -threshold,
	};
}

/** @param {number[]} samples */
function distribution(samples) {
	const median_value = median(samples);
	return {
		median: median_value,
		mad: median(samples.map((sample) => Math.abs(sample - median_value))),
	};
}

/** @param {number[]} values */
function median(values) {
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function print_comparison(name, result) {
	const variant_changes = result.variants
		? `, cross-over ${result.variants.map((variant) => `${format_percent(variant.improvement)}/${format_percent(variant.threshold)}`).join(' and ')}`
		: '';
	console.log(
		`${name}: baseline ${format_number(result.baseline.median)} ops/s ±${format_percent(result.baseline.mad / result.baseline.median)}, candidate ${format_number(result.candidate.median)} ops/s ±${format_percent(result.candidate.mad / result.candidate.median)}, change ${format_percent(result.improvement)}, gate ${format_percent(result.threshold)}${variant_changes}${result.accepted ? ' ACCEPT' : result.regressed ? ' REGRESSION' : ''}`,
	);
}

function assert_candidate(name, comparisons) {
	const primary_cases = {
		'normalize-spread-props': ['spread-workload', 'spread-helper-normalize'],
		'map-iterable': ['loop-workload', 'loop-helper-scalar'],
		'merge-ref-props': ['ref-workload', 'ref-helper-merge'],
	}[name];
	if (primary_cases === undefined) {
		throw new Error(`Unknown --assert candidate: ${name}`);
	}

	for (const primary of primary_cases) {
		assert.equal(
			comparisons.get(primary)?.accepted,
			true,
			`${primary} did not clear the noise gate`,
		);
	}

	for (const [case_name, result] of comparisons) {
		if (primary_cases.includes(case_name)) continue;
		assert.equal(result.regressed, false, `${case_name} regressed beyond the noise gate`);
	}
}

function format_number(value) {
	return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
}

function format_percent(value) {
	return `${(value * 100).toFixed(2)}%`;
}
