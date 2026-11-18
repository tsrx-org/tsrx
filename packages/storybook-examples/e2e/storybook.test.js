import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const results = join(packageRoot, 'test-results');
const env = { ...process.env, STORYBOOK_DISABLE_TELEMETRY: '1', CI: '1' };
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

async function binary(name) {
	const manifest = fileURLToPath(import.meta.resolve(`${name}/package.json`));
	const { bin } = JSON.parse(await readFile(manifest, 'utf8'));
	return resolve(dirname(manifest), typeof bin === 'string' ? bin : bin[name]);
}

async function freePort() {
	const server = createServer();
	await new Promise((done, reject) => server.once('error', reject).listen(0, '127.0.0.1', done));
	const port = server.address().port;
	await new Promise((done) => server.close(done));
	return port;
}

async function serve(cwd, mode, run) {
	const port = await freePort();
	const url = `http://127.0.0.1:${port}`;
	const cli = await binary(mode === 'development' ? 'storybook' : 'vite');
	const args =
		mode === 'development'
			? [
					'dev',
					'--host',
					'127.0.0.1',
					'--port',
					String(port),
					'--ci',
					'--no-open',
					'--no-version-updates',
				]
			: [
					'preview',
					'--outDir',
					'dist',
					'--host',
					'127.0.0.1',
					'--port',
					String(port),
					'--strictPort',
				];
	const child = spawn(process.execPath, [cli, ...args], {
		cwd,
		env,
		detached: process.platform !== 'win32',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let output = '';
	let failure;
	child.stdout.on('data', (chunk) => {
		output += chunk;
	});
	child.stderr.on('data', (chunk) => {
		output += chunk;
	});
	child.on('error', (error) => {
		failure = error;
	});
	try {
		const deadline = Date.now() + 60000;
		for (;;) {
			if (failure) throw failure;
			if (child.exitCode !== null)
				throw new Error(`Storybook server exited ${child.exitCode}\n${output}`);
			try {
				if ((await fetch(`${url}/index.json`, { signal: AbortSignal.timeout(1000) })).ok) break;
			} catch {}
			if (Date.now() >= deadline) throw new Error(`Storybook server startup timed out\n${output}`);
			await pause(100);
		}
		await run(url);
	} finally {
		try {
			process.platform === 'win32' ? child.kill() : process.kill(-child.pid, 'SIGTERM');
		} catch (error) {
			if (error.code !== 'ESRCH') throw error;
		}
		if (child.exitCode === null)
			await Promise.race([new Promise((done) => child.once('exit', done)), pause(3000)]);
		if (child.exitCode === null)
			process.platform === 'win32' ? child.kill('SIGKILL') : process.kill(-child.pid, 'SIGKILL');
	}
}

async function journey(browser, url, target, mode, source) {
	const context = await browser.newContext();
	await context.tracing.start({ screenshots: true, snapshots: true });
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	try {
		await page.goto(`${url}/?path=/story/tsrx-counter--default`);
		const frame = page.frameLocator('#storybook-preview-iframe');
		const counter = frame.getByRole('region', { name: 'TSRX counter' });
		const count = counter.locator('output');
		await expect(counter.getByRole('heading', { name: `Native ${target} counter` })).toBeVisible({
			timeout: 30000,
		});
		await expect(counter).toHaveCSS('background-color', 'rgb(15, 23, 42)');
		await expect(counter).toHaveCSS('display', 'grid');
		await expect(counter.getByRole('listitem')).toHaveCount(2);
		await counter.evaluate((node) => {
			const outside = document.createElement('p');
			outside.className = 'counter';
			outside.id = 'outside-counter';
			node.ownerDocument.body.append(outside);
		});
		await expect(frame.locator('#outside-counter')).toHaveCSS(
			'background-color',
			'rgba(0, 0, 0, 0)',
		);
		await expect(count).toHaveText('Count: 0');
		await counter.getByRole('button', { name: 'Increment', exact: true }).click();
		await expect(count).toHaveText('Count: 1');
		await page.locator('#control-label').fill('Add three');
		await page.locator('#control-label').press('Tab');
		const action = counter.getByRole('button', { name: 'Add three', exact: true });
		await expect(action).toBeVisible();
		await expect(count).toHaveText('Count: 1');
		await page.locator('#control-step').fill('3');
		await page.locator('#control-step').press('Tab');
		await expect(counter.getByText('Step: 3', { exact: true })).toBeVisible();
		await expect(count).toHaveText('Count: 1');
		await action.click();
		await expect(count).toHaveText('Count: 4');
		await page.getByText('True', { exact: true }).click();
		await expect(action).toBeDisabled();
		await expect(counter.getByText('Paused', { exact: true })).toBeVisible();
		await action.evaluate((node) => node.click());
		await expect(count).toHaveText('Count: 4');
		const original = await counter.elementHandle();
		await page.getByRole('link', { name: 'Large Step', exact: true }).click();
		await expect(count).toHaveText('Count: 0');
		await expect(counter.getByText('Step: 5', { exact: true })).toBeVisible();
		assert.equal(await original.evaluate((node) => node.isConnected), false);
		await counter.getByRole('button', { name: 'Add five', exact: true }).click();
		await expect(count).toHaveText('Count: 5');
		const other = await counter.elementHandle();
		await page.getByRole('link', { name: 'Default', exact: true }).click();
		await expect(count).toHaveText('Count: 0');
		assert.equal(await other.evaluate((node) => node.isConnected), false);
		if (mode === 'development') {
			// Edit an isolated fixture copy; a consumer's source and running workbench stay untouched.
			const text = await readFile(source, 'utf8');
			await writeFile(
				source,
				text
					.replace(`Native ${target} counter`, `Edited ${target} counter`)
					.replace('rgb(15, 23, 42)', 'rgb(40, 70, 100)'),
			);
			await expect(counter.getByRole('heading', { name: `Edited ${target} counter` })).toBeVisible({
				timeout: 30000,
			});
			await expect(counter).toHaveCSS('background-color', 'rgb(40, 70, 100)');
		}
		assert.deepEqual(errors, []);
		await context.tracing.stop();
	} catch (error) {
		await mkdir(results, { recursive: true });
		await page.screenshot({ path: join(results, `${target}-${mode}.png`) }).catch(() => {});
		await context.tracing.stop({ path: join(results, `${target}-${mode}.zip`) }).catch(() => {});
		throw error;
	} finally {
		await context.close();
	}
}

for (const target of ['react', 'preact', 'solid', 'vue', 'hono', 'ripple']) {
	test(
		`${target}: typed TSRX components in development and static Storybook`,
		{ timeout: 180000 },
		async () => {
			const cache = join(packageRoot, '.cache');
			await mkdir(cache, { recursive: true });
			const fixture = await mkdtemp(join(cache, `${target}-`));
			let browser;
			try {
				await cp(join(packageRoot, target), fixture, {
					recursive: true,
					filter: (path) => !path.split(/[\\/]/).includes('dist'),
				});
				await promisify(execFile)(
					process.execPath,
					[await binary('storybook'), 'build', '--output-dir', 'dist'],
					{ cwd: fixture, env, timeout: 90000, maxBuffer: 4 * 1024 * 1024 },
				);
				browser = await chromium.launch();
				for (const mode of ['static', 'development']) {
					await serve(fixture, mode, (url) =>
						journey(browser, url, target, mode, join(fixture, 'Counter.tsrx')),
					);
				}
			} finally {
				await browser?.close();
				await rm(fixture, { recursive: true, force: true });
			}
		},
	);
}
