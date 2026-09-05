package dev.tsrx.intellij_plugin

import com.intellij.ide.plugins.cl.PluginAwareClassLoader
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.diagnostic.Logger
import java.net.URL
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.nio.file.StandardCopyOption
import java.util.Comparator
import java.util.UUID
import org.jetbrains.plugins.textmate.api.TextMateBundleProvider

class TsrxTextMateBundleProvider internal constructor(
	private val bundleCache: TsrxTextMateBundleCache,
) : TextMateBundleProvider {
	constructor() : this(defaultBundleCache())

	override fun getBundles(): List<TextMateBundleProvider.PluginBundle> {
		val bundlePath = bundleCache.ensureBundleAvailable()
		if (bundlePath == null) {
			LOG.warn("Failed to extract TSRX TextMate bundle")
			return emptyList()
		}
		return listOf(TextMateBundleProvider.PluginBundle("TSRX", bundlePath))
	}

	companion object {
		private const val BUNDLE_RESOURCE_ROOT = "textmate"
		private val LOG = Logger.getInstance(TsrxTextMateBundleProvider::class.java)

		private fun defaultBundleCache() = TsrxTextMateBundleCache(
			cacheRoot = Paths.get(PathManager.getSystemPath(), "tsrx-textmate"),
			resourceUrl = { relativePath ->
				TsrxTextMateBundleProvider::class.java.classLoader
					.getResource("$BUNDLE_RESOURCE_ROOT/$relativePath")
			},
			pluginVersion = {
				(TsrxTextMateBundleProvider::class.java.classLoader as? PluginAwareClassLoader)
					?.pluginDescriptor
					?.version
					?: "dev"
			},
		)
	}
}

internal class TsrxTextMateBundleCache(
	private val cacheRoot: Path,
	private val resourceUrl: (String) -> URL?,
	private val pluginVersion: () -> String,
	private val uniqueId: () -> String = { UUID.randomUUID().toString() },
) {
	private val lock = Any()

	fun ensureBundleAvailable(): Path? = synchronized(lock) {
		val bundleDir = cacheRoot.resolve("tsrx.tmbundle")
		val versionFile = cacheRoot.resolve("version.txt")
		val version = pluginVersion()
		if (isCurrent(bundleDir, versionFile, version)) return bundleDir

		val staging = cacheRoot.resolve(".staging-${uniqueId()}")
		return runCatching {
			deleteRecursively(staging)
			val extracted = extractBundle(staging)
			if (!extracted || !isValidBundle(staging)) {
				deleteRecursively(staging)
				return null
			}
			promote(staging, bundleDir)
			Files.writeString(versionFile, version)
			bundleDir
		}.getOrElse {
			runCatching { deleteRecursively(staging) }
			null
		}
	}

	private fun isCurrent(bundleDir: Path, versionFile: Path, version: String): Boolean {
		if (!isValidBundle(bundleDir) || !Files.isRegularFile(versionFile)) return false
		return runCatching { Files.readString(versionFile) == version }.getOrDefault(false)
	}

	private fun isValidBundle(directory: Path): Boolean =
		Files.isDirectory(directory) &&
			Files.isRegularFile(directory.resolve("info.plist")) &&
			Files.isRegularFile(directory.resolve("Syntaxes/tsrx.tmLanguage.json"))

	private fun extractBundle(target: Path): Boolean = runCatching {
		for (relativePath in REQUIRED_RESOURCES) {
			val source = resourceUrl(relativePath) ?: return false
			val destination = target.resolve(relativePath)
			Files.createDirectories(destination.parent)
			source.openStream().use { input ->
				Files.copy(input, destination, StandardCopyOption.REPLACE_EXISTING)
			}
		}
		true
	}.getOrDefault(false)

	private fun promote(staging: Path, target: Path) {
		Files.createDirectories(cacheRoot)
		val backup = cacheRoot.resolve(".backup-${uniqueId()}")
		if (Files.exists(target)) moveDirectory(target, backup)
		try {
			moveDirectory(staging, target)
			deleteRecursively(backup)
		} catch (exception: Exception) {
			if (Files.exists(backup) && !Files.exists(target)) moveDirectory(backup, target)
			throw exception
		}
	}

	companion object {
		private val REQUIRED_RESOURCES = listOf(
			"info.plist",
			"Syntaxes/tsrx.tmLanguage.json",
		)
	}
}

private fun moveDirectory(source: Path, target: Path) {
	try {
		Files.move(source, target, StandardCopyOption.ATOMIC_MOVE)
	} catch (_: AtomicMoveNotSupportedException) {
		Files.move(source, target)
	}
}

private fun deleteRecursively(path: Path) {
	if (!Files.exists(path)) return
	Files.walk(path).use { paths ->
		paths.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists)
	}
}
