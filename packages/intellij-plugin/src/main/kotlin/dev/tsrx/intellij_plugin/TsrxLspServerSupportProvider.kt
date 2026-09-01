package dev.tsrx.intellij_plugin

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.lsp.api.LspServer
import com.intellij.platform.lsp.api.LspServerSupportProvider
import com.intellij.platform.lsp.api.lsWidget.LspServerWidgetItem
import javax.swing.Icon

class TsrxLspServerSupportProvider : LspServerSupportProvider {
	override fun fileOpened(
		project: Project,
		file: VirtualFile,
		serverStarter: LspServerSupportProvider.LspServerStarter,
	) {
		if (!TsrxFileType.isTsrxFile(file)) {
			return
		}

		val serverInfo = TsrxLanguageServer.resolveServer(project, file) ?: return
		serverStarter.ensureServerStarted(TsrxLspServerDescriptor(project, serverInfo))
	}

	override fun createLspServerWidgetItem(
		lspServer: LspServer,
		currentFile: VirtualFile?,
	): LspServerWidgetItem = TsrxLspServerWidgetItem(lspServer, currentFile)
}

private class TsrxLspServerWidgetItem(
	lspServer: LspServer,
	currentFile: VirtualFile?,
) : LspServerWidgetItem(lspServer, currentFile, TsrxIcons.WIDGET) {
	override val statusBarIcon: Icon = TsrxIcons.WIDGET_STATUSBAR
}
