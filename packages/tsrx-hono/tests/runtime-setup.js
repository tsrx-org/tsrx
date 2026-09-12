import { afterEach, beforeEach } from 'vitest';
import { createElement } from 'hono/jsx/dom';
import { createRoot } from 'hono/jsx/dom/client';

/** @type {HTMLDivElement} */
let container;
/** @type {ReturnType<typeof createRoot>} */
let root;

globalThis.render = function render(Component, props) {
	root.render(createElement(Component, props ?? null));
};

globalThis.unmount = function unmount() {
	root.unmount();
};

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
	globalThis.container = container;
});

afterEach(() => {
	root.unmount();
	document.body.removeChild(container);
	globalThis.container = /** @type {HTMLDivElement} */ (/** @type {unknown} */ (undefined));
});
