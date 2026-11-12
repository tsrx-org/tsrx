import type { FC } from 'hono/jsx';
import { Dynamic } from '../types/dynamic.js';
import type { DynamicElementType, DynamicProps } from '../types/index.js';

const element_type: DynamicElementType = 'button';
void element_type;

type CardProps = { title: string };
declare const Card: FC<CardProps>;

const card_props: DynamicProps<typeof Card> = {
	is: Card,
	title: 'dynamic card',
};
void card_props;

Dynamic({
	is: Card,
	title: 'dynamic card',
});

const button_props: DynamicProps<'button'> = {
	is: 'button',
	type: 'button',
};
void button_props;

Dynamic({
	is: 'button',
	type: 'button',
});

// @ts-expect-error A component's required props remain required for a dynamic tag.
const missing_card_props: DynamicProps<typeof Card> = { is: Card };
void missing_card_props;

// @ts-expect-error A component's required props remain required in the Dynamic call signature.
Dynamic({ is: Card });

const invalid_button_props: DynamicProps<'button'> = {
	is: 'button',
	// @ts-expect-error Intrinsic element attributes keep their target-specific value types.
	type: 'checkbox',
};
void invalid_button_props;

Dynamic({
	is: 'button',
	// @ts-expect-error Intrinsic element attributes keep their target-specific value types.
	type: 'checkbox',
});

// The editor's type view writes a dynamic tag, `<{props.tag} id="d" />`, as a
// `<Dynamic … />` element, which Hono must accept as a JSX component.
declare const tag: 'div' | 'span';
export const intrinsic_element = <Dynamic is={tag} id="d" />;
export const component_element = <Dynamic is={Card} title="dynamic card" />;

// @ts-expect-error A component's required props remain required on a dynamic tag.
export const missing_card_element = <Dynamic is={Card} />;

export const invalid_button_element = (
	// @ts-expect-error Intrinsic element attributes keep their target-specific value types.
	<Dynamic is="button" type="checkbox" />
);
