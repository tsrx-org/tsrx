import {
	collect_stylesheet_texts,
	expect_cyclic_apply_error,
	expect_mark_before,
} from '@tsrx/core/test-harness/runtime/scoped-styles-dom';
import { reactive } from 'vue';
import { ThemeApplyApp } from '@tsrx/vite-plugin-vue-test/scoped-styles/applier.tsrx';

const THEME_MARK = '--tsrx-theme-mark';
const APPLIER_MARK = '--tsrx-applier-mark';
const SCOPE_HASH = expect.stringMatching(/^tsrx-[0-9a-f]+$/);

type SpreadBag = Record<string, unknown> | null | undefined;

function SpreadClassApp({ bag }: { bag?: SpreadBag }) @{
	<>
		<style>
			span {
				color: rgb(0, 128, 0);
			}
		</style>
		<span data-probe="spread" {...bag} />
		<span data-probe="class-before" class="base" {...bag} />
		<span data-probe="class-after" {...bag} class="last" />
	</>
}

function classes(probe: string): string[] {
	const element = container.querySelector(`[data-probe="${probe}"]`) as HTMLElement;
	return element.className.split(' ');
}

function NativeClassValue(props: { value?: unknown }) @{
	<span data-probe="native" class={props.value} />
}

function ScopedClassValue(props: { value?: unknown }) @{
	<>
		<style>
			span {
				color: rgb(0, 128, 0);
			}
		</style>
		<span data-probe="scoped" class={props.value} />
	</>
}

function ClassValueApp(props: { value?: unknown }) @{
	<>
		<NativeClassValue value={props.value} />
		<ScopedClassValue value={props.value} />
	</>
}

function ScopedClassName(props: { value?: unknown }) @{
	<>
		<style>
			span {
				color: rgb(0, 128, 0);
			}
		</style>
		<span data-probe="scoped-class" class={props.value} />
		<span data-probe="scoped-class-name" className={props.value} />
	</>
}

function GotClassName(props: { className?: string }) @{
	<span data-probe="got" data-class-name={props.className ?? 'none'} />
}

const tags = { GotClassName };

function ClassNameApp(props: { value?: unknown }) @{
	const Tag = GotClassName;
	<>
		<span data-probe="class-around-spread" class="a" {...{ class: 'bag' }} class="b" />
		<span data-probe="class-name-around-spread" class="a" {...{ class: 'bag' }} className="b" />
		<{Tag} className="dynamic" />
		<tags.GotClassName className="member" />
		<span data-probe="class" class={props.value} />
		<span data-probe="class-name" className={props.value} />
		<span data-probe="class-pair" class={['a', props.value]} />
		<span data-probe="class-name-pair" class="a" className={props.value} />
		<span data-probe="class-static" class="x" />
		<span data-probe="class-name-static" className="x" />
		<ScopedClassName value={props.value} />
	</>
}

function NativeClassPairs(props: { bag: Record<string, unknown> }) @{
	<>
		<p data-probe="native-around-spread" class="a" {...props.bag} class="b" />
		<p data-probe="native-class-name-around-spread" class="a" {...props.bag} className="b" />
		<p data-probe="native-class-name-first" className="a" {...props.bag} class="b" />
		<p data-probe="native-two-class-names" className="a" className="b" />
	</>
}

function ScopedClassPairs(props: { bag: Record<string, unknown> }) @{
	<>
		<style>
			p {
				color: rgb(0, 128, 0);
			}
		</style>
		<p data-probe="around-spread" class="a" {...props.bag} class="b" />
		<p data-probe="class-name-around-spread" class="a" {...props.bag} className="b" />
		<p data-probe="class-name-first" className="a" {...props.bag} class="b" />
		<p data-probe="two-class-names" className="a" className="b" />
	</>
}

function ClassPairsApp(props: { bag: Record<string, unknown> }) @{
	<>
		<NativeClassPairs bag={props.bag} />
		<ScopedClassPairs bag={props.bag} />
	</>
}

function class_list(probe: string): string[] {
	return Array.from((container.querySelector(`[data-probe="${probe}"]`) as HTMLElement).classList);
}

