import { createCompiler } from './compiler.js';
import { hono_dom_transform, validate_hono_dom_components } from './platform.js';

const compiler = createCompiler(hono_dom_transform, {
	validate: validate_hono_dom_components,
});

export const { parse, compile, compile_to_volar_mappings } = compiler;
export { isRefProp } from './ref.js';
