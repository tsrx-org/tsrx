import { createRoot } from 'hono/jsx/dom/client';
import { jsx } from 'hono/jsx/dom';
import type { JSXNode } from 'hono/jsx/dom';
import App from './App.tsrx';

const target = document.getElementById('root');
if (!target) throw new Error('#root not found');

const AppComponent = App as unknown as (props: Record<string, unknown>) => JSXNode;
createRoot(target).render(jsx(AppComponent, {}));
