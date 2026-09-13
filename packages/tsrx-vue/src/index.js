import { createTargetCompiler } from '@tsrx/core';
import { platform } from './transform.js';

export { isRefProp } from './ref.js';

/**
 * The Vue target compiler — the shared pipeline from `@tsrx/core` driven by
 * the Vue platform descriptor. `compile` emits a TSX module suitable for
 * vue-jsx-vapor or another Vue JSX transform; `compile_to_volar_mappings`
 * emits the type-only virtual module plus Volar mappings for editor tooling.
 */
export const { parse, compile, compile_to_volar_mappings } = createTargetCompiler(platform);
