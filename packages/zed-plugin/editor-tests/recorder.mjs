/**
 * Stands in for `tsrx-language-server` in a Zed editor test project: starts the real
 * server (TSRX_ZED_SERVER) with the same arguments, passes messages through both ways,
 * and appends each one to TSRX_ZED_RECORD as a JSON line `{ from, message }`, where
 * `from` is `zed` or `server`. Zed keeps its language server log in memory only.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';

const record = /** @type {string} */ (process.env.TSRX_ZED_RECORD);
const server = spawn(
	process.execPath,
	[/** @type {string} */ (process.env.TSRX_ZED_SERVER), ...process.argv.slice(2)],
	{
		stdio: ['pipe', 'pipe', 'inherit'],
	},
);

/** @param {'zed' | 'server'} from */
function recorder(from) {
	let buffered = Buffer.alloc(0);
	return (/** @type {Buffer} */ chunk) => {
		buffered = Buffer.concat([buffered, chunk]);
		for (;;) {
			const header_end = buffered.indexOf('\r\n\r\n');
			if (header_end < 0) return;
			const length = /Content-Length:\s*(\d+)/i.exec(buffered.subarray(0, header_end).toString());
			if (!length) return;
			const end = header_end + 4 + Number(length[1]);
			if (buffered.length < end) return;
			const message = JSON.parse(buffered.subarray(header_end + 4, end).toString('utf8'));
			buffered = buffered.subarray(end);
			fs.appendFileSync(record, `${JSON.stringify({ from, message })}\n`);
		}
	};
}

const from_zed = recorder('zed');
process.stdin.on('data', (chunk) => {
	from_zed(chunk);
	server.stdin.write(chunk);
});
process.stdin.on('end', () => server.stdin.end());
const from_server = recorder('server');
server.stdout.on('data', (chunk) => {
	from_server(chunk);
	process.stdout.write(chunk);
});
server.on('exit', (code) => process.exit(code ?? 0));
