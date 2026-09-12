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
