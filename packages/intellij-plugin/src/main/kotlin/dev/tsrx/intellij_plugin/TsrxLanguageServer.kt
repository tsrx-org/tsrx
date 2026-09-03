package dev.tsrx.intellij_plugin

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.util.ExecUtil
import com.intellij.ide.trustedProjects.TrustedProjects
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.lsp.api.LspServerManager
import com.intellij.util.EnvironmentUtil
import java.io.File
import java.io.InputStream
import java.nio.file.Path
import java.nio.file.Paths

internal object TsrxLanguageServer {
	private const val LSP_VERSION_RESOURCE = "/lsp-version.txt"
	private val LOG = Logger.getInstance(TsrxLanguageServer::class.java)
	private val requiredVersion: String by lazy { readRequiredVersion() }
	private val resolver: TsrxLanguageServerResolver by lazy {
		TsrxLanguageServerResolver(
			isWindows = SystemInfo.isWindows,
			pathValue = { EnvironmentUtil.getValue("PATH") },
			pathSeparator = File.pathSeparatorChar,
		)
	}
	private val installer: TsrxLanguageServerInstaller by lazy {
		TsrxLanguageServerInstaller(resolver, TsrxCommandRunner(::runCommand))
	}
	private val installCoordinator: TsrxInstallCoordinator<Project> by lazy {
		TsrxInstallCoordinator(
			execute = { task -> ApplicationManager.getApplication().executeOnPooledThread(task) },
			install = { version ->
				installer.install(resolver.findExecutableInPath("npm"), managedRoot(), version)
			},
			isDisposed = Project::isDisposed,
			onSuccess = { project, _ -> installationSucceeded(project) },
			onFailure = { project, failure -> installationFailed(project, failure) },
			onCallbackError = { _, exception ->
				LOG.warn("Failed to complete TSRX language-server installation for a waiting project", exception)
			},
		)
	}

	fun resolveServer(project: Project, file: VirtualFile?): TsrxLanguageServerInfo? {
		if (!TrustedProjects.isProjectTrusted(project)) {
			LOG.debug("Skipping TSRX language-server resolution for an untrusted project")
			return null
		}

		val startDir = file?.parent?.path?.let(Paths::get) ?: project.basePath?.let(Paths::get)
		val server = resolver.resolve(startDir, managedRoot(), requiredVersion)
		if (server != null) {
			LOG.debug("Resolved TSRX language server from ${server.source}")
			return server
		}

		val started = installCoordinator.request(requiredVersion, project)
		if (started) {
			notify(
				project,
				NotificationType.INFORMATION,
				"Installing ${TsrxLanguageServerResolver.LSP_PACKAGE}@$requiredVersion for language features...",
			)
		}
		return null
	}

	private fun runCommand(command: TsrxProcessCommand): TsrxProcessOutput {
		val commandLine = createTsrxLauncherCommandLine(
			command.executable,
			command.arguments,
			SystemInfo.isWindows,
		)
		commandLine.withParentEnvironmentType(GeneralCommandLine.ParentEnvironmentType.CONSOLE)
		val output = ExecUtil.execAndGetOutput(commandLine)
		return TsrxProcessOutput(output.exitCode, output.stdout, output.stderr)
	}

	private fun installationSucceeded(project: Project) {
		if (!TrustedProjects.isProjectTrusted(project)) return
		notify(
			project,
			NotificationType.INFORMATION,
			"TSRX language server installed. Restarting language services...",
		)
		LspServerManager.getInstance(project)
			.stopAndRestartIfNeeded(TsrxLspServerSupportProvider::class.java)
	}

	private fun installationFailed(project: Project, failure: TsrxInstallResult.Failure) {
		if (failure.cause != null) {
			LOG.warn("TSRX language server installation failed", failure.cause)
		} else if (failure.diagnosticDetails.isNotBlank()) {
			LOG.warn("TSRX language server installation failed:\n${failure.diagnosticDetails}")
		} else {
			LOG.warn("TSRX language server installation failed: ${failure.userMessage}")
		}
		if (!TrustedProjects.isProjectTrusted(project)) return
		val safeDetails = notificationDetails(failure.diagnosticDetails)
		val content = if (safeDetails.isBlank()) {
			failure.userMessage
		} else {
			"${failure.userMessage}<br><br><pre>$safeDetails</pre>"
		}
		notify(project, NotificationType.ERROR, content)
	}

	private fun managedRoot(): Path =
		Paths.get(PathManager.getSystemPath(), "tsrx-language-server")

	private fun readRequiredVersion(): String {
		return readRequiredLanguageServerVersion {
			TsrxLanguageServer::class.java.getResourceAsStream(LSP_VERSION_RESOURCE)
		}
	}

	private fun notify(project: Project, type: NotificationType, content: String) {
		if (project.isDisposed) return
		NotificationGroupManager.getInstance()
			.getNotificationGroup("TSRX")
			.createNotification("TSRX", content, type)
			.notify(project)
	}
}

internal fun readRequiredLanguageServerVersion(openResource: () -> InputStream?): String {
	val stream = requireNotNull(openResource()) {
		"TSRX language server version resource not found: /lsp-version.txt"
	}
	val version = stream.bufferedReader(Charsets.UTF_8).use { it.readText().trim() }
	require(version.isNotEmpty()) { "TSRX language server version resource is blank" }
	return version
}
