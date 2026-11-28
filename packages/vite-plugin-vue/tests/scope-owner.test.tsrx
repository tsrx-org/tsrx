import {
	createPlainElement,
	createVaporApp,
	createVaporSSRApp,
	defineVaporCustomElement,
	ref,
	useAttrs,
	useCssModule,
	useHost,
	useModel,
	useShadowRoot,
	useSlots,
	useTemplateRef,
	useInstanceOption,
	useVaporCssVars,
	onErrorCaptured,
	nextTick,
	resolveComponent,
	resolveDirective,
	resolveDynamicComponent,
	restoreCurrentInstance,
	setCurrentInstance,
	setTemplateRefBinding,
} from 'vue';
import * as Vue from 'vue';
import { defineVaporComponent, getCurrentInstance, h, useFullProps, useProps } from 'vue-jsx-vapor';

// A branch with setup statements that calls a composable acting on the
// component calling it keeps the shared lowering: in a `TsrxScope`, the
// composable would act on the scope, which has no slots, attributes, declared
// props, template refs, CSS modules, registered components or directives, root
// or custom-element host of its own.

const on = ref(true);

function SlotsChild() @{
	<div class="owner-slots">
		@if (on.value) {
			const slots = useSlots();
			<b>{Object.keys(slots).join(',')}</b>
		}
	</div>
}

function SlotsHost() @{
	<SlotsChild>
		<i>{'given'}</i>
	</SlotsChild>
}

function AttrsChild() @{
	<div class="owner-attrs">
		@if (on.value) {
			const attrs = useAttrs();
			<b>{String(attrs.title)}</b>
		}
	</div>
}

function AttrsHost() @{
	<AttrsChild title="hello" />
}

const ModelChild = defineVaporComponent(
	(props: { modelValue?: string }) => @{
		<div class="owner-model">
			@if (on.value) {
				const model = useModel(props, 'modelValue');
				<button onClick={() => (model.value = 'changed')}>{String(model.value)}</button>
			}
		</div>
	},
	{ props: ['modelValue'], emits: ['update:modelValue'] },
);

const model_value = ref('initial');

function ModelHost() @{
	<ModelChild
		modelValue={model_value.value}
		onUpdate:modelValue={(value: string) => (model_value.value = value)}
	/>
}

let template_ref: { value: unknown } | null = null;

function TemplateRefOwner() @{
	<div class="owner-template-ref">
		<input ref="field" />
		@if (on.value) {
			const field = useTemplateRef('field');
			template_ref = field;
			<b>{'ref'}</b>
		}
	</div>
}

function CssModuleOwner() @{
	<div class="owner-css-module">
		@if (on.value) {
			const css = useCssModule();
			<b>{String(css.box)}</b>
		}
	</div>
}

(CssModuleOwner as unknown as { __cssModules: unknown }).__cssModules = {
	$style: { box: 'box_hash' },
};

function CssVarsOwner() @{
	<div class="owner-css-vars">
		@if (on.value) {
			useVaporCssVars(() => ({ shade: 'red' }));
			<b>{'vars'}</b>
		}
	</div>
}

function HostOwner() @{
	<div>
		@if (on.value) {
			const host = useHost();
			<b>{String(host?.tagName)}</b>
		}
	</div>
}

function ShadowRootOwner() @{
	<div>
		@if (on.value) {
			const root = useShadowRoot();
			<b>{String(root?.host.tagName)}</b>
		}
	</div>
}

const HostElement = defineVaporCustomElement(HostOwner as never);
const ShadowRootElement = defineVaporCustomElement(ShadowRootOwner as never);

function InstanceOwner() @{
	<div class="owner-instance">
		@if (on.value) {
			const instance = getCurrentInstance() as { type: { name?: string } } | null;
			const type = useInstanceOption('type', true).value as { name?: string } | undefined;
			<b>{String(instance?.type.name) + ',' + String(type?.name)}</b>
		}
	</div>
}

const PropsChild = defineVaporComponent(
	(_props: { title?: string }) => @{
		<div class="owner-props">
			@if (on.value) {
				const props = useProps() as { title?: string };
				const full = useFullProps() as { title?: string; extra?: string };
				<b>{String(props.title) + ',' + String(full.title) + ',' + String(full.extra)}</b>
			}
		</div>
	},
	{ props: ['title'] },
);

function PropsHost() @{
	<PropsChild title="t" extra="e" />
}

let exposed: { hello?: string } | null = null;

function ExposeChild() @{
	<div class="owner-expose">
		@if (on.value) {
			defineExpose({ hello: 'world' });
			<b>{'exposed'}</b>
		}
	</div>
}

function ExposeHost() @{
	<ExposeChild ref={(value: { hello?: string } | null) => (exposed = value)} />
}

function Registered() @{
	<i>{'registered'}</i>
}

const registered_directive = {};

function ResolvesOwner() @{
	<div class="owner-resolves">
		@if (on.value) {
			const component = resolveComponent('Registered');
			const directive = resolveDirective('registered');
			<b>{String(component === Registered) + ',' + String(directive === registered_directive)}</b>
		}
	</div>
}

