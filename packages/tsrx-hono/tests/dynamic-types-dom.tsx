/** @jsxImportSource hono/jsx/dom */
import type { FC } from 'hono/jsx';
import { Dynamic } from '../types/dynamic.js';

// The editor's type view writes a dynamic tag as a `<Dynamic … />` element, so
// Hono's DOM renderer must accept it as a JSX component too.
type CardProps = { title: string };
declare const Card: FC<CardProps>;
declare const tag: 'div' | 'span';

export const intrinsic_element = <Dynamic is={tag} id="d" />;
export const component_element = <Dynamic is={Card} title="dynamic card" />;

// @ts-expect-error A component's required props remain required on a dynamic tag.
export const missing_card_element = <Dynamic is={Card} />;