describe('sibling-scoped apply runtime (vue)', function () {
	it('mounts a theme module plus applier and keeps the local rule later in the cascade', async function () {
		await render(ThemeApplyApp);

		const applied = container.querySelector('[data-probe="applied"]') as HTMLElement;
		const opted_in = container.querySelector('[data-probe="opt-in"]') as HTMLElement;
		const untouched = container.querySelector('[data-probe="untouched"]') as HTMLElement;

		expect(applied).not.toBeNull();
		expect(opted_in).not.toBeNull();
		expect(untouched).not.toBeNull();
		expect(applied.className).toContain('probe');
		expect(opted_in.className).toMatch(/tsrx-[0-9a-f]+/);
		expect(untouched.className).not.toMatch(/tsrx-[0-9a-f]+/);

		expect_mark_before(collect_stylesheet_texts(), THEME_MARK, APPLIER_MARK);

		expect(getComputedStyle(applied).color).toBe('rgb(0, 0, 0)');
		expect(getComputedStyle(opted_in).color).toBe('rgb(0, 128, 0)');
	});

	// Vue's `mergeProps` joins `class` across attributes and spreads, so an
	// authored class and the scope hash stay beside the class a spread supplies.
	it('keeps the class a host spread supplies beside the scope hash', async function () {
		await render(SpreadClassApp, { bag: { class: 'from-spread', id: 'spread-id' } });

		expect(classes('spread')).toEqual(['from-spread', SCOPE_HASH]);
		expect(classes('class-before')).toEqual(['base', SCOPE_HASH, 'from-spread']);
		expect(classes('class-after')).toEqual(['from-spread', 'last', SCOPE_HASH]);
		expect(container.querySelector('[data-probe="spread"]')?.id).toBe('spread-id');
	});

	for (const [label, bag] of [
		['without a class', { id: 'spread-id' }],
		['with an undefined class', { class: undefined }],
		['of an omitted bag', undefined],
	] as const) {
		it(`keeps the scope hash beside a host spread ${label}`, async function () {
			await render(SpreadClassApp, { bag });

			expect(classes('spread')).toEqual([SCOPE_HASH]);
			expect(classes('class-before')).toEqual(['base', SCOPE_HASH]);
			expect(classes('class-after')).toEqual(['last', SCOPE_HASH]);
		});
	}

	it('updates the class a host spread supplies', async function () {
		const bag = reactive<Record<string, unknown>>({ class: 'one' });
		await render(SpreadClassApp, { bag });

		expect(classes('spread')).toEqual(['one', SCOPE_HASH]);

		bag.class = 'two';
		await flush();
		expect(classes('spread')).toEqual(['two', SCOPE_HASH]);

		delete bag.class;
		await flush();
		expect(classes('spread')).toEqual([SCOPE_HASH]);
	});

	// An authored `className` compiles to `class`, so React-style source keeps
	// its class.
	for (const [label, value] of [
		['a string', 'b c'],
		['an undefined', undefined],
		['an object', { on: true, off: false }],
	] as const) {
		it(`renders an authored className of ${label} as class`, async function () {
			await render(ClassNameApp, { value });

			for (const [probe, expected] of [
				['class-name', 'class'],
				['class-name-pair', 'class-pair'],
				['class-name-static', 'class-static'],
				['scoped-class-name', 'scoped-class'],
				// With a spread between, `className` stays where it is written, as
				// a second `class`.
				['class-name-around-spread', 'class-around-spread'],
			]) {
				expect(class_list(probe)).toEqual(class_list(expected));
			}
			expect(class_list('scoped-class-name')).toEqual(expect.arrayContaining([SCOPE_HASH]));
			expect(container.querySelector('[classname]')).toBeNull();
		});
	}

	// Vue's `mergeProps` joins every class attribute and the spread's class.
	it('keeps the scope hash beside several class attributes', async function () {
		await render(ClassPairsApp, { bag: { class: 'fromBag' } });

		for (const probe of [
			'around-spread',
			'class-name-around-spread',
			'class-name-first',
			'two-class-names',
		]) {
			expect(class_list(probe).filter((name) => !/^tsrx-/.test(name))).toEqual(
				class_list(`native-${probe}`),
			);
			expect(class_list(probe).filter((name) => /^tsrx-/.test(name))).toHaveLength(1);
		}
		expect(class_list('around-spread')).toEqual(['a', SCOPE_HASH, 'fromBag', 'b']);
	});

	// A dynamic or member tag may be a component, which reads `className`.
	it('passes an authored className to a dynamic or member tag as written', async function () {
		await render(ClassNameApp, { value: 'b c' });

		expect(
			Array.from(container.querySelectorAll('[data-probe="got"]'), (element) =>
				element.getAttribute('data-class-name'),
			),
		).toEqual(['dynamic', 'member']);
	});

	for (const [label, value] of [
		['an undefined', undefined],
		['a null', null],
		['a false', false],
		['an empty', ''],
		['a true', true],
		['a zero', 0],
		['a one', 1],
		['a function', () => 'fn'],
		['a string', 'a b'],
		['an object', { active: true, off: false }],
		['a list', ['a', false, 'c']],
		['a nested list', [['x'], { y: true }]],
	] as const) {
		it(`renders ${label} class as the target does, beside the scope hash`, async function () {
			await render(ClassValueApp, { value });

			expect(class_list('scoped')).toEqual([...class_list('native'), SCOPE_HASH]);
		});
	}

	it('throws when an applier evaluates before its imported theme', async function () {
		try {
			await import('@tsrx/vite-plugin-vue-test/scoped-styles/cycle-theme.tsrx');
			throw new Error('expected the cyclic apply import to throw');
		} catch (error) {
			if (error instanceof Error && error.message === 'expected the cyclic apply import to throw') {
				throw error;
			}
			expect_cyclic_apply_error(error);
		}
	});
});
