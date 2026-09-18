/**
 * Bundled `@tsrx/content-mapper` entry for inferred projects: the TypeScript 7
 * extension spawns this file (see `registerContentMappers` in `extension.js`)
 * and talks the content-mapper protocol over stdio.
 */

import { create_tsrx_content_mapper } from '@tsrx/content-mapper/mapper';
import { redirect_console_to_stderr, run_mapper_server } from '@tsrx/content-mapper/rpc';

redirect_console_to_stderr();
run_mapper_server(create_tsrx_content_mapper());
