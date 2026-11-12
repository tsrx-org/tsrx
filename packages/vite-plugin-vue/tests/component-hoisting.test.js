import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tsrxVue } from '../src/index.js';

// Modules that read a component above its declaration, loaded through Vite
// and vue-jsx-vapor. A wrapped component is a `const`, so the compiler moves
// it above an early read when that changes nothing else, and reports
// TSRX2028 when its prop defaults would read a binding it moves past.
const FIXTURES = {
	'registry.tsrx': `export const registry = { inner: Inner };
export function Inner(props: { label: string }) @{
	<span>{props.label}</span>
}
export const result = typeof registry.inner;`,

	'class-field.tsrx': `class Holder {
	comp = Inner;
}
const PREFIX = 'p';
export function Inner({ label = PREFIX }: { label?: string }) @{
	<span>{label}</span>
}
export const result = [new Holder().comp === Inner, (Inner as any).props.label.default];`,

	'var-default.tsrx': `class Holder {
	comp = Inner;
}
var PREFIX = 'p';
export function Inner({ label = PREFIX }: { label?: string }) @{
	<span>{label}</span>
}
export const result = [new Holder().comp === Inner, (Inner as any).props.label.default];`,

	'dead-branch.tsrx': `const DEBUG = false;
if (DEBUG) console.log(Inner);
const PREFIX = 'p';
export function Inner({ label = PREFIX }: { label?: string }) @{
	<span>{label}</span>
}
export const result = (Inner as any).props.label.default;`,

	'shadow.tsrx': `const log: string[] = [];
{
	const Inner = 'shadow';
	log.push(Inner);
}
const PREFIX = 'p';
export function Inner({ label = PREFIX }: { label?: string }) @{
	<span>{label}</span>
}
export const result = [log, (Inner as any).props.label.default];`,

	'block.tsrx': `const log: string[] = [];
{
	const reg = { a: A };
	function A() @{
		<i />
	}
	log.push(typeof reg.a);
}
export const result = log;`,

	'default-export.tsrx': `export default function Card(props: { title: string }) {
	const el = <div>{props.title}</div>;
	return el;
}
export { Card };
export const result = typeof Card;`,

	'unsafe-assign.tsrx': `let size = 1;
const registry = { card: Card };
size = 2;
function Card({ s = size }: { s?: number }) {
	const el = <div>{s}</div>;
	return el;
}
export { registry };`,

	'shadowed-constant.tsrx': `const log: string[] = [];
const DEBUG = false;
{
	const DEBUG = true;
	if (DEBUG) log.push(typeof Inner);
}
function Inner() {
	const el = <i />;
	return el;
}
export const result = log;`,

	'dropped-default.tsrx': `const cfg = { size: 3 };
function Card({ s = cfg.size }: { s?: number }) {
	const el = <div>{s}</div>;
	return el;
}
export { Card };`,

	'kept-default.tsrx': `const SIZE = 3;
function Card({ s = SIZE, t = [1] }: { s?: number; t?: number[] }) {
	const el = <div>{s}</div>;
	return el;
}
export const result = [(Card as any).props.s.default, (Card as any).props.t.default()];`,

	'unsafe.tsrx': `export const registry = { inner: Inner };
const PREFIX = 'p';
export function Inner({ label = PREFIX }: { label?: string }) @{
	<span>{label}</span>
}`,
};

/** @type {string} */
let dir;
/** @type {import('vite').ViteDevServer} */
let server;

beforeAll(async () => {
	dir = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), '.tmp-hoisting-'));
	for (const [file, source] of Object.entries(FIXTURES)) writeFileSync(join(dir, file), source);
	server = await createServer({
		root: dir,
		configFile: false,
		cacheDir: join(dir, '.vite'),
		logLevel: 'silent',
		plugins: [tsrxVue()],
		optimizeDeps: { noDiscovery: true, include: [] },
		server: { middlewareMode: true, hmr: false, watch: null },
	});
});

afterAll(async () => {
	await server?.close();
	rmSync(dir, { recursive: true, force: true });
});

/** @param {string} file */
const load = (file) => server.ssrLoadModule(`/${file}`);

describe('[vue] destructured prop defaults', () => {
	it('keeps the defaults vue-jsx-vapor turns into prop options', async () => {
		expect((await load('kept-default.tsrx')).result).toEqual([3, [1]]);
	});

	it('reports TSRX2029 for a default vue-jsx-vapor would drop', async () => {
		await expect(load('dropped-default.tsrx')).rejects.toThrow(
			"Vue TSRX cannot keep this default for 's'",
		);
	});
});

describe('[vue] components read above their declaration', () => {
	it('moves a component above a read that runs while the module loads', async () => {
		expect((await load('registry.tsrx')).result).toBe('object');
		expect((await load('block.tsrx')).result).toEqual(['object']);
		// A nested scope's own `DEBUG` hides the outer constant, so the read counts.
		expect((await load('shadowed-constant.tsrx')).result).toEqual(['object']);
	});

	it('leaves a component in place for reads that do not run at load', async () => {
		// A class instance field, a branch a constant condition skips, and a
		// block's own binding of the name: the prop default still reads 'p'.
		expect((await load('class-field.tsrx')).result).toEqual([true, 'p']);
		expect((await load('var-default.tsrx')).result).toEqual([true, 'p']);
		expect((await load('dead-branch.tsrx')).result).toBe('p');
		expect((await load('shadow.tsrx')).result).toEqual([['shadow'], 'p']);
	});

	it('keeps the module binding of a default-exported component', async () => {
		const module = await load('default-export.tsrx');
		expect(module.result).toBe('object');
		expect(module.Card).toBe(module.default);
	});

	it('reports TSRX2028 instead of moving a component past a binding its prop default reads', async () => {
		await expect(load('unsafe.tsrx')).rejects.toThrow(
			"'Inner' is read here before its declaration.",
		);
		// `size = 2` in between would change the default the component captures.
		await expect(load('unsafe-assign.tsrx')).rejects.toThrow(
			"'Card' is read here before its declaration.",
		);
	});
});
