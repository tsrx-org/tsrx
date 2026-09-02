package dev.tsrx.intellij_plugin

import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths

internal enum class TsrxLanguageServerSource {
	PROJECT,
	PATH,
	MANAGED,
}

internal data class TsrxLanguageServerInfo(
	val binary: Path,
	val root: Path?,
	val source: TsrxLanguageServerSource,
)

internal data class TsrxManagedPackage(val name: String, val version: String)

internal class TsrxLanguageServerResolver(
	private val isWindows: Boolean,
	private val pathValue: () -> String?,
	private val pathSeparator: Char = File.pathSeparatorChar,
	private val isRegularFile: (Path) -> Boolean = Files::isRegularFile,
	private val exists: (Path) -> Boolean = Files::exists,
	private val readString: (Path) -> String = Files::readString,
) {
	fun resolve(startDir: Path?, managedRoot: Path, requiredVersion: String): TsrxLanguageServerInfo? {
		val root = findRoot(startDir) ?: startDir
		findLocalBinary(startDir)?.let {
			return TsrxLanguageServerInfo(it, root, TsrxLanguageServerSource.PROJECT)
		}
		findExecutableInPath(LSP_BIN)?.let {
			return TsrxLanguageServerInfo(it, root, TsrxLanguageServerSource.PATH)
		}
		resolveManagedBinary(versionDirectory(managedRoot, requiredVersion), requiredVersion)?.let {
			return TsrxLanguageServerInfo(it, root, TsrxLanguageServerSource.MANAGED)
		}
		return null
	}

	fun findExecutableInPath(name: String): Path? {
		val candidates = if (isWindows) {
			listOf("$name.cmd", "$name.exe", "$name.bat", name)
		} else {
			listOf(name)
		}
		for (entry in pathValue()?.split(pathSeparator).orEmpty()) {
			if (entry.isBlank()) continue
			for (candidate in candidates) {
				val path = Paths.get(entry, candidate)
				if (isRegularFile(path)) return path
			}
		}
		return null
	}

	fun resolveManagedBinary(directory: Path, requiredVersion: String): Path? {
		val installedPackage = readManagedPackage(directory) ?: return null
		if (installedPackage.name != LSP_PACKAGE || installedPackage.version != requiredVersion) return null
		return launcher(directory.resolve("node_modules/.bin"))
			.takeIf(isRegularFile)
	}

	fun readManagedPackage(directory: Path): TsrxManagedPackage? {
		val packageJson = directory.resolve("node_modules/@tsrx/language-server/package.json")
		if (!isRegularFile(packageJson)) return null
		return runCatching {
			val content = readString(packageJson)
			val name = NAME_PATTERN.find(content)?.groupValues?.get(1) ?: return null
			val version = VERSION_PATTERN.find(content)?.groupValues?.get(1) ?: return null
			TsrxManagedPackage(name, version)
		}.getOrNull()
	}

	fun versionDirectory(managedRoot: Path, version: String): Path = managedRoot.resolve(version)

	private fun findLocalBinary(startDir: Path?): Path? {
		var current = startDir
		while (current != null) {
			val binary = launcher(current.resolve("node_modules/.bin"))
			if (isRegularFile(binary)) return binary
			current = current.parent
		}
		return null
	}

	private fun launcher(binDirectory: Path): Path =
		binDirectory.resolve("$LSP_BIN${if (isWindows) ".cmd" else ""}")

	private fun findRoot(startDir: Path?): Path? {
		var current = startDir
		while (current != null) {
			if (ROOT_MARKERS.any { exists(current.resolve(it)) }) return current
			current = current.parent
		}
		return null
	}

	companion object {
		const val LSP_PACKAGE = "@tsrx/language-server"
		private const val LSP_BIN = "tsrx-language-server"
		private val ROOT_MARKERS = listOf("package.json", "pnpm-workspace.yaml", ".git")
		private val NAME_PATTERN = Regex("\\\"name\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"")
		private val VERSION_PATTERN = Regex("\\\"version\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"")
	}
}
