import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const package_dir = fs.realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const react_package = fs.realpathSync(path.join(package_dir, 'node_modules', '@tsrx', 'react'));
const tsserver_path = createRequire(path.join(package_dir, 'package.json')).resolve(
	'typescript/lib/tsserver.js',
);

/**
 * A project directory with `files`, the React compiler in `node_modules`, and a
 * probe location where tsserver finds this package (its `dist`) as a global plugin.
 * @param {string} prefix
 * @param {Record<string, string>} files Relative path → content.
 */
export function create_tsserver_workspace(prefix, files) {
	const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
	for (const [name, content] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(workspace, name)), { recursive: true });
		fs.writeFileSync(path.join(workspace, name), content);
	}
	fs.mkdirSync(path.join(workspace, 'node_modules', '@tsrx'), { recursive: true });
	fs.symlinkSync(react_package, path.join(workspace, 'node_modules', '@tsrx', 'react'), 'junction');
	// tsserver looks for global plugins in `<probe location>/node_modules`.
	const probe_location = path.join(workspace, '.probe');
	fs.mkdirSync(path.join(probe_location, 'node_modules', '@tsrx'), { recursive: true });
	fs.symlinkSync(
		package_dir,
		path.join(probe_location, 'node_modules', '@tsrx', 'typescript-plugin'),
		'junction',
	);
	return { workspace, probe_location };
}

/**
 * A tsserver with `@tsrx/typescript-plugin` (this package's `dist`) as a global
 * plugin, the way VS Code hands it over (`typescriptServerPlugins`).
 * @param {string} workspace
 * @param {string} probe_location
 */
export function start_tsserver(workspace, probe_location) {
	const child = spawn(
		process.execPath,
		[
			tsserver_path,
			'--globalPlugins',
			'@tsrx/typescript-plugin',
			'--pluginProbeLocations',
			probe_location,
			'--disableAutomaticTypingAcquisition',
		],
		{ cwd: workspace, stdio: ['pipe', 'pipe', 'ignore'] },
	);
	let seq = 0;
	/** @type {Map<number, (response: any) => void>} */
	const pending = new Map();
	let buffer = '';
	child.stdout.setEncoding('utf8');
	child.stdout.on('data', (chunk) => {
		buffer += chunk;
		let end;
		while ((end = buffer.indexOf('\n')) >= 0) {
			const line = buffer.slice(0, end).trim();
			buffer = buffer.slice(end + 1);
			if (!line.startsWith('{')) continue;
			const message = JSON.parse(line);
			if (message.type === 'response') pending.get(message.request_seq)?.(message);
		}
	});
	return {
		/**
		 * @param {string} command
		 * @param {unknown} args
		 * @returns {Promise<any>}
		 */
		request(command, args) {
			const id = ++seq;
			child.stdin.write(
				JSON.stringify({ seq: id, type: 'request', command, arguments: args }) + '\n',
			);
			return new Promise((resolve) => pending.set(id, resolve));
		},
		stop: () => child.kill('SIGKILL'),
	};
}
