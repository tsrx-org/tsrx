package dev.tsrx.intellij_plugin

import com.intellij.ide.plugins.PluginManager
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.extensions.PluginId
import org.jetbrains.plugins.textmate.api.TextMateBundleProvider
import java.net.JarURLConnection
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.nio.file.StandardCopyOption
import java.util.Comparator

class TsrxTextMateBundleProvider : TextMateBundleProvider {
	override fun getBundles(): List<TextMateBundleProvider.PluginBundle> {
		val bundlePath = ensureBundleAvailable() ?: return emptyList()
		return listOf(TextMateBundleProvider.PluginBundle("TSRX", bundlePath))
	}

	private fun ensureBundleAvailable(): Path? {
		cachedBundle?.let { cached ->
			if (Files.isDirectory(cached) && isValidBundle(cached)) {
				return cached
			}
		}

		synchronized(lock) {
			cachedBundle?.let { cached ->
				if (Files.isDirectory(cached) && isValidBundle(cached)) {
					return cached
				}
			}

			val cacheRoot = Paths.get(PathManager.getSystemPath(), "tsrx-textmate")
			val bundleDir = cacheRoot.resolve("tsrx.tmbundle")
			val versionFile = cacheRoot.resolve("version.txt")
			val pluginVersion = pluginVersion()

			if (Files.isDirectory(bundleDir) && Files.isRegularFile(versionFile)) {
				val recorded = runCatching { Files.readString(versionFile) }.getOrNull()
				if (recorded == pluginVersion && isValidBundle(bundleDir)) {
					cachedBundle = bundleDir
					return bundleDir
				}
			}

			if (Files.exists(bundleDir)) {
				runCatching { deleteRecursively(bundleDir) }
			}

			val extracted = extractBundle(bundleDir)
			if (!extracted) {
				LOG.warn(
					"Failed to extract TSRX TextMate bundle. Expected resource `$BUNDLE_RESOURCE_ROOT` " +
						"missing from plugin classpath. Run `pnpm regenerate-textmate` from repo root before building."
				)
				diagnoseMissingResource()
				return null
			}

			if (!isValidBundle(bundleDir)) {
				LOG.warn("TSRX TextMate bundle extracted but grammar missing at $bundleDir/Syntaxes/tsrx.tmLanguage.json")
				return null
			}

			runCatching {
				Files.createDirectories(cacheRoot)
				Files.writeString(versionFile, pluginVersion)
			}

			cachedBundle = bundleDir
			return bundleDir
		}
	}

	private fun isValidBundle(bundleDir: Path): Boolean {
		// Grammar is stored as JSON; validate presence to avoid caching broken bundles
		return Files.isRegularFile(bundleDir.resolve("Syntaxes/tsrx.tmLanguage.json")) ||
			Files.isRegularFile(bundleDir.resolve("Syntaxes/tsrx.tmLanguage"))
	}

	private fun diagnoseMissingResource() {
		// Extra diagnostic: try alternative resource path that would exist if bundle was partially packaged
		val alt = javaClass.classLoader.getResource("$BUNDLE_RESOURCE_ROOT/Syntaxes/tsrx.tmLanguage.json")
		if (alt == null) {
			LOG.warn("TSRX TextMate resource `$BUNDLE_RESOURCE_ROOT/Syntaxes/tsrx.tmLanguage.json` not found in classpath")
		} else {
			LOG.info("TSRX TextMate alternative resource found at $alt but bundle root `$BUNDLE_RESOURCE_ROOT` was not resolvable as directory/jar root")
		}
	}

	private fun extractBundle(target: Path): Boolean {
		val resourceUrl = javaClass.classLoader.getResource(BUNDLE_RESOURCE_ROOT)
		if (resourceUrl == null) {
			LOG.warn("TSRX TextMate bundle resource `$BUNDLE_RESOURCE_ROOT` not found in classpath")
			return false
		}

		return when (resourceUrl.protocol) {
			"file" -> copyDirectory(Paths.get(resourceUrl.toURI()), target)
			"jar" -> copyFromJar(resourceUrl, target)
			else -> {
				LOG.warn("Unsupported protocol for TSRX bundle resource: ${resourceUrl.protocol} ($resourceUrl)")
				false
			}
		}
	}

	private fun copyDirectory(source: Path, target: Path): Boolean {
		return runCatching {
			Files.walk(source).use { stream ->
				stream.forEach { path ->
					val relative = source.relativize(path)
					val destination = target.resolve(relative)
					if (Files.isDirectory(path)) {
						Files.createDirectories(destination)
					} else {
						Files.createDirectories(destination.parent)
						Files.copy(path, destination, StandardCopyOption.REPLACE_EXISTING)
					}
				}
			}
			true
		}.getOrElse { false }
	}

	private fun copyFromJar(resourceUrl: java.net.URL, target: Path): Boolean {
		return runCatching {
			val connection = resourceUrl.openConnection() as JarURLConnection
			val entryRoot = connection.entryName.trimEnd('/')
			connection.jarFile.use { jar ->
				val entries = jar.entries()
				while (entries.hasMoreElements()) {
					val entry = entries.nextElement()
					if (entry.isDirectory) {
						continue
					}
					if (!entry.name.startsWith("$entryRoot/")) {
						continue
					}
					val relative = entry.name.removePrefix("$entryRoot/")
					val destination = target.resolve(relative)
					Files.createDirectories(destination.parent)
					jar.getInputStream(entry).use { input ->
						Files.copy(input, destination, StandardCopyOption.REPLACE_EXISTING)
					}
				}
			}
			true
		}.getOrElse { false }
	}

	private fun deleteRecursively(path: Path) {
		Files.walk(path)
			.sorted(Comparator.reverseOrder())
			.forEach { Files.deleteIfExists(it) }
	}

	private fun pluginVersion(): String {
		val descriptor = PluginManager.getInstance().findEnabledPlugin(PluginId.getId(PLUGIN_ID))
		return descriptor?.version ?: "dev"
	}

	companion object {
		private const val PLUGIN_ID = "dev.tsrx.intellij_plugin"
		private const val BUNDLE_RESOURCE_ROOT = "textmate"
		private val LOG = Logger.getInstance(TsrxTextMateBundleProvider::class.java)
		private val lock = Any()

		@Volatile
		private var cachedBundle: Path? = null
	}
}
