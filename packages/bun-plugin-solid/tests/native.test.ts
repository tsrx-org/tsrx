import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Bun.plugin() registration calls only the first onLoad hook whose filter
// matches and needs an object back, so instances that split the source files
// have to hand them on. The modules export plain values: Solid's server build,
// which Bun's runtime resolves, can't evaluate compiled DOM components.
test('splits the source files between two instances in a bun:test preload', async () => {
	const dir = await mkdtemp(join(import.meta.dir, '.native-'));
	try {
		const files = {
			'preload.mjs': `import { tsrxSolid } from ${JSON.stringify(join(import.meta.dir, '../src/index.js'))};
Bun.plugin(tsrxSolid({ exclude: [/Second\\.tsrx$/, /Asset\\.tsrx$/] }));
Bun.plugin(tsrxSolid({ include: /Second\\.tsrx$/ }));
`,
			'First.tsrx': "export const name: string = 'first';\n",
			'Second.tsrx': "export const name: string = 'second';\n",
			'Asset.tsrx': 'export const unused = true;\n',
			'split.test.js': `import { expect, test } from 'bun:test';
import { name as first } from './First.tsrx';
import { name as second } from './Second.tsrx';
import asset from './Asset.tsrx';
test('loads both and the left-out file as Bun does', () => {
	expect([first, second]).toEqual(['first', 'second']);
	expect(asset).toEndWith('/Asset.tsrx');
});
`,
		};
		for (const [name, contents] of Object.entries(files)) {
			await writeFile(join(dir, name), contents);
		}
		const child = Bun.spawnSync({
			cmd: [process.execPath, 'test', '--preload', './preload.mjs', './split.test.js'],
			cwd: dir,
		});
		expect(child.stderr.toString()).toContain(' 1 pass');
		expect(child.exitCode).toBe(0);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
