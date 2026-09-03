package dev.tsrx.intellij_plugin

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.lsp.api.ProjectWideLspServerDescriptor

internal class TsrxLspServerDescriptor(
	project: Project,
	private val serverInfo: TsrxLanguageServerInfo,
) : ProjectWideLspServerDescriptor(project, "TSRX") {
	override fun isSupportedFile(file: VirtualFile): Boolean = TsrxFileType.isTsrxFile(file)

	override fun createCommandLine(): GeneralCommandLine {
		val commandLine = createTsrxLauncherCommandLine(
			serverInfo.binary,
			listOf("--stdio"),
			com.intellij.openapi.util.SystemInfo.isWindows,
		)
		serverInfo.root?.let { commandLine.withWorkDirectory(it.toFile()) }
		return commandLine
	}
}
