import { describe, expect, it } from 'vitest';
import { createCompileErrorDiagnosticPlugin } from '../src/compileErrorDiagnosticPlugin.js';
import { createTypeScriptDiagnosticFilterPlugin } from '../src/typescriptDiagnosticPlugin.js';
import { create_typescript_harness } from './setup.js';

const TYPE_MESSAGE = 'Hono JSX DOM components must render synchronously';
const COMPILER_MESSAGE = 'Hono JSX DOM does not support async components';

/** @param {string} source @param {string} [fixture_name] */
async function diagnostics_for(source, fixture_name = 'hono-dom/App.tsrx') {
	const { document, service, uri } = create_typescript_harness(
		source,
		[createCompileErrorDiagnosticPlugin(), createTypeScriptDiagnosticFilterPlugin()],
		fixture_name,
	);
	const diagnostics = await service.getDiagnostics(uri);
	return { document, diagnostics };
}

/** @param {Awaited<ReturnType<typeof diagnostics_for>>['diagnostics']} diagnostics */
function hono_diagnostics(diagnostics) {
	return diagnostics.filter(
		(diagnostic) =>
			typeof diagnostic.message === 'string' &&
			(diagnostic.message.includes(TYPE_MESSAGE) || diagnostic.message.includes(COMPILER_MESSAGE)),
	);
}

describe('Hono DOM type-aware component diagnostics', () => {
	it('maps imported and inferred definite Promise returns to their rendered tags', async () => {
		const source = `import { ImportedAsync } from './components';
		function InferredAsync() {
			return Promise.resolve('inferred');
		}
		export function App() {
			return <><ImportedAsync /><InferredAsync /></>;
		}`;
		const { document, diagnostics } = await diagnostics_for(
			source,
			'hono-dom/imported-and-inferred.tsrx',
		);
		const hono = hono_diagnostics(diagnostics);

		expect(hono).toHaveLength(2);
		expect(hono.map((diagnostic) => document.getText(diagnostic.range)).sort()).toEqual(
			['ImportedAsync', 'InferredAsync'].sort(),
		);
	});

	it('does not report uncertain or synchronous component types', async () => {
		const source = `import {
			ImportedSync,
			MixedOverload,
			Broad,
			UnionResult,
			AnyComponent,
			UnknownComponent,
			Components,
			Generic,
		} from './components';
		async function unusedHelper() { return 'unused'; }
		export function App() {
			return <>
				<ImportedSync />
				<MixedOverload />
				<Broad />
				<UnionResult />
				<AnyComponent />
				<UnknownComponent />
				<Components.MaybeAsync />
				<Generic />
			</>;
		}`;
		const { diagnostics } = await diagnostics_for(source, 'hono-dom/uncertain.tsrx');

		expect(hono_diagnostics(diagnostics)).toEqual([]);
	});

	it('does not apply the DOM Promise policy in server mode', async () => {
		const source = `import { ImportedAsync } from '../hono-dom/components';
		export function App() { return <ImportedAsync />; }`;
		const { diagnostics } = await diagnostics_for(source, 'hono-server/App.tsrx');

		expect(hono_diagnostics(diagnostics)).toEqual([]);
	});

	it('reports one compiler diagnostic and suppresses the duplicate type assertion locally', async () => {
		const source = `async function LocalAsync() { return 'async'; }
		export function App() { return <LocalAsync />; }`;
		const { diagnostics } = await diagnostics_for(source, 'hono-dom/local-async.tsrx');
		const hono = hono_diagnostics(diagnostics);

		expect(hono).toHaveLength(1);
		expect(hono[0].message).toContain(COMPILER_MESSAGE);
	});
});
