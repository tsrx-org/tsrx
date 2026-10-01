import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nearest_tsconfig } from '../src/project-config.js';

vi.mock('vscode', () => ({ default: {} }));

/** @type {string[]} */
const roots = [];
afterEach(() => {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('TSRX: Go to Project Configuration', () => {
	it('finds the nearest tsconfig.json above the file, as TSRX reads its settings', () => {
		const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-project-config-')));
		roots.push(root);
		fs.mkdirSync(path.join(root, 'packages', 'app', 'src', 'components'), { recursive: true });
		fs.writeFileSync(path.join(root, 'tsconfig.json'), '{}');
		fs.writeFileSync(path.join(root, 'packages', 'app', 'tsconfig.json'), '{}');
		expect(nearest_tsconfig(path.join(root, 'packages', 'app', 'src', 'components'))).toBe(
			path.join(root, 'packages', 'app', 'tsconfig.json'),
		);
		expect(nearest_tsconfig(path.join(root, 'packages'))).toBe(path.join(root, 'tsconfig.json'));
	});
});
