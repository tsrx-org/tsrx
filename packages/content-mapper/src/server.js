#!/usr/bin/env node
/**
 * Executable entry of the content mapper: TypeScript spawns it through the
 * `typescript.contentMapper.exec` manifest entry and talks JSON-RPC over stdio.
 */

import { create_tsrx_content_mapper } from './mapper.js';
import { redirect_console_to_stderr, run_mapper_server } from './rpc.js';

redirect_console_to_stderr();
run_mapper_server(create_tsrx_content_mapper());
