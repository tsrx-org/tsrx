package dev.tsrx.intellij_plugin

import com.intellij.execution.configurations.GeneralCommandLine
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.util.Comparator
import java.util.UUID

internal data class TsrxProcessCommand(
	val executable: Path,
	val arguments: List<String>,
)

internal data class TsrxProcessOutput(
	val exitCode: Int,
	val stdout: String,
	val stderr: String,
)

internal fun interface TsrxCommandRunner {
	fun run(command: TsrxProcessCommand): TsrxProcessOutput
}

internal sealed interface TsrxInstallResult {
	data class Success(val binary: Path) : TsrxInstallResult

	data class Failure(
		val userMessage: String,
		val diagnosticDetails: String = "",
		val cause: Throwable? = null,
	) : TsrxInstallResult
}

internal class TsrxLanguageServerInstaller(
	private val resolver: TsrxLanguageServerResolver,
	private val commandRunner: TsrxCommandRunner,
	private val uniqueId: () -> String = { UUID.randomUUID().toString() },
) {
	fun install(npm: Path?, managedRoot: Path, requiredVersion: String): TsrxInstallResult {
		if (npm == null) {
			return TsrxInstallResult.Failure(
				"npm was not found on PATH. Install Node.js 22+ to enable TSRX language features.",
			)
		}

		val target = resolver.versionDirectory(managedRoot, requiredVersion)
		resolver.resolveManagedBinary(target, requiredVersion)?.let {
			return TsrxInstallResult.Success(it)
		}
		val staging = managedRoot.resolve(".staging-$requiredVersion-${uniqueId()}")

		return try {
			Files.createDirectories(managedRoot)
			deleteRecursively(staging)
			Files.createDirectories(staging)
			val command = TsrxProcessCommand(
				npm,
				listOf(
					"install",
					"${TsrxLanguageServerResolver.LSP_PACKAGE}@$requiredVersion",
					"--prefix",
					staging.toString(),
					"--no-audit",
					"--no-fund",
					"--ignore-scripts",
				),
			)
			val output = commandRunner.run(command)
			if (output.exitCode != 0) {
				return failure(
					staging,
					"npm install failed. Check your network and npm configuration, then retry.",
					combineOutput(output),
				)
			}

			val installedPackage = resolver.readManagedPackage(staging)
			if (installedPackage?.name != TsrxLanguageServerResolver.LSP_PACKAGE) {
				return failure(
					staging,
					"npm installed an unexpected package. Check your npm registry and retry.",
					combineOutput(output),
				)
			}
			if (installedPackage.version != requiredVersion) {
				return failure(
					staging,
					"npm installed ${installedPackage.version}, but TSRX requires $requiredVersion.",
					combineOutput(output),
				)
			}
			val stagedBinary = resolver.resolveManagedBinary(staging, requiredVersion)
				?: return failure(
					staging,
					"The TSRX language server package did not contain its launcher. Retry the installation.",
					combineOutput(output),
				)

			resolver.resolveManagedBinary(target, requiredVersion)?.let {
				deleteRecursively(staging)
				return TsrxInstallResult.Success(it)
			}
			deleteRecursively(target)
			moveDirectory(staging, target)
			val installedBinary = resolver.resolveManagedBinary(target, requiredVersion)
				?: run {
					deleteRecursively(target)
					return TsrxInstallResult.Failure(
						"The managed TSRX language server could not be validated after installation.",
					)
				}
			check(stagedBinary.fileName == installedBinary.fileName)
			TsrxInstallResult.Success(installedBinary)
		} catch (exception: InterruptedException) {
			Thread.currentThread().interrupt()
			failure(staging, "TSRX language server installation was interrupted. Retry when ready.", cause = exception)
		} catch (exception: Exception) {
			failure(
				staging,
				"TSRX language server installation failed. Check the IDE log and retry.",
				diagnosticDetails = exception.message.orEmpty(),
				cause = exception,
			)
		}
	}

	private fun failure(
		staging: Path,
		message: String,
		diagnosticDetails: String = "",
		cause: Throwable? = null,
	): TsrxInstallResult.Failure {
		runCatching { deleteRecursively(staging) }
		return TsrxInstallResult.Failure(message, diagnosticDetails, cause)
	}

	private fun combineOutput(output: TsrxProcessOutput): String =
		listOf(output.stderr, output.stdout).filter { it.isNotBlank() }.joinToString("\n")

	private fun moveDirectory(source: Path, target: Path) {
		try {
			Files.move(source, target, StandardCopyOption.ATOMIC_MOVE)
		} catch (_: AtomicMoveNotSupportedException) {
			Files.move(source, target)
		}
	}
}

