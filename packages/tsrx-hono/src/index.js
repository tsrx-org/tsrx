import { createCompiler } from './compiler.js';
import { hono_server_transform } from './platform.js';

const compiler = createCompiler(hono_server_transform);

export const { parse, compile, compile_to_volar_mappings } = compiler;
export { isRefProp } from './ref.js';