Object.assign(ResolvesOwner, {
	components: { Registered },
	directives: { registered: registered_directive },
});

function RendersRegistered() @{
	<div class="owner-renders">
		@if (on.value) {
			const child = h('Registered');
			<b>{child}</b>
		}
	</div>
}

Object.assign(RendersRegistered, { components: { Registered } });

function ResolvesDynamicOwner() @{
	<div class="owner-resolves-dynamic">
		@if (on.value) {
			const component = resolveDynamicComponent('Registered');
			<b>{String(component === Registered)}</b>
		}
	</div>
}

Object.assign(ResolvesDynamicOwner, { components: { Registered } });

let bound_ref: { value: unknown } | null = null;

function BindsTemplateRef() @{
	const field = useTemplateRef('field');
	bound_ref = field;
	<div class="owner-binds">
		@if (on.value) {
			const element = document.createElement('input');
			setTemplateRefBinding(element, () => 'field');
			<b>{'bound'}</b>
		}
	</div>
}

function SetsCurrentInstance() @{
	<div class="owner-sets">
		@if (on.value) {
			const previous = setCurrentInstance(null) as unknown as [{ type: { name?: string } }];
			restoreCurrentInstance(previous as never);
			<b>{String(previous[0].type.name)}</b>
		}
	</div>
}

function CreatesPlainElement() @{
	<main class="owner-plain">
		@if (on.value) {
			const node = createPlainElement('b');
			node.textContent = 'plain';
			<span>{node}</span>
		}
	</main>
}

Object.assign(CreatesPlainElement, { __scopeId: 'data-v-owner' });

function ReadsCurrentInstance() @{
	<div class="owner-current">
		@if (on.value) {
			const owner = (Vue as unknown as { currentInstance: { type: { name?: string } } })
				.currentInstance;
			<b>{String(owner.type.name)}</b>
		}
	</div>
}

const captured: string[] = [];

function Throws() @{
	throw new Error('sibling');
	<i />
}

function CapturesSiblings() @{
	<div class="owner-captures">
		@if (on.value) {
			onErrorCaptured((error) => {
				captured.push((error as Error).message);
				return false;
			});
			<b>{'captures'}</b>
		}
		<span>
			<Throws />
		</span>
	</div>
}

async function mount(component: unknown) {
	const warnings: string[] = [];
	const app = createVaporApp(component as Parameters<typeof createVaporApp>[0]);
	app.config.warnHandler = (message) => {
		warnings.push(message);
	};
	app.mount(container);
	await flush();
	return { app, warnings };
}

