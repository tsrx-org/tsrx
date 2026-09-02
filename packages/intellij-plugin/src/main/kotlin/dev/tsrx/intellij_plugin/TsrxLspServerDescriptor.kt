package dev.tsrx.intellij_plugin

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.lsp.api.ProjectWideLspServerDescriptor

internal class TsrxLspServerDescriptor(
	project: Project,
	private val serverInfo: TsrxLanguageServer.ServerInfo,
) : ProjectWideLspServerDescriptor(project, "TSRX") {
	override fun isSupportedFile(file: VirtualFile): Boolean = TsrxFileType.isTsrxFile(file)

	override fun createCommandLine(): GeneralCommandLine {
		val commandLine = GeneralCommandLine(serverInfo.binary.toString(), "--stdio")
		serverInfo.root?.let { commandLine.withWorkDirectory(it.toFile()) }
		return commandLine
	}

	// LSP features (Go to Definition via textDocument/definition, Find Usages via
	// textDocument/references) are enabled by default since 2023.2/2024.2.
	// Explicit customization is not required for webstorm 2025.2.4 target.
	// If fine-tuning is needed, override lspCustomization:
	//   override val lspCustomization = LspCustomization().apply {
	//     goToDefinitionCustomizer = LspGoToDefinitionSupport()
	//     findReferencesCustomizer = LspFindReferencesSupport()
	//   }
}
