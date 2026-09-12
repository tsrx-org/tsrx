/** @import { BuildArtifact, BuildOutput } from 'bun' */
/** @import { RawSourceMap } from 'source-map' */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SourceMapConsumer, SourceMapGenerator } from 'source-map';

const INLINE_SOURCE_MAP_PATTERN =
	/(\/\/[#@]\s*sourceMappingURL=data:application\/json(?:;charset=[^;,]+)?;base64,)([A-Za-z0-9+/=]+)(\s*)$/;

/**
 * Bun does not yet chain source maps returned by JavaScript `onLoad` hooks.
 * Compose its bundle map with every TSRX compiler map after bundling instead.
 *
 * @param {BuildOutput} result
 * @param {Map<string, RawSourceMap>} compiler_maps
 * @param {boolean} writes_to_disk
 */
export async function compose_bun_source_maps(result, compiler_maps, writes_to_disk) {
	if (!result.success || compiler_maps.size === 0) return;

	/** @type {Map<string, BuildArtifact>} */
	const replacements = new Map();
	for (const artifact of result.outputs) {
		if (artifact.kind !== 'sourcemap') continue;
		const source_map = parse_source_map(await artifact.text());
		if (!source_map) continue;
		const composed = await compose_source_map(source_map, artifact.path, compiler_maps);
		if (!composed) continue;

		const contents = JSON.stringify(composed);
		replacements.set(artifact.path, create_artifact(artifact, contents, null));
		if (writes_to_disk) await writeFile(path.resolve(artifact.path), contents);
	}

	/** @type {BuildArtifact[]} */
	const outputs = [];
	for (const artifact of result.outputs) {
		const replacement = replacements.get(artifact.path);
		if (replacement) {
			outputs.push(replacement);
			continue;
		}

		const source_map_replacement = artifact.sourcemap
			? replacements.get(artifact.sourcemap.path)
			: undefined;
		if (source_map_replacement) {
			outputs.push(create_artifact(artifact, await artifact.arrayBuffer(), source_map_replacement));
			continue;
		}

		const inline = await compose_inline_source_map(artifact, compiler_maps);
		if (inline) {
			outputs.push(create_artifact(artifact, inline, null));
			if (writes_to_disk) await writeFile(path.resolve(artifact.path), inline);
			continue;
		}

		outputs.push(artifact);
	}

	result.outputs.splice(0, result.outputs.length, ...outputs);
}

/**
 * @param {BuildArtifact} artifact
 * @param {Map<string, RawSourceMap>} compiler_maps
 * @returns {Promise<string | null>}
 */
async function compose_inline_source_map(artifact, compiler_maps) {
	if (artifact.kind !== 'entry-point' && artifact.kind !== 'chunk') return null;
	const contents = await artifact.text();
	const match = INLINE_SOURCE_MAP_PATTERN.exec(contents);
	if (!match) return null;

	const source_map = parse_source_map(Buffer.from(match[2], 'base64').toString('utf8'));
	if (!source_map) return null;
	const composed = await compose_source_map(source_map, artifact.path + '.map', compiler_maps);
	if (!composed) return null;

	const encoded = Buffer.from(JSON.stringify(composed)).toString('base64');
	return contents.replace(INLINE_SOURCE_MAP_PATTERN, `$1${encoded}$3`);
}

/**
 * @param {RawSourceMap} output_map
 * @param {string} output_path
 * @param {Map<string, RawSourceMap>} compiler_maps
 * @returns {Promise<RawSourceMap | null>}
 */
async function compose_source_map(output_map, output_path, compiler_maps) {
	const output_consumer = await new SourceMapConsumer(output_map);
	/** @type {Map<string, { consumer: SourceMapConsumer, map: RawSourceMap }>} */
	const compiler_consumers = new Map();
	try {
		for (const source of output_consumer.sources) {
			const compiler_map = find_compiler_map(compiler_maps, output_path, source);
			if (compiler_map) {
				compiler_consumers.set(source, {
					consumer: await new SourceMapConsumer(compiler_map),
					map: compiler_map,
				});
			}
		}
		if (compiler_consumers.size === 0) return null;

		const generator = new SourceMapGenerator(
			output_map.file === undefined ? undefined : { file: output_map.file },
		);
		output_consumer.eachMapping((mapping) => {
			if (
				mapping.originalLine == null ||
				mapping.originalColumn == null ||
				mapping.source == null
			) {
				return;
			}

			const compiler_entry = compiler_consumers.get(mapping.source);
			if (compiler_entry) {
				const original = compiler_entry.consumer.originalPositionFor({
					line: mapping.originalLine,
					column: mapping.originalColumn,
				});
				if (original.line != null && original.column != null && original.source != null) {
					generator.addMapping({
						generated: { line: mapping.generatedLine, column: mapping.generatedColumn },
						original: { line: original.line, column: original.column },
						source: original.source,
						name: original.name ?? mapping.name ?? undefined,
					});
					return;
				}
			}

			generator.addMapping({
				generated: { line: mapping.generatedLine, column: mapping.generatedColumn },
				original: { line: mapping.originalLine, column: mapping.originalColumn },
				source: compiler_entry ? generated_source_name(mapping.source) : mapping.source,
				name: mapping.name ?? undefined,
			});
		});

		for (const source of output_consumer.sources) {
			const compiler_entry = compiler_consumers.get(source);
			if (!compiler_entry) {
				const content = output_consumer.sourceContentFor(source, true);
				if (content != null) generator.setSourceContent(source, content);
				continue;
			}

			const generated_content = output_consumer.sourceContentFor(source, true);
			if (generated_content != null) {
				generator.setSourceContent(generated_source_name(source), generated_content);
			}
			for (const authored_source of compiler_entry.map.sources) {
				const content = compiler_entry.consumer.sourceContentFor(authored_source, true);
				if (content != null) generator.setSourceContent(authored_source, content);
			}
		}

		return /** @type {RawSourceMap} */ ({
			...output_map,
			...JSON.parse(generator.toString()),
		});
	} finally {
		output_consumer.destroy();
		for (const { consumer } of compiler_consumers.values()) consumer.destroy();
	}
}

/**
 * @param {Map<string, RawSourceMap>} compiler_maps
 * @param {string} output_path
 * @param {string} source
 * @returns {RawSourceMap | undefined}
 */
function find_compiler_map(compiler_maps, output_path, source) {
	const candidates = [source];
	if (source.startsWith('file:')) {
		try {
			candidates.push(fileURLToPath(source));
		} catch {
			// An invalid file URL cannot name one of the absolute onLoad paths.
		}
	} else if (!/^[a-z][a-z+.-]*:/i.test(source)) {
		candidates.push(path.resolve(path.dirname(path.resolve(output_path)), source));
		candidates.push(path.resolve(source));
	}

	for (const candidate of candidates) {
		const compiler_map = compiler_maps.get(path.normalize(candidate));
		if (compiler_map) return compiler_map;
	}
	return undefined;
}

/** @param {string} source */
function generated_source_name(source) {
	return source + '?tsrx-generated';
}

/**
 * @param {string} source
 * @returns {RawSourceMap | null}
 */
function parse_source_map(source) {
	try {
		const value = JSON.parse(source);
		return value &&
			value.version === 3 &&
			Array.isArray(value.sources) &&
			typeof value.mappings === 'string'
			? value
			: null;
	} catch {
		return null;
	}
}

/**
 * @param {BuildArtifact} artifact
 * @param {BlobPart} contents
 * @param {BuildArtifact | null} sourcemap
 * @returns {BuildArtifact}
 */
function create_artifact(artifact, contents, sourcemap) {
	return /** @type {BuildArtifact} */ (
		Object.assign(new Blob([contents]), {
			path: artifact.path,
			loader: artifact.loader,
			hash: null,
			kind: artifact.kind,
			sourcemap,
		})
	);
}
