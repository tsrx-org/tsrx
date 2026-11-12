import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { query_node_types } from './tree-sitter-query-nodes.js';

const root = process.cwd();
const extensionTomlPath = path.join(root, 'packages/zed-plugin/extension.toml');
const queryDir = path.join(root, 'packages/zed-plugin/languages/tsrx');
const nodeTypesPath = 'grammars/tree-sitter/src/node-types.json';

const extensionToml = await readFile(extensionTomlPath, 'utf8');
const rev = extensionToml.match(/^\s*rev\s*=\s*"([^"]+)"/m)?.[1];

if (!rev) {
	console.error(`Could not find a grammar rev in ${path.relative(root, extensionTomlPath)}.`);
	process.exit(1);
}

let nodeTypesJson;
try {
	nodeTypesJson = execFileSync('git', ['show', `${rev}:${nodeTypesPath}`], {
		cwd: root,
		encoding: 'utf8',
	});
} catch {
	console.error(`Could not read ${nodeTypesPath} at Zed grammar rev ${rev}.`);
	console.error('Run pnpm sync-zed-grammar-rev after committing grammar changes.');
	process.exit(1);
}

/** @type {Array<{ type: string, named: boolean }>} */
const nodeTypes = JSON.parse(nodeTypesJson);
const namedTypes = new Set(nodeTypes.filter((node) => node.named).map((node) => node.type));
// A query that names a token the grammar lacks (`"using"`) fails to load just as
// one that names a missing node does, so tokens are checked too.
const anonymousTypes = new Set(nodeTypes.filter((node) => !node.named).map((node) => node.type));
const queryFiles = (await readdir(queryDir)).filter((file) => file.endsWith('.scm')).sort();
const missing = [];

for (const file of queryFiles) {
	const queryPath = path.join(queryDir, file);
	const { named, anonymous } = query_node_types(await readFile(queryPath, 'utf8'));
	const relativePath = path.relative(root, queryPath);

	for (const nodeName of named) {
		if (!namedTypes.has(nodeName)) {
			missing.push(`- ${relativePath} references missing node type "${nodeName}"`);
		}
	}
	for (const token of anonymous) {
		if (!anonymousTypes.has(token)) {
			missing.push(`- ${relativePath} references missing token ${JSON.stringify(token)}`);
		}
	}
}

if (missing.length > 0) {
	console.error(`Zed grammar rev ${rev} is incompatible with the checked-in TSRX queries.`);
	console.error('');
	for (const line of missing) {
		console.error(line);
	}
	console.error('');
	console.error(
		"Zed's queries must match the grammar at its rev. Leave packages/zed-plugin/languages/tsrx as it is: Version Packages moves the rev and copies the queries together.",
	);
	process.exit(1);
}

console.log(`Zed grammar rev ${rev} matches checked-in TSRX query node types and tokens.`);