internal class TsrxInstallCoordinator<P>(
	private val execute: (() -> Unit) -> Unit,
	private val install: (String) -> TsrxInstallResult,
	private val isDisposed: (P) -> Boolean,
	private val onSuccess: (P, TsrxInstallResult.Success) -> Unit,
	private val onFailure: (P, TsrxInstallResult.Failure) -> Unit,
	private val onCallbackError: (P, Throwable) -> Unit = { _, _ -> },
) {
	private val lock = Any()
	private val waiters = mutableMapOf<String, LinkedHashSet<P>>()

	fun request(version: String, project: P): Boolean {
		val shouldStart = synchronized(lock) {
			val waiting = waiters[version]
			if (waiting != null) {
				waiting += project
				false
			} else {
				waiters[version] = linkedSetOf(project)
				true
			}
		}
		if (!shouldStart) return false

		execute {
			val result = try {
				install(version)
			} catch (exception: Exception) {
				TsrxInstallResult.Failure(
					"TSRX language server installation failed. Check the IDE log and retry.",
					cause = exception,
				)
			}
			val completed = synchronized(lock) { waiters.remove(version).orEmpty().toList() }
			for (waitingProject in completed) {
				if (isDisposed(waitingProject)) continue
				try {
					when (result) {
						is TsrxInstallResult.Success -> onSuccess(waitingProject, result)
						is TsrxInstallResult.Failure -> onFailure(waitingProject, result)
					}
				} catch (exception: Exception) {
					onCallbackError(waitingProject, exception)
				}
			}
		}
		return true
	}
}

internal fun createTsrxLauncherCommandLine(
	launcher: Path,
	arguments: List<String>,
	isWindows: Boolean,
	windowsShell: String = System.getenv("ComSpec") ?: "cmd.exe",
): GeneralCommandLine {
	val isBatch = launcher.fileName.toString().endsWith(".cmd", ignoreCase = true) ||
		launcher.fileName.toString().endsWith(".bat", ignoreCase = true)
	val command = if (isWindows && isBatch) {
		val invocation = (listOf(launcher.toString()) + arguments)
			.joinToString(" ") { argument -> "\"${argument.replace("\"", "\"\"")}\"" }
		listOf(windowsShell, "/d", "/s", "/c", "\"$invocation\"")
	} else {
		listOf(launcher.toString()) + arguments
	}
	return GeneralCommandLine(*command.toTypedArray())
}

internal fun notificationDetails(
	details: String,
	maxLines: Int = 8,
	maxCharacters: Int = 1_500,
): String {
	val bounded = ANSI_PATTERN.replace(details, "")
		.lineSequence()
		.filter { it.isNotBlank() }
		.toList()
		.takeLast(maxLines)
		.joinToString("\n")
	val escaped = buildString(bounded.length) {
		for (character in bounded) {
			append(
				when (character) {
					'&' -> "&amp;"
					'<' -> "&lt;"
					'>' -> "&gt;"
					'\"' -> "&quot;"
					'\'' -> "&#39;"
					else -> character
				},
			)
		}
	}
	return escaped.takeLast(maxCharacters)
}

private fun deleteRecursively(path: Path) {
	if (!Files.exists(path)) return
	Files.walk(path).use { paths ->
		paths.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists)
	}
}

private val ANSI_PATTERN = Regex("\\u001B\\[[;\\d]*[ -/]*[@-~]")
