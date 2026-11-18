import { render } from 'preact';
import type { RenderContext } from 'storybook/internal/types';
import type { PreactRenderer } from '@storybook/preact-vite';

// Keep the component type stable when Storybook replaces its story function on args updates.
export function renderToCanvas(
	{ storyFn, showMain, forceRemount }: RenderContext<PreactRenderer>,
	canvas: HTMLElement,
) {
	if (forceRemount) render(null, canvas);
	showMain();
	render(storyFn(), canvas);
	return () => render(null, canvas);
}
