import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const compiler = fileURLToPath(new URL('../../typescript-plugin/dist/tsc.js', import.meta.url));
for (const target of ['react', 'preact', 'solid', 'vue', 'hono', 'ripple']) {
	console.log(`Typechecking ${target} Storybook`);
	const cwd = fileURLToPath(new URL(`../${target}/`, import.meta.url));
	const result = spawnSync(process.execPath, [compiler, '--noEmit', '-p', 'tsconfig.json'], {
		cwd,
		stdio: 'inherit',
	});
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}
