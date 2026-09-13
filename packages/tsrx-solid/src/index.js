import { createTargetCompiler } from '@tsrx/core';
import { platform } from './transform.js';

export { isRefProp } from './ref.js';

/**
 * The Solid target compiler — the shared pipeline from `@tsrx/core` driven by
 * the Solid platform descriptor. `compile` emits a TSX module suitable for
 * Solid's JSX transform (typically via `vite-plugin-solid`);
 * `compile_to_volar_mappings` emits the type-only virtual module plus Volar
 * mappings for editor tooling.
 */
export const { parse, compile, compile_to_volar_mappings } = createTargetCompiler(platform);