describe('tsrx-vue a branch that calls a composable acting on its component', () => {
	beforeEach(() => {
		on.value = true;
		model_value.value = 'initial';
		template_ref = null;
		exposed = null;
		captured.length = 0;
	});

	it('reads its component’s slots with useSlots', async () => {
		const { app, warnings } = await mount(SlotsHost);
		expect(container.querySelector('.owner-slots b')?.textContent).toBe('default');
		expect(warnings).toEqual([]);
		app.unmount();
	});

	it('reads its component’s attributes with useAttrs', async () => {
		const { app, warnings } = await mount(AttrsHost);
		expect(container.querySelector('.owner-attrs b')?.textContent).toBe('hello');
		expect(warnings).toEqual([]);
		app.unmount();
	});

	it('reads and updates its component’s model with useModel', async () => {
		const { app, warnings } = await mount(ModelHost);
		expect(container.querySelector('.owner-model button')?.textContent).toBe('initial');
		(container.querySelector('.owner-model button') as HTMLElement).click();
		await flush();
		expect(model_value.value).toBe('changed');
		expect(container.querySelector('.owner-model button')?.textContent).toBe('changed');
		expect(warnings).toEqual([]);
		app.unmount();
	});

	it('reads its component’s template ref with useTemplateRef', async () => {
		const { app } = await mount(TemplateRefOwner);
		expect(template_ref?.value).toBe(container.querySelector('.owner-template-ref input'));
		app.unmount();
	});

	it('reads its component’s CSS modules with useCssModule', async () => {
		const { app, warnings } = await mount(CssModuleOwner);
		expect(container.querySelector('.owner-css-module b')?.textContent).toBe('box_hash');
		expect(warnings).toEqual([]);
		app.unmount();
	});

	it('sets CSS variables on its component’s root with useVaporCssVars', async () => {
		const { app } = await mount(CssVarsOwner);
		await new Promise((resolve) => setTimeout(resolve, 0));
		await flush();
		const root = container.querySelector('.owner-css-vars') as HTMLElement;
		expect(root.style.getPropertyValue('--shade')).toBe('red');
		expect((root.querySelector('b') as HTMLElement).style.getPropertyValue('--shade')).toBe('');
		app.unmount();
	});

	it('reads its component’s instance with getCurrentInstance and useInstanceOption', async () => {
		const { app } = await mount(InstanceOwner);
		expect(container.querySelector('.owner-instance b')?.textContent).toBe(
			'InstanceOwner,InstanceOwner',
		);
		app.unmount();
	});

	it('reads its component’s props with useProps and useFullProps', async () => {
		const { app } = await mount(PropsHost);
		expect(container.querySelector('.owner-props b')?.textContent).toBe('t,t,e');
		app.unmount();
	});

	it('resolves its component’s registrations with resolveComponent and resolveDirective', async () => {
		const { app, warnings } = await mount(ResolvesOwner);
		expect(container.querySelector('.owner-resolves b')?.textContent).toBe('true,true');
		expect(warnings).toEqual([]);
		app.unmount();
	});

	it('renders its component’s registered component by name with h', async () => {
		const { app, warnings } = await mount(RendersRegistered);
		expect(container.querySelector('.owner-renders b')?.innerHTML).toBe('<i>registered</i>');
		expect(warnings).toEqual([]);
		app.unmount();
	});

	it('resolves its component’s registration with resolveDynamicComponent', async () => {
		const { app, warnings } = await mount(ResolvesDynamicOwner);
		expect(container.querySelector('.owner-resolves-dynamic b')?.textContent).toBe('true');
		expect(warnings).toEqual([]);
		app.unmount();
	});

	it('registers a template ref with its component through setTemplateRefBinding', async () => {
		bound_ref = null;
		const { app } = await mount(BindsTemplateRef);
		await nextTick();
		expect(bound_ref?.value).toBeInstanceOf(HTMLInputElement);
		app.unmount();
	});

	it('gets its component back from setCurrentInstance', async () => {
		const { app } = await mount(SetsCurrentInstance);
		expect(container.querySelector('.owner-sets b')?.textContent).toBe('SetsCurrentInstance');
		app.unmount();
	});

	it('gives an element its component’s scope id with createPlainElement', async () => {
		const { app } = await mount(CreatesPlainElement);
		expect(container.querySelector('.owner-plain b')?.hasAttribute('data-v-owner')).toBe(true);
		app.unmount();
	});

	it('reads its component through currentInstance', async () => {
		const { app } = await mount(ReadsCurrentInstance);
		expect(container.querySelector('.owner-current b')?.textContent).toBe('ReadsCurrentInstance');
		app.unmount();
	});

	it('exposes a value from its component with defineExpose', async () => {
		const { app } = await mount(ExposeHost);
		expect(exposed?.hello).toBe('world');
		app.unmount();
	});

	it('captures an error from its component’s other content with onErrorCaptured', async () => {
		const errors: unknown[] = [];
		const app = createVaporApp(CapturesSiblings);
		app.config.errorHandler = (error) => {
			errors.push(error);
		};
		app.mount(container);
		await flush();
		expect(captured).toEqual(['sibling']);
		expect(errors).toEqual([]);
		app.unmount();
	});

	it.each([
		['useHost', 'x-tsrx-scope-host', HostElement],
		['useShadowRoot', 'x-tsrx-scope-shadow-root', ShadowRootElement],
	] as const)('reads its custom element with %s', async (_name, tag, element_class) => {
		customElements.define(tag, element_class as unknown as CustomElementConstructor);
		const element = document.createElement(tag);
		container.append(element);
		await flush();
		expect(element.shadowRoot?.textContent).toBe(tag.toUpperCase());
		element.remove();
	});
});

// `vapor-for-ssr.test.js` renders these on the server, in the IIFE branch's
// fragment, with the component's slots, attributes and model.
const hydrated = [
	[
		'useSlots',
		SlotsHost,
		'<div class="owner-slots"><!--[--><b>default</b><!--]--></div>',
		'default',
	],
	[
		'useAttrs',
		AttrsHost,
		'<div class="owner-attrs" title="hello"><!--[--><b>hello</b><!--]--></div>',
		'hello',
	],
	[
		'useModel',
		ModelHost,
		'<div class="owner-model"><!--[--><button>initial</button><!--]--></div>',
		'initial',
	],
] as const;

describe('tsrx-vue hydrating a branch that calls a composable acting on its component', () => {
	beforeEach(() => {
		on.value = true;
		model_value.value = 'initial';
	});

	it.each(hydrated)(
		'hydrates a branch that calls %s as the server rendered it, then follows',
		async (name, host, markup, text) => {
			container.innerHTML = markup;
			const server_node = container.querySelector('b, button');
			const errors: unknown[] = [];
			const warnings: string[] = [];
			const app = createVaporSSRApp(host);
			app.config.errorHandler = (error) => {
				errors.push(error);
			};
			app.config.warnHandler = (message) => {
				warnings.push(message);
			};
			try {
				app.mount(container);
				await flush();
				expect(container.querySelector('b, button')).toBe(server_node);
				expect(container.textContent).toBe(text);

				if (name === 'useModel') {
					(server_node as HTMLElement).click();
					await flush();
					// The shared lowering re-runs the branch on a change it reads.
					expect(model_value.value).toBe('changed');
					expect(container.textContent).toBe('changed');
				}

				on.value = false;
				await flush();
				expect(container.textContent).toBe('');
				on.value = true;
				await flush();
				expect(container.textContent).toBe(name === 'useModel' ? 'changed' : text);
				expect(errors).toEqual([]);
				expect(warnings).toEqual([]);
			} finally {
				app.unmount();
			}
		},
	);
});
